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
import type {
  PackageGraph,
  PackageInfo,
  ResolvedSymbol,
  SymbolNode,
} from "./types.js";
import { resolveTypesEntry, resolveModuleSpecifier } from "./resolver.js";
import { crawl, type CrawlOptions } from "./crawler.js";
import { clearSourceFileCache } from "./parser.js";

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

  const rawNodes = allSymbols.map((resolvedSymbol) =>
    toSymbolNode(resolvedSymbol, packageInfo)
  );

  const symbols = mergeDeclarations(rawNodes);

  const nameCount = new Map<string, number>();
  for (const symbolNode of symbols) {
    const count = (nameCount.get(symbolNode.name) ?? 0) + 1;
    nameCount.set(symbolNode.name, count);
    
    const baseId = `${packageInfo.name}@${packageInfo.version}::${symbolNode.name}`;
    
    if (symbolNode.isInternal) {
      // Internal symbols are ALWAYS file-qualified to avoid collisions
      symbolNode.id = `${packageInfo.name}@${packageInfo.version}::${symbolNode.filePath}::${symbolNode.name}`;
    } else if (count === 1) {
      symbolNode.id = baseId;
    } else {
      symbolNode.id = `${baseId}#${count}`;
    }
  }

  // Build lookup maps for dependency resolution
  const nameToId = new Map<string, string>(); // Global name lookup (public first)
  const fileLocalToId = new Map<string, string>(); // File-local lookup: "filePath::name"

  for (const symbolNode of symbols) {
    fileLocalToId.set(`${symbolNode.filePath}::${symbolNode.name}`, symbolNode.id);

    // Public exports take precedence in global name lookup
    if (!symbolNode.isInternal || !nameToId.has(symbolNode.name)) {
      nameToId.set(symbolNode.name, symbolNode.id);
    }
  }

  // Resolve dependencies using structured rawDependencies
  for (const symbolNode of symbols) {
    if (symbolNode.rawDependencies && symbolNode.rawDependencies.length > 0) {
      const resolvedIds = new Set<string>();
      for (const rawDep of symbolNode.rawDependencies) {
        let targetId: string | undefined;

        if (rawDep.importPath) {
          // Inline import() resolution
          const absPath = resolveModuleSpecifier(
            rawDep.importPath,
            path.join(packageInfo.dir, symbolNode.filePath)
          );
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
              const absSourcePath = resolveModuleSpecifier(
                matchingImport.source,
                path.join(packageInfo.dir, symbolNode.filePath)
              );
              if (absSourcePath) {
                const relSourcePath = makeRelative(absSourcePath, packageInfo.dir);
                const originalName = matchingImport.originalName || matchingImport.name;
                targetId = fileLocalToId.get(`${relSourcePath}::${originalName}`);
              }
            }
          }

          // Finally check global public exports (public aliases)
          if (!targetId) {
            targetId = nameToId.get(rawDep.name);
          }
        }

        if (targetId) {
          resolvedIds.add(targetId);
        }
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

  clearSourceFileCache();

  return result;
}

/**
 * Merge declarations with the same name AND same source file.
 *
 * Symbols with the same name from different source files (e.g., multiple
 * subpath exports each defining their own `create` function) are kept
 * as distinct nodes.
 */
function mergeDeclarations(nodes: SymbolNode[]): SymbolNode[] {
  const merged = new Map<string, SymbolNode>();

  for (const node of nodes) {
    const mergeKey = `${node.name}::${node.filePath}`;
    const existing = merged.get(mergeKey);
    if (existing) {
      if (node.rawDependencies && node.rawDependencies.length > 0) {
        existing.rawDependencies = existing.rawDependencies || [];
        const existingDeps = new Set(existing.rawDependencies.map(dep => `${dep.name}::${dep.importPath || ""}`));
        for (const rawDep of node.rawDependencies) {
          const depKey = `${rawDep.name}::${rawDep.importPath || ""}`;
          if (!existingDeps.has(depKey)) {
            existingDeps.add(depKey);
            existing.rawDependencies.push(rawDep);
          }
        }
      }

      if (node.deprecated && !existing.deprecated) {
        existing.deprecated = node.deprecated;
      }

      if (node.visibility && !existing.visibility) {
        existing.visibility = node.visibility;
      }
    } else {
      merged.set(mergeKey, { ...node });
    }
  }

  return Array.from(merged.values());
}

/**
 * Convert a ResolvedSymbol into a SymbolNode with a unique ID.
 */
function toSymbolNode(
  resolved: ResolvedSymbol,
  packageInfo: PackageInfo
): SymbolNode {
    const reExportSource = resolved.reExportChain?.[0]
      ? makeRelative(resolved.reExportChain[0], packageInfo.dir)
      : undefined;
    const symbolFilePath = makeRelative(resolved.definedIn, packageInfo.dir);

    return {
    id: "",
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
  };
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
