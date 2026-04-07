import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { parseFile } from "./parser.js";
import { resolveModuleSpecifier, normalizePath } from "./resolver.js";
import type { CrawlResult, ParsedExport, ParsedImport, ResolvedSymbol } from "./types.js";
import { DEFAULT_MAX_HOPS, MAX_HOPS_UNLIMITED } from "./constants.js";
import { normalizeSignature, symbolDedupeKey } from "./dedupe.js";
import { nciProfileEnabled, profileLog, profileStat } from "./nci-log-flags.js";

export interface CrawlOptions {
  /**
   * Upper bound on discovery edges from each package entry (default `DEFAULT_MAX_HOPS`).
   * Use `MAX_HOPS_UNLIMITED` (-1) for no cap (only graph shape and circular detection stop the crawl).
   */
  maxHops?: number;
}

function normalizeMaxHops(raw?: number): number {
  const resolved = raw ?? DEFAULT_MAX_HOPS;
  if (resolved === MAX_HOPS_UNLIMITED) return Number.POSITIVE_INFINITY;
  if (!Number.isFinite(resolved) || !Number.isInteger(resolved))
    throw new Error(`maxHops must be a finite integer, ${MAX_HOPS_UNLIMITED} (unlimited), or >= 0`);
  if (resolved < 0) throw new Error(`maxHops must be ${MAX_HOPS_UNLIMITED} (unlimited) or >= 0, got ${resolved}`);
  return resolved;
}

