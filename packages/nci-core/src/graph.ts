/**
 * NCI Core — Graph Constructor
 *
 * Transforms crawl results into a structured symbol graph.
 * Produces the final PackageGraph output that gets written to .nci JSON files.
 *
 * Handles:
 * - Multiple entry points (subpath exports)
 * - Declaration merging (deduplication by name + source file)
 * - ID disambiguation for same-name symbols from different files
 * - Dependency resolution to symbol IDs
 */
import path from "node:path";
import ts from "typescript";
import type {
  PackageGraph,
  PackageInfo,
  ResolvedSymbol,
  SymbolNode,
} from "./types.js";
import { resolveTypesEntry, resolveModuleSpecifier } from "./resolver.js";
import { crawl, type CrawlOptions } from "./crawler.js";
import { clearParserCache } from "./parser.js";

/**
 * Build a symbol graph for a single package.
 *
 * Crawls ALL entry points (root + subpath exports) and merges results.
 *
 * @param packageInfo - Package metadata from the scanner
 * @param crawlOptions - Options for the crawler
 * @returns PackageGraph with all resolved symbols
 */
export function buildPackageGraph(
  packageInfo: PackageInfo,
  crawlOptions?: CrawlOptions
): PackageGraph {
  const startTime = performance.now();
  const entry = resolveTypesEntry(packageInfo.dir);

  if (entry.typesEntries.length === 0) {
    return {
      package: packageInfo.name,
      version: packageInfo.version,
      symbols: [],
      totalSymbols: 0,
      totalFiles: 0,
      crawlDurationMs: performance.now() - startTime,
    };
  }

  const crawlResult = crawl(entry.typesEntries, crawlOptions);
  const allSymbols = crawlResult.exports;
  const allImportsPerFile = crawlResult.imports;
  const visited = new Set(crawlResult.visitedFiles);

  // 1. Symbol Mapping and Declaration Merging: Consolidate multiple declarations into unique nodes.
  const merged = new Map<string, SymbolNode>();
  const sameFileCounters = new Map<string, number>();

  const isCrossFileMergeable = (kind: ts.SyntaxKind): boolean =>
    kind === ts.SyntaxKind.ModuleDeclaration ||
    kind === ts.SyntaxKind.InterfaceDeclaration ||
    kind === ts.SyntaxKind.EnumDeclaration;

  for (const resolved of allSymbols) {
    const symbolFilePath = makeRelative(resolved.definedIn, packageInfo.dir);
    let mergeKey: string;

    if (isCrossFileMergeable(resolved.kind)) {
      // Mergeable types (Interfaces, Namespaces) merge by name package-wide.
      mergeKey = resolved.name;
    } else {
      // Other declarations (like overloads) are unique by name, kind, and file.
      const perFileKey = `${resolved.name}::${resolved.kind}::${symbolFilePath}`;
      const count = (sameFileCounters.get(perFileKey) ?? 0) + 1;
      sameFileCounters.set(perFileKey, count);
      mergeKey = count === 1 ? perFileKey : `${perFileKey}#local${count}`;
    }

    const existing = merged.get(mergeKey);
    if (existing) {
      if (symbolFilePath !== existing.filePath) {
        existing.additionalFiles = existing.additionalFiles || [];
        if (!existing.additionalFiles.includes(symbolFilePath)) {
          existing.additionalFiles.push(symbolFilePath);
        }
      }

      if (resolved.dependencies && resolved.dependencies.length > 0) {
        existing.rawDependencies = existing.rawDependencies || [];
        const existingDeps = new Set(
          existing.rawDependencies.map((dep) => `${dep.name}::${dep.importPath || ""}`)
        );
        for (const rawDep of resolved.dependencies) {
          const depKey = `${rawDep.name}::${rawDep.importPath || ""}`;
          if (!existingDeps.has(depKey)) {
            existingDeps.add(depKey);
            existing.rawDependencies.push(rawDep);
          }
        }
      }

      if (resolved.deprecated && !existing.deprecated) existing.deprecated = resolved.deprecated;
      if (resolved.visibility && !existing.visibility) existing.visibility = resolved.visibility;
      if (resolved.since && !existing.since) existing.since = resolved.since;
    } else {
      const reExportSource = resolved.reExportChain?.[0]
        ? makeRelative(resolved.reExportChain[0], packageInfo.dir)
        : undefined;

      merged.set(mergeKey, {
        id: "", // Assigned in next step
        name: resolved.name,
        kind: resolved.kind,
        kindName: resolved.kindName,
        package: packageInfo.name,
        filePath: symbolFilePath,
        signature: resolved.signature,
        jsDoc: resolved.jsDoc,
        isTypeOnly: resolved.isTypeOnly,
        dependencies: [],
        rawDependencies: resolved.dependencies,
        isInternal: resolved.isInternal,
        reExportedFrom: reExportSource !== symbolFilePath ? reExportSource : undefined,
        deprecated: resolved.deprecated,
        visibility: resolved.visibility,
        since: resolved.since,
      });
    }
  }

  const symbols = Array.from(merged.values());
  const nameToId = new Map<string, string>();
  const fileLocalToId = new Map<string, string>();
  const nameCount = new Map<string, number>();

  // 2. ID Generation: Assign unique identifiers and build fast-lookup reference maps.
  for (const symbolNode of symbols) {
    const count = (nameCount.get(symbolNode.name) ?? 0) + 1;
    nameCount.set(symbolNode.name, count);

    const baseId = `${packageInfo.name}@${packageInfo.version}::${symbolNode.name}`;
    if (symbolNode.isInternal) {
      symbolNode.id = `${packageInfo.name}@${packageInfo.version}::${symbolNode.filePath}::${symbolNode.name}`;
    } else {
      symbolNode.id = count === 1 ? baseId : `${baseId}#${count}`;
    }

    fileLocalToId.set(`${symbolNode.filePath}::${symbolNode.name}`, symbolNode.id);
    if (!symbolNode.isInternal || !nameToId.has(symbolNode.name)) {
      nameToId.set(symbolNode.name, symbolNode.id);
    }
  }

  // 3. Dependency Resolution: Link raw type references to unique symbol IDs across the package.
  for (const symbolNode of symbols) {
    if (symbolNode.rawDependencies && symbolNode.rawDependencies.length > 0) {
      const resolvedIds = new Set<string>();
      for (const rawDep of symbolNode.rawDependencies) {
        let targetId: string | undefined;

        if (rawDep.importPath) {
          const absPath = resolveModuleSpecifier(rawDep.importPath, path.join(packageInfo.dir, symbolNode.filePath));
          if (absPath) {
            const relPath = makeRelative(absPath, packageInfo.dir);
            targetId = fileLocalToId.get(`${relPath}::${rawDep.name}`);
          }
        } else {
          // For internal private types
          targetId = fileLocalToId.get(`${symbolNode.filePath}::${rawDep.name}`);

          // Try to resolve via imports in the file where this symbol is defined
          if (!targetId) {
            const absPathForLookup = path.resolve(packageInfo.dir, symbolNode.filePath).replace(/\\/g, "/");
            const fileImports = allImportsPerFile[absPathForLookup] || [];
            const matchingImport = fileImports.find(imp => imp.name === rawDep.name);

            if (matchingImport) {
              const absSourcePath = resolveModuleSpecifier(matchingImport.source, path.join(packageInfo.dir, symbolNode.filePath));
              if (absSourcePath) {
                const relSourcePath = makeRelative(absSourcePath, packageInfo.dir);
                const originalName = matchingImport.originalName || matchingImport.name;
                targetId = fileLocalToId.get(`${relSourcePath}::${originalName}`);
              }
            }
          }
          if (!targetId) targetId = nameToId.get(rawDep.name);
        }
        if (targetId) resolvedIds.add(targetId);
      }
      symbolNode.dependencies = Array.from(resolvedIds);
    }
    delete symbolNode.rawDependencies;
  }

  const result: PackageGraph = {
    package: packageInfo.name,
    version: packageInfo.version,
    symbols,
    totalSymbols: symbols.length,
    totalFiles: visited.size,
    crawlDurationMs: performance.now() - startTime,
  };

  clearParserCache();

  return result;
}

/**
 * Make a path relative to the package directory.
 */
function makeRelative(absPath: string, packageDir: string): string {
  const normalized = absPath.replace(/\\/g, "/");
  const normalizedDir = packageDir.replace(/\\/g, "/");

  if (normalized.startsWith(normalizedDir)) {
    return normalized.slice(normalizedDir.length + 1);
  }
  return path.relative(packageDir, absPath).replace(/\\/g, "/");
}
