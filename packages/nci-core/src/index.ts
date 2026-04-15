export { scanPackages } from "./scanner.js";
export { resolveTypesEntry } from "./resolver.js";
export { parseFile } from "./parser.js";
export { crawl, type CrawlOptions } from "./crawler.js";
export { DEFAULT_MAX_HOPS, MAX_HOPS_UNLIMITED } from "./constants.js";
export { buildPackageGraph } from "./graph.js";
export { npmPackageRoot } from "./npm-package-root.js";
export { encodeOutsidePackageRelative, makePackageRelativePath } from "./relative-path-encoding.js";
export {
  NCI_LOG_ALL_RAW_EXPORTS,
  NCI_PROFILE,
  nciLogAllRawExportsEnabled,
  nciProfileEnabled,
  profileLog,
  profileStat,
} from "./nci-log-flags.js";

export type {
  PackageInfo,
  PackageEntry,
  ParsedExport,
  CrawlResult,
  ResolvedSymbol,
  SymbolNode,
  PackageGraph,
  SymbolSpace,
} from "./types.js";
