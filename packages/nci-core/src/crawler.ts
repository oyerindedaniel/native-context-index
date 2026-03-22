/**
 * NCI Core — Crawler
 *
 * The core recursive engine. Given a starting .d.ts file:
 * 1. Parse it for exports
 * 2. For each re-export, JUMP into the target file
 * 3. Resolve the actual symbol definitions
 * 4. Track visited files to detect circular dependencies
 * 5. Enforce a configurable depth limit
 */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { parseFile } from "./parser.js";
import { resolveModuleSpecifier, normalizePath } from "./resolver.js";
import type { CrawlResult, ParsedExport, ParsedImport, ResolvedSymbol } from "./types.js";
import { DEFAULT_MAX_DEPTH } from "./constants.js";

export interface CrawlOptions {
  /** Maximum depth for following re-exports (default: 10) */
  maxDepth?: number;
}

/**
 * Crawl one or more .d.ts files, following all re-exports recursively.
 *
 * @param entryFilePaths - Absolute path(s) to the starting .d.ts file(s)
 * @param options - Crawl configuration
 * @returns CrawlResult with all resolved symbols
 */
export function crawl(
  entryFilePaths: string | string[],
  options: CrawlOptions = {}
): CrawlResult {
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const visited = new Set<string>();
  const circularRefs: string[] = [];
  const resolvedSymbols: ResolvedSymbol[] = [];
  const typeRefPackages = new Set<string>();

  const allRawExports = new Map<string, ParsedExport[]>();
  const allRawImports = new Map<string, ParsedImport[]>();
  const allRawReferences = new Map<string, string[]>();
  const discoveryPathSet = new Set<string>();
  const discoveryPathStack: string[] = [];
  const resolutionPath = new Set<string>();
  const resolutionCache = new Map<string, ResolvedSymbol[]>();

  const entries = Array.isArray(entryFilePaths) ? entryFilePaths : [entryFilePaths];
  const primaryEntry = entries[0] || "";

  for (const entryPath of entries) {
    discoverFiles(entryPath, 0);
  }

  const publicSymbols = new Set<string>();
  for (const entryPath of entries) {
    const resolved = resolveFile(entryPath, 0);
    for (const resolvedSymbol of resolved) {
      resolvedSymbol.isInternal = false;
      resolvedSymbols.push(resolvedSymbol);
      publicSymbols.add(`${resolvedSymbol.definedIn}::${resolvedSymbol.name}`);
    }
  }

  for (const file of visited) {
    const exports = allRawExports.get(file) || [];
    for (const exportEntry of exports) {
      if (exportEntry.isGlobalAugmentation || exportEntry.isWildcard || !exportEntry.name) continue;
      // Skip ExportDeclarations — they're forwarding statements, not definitions.
      if (exportEntry.kind === ts.SyntaxKind.ExportDeclaration) continue;

      if (!publicSymbols.has(`${file}::${exportEntry.name}`)) {
        resolvedSymbols.push({
          name: exportEntry.name,
          kind: exportEntry.kind,
          kindName: exportEntry.kindName,
          isTypeOnly: exportEntry.isTypeOnly,
          signature: exportEntry.signature,
          jsDoc: exportEntry.jsDoc,
          definedIn: file,
          dependencies: exportEntry.dependencies,
          deprecated: exportEntry.deprecated,
          visibility: exportEntry.visibility,
          since: exportEntry.since,
          heritage: exportEntry.heritage,
          isInternal: true,
        });
        publicSymbols.add(`${file}::${exportEntry.name}`);
      }
    }
  }

  return {
    filePath: primaryEntry,
    exports: resolvedSymbols,
    imports: Object.fromEntries(allRawImports),
    visitedFiles: Array.from(visited),
    typeReferencePackages: Array.from(typeRefPackages),
    circularRefs,
  };

  /**
   * Internal recursive explorer that identifies all files reachable from an entry point.
   * Scans for both re-exports and triple-slash references to build the complete visit set.
   *
   * @param filePath Absolute path to the file to discover.
   * @param depth Current recursion depth.
   */
  function discoverFiles(filePath: string, depth: number): void {
    const normalizedPath = normalizePath(filePath);
    if (depth > maxDepth) return;
    if (!fs.existsSync(normalizedPath)) return;

    if (discoveryPathSet.has(normalizedPath)) {
      circularRefs.push([...discoveryPathStack, normalizedPath].join(" -> "));
      return;
    }

    if (visited.has(normalizedPath)) return;
    visited.add(normalizedPath);

    discoveryPathSet.add(normalizedPath);
    discoveryPathStack.push(normalizedPath);

    const { exports: exportEntries, imports: importEntries, references: tripleSlashRefs, typeReferences: typeRefDirectives } = parseFile(normalizedPath);
    for (const pkg of typeRefDirectives) typeRefPackages.add(pkg);
    allRawExports.set(normalizedPath, exportEntries);
    allRawImports.set(normalizedPath, importEntries);
    allRawReferences.set(normalizedPath, tripleSlashRefs);

    for (const reference of tripleSlashRefs) {
      const resolvedPaths = resolveModuleSpecifier(reference, normalizedPath);
      if (resolvedPaths.length > 0) {
        for (const refPath of resolvedPaths) discoverFiles(refPath, depth + 1);
      } else {
        const refPath = resolveTripleSlashRef(reference, normalizedPath);
        if (refPath) discoverFiles(refPath, depth + 1);
      }
    }

    for (const exportEntry of exportEntries) {
      if (exportEntry.source) {
        const sourcePaths = resolveModuleSpecifier(exportEntry.source, normalizedPath);
        for (const sourcePath of sourcePaths) {
          discoverFiles(sourcePath, depth + 1);
        }
      }
    }

    // Follow regular imports so internal types are discovered
    for (const importEntry of importEntries) {
      if (importEntry.source) {
        const importedPaths = resolveModuleSpecifier(importEntry.source, normalizedPath);
        for (const importedPath of importedPaths) {
          discoverFiles(importedPath, depth + 1);
        }
      }
    }

    discoveryPathStack.pop();
    discoveryPathSet.delete(normalizedPath);
  }

  /**
   * Resolves all public symbols from a file by following its export chain.
   *
   * @param filePath Absolute path to the file to resolve.
   * @param depth Current recursion depth.
   * @param namePrefix Optional prefix for nested symbols (e.g., from namespace exports).
   * @returns Array of fully resolved symbols.
   */
  function resolveFile(
    filePath: string,
    depth: number,
    namePrefix: string = ""
  ): ResolvedSymbol[] {
    const normalizedPath = normalizePath(filePath);
    if (depth > maxDepth || resolutionPath.has(normalizedPath)) return [];

    if (!namePrefix && resolutionCache.has(normalizedPath)) {
      return resolutionCache.get(normalizedPath)!;
    }

    const rawExports = allRawExports.get(normalizedPath);
    if (!rawExports) return [];

    resolutionPath.add(normalizedPath);

    const actualExports = [...rawExports];
    const knownNames = new Set(rawExports.map(entry => entry.name));

    const tripleSlashRefs = allRawReferences.get(normalizedPath) || [];
    for (const ref of tripleSlashRefs) {
      const resolvedPaths = resolveModuleSpecifier(ref, normalizedPath);
      const refPaths = resolvedPaths.length > 0 ? resolvedPaths : [resolveTripleSlashRef(ref, normalizedPath)].filter(Boolean) as string[];

      for (const refPath of refPaths) {
        const nestedSymbols = resolveFile(refPath, depth + 1);
        for (const symbolNode of nestedSymbols) {
          if (!knownNames.has(symbolNode.name)) {
            knownNames.add(symbolNode.name);
            actualExports.push({
              name: symbolNode.name,
              kind: symbolNode.kind,
              kindName: symbolNode.kindName,
              signature: symbolNode.signature,
              jsDoc: symbolNode.jsDoc,
              isExplicitExport: true,
              isTypeOnly: symbolNode.isTypeOnly,
              dependencies: symbolNode.dependencies,
              deprecated: symbolNode.deprecated,
              visibility: symbolNode.visibility,
              decorators: symbolNode.decorators,
              heritage: symbolNode.heritage,
              modifiers: symbolNode.modifiers,
              since: symbolNode.since,
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

    for (const exportEntry of actualExports) {
      if (exportEntry.isGlobalAugmentation) continue;
      // Skip non-exported declarations — they'll be captured as internal symbols
      if (!exportEntry.isExplicitExport) continue;

      if (exportEntry.source) {
        results.push(...resolveReExport(exportEntry, normalizedPath, depth, namePrefix));
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
          signature: exportEntry.signature,
          jsDoc: exportEntry.jsDoc,
          definedIn: normalizedPath,
          dependencies: exportEntry.dependencies,
          deprecated: exportEntry.deprecated,
          visibility: exportEntry.visibility,
          since: exportEntry.since,
          heritage: exportEntry.heritage,
          decorators: exportEntry.decorators,
          modifiers: exportEntry.modifiers,
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

  /**
   * Resolves symbols that are re-exported from another module (e.g., export * from "./s").
   *
   * @param exportEntry The parsed export entry identifying the source.
   * @param currentFile The path of the file containing the re-export.
   * @param depth Current recursion depth.
   * @param namePrefix Current symbol name prefix.
   * @returns Array of resolved symbols from the target module.
   */
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
        });
      }
    }

    return results;
  }

  /**
   * Resolves symbols that are assigned locally (e.g., export { x as y } or export default x).
   *
   * @param exportEntry The parsed export statement.
   * @param localIndex Map of all symbols defined in the current file.
   * @param currentFile Path to the current file.
   * @param namePrefix Current symbol name prefix.
   * @returns Resolved symbol associated with the assignment.
   */
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
        });
      }
    }

    return results;
  }
}

/**
 * Resolves a triple-slash reference path relative to the current file.
 * Triple-slash references are prioritized in the discovery phase for architectural integrity.
 *
 * @param refPath The raw reference path from the triple-slash directive.
 * @param currentFile The path of the containing file.
 * @returns Resolved absolute path or null if not found.
 */
function resolveTripleSlashRef(
  refPath: string,
  currentFile: string
): string | null {
  const dir = path.dirname(currentFile);
  const resolved = path.resolve(dir, refPath);
  if (fs.existsSync(resolved)) return normalizePath(resolved);
  return null;
}

