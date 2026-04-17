#!/usr/bin/env npx tsx
/**
 * Deep diff for one package between TS and Rust NCI JSON reports: symmetric
 * multiset keys (basename(file)::name) and symbol id sets, with row samples.
 *
 * Usage (repo root):
 *   pnpm exec tsx scripts/parity-package-dig.ts --package eslint --limit 20
 *
 * Shared flags: scripts/nci-report-cli.ts (--ts-report, --rust-report, --package, --limit).
 */
import fs from "node:fs";
import path from "node:path";
import {
  parseParityCli,
  requireBothReportsOrExit,
  resolveParityPackagePair,
  warnUnknownParityArgs,
} from "./nci-report-cli.ts";

interface ReportSymbol {
  id: string;
  name: string;
  filePath: string;
  kindName: string;
}

interface PackageRow {
  package?: string;
  version?: string;
  symbols: ReportSymbol[];
}

interface Report {
  packages: PackageRow[];
}

function heuristicKey(symbol: ReportSymbol): string {
  return `${path.basename(symbol.filePath)}::${symbol.name}`;
}

function multisetFromSymbols(
  symbols: ReportSymbol[],
): Map<string, ReportSymbol[]> {
  const bucketMap = new Map<string, ReportSymbol[]>();
  for (const symbol of symbols) {
    const key = heuristicKey(symbol);
    const bucket = bucketMap.get(key) ?? [];
    bucket.push(symbol);
    bucketMap.set(key, bucket);
  }
  return bucketMap;
}

function formatSymbolRow(label: string, symbol: ReportSymbol): void {
  console.log(`  ${label}`);
  console.log(`    id:       ${symbol.id}`);
  console.log(`    name:     ${symbol.name}`);
  console.log(`    kindName: ${symbol.kindName}`);
  console.log(`    filePath: ${symbol.filePath}`);
}

function main(): void {
  const cli = parseParityCli(process.argv.slice(2));
  warnUnknownParityArgs(cli.unknownArgs);

  if (cli.allPackages) {
    console.error(
      "parity-package-dig compares one package; omit --all-packages.",
    );
    process.exit(1);
  }

  requireBothReportsOrExit(cli.tsReportPath, cli.rustReportPath);

  const tsReport: Report = JSON.parse(
    fs.readFileSync(cli.tsReportPath, "utf8"),
  );
  const rustReport: Report = JSON.parse(
    fs.readFileSync(cli.rustReportPath, "utf8"),
  );

  const pair = resolveParityPackagePair(
    tsReport.packages,
    rustReport.packages,
    cli.packageName,
  );

  const tsSymbols = pair.tsPackage.symbols ?? [];
  const rustSymbols = pair.rustPackage.symbols ?? [];
  const sampleLimit = cli.limit;

  console.log(`\nparity-package-dig — ${pair.displayName}`);
  console.log(`  TS symbols:   ${tsSymbols.length}`);
  console.log(`  Rust symbols: ${rustSymbols.length}`);

  const rustIdSet = new Set(rustSymbols.map((symbol) => symbol.id));
  const tsIdSet = new Set(tsSymbols.map((symbol) => symbol.id));

  const tsIdsNotInRust = tsSymbols.filter(
    (symbol) => !rustIdSet.has(symbol.id),
  );
  const rustIdsNotInTs = rustSymbols.filter(
    (symbol) => !tsIdSet.has(symbol.id),
  );

  console.log(`\nSymmetric id set (first ${sampleLimit} each way)`);
  console.log(`  TS ids not in Rust: ${tsIdsNotInRust.length}`);
  for (const symbol of tsIdsNotInRust.slice(0, sampleLimit)) {
    console.log(`    - ${symbol.id}`);
  }
  console.log(`  Rust ids not in TS: ${rustIdsNotInTs.length}`);
  for (const symbol of rustIdsNotInTs.slice(0, sampleLimit)) {
    console.log(`    - ${symbol.id}`);
  }

  const tsBuckets = multisetFromSymbols(tsSymbols);
  const rustBuckets = multisetFromSymbols(rustSymbols);

  const rustKeySet = new Set(rustBuckets.keys());
  const tsKeySet = new Set(tsBuckets.keys());

  const tsKeysOnly = [...tsKeySet].filter((key) => !rustKeySet.has(key)).sort();
  const rustKeysOnly = [...rustKeySet]
    .filter((key) => !tsKeySet.has(key))
    .sort();

  console.log(`\nSymmetric heuristic key basename(file)::name`);
  console.log(`  Keys only on TS:   ${tsKeysOnly.length}`);
  for (const key of tsKeysOnly.slice(0, sampleLimit)) {
    console.log(`    - ${key}`);
  }
  console.log(`  Keys only on Rust: ${rustKeysOnly.length}`);
  for (const key of rustKeysOnly.slice(0, sampleLimit)) {
    console.log(`    - ${key}`);
  }

  const keysWithCountMismatch: string[] = [];
  const unionKeys = new Set<string>([...tsKeySet, ...rustKeySet]);
  for (const key of unionKeys) {
    const tsCount = tsBuckets.get(key)?.length ?? 0;
    const rustCount = rustBuckets.get(key)?.length ?? 0;
    if (tsCount !== rustCount) {
      keysWithCountMismatch.push(key);
    }
  }
  keysWithCountMismatch.sort();
  console.log(
    `\nHeuristic keys with differing multiplicities: ${keysWithCountMismatch.length}`,
  );
  for (const key of keysWithCountMismatch.slice(0, sampleLimit)) {
    const tsCount = tsBuckets.get(key)?.length ?? 0;
    const rustCount = rustBuckets.get(key)?.length ?? 0;
    console.log(`    - ${key}  (TS ${tsCount} vs Rust ${rustCount})`);
  }

  const firstTsOnlyKey = tsKeysOnly[0];
  if (firstTsOnlyKey) {
    const tsSample =
      tsBuckets.get(firstTsOnlyKey)?.[0] ??
      tsSymbols.find((symbol) => heuristicKey(symbol) === firstTsOnlyKey);
    console.log(`\nDetail: first key only on TS — "${firstTsOnlyKey}"`);
    if (tsSample) {
      formatSymbolRow("TS row", tsSample);
      const sameBasenameName = rustSymbols.find(
        (symbol) =>
          path.basename(symbol.filePath) === path.basename(tsSample.filePath) &&
          symbol.name === tsSample.name,
      );
      if (sameBasenameName) {
        formatSymbolRow(
          "Rust row (same basename + name as TS — fuzzy-style)",
          sameBasenameName,
        );
      } else {
        console.log(
          "  (No Rust row with same basename(filePath) and same name as TS sample.)",
        );
      }
    }
  }

  const firstRustOnlyKey = rustKeysOnly[0];
  if (firstRustOnlyKey) {
    const rustSample =
      rustBuckets.get(firstRustOnlyKey)?.[0] ??
      rustSymbols.find((symbol) => heuristicKey(symbol) === firstRustOnlyKey);
    console.log(`\nDetail: first key only on Rust — "${firstRustOnlyKey}"`);
    if (rustSample) {
      formatSymbolRow("Rust row", rustSample);
      const tsMatch = tsSymbols.find(
        (symbol) =>
          path.basename(symbol.filePath) ===
            path.basename(rustSample.filePath) &&
          symbol.name === rustSample.name,
      );
      if (tsMatch) {
        formatSymbolRow(
          "TS row (same basename + name as Rust — fuzzy-style)",
          tsMatch,
        );
      } else {
        console.log(
          "  (No TS row with same basename(filePath) and same name as Rust sample.)",
        );
      }
    }
  }
}

main();
