/**
 * Central flags for optional stderr debugging across the pipeline.
 *
 * Set `NCI_LOG_ALL_RAW_EXPORTS=1` in the environment, then wrap logs with
 * `nciLogAllRawExportsEnabled()` anywhere (crawler, graph, parser, etc.).
 */

/** `process.env` key for verbose raw crawl / pipeline logging. */
export const NCI_LOG_ALL_RAW_EXPORTS = "NCI_LOG_ALL_RAW_EXPORTS" as const;

/** True when verbose raw-export and related internal maps should print to stderr. */
export function nciLogAllRawExportsEnabled(): boolean {
  return process.env[NCI_LOG_ALL_RAW_EXPORTS] === "1";
}

/** `process.env` key for phase-level profiling output. */
export const NCI_PROFILE = "NCI_PROFILE" as const;

let _profileEnabled: boolean | undefined;

/** True when phase-level timing should be printed to stderr. */
export function nciProfileEnabled(): boolean {
  if (_profileEnabled === undefined) {
    _profileEnabled = process.env[NCI_PROFILE] === "1";
  }
  return _profileEnabled;
}

/** Log a phase timing to stderr when profiling is enabled. */
export function profileLog(label: string, ms: number): void {
  if (nciProfileEnabled()) {
    process.stderr.write(`  [profile] ${label.padEnd(24)} ${ms.toFixed(1)}ms\n`);
  }
}

/** Log a non-timing stat (counts, sizes) when profiling is enabled. */
export function profileStat(label: string, value: string | number): void {
  if (nciProfileEnabled()) {
    process.stderr.write(`  [profile] ${label.padEnd(24)} ${value}\n`);
  }
}
