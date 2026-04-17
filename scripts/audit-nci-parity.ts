#!/usr/bin/env npx tsx
/**
 * TypeScript vs Rust NCI report comparison (same inputs as both demos).
 *
 * Default: per-package totals (symbols + files) for the whole workspace.
 * With `--package <name>`: deep dive (ids, multiset keys, samples) for that package.
 *
 * Shared flags (see `scripts/nci-report-cli.ts`): `--ts-report`, `--rust-report`,
 * `--package`, `--all-packages` (ignored here; default is already workspace-wide),
 * `--limit`, `--min-delta-symbols`.
 *
 * Usage (repo root):
 *   npx tsx scripts/audit-nci-parity.ts
 *   npx tsx scripts/audit-nci-parity.ts --min-delta-symbols 10
 *   npx tsx scripts/audit-nci-parity.ts --package ai --limit 80
 *
 * Prerequisite: generate both JSON reports (full workspace scans).
 */
import fs from "node:fs";
import path from "node:path";
import {
  parseParityCli,
  printMissingBothReportsHelp,
  warnUnknownParityArgs,
} from "./nci-report-cli.ts";

const cli = parseParityCli(process.argv.slice(2));
warnUnknownParityArgs(cli.unknownArgs);

const tsReportPath = cli.tsReportPath;
const rustReportPath = cli.rustReportPath;

interface SymbolEntry {
  id: string;
  name: string;
  filePath: string;
  kindName: string;
  isInherited?: boolean;
  signature?: string;
}

interface PkgRow {
  package: string;
  version: string;
  symbols: SymbolEntry[];
  totalSymbols: number;
  totalFiles: number;
}

interface Report {
  totalSymbols?: number;
  totalFiles?: number;
  packages: PkgRow[];
}

function loadReport(filePath: string): Report {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as Report;
}

function symbolKey(symbol: SymbolEntry): string {
  return `${path.basename(symbol.filePath)}::${symbol.name}`;
}

function multiset<T>(items: T[], keyFn: (item: T) => string): Map<string, T[]> {
  const multisetMap = new Map<string, T[]>();
  for (const item of items) {
    const multisetKey = keyFn(item);
    const bucket = multisetMap.get(multisetKey) ?? [];
    bucket.push(item);
    multisetMap.set(multisetKey, bucket);
  }
  return multisetMap;
}

function ensureReports(): void {
  if (!fs.existsSync(tsReportPath) || !fs.existsSync(rustReportPath)) {
    printMissingBothReportsHelp(tsReportPath, rustReportPath);
    process.exit(1);
  }
}

function runWorkspace(minDelta: number): void {
  ensureReports();
  const tsReport = loadReport(tsReportPath);
  const rustReport = loadReport(rustReportPath);

  const packageVersionKey = (packageRow: PkgRow) =>
    `${packageRow.package}@${packageRow.version}`;
  const tsMap = new Map(
    tsReport.packages.map((packageRow) => [
      packageVersionKey(packageRow),
      packageRow,
    ]),
  );
  const rustMap = new Map(
    rustReport.packages.map((packageRow) => [
      packageVersionKey(packageRow),
      packageRow,
    ]),
  );

  type DiffRow = {
    package: string;
    tsSym: number;
    rustSym: number;
    dSym: number;
    tsFiles: number;
    rustFiles: number;
    dFiles: number;
  };

  const rows: DiffRow[] = [];

  for (const pkgKey of new Set([...tsMap.keys(), ...rustMap.keys()])) {
    const tsPkg = tsMap.get(pkgKey);
    const rustPkg = rustMap.get(pkgKey);
    if (!tsPkg || !rustPkg) {
      console.warn("Package only in one report:", pkgKey);
      continue;
    }
    const symbolDelta = tsPkg.totalSymbols - rustPkg.totalSymbols;
    const fileDelta = tsPkg.totalFiles - rustPkg.totalFiles;
    if (Math.abs(symbolDelta) >= minDelta || Math.abs(fileDelta) >= 1) {
      rows.push({
        package: tsPkg.package,
        tsSym: tsPkg.totalSymbols,
        rustSym: rustPkg.totalSymbols,
        dSym: symbolDelta,
        tsFiles: tsPkg.totalFiles,
        rustFiles: rustPkg.totalFiles,
        dFiles: fileDelta,
      });
    }
  }

  rows.sort(
    (first, second) =>
      Math.abs(second.dSym) - Math.abs(first.dSym) ||
      Math.abs(second.dFiles) - Math.abs(first.dFiles),
  );

  console.log("\nWorkspace TS vs Rust (per package)\n");
  console.log(
    `TS totals:   ${tsReport.totalSymbols?.toLocaleString() ?? "?"} symbols, ${tsReport.totalFiles?.toLocaleString() ?? "?"} files (${tsReport.packages.length} pkgs)`,
  );
  console.log(
    `Rust totals: ${rustReport.totalSymbols?.toLocaleString() ?? "?"} symbols, ${rustReport.totalFiles?.toLocaleString() ?? "?"} files (${rustReport.packages.length} pkgs)\n`,
  );

  console.log(
    `${"Package".padEnd(42)} ${"TS sym".padStart(8)} ${"Rust sym".padStart(9)} ${"Δ sym".padStart(8)} ${"TS files".padStart(8)} ${"Rust".padStart(5)} ${"ΔF".padStart(5)}`,
  );
  console.log("─".repeat(92));

  for (const row of rows) {
    const dSymStr = String((row.dSym > 0 ? "+" : "") + row.dSym).padStart(8);
    const dFileStr = String((row.dFiles > 0 ? "+" : "") + row.dFiles).padStart(
      5,
    );
    console.log(
      `${row.package.slice(0, 42).padEnd(42)} ${String(row.tsSym).padStart(8)} ${String(row.rustSym).padStart(9)} ${dSymStr} ${String(row.tsFiles).padStart(8)} ${String(row.rustFiles).padStart(5)} ${dFileStr}`,
    );
  }

  if (rows.length === 0) {
    console.log(
      "\n✅ No per-package deltas (symbols and files match for every package).\n",
    );
  } else {
    console.log("");
  }
}

