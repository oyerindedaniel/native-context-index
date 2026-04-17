#!/usr/bin/env npx tsx
/**
 * Gap report: TS vs Rust symbol counts and heuristic overlap (`basename(file)::name`)
 * for one package or for **all** packages in both reports.
 *
 * Shared flags (`scripts/nci-report-cli.ts`): `--ts-report`, `--rust-report`,
 * `--package`, `--all-packages`, `--limit`, `--min-delta-symbols`.
 *
 * Modes:
 *   (default)           — first package row in each JSON
 *   --package <name>    — match `package` field (npm name)
 *   --all-packages      — one summary line per package in both reports (same `package@version` key as audit)
 *
 * Usage (repo root):
 *   npx tsx scripts/compare-engines.ts
 *   npx tsx scripts/compare-engines.ts --package typescript
 *   npx tsx scripts/compare-engines.ts --all-packages
 */
import fs from "node:fs";
import path from "node:path";
import {
  packageVersionLookupKey,
  parseParityCli,
  requireBothReportsOrExit,
  resolveParityPackagePair,
  warnUnknownParityArgs,
} from "./nci-report-cli.ts";

const cli = parseParityCli(process.argv.slice(2));
warnUnknownParityArgs(cli.unknownArgs);

if (cli.packageName && cli.allPackages) {
  console.error("Use either --package <name> or --all-packages, not both.");
  process.exit(1);
}

requireBothReportsOrExit(cli.tsReportPath, cli.rustReportPath);

interface SymbolEntry {
  name: string;
  id: string;
  filePath: string;
  kindName: string;
}

interface PackageRow {
  package?: string;
  version?: string;
  symbols: SymbolEntry[];
}

interface Report {
  packages: PackageRow[];
}

const rustData: Report = JSON.parse(
  fs.readFileSync(cli.rustReportPath, "utf8"),
);
const tsData: Report = JSON.parse(fs.readFileSync(cli.tsReportPath, "utf8"));

const getSymbolKey = (symbol: SymbolEntry) =>
  `${path.basename(symbol.filePath)}::${symbol.name}`;

function countHeuristicMissing(
  tsSymbols: SymbolEntry[],
  rustSymbols: SymbolEntry[],
): number {
  const rustKeySet = new Set(rustSymbols.map(getSymbolKey));
  return tsSymbols.filter((tsSymbol) => !rustKeySet.has(getSymbolKey(tsSymbol)))
    .length;
}

function printSinglePackageReport(
  tsSymbols: SymbolEntry[],
  rustSymbols: SymbolEntry[],
  displayName: string,
): void {
  const rustKeySet = new Set(rustSymbols.map(getSymbolKey));
  const missingInRust = tsSymbols.filter(
    (tsSymbol) => !rustKeySet.has(getSymbolKey(tsSymbol)),
  );

  console.log(`\n📊 Stat comparison — ${displayName}`);
  console.log(`   Rust symbols: ${rustSymbols.length.toLocaleString()}`);
  console.log(`   TS symbols:   ${tsSymbols.length.toLocaleString()}`);
  console.log(
    `   Gap:          ${(tsSymbols.length - rustSymbols.length).toLocaleString()}`,
  );

  const sampleCap = cli.limit;

  console.log(
    `\n🔍 Analysis of ${missingInRust.length} missing symbols in Rust:`,
  );

  if (missingInRust.length === 0) {
    console.log(
      "   (Heuristic only: same basename(file)::name in Rust — not full symbol-id parity.)",
    );
    console.log(`\nTop missing Symbol Kinds: 0`);
    console.log(`Top files with gaps: 0`);
    console.log(`Example missing symbols (up to ${sampleCap}): 0`);
    return;
  }

  const kindCounts: Record<string, number> = {};
  missingInRust.forEach((symbol) => {
    kindCounts[symbol.kindName] = (kindCounts[symbol.kindName] || 0) + 1;
  });

  console.log(`\nTop missing Symbol Kinds:`);
  const denom = missingInRust.length;
  Object.entries(kindCounts)
    .sort((entryA, entryB) => entryB[1] - entryA[1])
    .slice(0, 10)
    .forEach(([kind, count]) => {
      const percentage =
        denom === 0 ? "0.0" : ((count / denom) * 100).toFixed(1);
      console.log(
        ` - ${kind.padEnd(25)} ${count.toString().padStart(5)} (${percentage}%)`,
      );
    });

  const fileCounts: Record<string, number> = {};
  missingInRust.forEach((symbol) => {
    const fileName = path.basename(symbol.filePath);
    fileCounts[fileName] = (fileCounts[fileName] || 0) + 1;
  });

  console.log(`\nTop files with gaps:`);
  Object.entries(fileCounts)
    .sort((entryA, entryB) => entryB[1] - entryA[1])
    .slice(0, 5)
    .forEach(([fileName, count]) => {
      console.log(` - ${fileName.padEnd(30)} ${count} symbols missing`);
    });

  console.log(`\nExample missing symbols (up to ${sampleCap}):`);
  missingInRust.slice(0, sampleCap).forEach((symbol) => {
    console.log(
      ` - [${symbol.kindName}] ${symbol.name} (in ${path.basename(symbol.filePath)})`,
    );
  });
}