/** Crawl one or more .d.ts files, following all re-exports recursively. */
export function crawl(
  entryFilePaths: string | string[],
  options: CrawlOptions = {}
): CrawlResult {
  const maxHops = normalizeMaxHops(options.maxHops);
  const visited = new Set<string>();
  const circularRefs: string[] = [];
  const resolvedSymbols: ResolvedSymbol[] = [];
  const typeRefPackages = new Set<string>();

  const allRawExports = new Map<string, ParsedExport[]>();
  const allRawImports = new Map<string, ParsedImport[]>();
  const allRawReferences = new Map<string, string[]>();
  const tripleSlashRefTargets = new Map<string, Set<string>>();
  const fileIsExternalModule = new Map<string, boolean>();
  const resolutionPath = new Set<string>();
  const resolutionCache = new Map<string, ResolvedSymbol[]>();

  const entries = Array.isArray(entryFilePaths) ? entryFilePaths : [entryFilePaths];
  const primaryEntry = entries[0] || "";
  const crawlProfiling = nciProfileEnabled();
  let profileResolveFileCacheHits = 0;

  function recordTripleSlashEdge(fromAbs: string, toAbs: string): void {
    const from = normalizePath(fromAbs);
    const to = normalizePath(toAbs);
    let set = tripleSlashRefTargets.get(from);
    if (!set) {
      set = new Set();
      tripleSlashRefTargets.set(from, set);
    }
    set.add(to);
  }

  const discoveryStart = performance.now();
  discoverLinkedFiles();
  if (crawlProfiling) {
    profileLog("  crawl:discover", performance.now() - discoveryStart);
    profileStat("  crawl:filesDiscovered", visited.size);
  }

  const seenResolvedKeys = new Set<string>();
  const seenPublicDefinitionKeys = new Set<string>();

  const crawlResolveStart = performance.now();
  for (const entryPath of entries) {
    const entryNorm = normalizePath(entryPath);
    const resolvedFromEntry = resolveFile(entryPath, 0);
    for (const resolvedSymbol of resolvedFromEntry) {
      const perEntryKey = `${entryNorm}::${symbolDedupeKey(
        resolvedSymbol.definedIn,
        resolvedSymbol.name,
        resolvedSymbol.kind,
        resolvedSymbol.signature
      )}`;
      if (seenResolvedKeys.has(perEntryKey)) {
        continue;
      }
      resolvedSymbols.push({
        ...resolvedSymbol,
        isInternal: false,
        resolvedFromPackageEntry: entryNorm,
      });
      seenResolvedKeys.add(perEntryKey);
      seenPublicDefinitionKeys.add(
        symbolDedupeKey(
          resolvedSymbol.definedIn,
          resolvedSymbol.name,
          resolvedSymbol.kind,
          resolvedSymbol.signature
        )
      );
    }
  }

  if (crawlProfiling) {
    profileLog("  crawl:entryResolve", performance.now() - crawlResolveStart);
    profileStat("  crawl:entryRoots", entries.length);
    profileStat("  crawl:resolveCacheHits", profileResolveFileCacheHits);
    profileStat("  crawl:publicSymbols", resolvedSymbols.length);
  }

  const internalStart = performance.now();
  const visitedSorted = [...visited].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  for (const file of visitedSorted) {
    const exports = allRawExports.get(file) || [];
    for (const exportEntry of exports) {
      if (exportEntry.isWildcard || !exportEntry.name) continue;
      if (
        exportEntry.isGlobalAugmentation &&
        exportEntry.kind === ts.SyntaxKind.ModuleDeclaration &&
        exportEntry.name === "global"
      ) {
        continue;
      }
      // Skip ExportDeclarations — they're forwarding statements, not definitions.
      if (exportEntry.kind === ts.SyntaxKind.ExportDeclaration) continue;

      const definitionKey = symbolDedupeKey(
        file,
        exportEntry.name,
        exportEntry.kind,
        exportEntry.signature
      );
      if (seenPublicDefinitionKeys.has(definitionKey)) {
        continue;
      }

      const dedupKey = definitionKey;
      if (seenResolvedKeys.has(dedupKey)) {
        continue;
      }
      resolvedSymbols.push({
        name: exportEntry.name,
        kind: exportEntry.kind,
        kindName: exportEntry.kindName,
        isTypeOnly: exportEntry.isTypeOnly,
        symbolSpace: exportEntry.symbolSpace,
        signature: exportEntry.signature,
        jsDoc: exportEntry.jsDoc,
        definedIn: file,
        dependencies: exportEntry.dependencies,
        deprecated: exportEntry.deprecated,
        visibility: exportEntry.visibility,
        since: exportEntry.since,
        heritage: exportEntry.heritage,
        isGlobalAugmentation: exportEntry.isGlobalAugmentation,
        isInternal: true,
      });
      seenResolvedKeys.add(dedupKey);
    }
  }
  if (crawlProfiling) {
    profileLog("  crawl:internalCollect", performance.now() - internalStart);
    profileStat("  crawl:totalSymbols", resolvedSymbols.length);
  }

  const tripleSlashReferenceTargets: Record<string, string[]> = Object.fromEntries(
    [...tripleSlashRefTargets.entries()]
      .sort(([leftSourceAbs], [rightSourceAbs]) =>
        leftSourceAbs.localeCompare(rightSourceAbs)
      )
      .map(([from, toSet]) => [from, [...toSet].sort()])
  );

  const importsSorted = [...allRawImports.entries()].sort(([left], [right]) =>
    left < right ? -1 : left > right ? 1 : 0
  );

  function discoverLinkedFiles(): void {
    const hop = new Map<string, number>();
    let layer: string[] = [];

    for (const entryPath of entries) {
      const normalizedEntry = normalizePath(entryPath);
      if (!fs.existsSync(normalizedEntry)) continue;
      if (!hop.has(normalizedEntry)) {
        hop.set(normalizedEntry, 0);
        visited.add(normalizedEntry);
        layer.push(normalizedEntry);
      }
    }
    layer = [...new Set(layer)].sort();

    while (layer.length > 0) {
      const next = new Set<string>();
      for (const normalizedPath of layer) {
        const fromHop = hop.get(normalizedPath)!;
        if (!fs.existsSync(normalizedPath)) continue;

        const tryEnqueue = (absPath: string): void => {
          if (fromHop >= maxHops) return;
          const normalizedTarget = normalizePath(absPath);
          if (!fs.existsSync(normalizedTarget)) return;
          if (hop.has(normalizedTarget)) {
            circularRefs.push(`${normalizedPath} -> ${normalizedTarget}`);
          } else {
            hop.set(normalizedTarget, fromHop + 1);
            visited.add(normalizedTarget);
            next.add(normalizedTarget);
          }
        };

        const {
          exports: exportEntries,
          imports: importEntries,
          references: tripleSlashRefs,
          typeReferences: typeRefDirectives,
          isExternalModule,
        } = parseFile(normalizedPath);

        for (const typeRefPackage of typeRefDirectives) {
          typeRefPackages.add(typeRefPackage);
        }
        allRawExports.set(normalizedPath, exportEntries);
        allRawImports.set(normalizedPath, importEntries);
        allRawReferences.set(normalizedPath, tripleSlashRefs);
        fileIsExternalModule.set(normalizedPath, isExternalModule);

        for (const reference of tripleSlashRefs) {
          const resolvedPaths = resolveModuleSpecifier(reference, normalizedPath);
          if (resolvedPaths.length > 0) {
            for (const refPath of resolvedPaths) {
              recordTripleSlashEdge(normalizedPath, refPath);
              tryEnqueue(refPath);
            }
          } else {
            const refPath = resolveTripleSlashRef(reference, normalizedPath);
            if (refPath) {
              recordTripleSlashEdge(normalizedPath, refPath);
              tryEnqueue(refPath);
            }
          }
        }

        for (const exportEntry of exportEntries) {
          if (exportEntry.source) {
            const sourcePaths = resolveModuleSpecifier(exportEntry.source, normalizedPath);
            for (const sourcePath of sourcePaths) {
              tryEnqueue(sourcePath);
            }
          }
        }

        for (const importEntry of importEntries) {
          if (importEntry.source) {
            const importedPaths = resolveModuleSpecifier(importEntry.source, normalizedPath);
            for (const importedPath of importedPaths) {
              tryEnqueue(importedPath);
            }
          }
        }

        for (const exportEntry of exportEntries) {
          if (!exportEntry.dependencies) continue;
          for (const dependency of exportEntry.dependencies) {
            if (!dependency.importPath) continue;
            const depPaths = resolveModuleSpecifier(dependency.importPath, normalizedPath);
            for (const depPath of depPaths) {
              if (depPath !== dependency.importPath) {
                tryEnqueue(depPath);
              }
            }
          }
        }
      }
      layer = [...next].sort();
    }
  }

/** Resolve all public symbols from a file by following its export chain. */
  function resolveFile(
    filePath: string,
    depth: number,
    namePrefix: string = ""
  ): ResolvedSymbol[] {
    const normalizedPath = normalizePath(filePath);
    if (depth > maxHops || resolutionPath.has(normalizedPath)) return [];

    if (!namePrefix && resolutionCache.has(normalizedPath)) {
      if (crawlProfiling) profileResolveFileCacheHits++;
      return resolutionCache.get(normalizedPath)!;
    }

    const rawExports = allRawExports.get(normalizedPath);
    if (!rawExports) return [];

    resolutionPath.add(normalizedPath);

    const resolvingAsScript = fileIsExternalModule.get(normalizedPath) === false;

    const actualExports = [...rawExports];
    // When folding `/// <reference path="..." />` results into the entry resolution,
    // overloads must be kept distinct. De-dupe using kind+signature, not just name.
    const knownExportKeys = new Set(
      rawExports.map((entry) => `${entry.name}::${entry.kind}::${normalizeSignature(entry.signature)}`)
    );

    const tripleSlashRefs = allRawReferences.get(normalizedPath) || [];
  
    for (const ref of tripleSlashRefs) {
      const resolvedPaths = resolveModuleSpecifier(ref, normalizedPath);
      const refPaths = resolvedPaths.length > 0 ? resolvedPaths : [resolveTripleSlashRef(ref, normalizedPath)].filter(Boolean) as string[];

      for (const refPath of refPaths) {
        const refNormalized = normalizePath(refPath);
        const refIsModule = fileIsExternalModule.get(refNormalized) ?? true;
        // TS: triple-slash does not pull module-scoped declarations into the referrer's global scope.
        // Exception: module files can still contribute ambient declarations via `declare global`.
        const nestedSymbols = resolveFile(refPath, depth + 1).filter((symbolNode) =>
          refIsModule ? symbolNode.isGlobalAugmentation === true : true
        );
        for (const symbolNode of nestedSymbols) {
          const exportKey = `${symbolNode.name}::${symbolNode.kind}::${normalizeSignature(symbolNode.signature)}`;
          if (!knownExportKeys.has(exportKey)) {
            knownExportKeys.add(exportKey);
            actualExports.push({
              name: symbolNode.name,
              kind: symbolNode.kind,
              kindName: symbolNode.kindName,
              signature: symbolNode.signature,
              jsDoc: symbolNode.jsDoc,
              isExplicitExport: true,
              isTypeOnly: symbolNode.isTypeOnly,
              symbolSpace: symbolNode.symbolSpace,
              dependencies: symbolNode.dependencies,
              deprecated: symbolNode.deprecated,
              visibility: symbolNode.visibility,
              decorators: symbolNode.decorators,
              heritage: symbolNode.heritage,
              modifiers: symbolNode.modifiers,
              since: symbolNode.since,
              declaredInFile: refNormalized,
              isGlobalAugmentation: symbolNode.isGlobalAugmentation,
            });
          }
        }
      }
    }

    const localIndex = new Map<string, ParsedExport[]>();
    for (const exportEntry of actualExports) {
      const existing = localIndex.get(exportEntry.name) || [];
      existing.push(exportEntry);
      localIndex.set(exportEntry.name, existing);
    }

    const results: ResolvedSymbol[] = [];
    const seenSymbolKeys = new Set<string>();

    for (const exportEntry of actualExports) {
      if (
        exportEntry.isGlobalAugmentation &&
        exportEntry.kind === ts.SyntaxKind.ModuleDeclaration &&
        exportEntry.name === "global"
      ) {
        continue;
      }
      if (!exportEntry.isExplicitExport && !resolvingAsScript && !exportEntry.isGlobalAugmentation) continue;

      const definedInPath = exportEntry.declaredInFile ?? normalizedPath;

      if (exportEntry.source) {
        for (const resolvedSymbol of resolveReExport(exportEntry, normalizedPath, depth, namePrefix)) {
          const symbolKey = symbolDedupeKey(
            resolvedSymbol.definedIn,
            resolvedSymbol.name,
            resolvedSymbol.kind,
            resolvedSymbol.signature
          );
          if (!seenSymbolKeys.has(symbolKey)) {
            seenSymbolKeys.add(symbolKey);
            results.push(resolvedSymbol);
          }
        }
      } else if (
        exportEntry.kind === ts.SyntaxKind.ExportAssignment ||
        exportEntry.kind === ts.SyntaxKind.ExportDeclaration ||
        exportEntry.kind === ts.SyntaxKind.ImportEqualsDeclaration
      ) {
        results.push(...resolveLocalAssignment(exportEntry, localIndex, normalizedPath, namePrefix));
      } else {
        results.push({
          name: namePrefix ? `${namePrefix}.${exportEntry.name}` : exportEntry.name,
          kind: exportEntry.kind,
          kindName: exportEntry.kindName,
          isTypeOnly: exportEntry.isTypeOnly,
          symbolSpace: exportEntry.symbolSpace,
          signature: exportEntry.signature,
          jsDoc: exportEntry.jsDoc,
          definedIn: definedInPath,
          dependencies: exportEntry.dependencies,
          deprecated: exportEntry.deprecated,
          visibility: exportEntry.visibility,
          since: exportEntry.since,
          heritage: exportEntry.heritage,
          decorators: exportEntry.decorators,
          modifiers: exportEntry.modifiers,
          isGlobalAugmentation: exportEntry.isGlobalAugmentation,
        });
      }
    }

    resolutionPath.delete(normalizedPath);

    // Only cache if there's no prefix (global resolution for this file)
    if (!namePrefix) {
      resolutionCache.set(normalizedPath, results);
    }

    return results;
  }

/** Resolve symbols that are re-exported from another module. */
  function resolveReExport(
    exportEntry: ParsedExport,
    currentFile: string,
    depth: number,
    namePrefix: string
  ): ResolvedSymbol[] {
    const results: ResolvedSymbol[] = [];
    const fullName = namePrefix ? `${namePrefix}.${exportEntry.name}` : exportEntry.name;
    const sourcePaths = resolveModuleSpecifier(exportEntry.source!, currentFile);

    if (sourcePaths.length === 0) {
      if (!exportEntry.isWildcard) {
        results.push({
          name: fullName,
          kind: exportEntry.kind,
          kindName: exportEntry.kindName,
          isTypeOnly: exportEntry.isTypeOnly,
          symbolSpace: exportEntry.symbolSpace,
          definedIn: currentFile,
          reExportChain: [currentFile],
          signature: exportEntry.signature,
          jsDoc: exportEntry.jsDoc,
          deprecated: exportEntry.deprecated,
          visibility: exportEntry.visibility,
          since: exportEntry.since,
          heritage: exportEntry.heritage,
          decorators: exportEntry.decorators,
          modifiers: exportEntry.modifiers,
          isGlobalAugmentation: exportEntry.isGlobalAugmentation,
        });
      }
      return results;
    }

    const allNestedSymbols: ResolvedSymbol[] = [];
    for (const sourcePath of sourcePaths) {
      allNestedSymbols.push(...resolveFile(sourcePath, depth + 1));
    }

    if (exportEntry.isWildcard) {
      return allNestedSymbols;
    } else if (exportEntry.isNamespaceExport) {
      results.push({
        name: fullName,
        kind: exportEntry.kind,
        kindName: exportEntry.kindName,
        isTypeOnly: exportEntry.isTypeOnly,
        symbolSpace: exportEntry.symbolSpace,
        definedIn: currentFile,
        reExportChain: [currentFile],
        signature: exportEntry.signature || `namespace ${exportEntry.name} { ${allNestedSymbols.length} symbols }`,
        jsDoc: exportEntry.jsDoc,
        deprecated: exportEntry.deprecated,
        visibility: exportEntry.visibility,
        since: exportEntry.since,
        heritage: exportEntry.heritage,
        decorators: exportEntry.decorators,
        modifiers: exportEntry.modifiers,
        isGlobalAugmentation: exportEntry.isGlobalAugmentation,
      });
      for (const symbolNode of allNestedSymbols) {
        results.push({
          ...symbolNode,
          name: namePrefix ? `${namePrefix}.${exportEntry.name}.${symbolNode.name}` : `${exportEntry.name}.${symbolNode.name}`,
          reExportChain: [currentFile, ...(symbolNode.reExportChain ?? [])],
        });
      }
    } else {
      const targetName = exportEntry.originalName ?? exportEntry.name;
      const matches = allNestedSymbols.filter(symbolNode => symbolNode.name === targetName);
      if (matches.length > 0) {
        for (const match of matches) {
          results.push({
            ...match,
            name: fullName,
            reExportChain: [currentFile, ...(match.reExportChain ?? [])],
          });
        }
      } else {
        results.push({
          name: fullName,
          kind: exportEntry.kind,
          kindName: exportEntry.kindName,
          isTypeOnly: exportEntry.isTypeOnly,
          symbolSpace: exportEntry.symbolSpace,
          definedIn: normalizePath(sourcePaths[0]!),
          reExportChain: [currentFile],
          signature: exportEntry.signature,
          jsDoc: exportEntry.jsDoc,
          deprecated: exportEntry.deprecated,
          visibility: exportEntry.visibility,
          since: exportEntry.since,
          heritage: exportEntry.heritage,
          decorators: exportEntry.decorators,
          modifiers: exportEntry.modifiers,
          isGlobalAugmentation: exportEntry.isGlobalAugmentation,
        });
      }
    }

    return results;
  }

/** Resolve symbols that are assigned locally. */
  function resolveLocalAssignment(
    exportEntry: ParsedExport,
    localIndex: Map<string, ParsedExport[]>,
    currentFile: string,
    namePrefix: string
  ): ResolvedSymbol[] {
    const targetName = exportEntry.originalName ?? exportEntry.name;
    const targets = localIndex.get(targetName) || [];

    const actualTargets = targets.filter(target => target !== exportEntry);
    
    if (actualTargets.length === 0) return [];

    const results: ResolvedSymbol[] = [];
    const fullName = namePrefix ? `${namePrefix}.${exportEntry.name}` : exportEntry.name;

    for (const target of actualTargets) {
      results.push({
        name: fullName,
        kind: target.kind,
        kindName: target.kindName,
        isTypeOnly: target.isTypeOnly,
        symbolSpace: target.symbolSpace,
        signature: target.signature,
        jsDoc: target.jsDoc,
        definedIn: currentFile,
        dependencies: target.dependencies,
        deprecated: target.deprecated,
        visibility: target.visibility,
        since: target.since,
        heritage: target.heritage,
        decorators: target.decorators,
        modifiers: target.modifiers,
        isGlobalAugmentation: target.isGlobalAugmentation,
      });
    }

    // Expand namespace members using prefix matching for each target
    for (const target of actualTargets) {
      const memberPrefix = target.name + ".";
      const matchingMembers: ParsedExport[] = [];
      for (const [memberName, members] of localIndex) {
        if (memberName.startsWith(memberPrefix)) {
          matchingMembers.push(...members);
        }
      }
      for (const member of matchingMembers) {
        const localMemberName = member.name.slice(memberPrefix.length);
        const newName = namePrefix ? `${namePrefix}.${exportEntry.name}.${localMemberName}` : `${exportEntry.name}.${localMemberName}`;
        results.push({
          name: newName,
          kind: member.kind,
          kindName: member.kindName,
          isTypeOnly: member.isTypeOnly,
          symbolSpace: member.symbolSpace,
          signature: member.signature,
          jsDoc: member.jsDoc,
          definedIn: currentFile,
          dependencies: member.dependencies,
          deprecated: member.deprecated,
          visibility: member.visibility,
          since: member.since,
          heritage: member.heritage,
          decorators: member.decorators,
          modifiers: member.modifiers,
          isGlobalAugmentation: member.isGlobalAugmentation,
        });
      }
    }

    return results;
  }

  return {
    filePath: primaryEntry,
    exports: resolvedSymbols,
    imports: Object.fromEntries(importsSorted),
    visitedFiles: [...visited].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
    typeReferencePackages: [...typeRefPackages].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
    circularRefs: [...new Set(circularRefs)].sort((a, b) => a.localeCompare(b)),
    tripleSlashReferenceTargets,
  };
}

/** Resolve a triple-slash reference path relative to the current file. */
function resolveTripleSlashRef(
  refPath: string,
  currentFile: string
): string | null {
  const dir = path.dirname(currentFile);
  const resolved = path.resolve(dir, refPath);
  if (fs.existsSync(resolved)) return normalizePath(resolved);
  return null;
}

