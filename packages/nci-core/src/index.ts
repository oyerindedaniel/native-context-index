/**
 * NCI Core — Public API
 *
 * Re-exports all modules for external consumption.
 */

// Pipeline modules
export { scanPackages } from "./scanner.js";
export { resolveTypesEntry } from "./resolver.js";
export { parseExports } from "./parser.js";
export { crawl, type CrawlOptions } from "./crawler.js";
export { buildPackageGraph } from "./graph.js";

// Types
export type {
  PackageInfo,
  PackageEntry,
  ParsedExport,
  CrawlResult,
  ResolvedSymbol,
  SymbolNode,
  PackageGraph,
} from "./types.js";