function runPackageDeepDive(packageName: string, listLimit: number): void {
  ensureReports();
  const tsReport = loadReport(tsReportPath);
  const rustReport = loadReport(rustReportPath);

  const tsPkg = tsReport.packages.find((row) => row.package === packageName);
  const rustPkg = rustReport.packages.find(
    (row) => row.package === packageName,
  );
  if (!tsPkg || !rustPkg) {
    console.error(
      `Package "${packageName}" missing: TS ${tsPkg ? "ok" : "missing"}, Rust ${rustPkg ? "ok" : "missing"}`,
    );
    process.exit(1);
  }

  const pkg = `${rustPkg.package}@${rustPkg.version}`;
  const tsSyms = tsPkg.symbols;
  const rustSyms = rustPkg.symbols;

  const tsSymbolIds = new Set(tsSyms.map((symbol) => symbol.id));
  const rustSymbolIds = new Set(rustSyms.map((symbol) => symbol.id));
  const onlyInTs = tsSyms.filter((symbol) => !rustSymbolIds.has(symbol.id));
  const onlyInRust = rustSyms.filter((symbol) => !tsSymbolIds.has(symbol.id));

  const tsFiles = new Set(tsSyms.map((symbol) => symbol.filePath));
  const rustFiles = new Set(rustSyms.map((symbol) => symbol.filePath));
  const filesOnlyInRust = [...rustFiles].filter(
    (filePath) => !tsFiles.has(filePath),
  );

  console.log(`\n🔍 package deep dive: ${pkg}\n`);
  console.log(
    `Row counts: TS ${tsSyms.length.toLocaleString()} | Rust ${rustSyms.length.toLocaleString()}`,
  );

  const rustByKey = multiset(rustSyms, symbolKey);
  const tsByKey = multiset(tsSyms, symbolKey);
  const rustKeys = new Set(rustByKey.keys());
  const tsKeys = new Set(tsByKey.keys());
  const onlyRustKeys = [...rustKeys].filter((key) => !tsKeys.has(key)).sort();
  const onlyTsKeys = [...tsKeys].filter((key) => !rustKeys.has(key)).sort();
  const rustDupKeys = [...rustByKey.entries()]
    .filter(([, rows]) => rows.length > 1)
    .sort((first, second) => second[1].length - first[1].length);
  const tsDupKeys = [...tsByKey.entries()]
    .filter(([, rows]) => rows.length > 1)
    .sort((first, second) => second[1].length - first[1].length);
  const extraRustRows = rustDupKeys.reduce(
    (count, [, rows]) => count + rows.length - 1,
    0,
  );
  const extraTsRows = tsDupKeys.reduce(
    (count, [, rows]) => count + rows.length - 1,
    0,
  );

  console.log(
    `\nUnique keys (basename(filePath)::name): TS ${tsKeys.size} | Rust ${rustKeys.size}`,
  );
  console.log(
    `Keys only in Rust: ${onlyRustKeys.length} | only in TS: ${onlyTsKeys.length}`,
  );
  console.log(
    `Duplicate keys → extra rows vs unique: Rust +${extraRustRows} | TS +${extraTsRows}`,
  );

  const byBasename = new Map<string, number>();
  for (const multisetKey of onlyTsKeys) {
    const fileBasename = multisetKey.split("::")[0] ?? multisetKey;
    byBasename.set(fileBasename, (byBasename.get(fileBasename) ?? 0) + 1);
  }
  const topBasenames = [...byBasename.entries()]
    .sort((leftEntry, rightEntry) => rightEntry[1] - leftEntry[1])
    .slice(0, 20);
  if (topBasenames.length > 0) {
    console.log(`\nTS-only keys by file (top ${topBasenames.length}):`);
    for (const [fileBasename, occurrenceCount] of topBasenames) {
      console.log(
        `  ${occurrenceCount.toString().padStart(5)}  ${fileBasename}`,
      );
    }
  }

  if (onlyRustKeys.length > 0 && listLimit > 0) {
    console.log(`\nSample Rust-only keys (up to ${listLimit}):`);
    onlyRustKeys
      .slice(0, listLimit)
      .forEach((multisetKey) => console.log(`  ${multisetKey}`));
  }
  if (onlyTsKeys.length > 0 && listLimit > 0) {
    console.log(`\nSample TS-only keys (up to ${listLimit}):`);
    onlyTsKeys
      .slice(0, listLimit)
      .forEach((multisetKey) => console.log(`  ${multisetKey}`));
  }

  if (rustDupKeys.length > 0 && listLimit > 0) {
    console.log(
      `\nRust duplicate keys (top ${Math.min(listLimit, rustDupKeys.length)}):`,
    );
    for (const [symbolKey, symbolsForKey] of rustDupKeys.slice(0, listLimit)) {
      console.log(
        `  ${symbolsForKey.length}× [${symbolsForKey[0]!.kindName}] ${symbolKey}`,
      );
    }
  }

  if (onlyInTs.length > 0) {
    console.log(
      `\n❌ Symbols in TS missing same id in Rust: ${onlyInTs.length}`,
    );
    if (listLimit > 0) {
      onlyInTs
        .slice(0, Math.min(listLimit, onlyInTs.length))
        .forEach((symbol) => {
          console.log(
            `   ${symbol.id} (${symbol.kindName}) [${path.basename(symbol.filePath)}] :: ${symbol.name}`,
          );
        });
      if (onlyInTs.length > listLimit)
        console.log(`   … +${onlyInTs.length - listLimit} more`);
    }
  }
  if (onlyInRust.length > 0) {
    console.log(
      `\n➕ Symbols in Rust missing same id in TS: ${onlyInRust.length}`,
    );
    if (listLimit > 0) {
      onlyInRust
        .slice(0, Math.min(listLimit, onlyInRust.length))
        .forEach((symbol) => {
          console.log(
            `   ${symbol.id} (${symbol.kindName}) [${path.basename(symbol.filePath)}] :: ${symbol.name}`,
          );
        });
      if (onlyInRust.length > listLimit)
        console.log(`   … +${onlyInRust.length - listLimit} more`);
    }
  }

  if (filesOnlyInRust.length > 0) {
    console.log(
      `\n📄 Files seen only in Rust (by symbol paths): ${filesOnlyInRust.length}`,
    );
    const counts = new Map<string, number>();
    for (const filePath of filesOnlyInRust) {
      const directory = path.dirname(filePath);
      counts.set(directory, (counts.get(directory) ?? 0) + 1);
    }
    [...counts.entries()]
      .sort(
        (leftDirectoryCount, rightDirectoryCount) =>
          rightDirectoryCount[1] - leftDirectoryCount[1],
      )
      .slice(0, 15)
      .forEach(([directoryPath, pathHitCount]) =>
        console.log(`   ${directoryPath}: ${pathHitCount}`),
      );
  }

  const idMatch =
    onlyInTs.length === 0 &&
    onlyInRust.length === 0 &&
    filesOnlyInRust.length === 0;
  const multisetBalanced =
    onlyRustKeys.length === 0 &&
    onlyTsKeys.length === 0 &&
    tsSyms.length === rustSyms.length;
  if (idMatch && multisetBalanced) {
    console.log(
      "\n✅ package deep dive: identical ids, files, and key counts vs rows.\n",
    );
  } else {
    console.log(
      "\nℹ️  Overload / #n suffixes can yield matching semantics with different ids; use keys + counts above.\n",
    );
  }
}

if (cli.packageName) {
  runPackageDeepDive(cli.packageName, cli.limit);
} else {
  runWorkspace(cli.minDeltaSymbols);
}
