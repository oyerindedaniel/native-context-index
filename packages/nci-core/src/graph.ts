/**
 * NCI Core — Graph Constructor
 *
 * Transforms crawl results into a structured symbol graph.
 * Produces the final PackageGraph output that gets written to .nci JSON files.
 *
 * Handles:
 * - Multiple entry points (subpath exports)
 * - Declaration merging (deduplication by name)
 * - Dependency resolution to symbol IDs
 */
import path from "node:path";
import type {
  PackageGraph,
  PackageInfo,
  ResolvedSymbol,
  SymbolNode,
} from "./types.js";
import { resolveTypesEntry } from "./resolver.js";
import { crawl, type CrawlOptions } from "./crawler.js";

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

  // Step 1: Resolve ALL types entry points (root + subpaths)
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

  // Step 2: Crawl ALL entry points and merge results
  const allSymbols: ResolvedSymbol[] = [];
  const allVisitedFiles = new Set<string>();

  for (const entryPath of entry.typesEntries) {
    const crawlResult = crawl(entryPath, crawlOptions);
    allSymbols.push(...crawlResult.exports);
    for (const f of crawlResult.visitedFiles) {
      allVisitedFiles.add(typeof f === "string" ? f : f);
    }
  }

  // Step 3: Transform resolved symbols into SymbolNodes
  const rawNodes = allSymbols.map((sym) =>
    toSymbolNode(sym, packageInfo)
  );

  // Step 4: Declaration merging — deduplicate by name
  const symbols = mergeDeclarations(rawNodes);

  // Step 5: Resolve dependency references to symbol IDs
  const nameToId = new Map<string, string>();
  for (const sym of symbols) {
    nameToId.set(sym.name, sym.id);
  }
  // Replace raw type names with actual symbol IDs where possible
  for (const sym of symbols) {
    if (sym.dependencies.length > 0) {
      sym.dependencies = sym.dependencies
        .map((dep) => nameToId.get(dep) ?? dep)
        .filter((dep) => dep !== sym.id); // Remove self-references
    }
  }

  return {
    package: packageInfo.name,
    version: packageInfo.version,
    symbols,
    totalSymbols: symbols.length,
    totalFiles: allVisitedFiles.size,
    crawlDurationMs: performance.now() - startTime,
  };
}

/**
 * Merge declarations with the same name.
 *
 * TypeScript supports declaration merging — the same name can appear in
 * multiple files (e.g., interface Config in a.d.ts and b.d.ts).
 * We keep the first occurrence's metadata and note additional file paths.
 */
function mergeDeclarations(nodes: SymbolNode[]): SymbolNode[] {
  const merged = new Map<string, SymbolNode>();

  for (const node of nodes) {
    const existing = merged.get(node.name);
    if (existing) {
      // Merge: union dependencies, track additional declaration file
      const additionalFile = node.filePath;
      if (additionalFile !== existing.filePath) {
        existing.additionalDeclarations = existing.additionalDeclarations ?? [];
        if (!existing.additionalDeclarations.includes(additionalFile)) {
          existing.additionalDeclarations.push(additionalFile);
        }
      }
      // Merge dependencies
      const depSet = new Set(existing.dependencies);
      for (const dep of node.dependencies) {
        if (!depSet.has(dep)) {
          depSet.add(dep);
          existing.dependencies.push(dep);
        }
      }
      // If either is deprecated, keep the deprecation info
      if (node.deprecated && !existing.deprecated) {
        existing.deprecated = node.deprecated;
      }
      // If either has visibility, keep the most restrictive
      if (node.visibility && !existing.visibility) {
        existing.visibility = node.visibility;
      }
    } else {
      merged.set(node.name, { ...node });
    }
  }

  return Array.from(merged.values());
}

/**
 * Convert a ResolvedSymbol into a SymbolNode with a unique ID.
 */
function toSymbolNode(
  sym: ResolvedSymbol,
  pkg: PackageInfo
): SymbolNode {
  return {
    id: `${pkg.name}@${pkg.version}::${sym.name}`,
    name: sym.name,
    kind: sym.kind,
    kindName: sym.kindName,
    package: pkg.name,
    filePath: makeRelative(sym.definedIn, pkg.dir),
    signature: sym.signature,
    jsDoc: sym.jsDoc,
    isTypeOnly: sym.isTypeOnly,
    dependencies: sym.dependencies ?? [],
    reExportedFrom: sym.reExportChain?.[0]
      ? makeRelative(sym.reExportChain[0], pkg.dir)
      : undefined,
    deprecated: sym.deprecated,
    visibility: sym.visibility,
  };
}

/**
 * Make a path relative to the package directory.
 */
function makeRelative(absPath: string, packageDir: string): string {
  const normalized = absPath.replace(/\\\\/g, "/");
  const normalizedDir = packageDir.replace(/\\\\/g, "/");

  if (normalized.startsWith(normalizedDir)) {
    return normalized.slice(normalizedDir.length + 1);
  }
  return path.relative(packageDir, absPath).replace(/\\\\/g, "/");
}