function runAllPackagesCompare(tsReport: Report, rustReport: Report): void {
  const tsMap = new Map<string, PackageRow>();
  for (const row of tsReport.packages ?? []) {
    const lookupKey = packageVersionLookupKey(row);
    if (lookupKey) {
      tsMap.set(lookupKey, row);
    }
  }
  const rustMap = new Map<string, PackageRow>();
  for (const row of rustReport.packages ?? []) {
    const lookupKey = packageVersionLookupKey(row);
    if (lookupKey) {
      rustMap.set(lookupKey, row);
    }
  }

  const sortedKeys = [...new Set([...tsMap.keys(), ...rustMap.keys()])].sort();
  const keysOnlyInTs: string[] = [];
  const keysOnlyInRust: string[] = [];
  let comparedCount = 0;
  let packagesWithHeuristicGaps = 0;
  let totalHeuristicMissing = 0;
  let totalSymbolGap = 0;

  console.log("\n📊 Heuristic compare — all packages (basename(file)::name)\n");
  console.log(
    `${"Package@version".padEnd(44)} ${"TS sym".padStart(8)} ${"Rust sym".padStart(9)} ${"Δ sym".padStart(8)} ${"HeurMiss".padStart(9)}`,
  );
  console.log("─".repeat(86));

  for (const lookupKey of sortedKeys) {
    const tsRow = tsMap.get(lookupKey);
    const rustRow = rustMap.get(lookupKey);
    if (!tsRow) {
      keysOnlyInRust.push(lookupKey);
      continue;
    }
    if (!rustRow) {
      keysOnlyInTs.push(lookupKey);
      continue;
    }

    const tsSymbols = tsRow.symbols ?? [];
    const rustSymbols = rustRow.symbols ?? [];
    const symbolGap = tsSymbols.length - rustSymbols.length;
    const heuristicMissing = countHeuristicMissing(tsSymbols, rustSymbols);
    comparedCount += 1;
    totalSymbolGap += Math.abs(symbolGap);
    if (heuristicMissing > 0) {
      packagesWithHeuristicGaps += 1;
      totalHeuristicMissing += heuristicMissing;
    }

    const label =
      lookupKey.length > 43 ? `${lookupKey.slice(0, 40)}…` : lookupKey;
    const gapStr = String((symbolGap > 0 ? "+" : "") + symbolGap).padStart(8);
    console.log(
      `${label.padEnd(44)} ${String(tsSymbols.length).padStart(8)} ${String(rustSymbols.length).padStart(9)} ${gapStr} ${String(heuristicMissing).padStart(9)}`,
    );
  }

  console.log("─".repeat(86));
  console.log(
    `Compared ${comparedCount} package(s) present in both reports | packages with heuristic misses: ${packagesWithHeuristicGaps} | sum(|Δsym|): ${totalSymbolGap} | sum(heuristic misses): ${totalHeuristicMissing}`,
  );

  if (keysOnlyInTs.length > 0) {
    console.warn(
      `\nTS-only keys (${keysOnlyInTs.length}):`,
      keysOnlyInTs.slice(0, 15).join(", "),
      keysOnlyInTs.length > 15 ? "…" : "",
    );
  }
  if (keysOnlyInRust.length > 0) {
    console.warn(
      `\nRust-only keys (${keysOnlyInRust.length}):`,
      keysOnlyInRust.slice(0, 15).join(", "),
      keysOnlyInRust.length > 15 ? "…" : "",
    );
  }

  if (packagesWithHeuristicGaps === 0) {
    console.log(
      "\n✅ Heuristic slice: no TS-only basename(file)::name keys missing from Rust for any compared package.\n",
    );
  } else {
    console.log(
      "\nRe-run with --package <npm-name> for full breakdown on one package.\n",
    );
  }
}

if (cli.allPackages) {
  runAllPackagesCompare(tsData, rustData);
} else {
  const { tsPackage, rustPackage, displayName } = resolveParityPackagePair(
    tsData.packages,
    rustData.packages,
    cli.packageName,
  );
  printSinglePackageReport(tsPackage.symbols, rustPackage.symbols, displayName);
}
