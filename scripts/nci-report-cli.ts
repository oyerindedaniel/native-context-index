/**
 * Shared CLI helpers for NCI engine parity scripts under `scripts/`.
 *
 * Repo root is derived from this file’s location (`scripts/` → parent).
 * Default report paths match the TS / Rust demos when run from repo root (no `--output`).
 *
 * Common flags (supported where relevant; unknown tokens are returned for optional warnings):
 *   --ts-report <path>          Override TS report JSON
 *   --rust-report <path>        Override Rust report JSON
 *   --package <name>            Scope to one npm package name (omit = first row for slice tools)
 *   --all-packages              Run slice tool across every package present in both reports (not with --package)
 *   --limit <n>                 Cap list / sample sizes for deep-dive output (default 30)
 *   --min-delta-symbols <n>     Workspace table: min |Δsymbols| to print a row (audit only; default 1)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const utilDir = path.dirname(fileURLToPath(import.meta.url));

/** Monorepo root (parent of `scripts/`). */
export const NCI_REPO_ROOT = path.resolve(utilDir, "..");

export function defaultTsReportPath(): string {
  return path.join(NCI_REPO_ROOT, "packages/nci-core/nci-report.json");
}

export function defaultRustReportPath(): string {
  return path.join(NCI_REPO_ROOT, "nci-report-rust.json");
}

export type ParityCliOptions = {
  tsReportPath: string;
  rustReportPath: string;
  /** When set, single-package analysis. When omitted, behavior is per-script (first row unless --all-packages). */
  packageName?: string;
  /** Iterate every package row that exists in both TS and Rust reports (compare / fuzzy). */
  allPackages: boolean;
  limit: number;
  minDeltaSymbols: number;
  unknownArgs: string[];
};

/**
 * Single-pass parser for shared parity-tool flags. Remaining tokens are `unknownArgs`.
 */
export function parseParityCli(argv: string[]): ParityCliOptions {
  let tsReportPath = defaultTsReportPath();
  let rustReportPath = defaultRustReportPath();
  let packageName: string | undefined;
  let allPackages = false;
  let limit = 30;
  let minDeltaSymbols = 1;
  const unknownArgs: string[] = [];

  for (let argIndex = 0; argIndex < argv.length; argIndex++) {
    const arg = argv[argIndex]!;
    if (arg === "--all-packages") {
      allPackages = true;
      continue;
    }
    if (arg === "--ts-report" && argv[argIndex + 1]) {
      tsReportPath = path.resolve(argv[++argIndex]!);
      continue;
    }
    if (arg === "--rust-report" && argv[argIndex + 1]) {
      rustReportPath = path.resolve(argv[++argIndex]!);
      continue;
    }
    if (arg === "--package" && argv[argIndex + 1]) {
      packageName = argv[++argIndex]!;
      continue;
    }
    if (arg === "--limit" && argv[argIndex + 1]) {
      limit = Math.max(1, parseInt(argv[++argIndex]!, 10) || 30);
      continue;
    }
    if (arg === "--min-delta-symbols" && argv[argIndex + 1]) {
      minDeltaSymbols = Math.max(0, parseInt(argv[++argIndex]!, 10) || 0);
      continue;
    }
    unknownArgs.push(arg);
  }

  return {
    tsReportPath,
    rustReportPath,
    packageName,
    allPackages,
    limit,
    minDeltaSymbols,
    unknownArgs,
  };
}

/** Same join as `audit-nci-parity` workspace rows: `name@version` when version is present. */
export function packageVersionLookupKey(row: {
  package?: string;
  version?: string;
}): string {
  const packageName = row.package ?? "";
  const packageVersion = row.version ?? "";
  return packageVersion ? `${packageName}@${packageVersion}` : packageName;
}

export function warnUnknownParityArgs(unknownArgs: string[]): void {
  if (unknownArgs.length > 0) {
    console.warn("Ignoring unrecognized args:", unknownArgs.join(" "));
  }
}

/** Pick one package row from TS + Rust reports (same `package` field) or default to index 0. */
export function resolveParityPackagePair<T extends { package?: string }>(
  tsPackages: T[] | undefined,
  rustPackages: T[] | undefined,
  packageName: string | undefined,
): { tsPackage: T; rustPackage: T; displayName: string } {
  const tsPackageList = tsPackages ?? [];
  const rustPackageList = rustPackages ?? [];

  if (packageName) {
    const tsPackageRow = tsPackageList.find(
      (candidate) => candidate.package === packageName,
    );
    const rustPackageRow = rustPackageList.find(
      (candidate) => candidate.package === packageName,
    );
    if (!tsPackageRow || !rustPackageRow) {
      console.error(
        `Package "${packageName}" missing: TS ${tsPackageRow ? "ok" : "missing"}, Rust ${rustPackageRow ? "ok" : "missing"}`,
      );
      process.exit(1);
    }
    return {
      tsPackage: tsPackageRow,
      rustPackage: rustPackageRow,
      displayName: `${packageName}`,
    };
  }

  const tsPackageRow = tsPackageList[0];
  const rustPackageRow = rustPackageList[0];
  if (!tsPackageRow || !rustPackageRow) {
    console.error("Reports have no packages to compare.");
    process.exit(1);
  }
  const displayName =
    tsPackageRow.package ??
    rustPackageRow.package ??
    "(first package in JSON order)";
  return {
    tsPackage: tsPackageRow,
    rustPackage: rustPackageRow,
    displayName,
  };
}

export function printMissingBothReportsHelp(
  tsReportPath: string,
  rustReportPath: string,
): void {
  console.error(
    `Missing reports:\n  TS:   ${tsReportPath}\n  Rust: ${rustReportPath}`,
  );
  console.error(
    "Run (from repo root, default outputs):\n  npx tsx packages/nci-core/scripts/demo.ts",
  );
  console.error(
    "  cargo run --release --manifest-path packages/nci-engine/Cargo.toml --example demo",
  );
  console.error(
    "Flags: --ts-report --rust-report --package --all-packages --limit --min-delta-symbols (see scripts/nci-report-cli.ts header).",
  );
}

export function requireBothReportsOrExit(
  tsReportPath: string,
  rustReportPath: string,
): void {
  if (!fs.existsSync(tsReportPath) || !fs.existsSync(rustReportPath)) {
    printMissingBothReportsHelp(tsReportPath, rustReportPath);
    process.exit(1);
  }
}
