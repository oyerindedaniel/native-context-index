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
    for (const entry of exports) {
      if (entry.isGlobalAugmentation || entry.isWildcard || !entry.name) continue;
      // Skip ExportDeclarations — they're forwarding statements, not definitions.
      if (entry.kind === ts.SyntaxKind.ExportDeclaration) continue;

      if (!publicSymbols.has(`${file}::${entry.name}`)) {
        resolvedSymbols.push({
          name: entry.name,
          kind: entry.kind,
          kindName: entry.kindName,
          isTypeOnly: entry.isTypeOnly,
          signature: entry.signature,
          jsDoc: entry.jsDoc,
          definedIn: file,
          dependencies: entry.dependencies,
          deprecated: entry.deprecated,
          visibility: entry.visibility,
          isInternal: true,
        });
        publicSymbols.add(`${file}::${entry.name}`);
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

    for (const ref of tripleSlashRefs) {
      const refPath = resolveModuleSpecifier(ref, normalizedPath) ?? resolveTripleSlashRef(ref, normalizedPath);
      if (refPath) discoverFiles(refPath, depth + 1);
    }

    for (const exportEntry of exportEntries) {
      if (exportEntry.source) {
        const sourcePath = resolveModuleSpecifier(exportEntry.source, normalizedPath);
        if (sourcePath) discoverFiles(sourcePath, depth + 1);
      }
    }

    // Follow regular imports so internal types are discovered
    for (const importEntry of importEntries) {
      if (importEntry.source) {
        const importedPath = resolveModuleSpecifier(importEntry.source, normalizedPath);
        if (importedPath) discoverFiles(importedPath, depth + 1);
      }
    }

    discoveryPathStack.pop();
    discoveryPathSet.delete(normalizedPath);
  }

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
      const refPath = resolveModuleSpecifier(ref, normalizedPath) ?? resolveTripleSlashRef(ref, normalizedPath);
      if (refPath) {
        const nestedSymbols = resolveFile(refPath, depth + 1);
        for (const sym of nestedSymbols) {
          if (!knownNames.has(sym.name)) {
            knownNames.add(sym.name);
            actualExports.push({
              name: sym.name,
              kind: sym.kind,
              kindName: sym.kindName,
              signature: sym.signature,
              jsDoc: sym.jsDoc,
              isExplicitExport: true,
              isTypeOnly: sym.isTypeOnly,
              dependencies: sym.dependencies,
              deprecated: sym.deprecated,
              visibility: sym.visibility,
              since: sym.since,
            });
          }
        }
      }
    }

    const localIndex = new Map<string, ParsedExport[]>();
    for (const exp of actualExports) {
      const existing = localIndex.get(exp.name) || [];
      existing.push(exp);
      localIndex.set(exp.name, existing);
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

  function resolveReExport(
    exp: ParsedExport,
    currentFile: string,
    depth: number,
    namePrefix: string
  ): ResolvedSymbol[] {
    const results: ResolvedSymbol[] = [];
    const fullName = namePrefix ? `${namePrefix}.${exp.name}` : exp.name;
    const sourcePath = resolveModuleSpecifier(exp.source!, currentFile);

    if (!sourcePath) {
      if (!exp.isWildcard) {
        results.push({
          name: fullName,
          kind: exp.kind,
          kindName: exp.kindName,
          isTypeOnly: exp.isTypeOnly,
          definedIn: currentFile,
          reExportChain: [currentFile],
          signature: exp.signature,
          jsDoc: exp.jsDoc,
          deprecated: exp.deprecated,
          visibility: exp.visibility,
          since: exp.since,
        });
      }
      return results;
    }

    const nestedSymbols = resolveFile(sourcePath, depth + 1);

    if (exp.isWildcard) {
      return nestedSymbols;
    } else if (exp.isNamespaceExport) {
      results.push({
        name: fullName,
        kind: exp.kind,
        kindName: exp.kindName,
        isTypeOnly: exp.isTypeOnly,
        definedIn: currentFile,
        reExportChain: [currentFile],
        signature: exp.signature || `namespace ${exp.name} { ${nestedSymbols.length} symbols }`,
        jsDoc: exp.jsDoc,
        deprecated: exp.deprecated,
        visibility: exp.visibility,
        since: exp.since,
      });
      for (const sym of nestedSymbols) {
        results.push({
          ...sym,
          name: namePrefix ? `${namePrefix}.${exp.name}.${sym.name}` : `${exp.name}.${sym.name}`,
          reExportChain: [currentFile, ...(sym.reExportChain ?? [])],
        });
      }
    } else {
      const targetName = exp.originalName ?? exp.name;
      const match = nestedSymbols.find(sym => sym.name === targetName);
      if (match) {
        results.push({
          ...match,
          name: fullName,
          reExportChain: [currentFile, ...(match.reExportChain ?? [])],
        });
      } else {
        results.push({
          name: fullName,
          kind: exp.kind,
          kindName: exp.kindName,
          isTypeOnly: exp.isTypeOnly,
          definedIn: normalizePath(sourcePath),
          reExportChain: [currentFile],
          signature: exp.signature,
          jsDoc: exp.jsDoc,
          deprecated: exp.deprecated,
          visibility: exp.visibility,
          since: exp.since,
        });
      }
    }

    return results;
  }

  function resolveLocalAssignment(
    exp: ParsedExport,
    localIndex: Map<string, ParsedExport[]>,
    currentFile: string,
    namePrefix: string
  ): ResolvedSymbol[] {
    const targetName = exp.originalName ?? exp.name;
    const targets = localIndex.get(targetName) || [];

    const actualTargets = targets.filter(target => target !== exp);
    
    if (actualTargets.length === 0) return [];

    const results: ResolvedSymbol[] = [];
    const fullName = namePrefix ? `${namePrefix}.${exp.name}` : exp.name;

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
        const newName = namePrefix ? `${namePrefix}.${exp.name}.${localMemberName}` : `${exp.name}.${localMemberName}`;
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
        });
      }
    }

    return results;
  }
}

/**
 * Resolve a triple-slash reference path relative to the current file.
 *
 * Triple-slash references use direct paths like "globals.d.ts" or
 * "./buffer.d.ts" that are resolved relative to the containing file.
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

