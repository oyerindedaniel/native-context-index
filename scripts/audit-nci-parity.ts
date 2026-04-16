#!/usr/bin/env npx tsx
/**
 * TypeScript vs Rust NCI report comparison (same inputs as both demos).
 *
 * Modes:
 *   workspace (default) — Per-package totals (totalSymbols, totalFiles) for every package.
 *   first-package      — Deep dive on `packages[0]` only: symbol-id diff + `basename(filePath)::name` multiset.
 *   package <name>     — Same multiset + id diff for one package (e.g. `ai`, `@oyerinde/caliper`).
 *
 * Usage (repo root):
 *   npx tsx scripts/audit-nci-parity.ts
 *   npx tsx scripts/audit-nci-parity.ts workspace --min-delta-symbols 10
 *   npx tsx scripts/audit-nci-parity.ts first-package --limit 40
 *   npx tsx scripts/audit-nci-parity.ts package ai --limit 80
 *
 * Prerequisite: generate both JSON reports (full workspace scans).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

const TS_REPORT = path.join(REPO_ROOT, "packages/nci-core/nci-report.json");
const RUST_REPORT = path.join(
  REPO_ROOT,
  "packages/nci-engine/nci-report-rust.json",
);

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
    const key = keyFn(item);
    const arr = multisetMap.get(key) ?? [];
    arr.push(item);
    multisetMap.set(key, arr);
  }
  return multisetMap;
}

function ensureReports(): void {
  if (!fs.existsSync(TS_REPORT) || !fs.existsSync(RUST_REPORT)) {
    console.error("Missing reports:\n  " + TS_REPORT + "\n  " + RUST_REPORT);
    console.error(
      "Run:\n  npx tsx packages/nci-core/scripts/demo.ts --output packages/nci-core/nci-report.json",
    );
    console.error(
      "  cargo run --release --manifest-path packages/nci-engine/Cargo.toml --example demo -- --output packages/nci-engine/nci-report-rust.json",
    );
    process.exit(1);
  }
}

function runWorkspace(minDelta: number): void {
  ensureReports();
  const ts = loadReport(TS_REPORT);
  const rust = loadReport(RUST_REPORT);

  const key = (packageRow: PkgRow) =>
    `${packageRow.package}@${packageRow.version}`;
  const tsMap = new Map(
    ts.packages.map((packageRow) => [key(packageRow), packageRow]),
  );
  const rustMap = new Map(
    rust.packages.map((packageRow) => [key(packageRow), packageRow]),
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
    const dSym = tsPkg.totalSymbols - rustPkg.totalSymbols;
    const dFiles = tsPkg.totalFiles - rustPkg.totalFiles;
    if (Math.abs(dSym) >= minDelta || Math.abs(dFiles) >= 1) {
      rows.push({
        package: tsPkg.package,
        tsSym: tsPkg.totalSymbols,
        rustSym: rustPkg.totalSymbols,
        dSym,
        tsFiles: tsPkg.totalFiles,
        rustFiles: rustPkg.totalFiles,
        dFiles,
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
    `TS totals:   ${ts.totalSymbols?.toLocaleString() ?? "?"} symbols, ${ts.totalFiles?.toLocaleString() ?? "?"} files (${ts.packages.length} pkgs)`,
  );
  console.log(
    `Rust totals: ${rust.totalSymbols?.toLocaleString() ?? "?"} symbols, ${rust.totalFiles?.toLocaleString() ?? "?"} files (${rust.packages.length} pkgs)\n`,
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

function runFirstPackage(listLimit: number): void {
  ensureReports();
  const ts = loadReport(TS_REPORT);
  const rust = loadReport(RUST_REPORT);

  const tsPkg = ts.packages[0]!;
  const rustPkg = rust.packages[0]!;
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

  console.log(`\n🔍 first-package deep dive: ${pkg}\n`);
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

  if (onlyRustKeys.length > 0 && listLimit > 0) {
    console.log(`\nSample Rust-only keys (up to ${listLimit}):`);
    onlyRustKeys.slice(0, listLimit).forEach((key) => console.log(`  ${key}`));
  }
  if (onlyTsKeys.length > 0 && listLimit > 0) {
    console.log(`\nSample TS-only keys (up to ${listLimit}):`);
    onlyTsKeys.slice(0, listLimit).forEach((key) => console.log(`  ${key}`));
  }

  if (rustDupKeys.length > 0 && listLimit > 0) {
    console.log(
      `\nRust duplicate keys (top ${Math.min(listLimit, rustDupKeys.length)}):`,
    );
    for (const [key, rows] of rustDupKeys.slice(0, listLimit)) {
      console.log(`  ${rows.length}× [${rows[0]!.kindName}] ${key}`);
    }
  }

  if (onlyInTs.length > 0) {
    console.log(
      `\n❌ Symbols in TS missing same id in Rust: ${onlyInTs.length}`,
    );
    onlyInTs
      .slice(0, Math.min(listLimit, onlyInTs.length))
      .forEach((symbol) => {
        console.log(
          `   ${symbol.id} (${symbol.kindName}) [${symbol.filePath}]`,
        );
      });
    if (onlyInTs.length > listLimit)
      console.log(`   … +${onlyInTs.length - listLimit} more`);
  }
  if (onlyInRust.length > 0) {
    console.log(
      `\n➕ Symbols in Rust missing same id in TS: ${onlyInRust.length}`,
    );
    onlyInRust
      .slice(0, Math.min(listLimit, onlyInRust.length))
      .forEach((symbol) => {
        console.log(
          `   ${symbol.id} (${symbol.kindName}) [${symbol.filePath}]`,
        );
      });
    if (onlyInRust.length > listLimit)
      console.log(`   … +${onlyInRust.length - listLimit} more`);
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
      .sort((first, second) => second[1] - first[1])
      .slice(0, 15)
      .forEach(([directory, count]) =>
        console.log(`   ${directory}: ${count}`),
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
      "\n✅ first-package: identical ids, files, and key counts vs rows.\n",
    );
  } else {
    console.log(
      "\nℹ️  Overload / #n suffixes can yield matching semantics with different ids; use keys + counts above.\n",
    );
  }
}

function runNamedPackage(packageName: string, listLimit: number): void {
  ensureReports();
  const ts = loadReport(TS_REPORT);
  const rust = loadReport(RUST_REPORT);

  const tsPkg = ts.packages.find((row) => row.package === packageName);
  const rustPkg = rust.packages.find((row) => row.package === packageName);
  if (!tsPkg || !rustPkg) {
    console.error(
      `Package "${packageName}" missing: TS ${tsPkg ? "ok" : "missing"}, Rust ${rustPkg ? "ok" : "missing"}`,
    );
    process.exit(1);
  }

  const pkg = `${rustPkg.package}@${rustPkg.version}`;
  const tsSyms = tsPkg.symbols;
  const rustSyms = rustPkg.symbols;

  console.log(`\n🔍 package deep dive: ${pkg}\n`);
  console.log(
    `Row counts: TS ${tsSyms.length.toLocaleString()} | Rust ${rustSyms.length.toLocaleString()}`,
  );

  const tsSymbolIds = new Set(tsSyms.map((symbol) => symbol.id));
  const rustSymbolIds = new Set(rustSyms.map((symbol) => symbol.id));
  const onlyInTs = tsSyms.filter((symbol) => !rustSymbolIds.has(symbol.id));
  const onlyInRust = rustSyms.filter((symbol) => !tsSymbolIds.has(symbol.id));

  const rustByKey = multiset(rustSyms, symbolKey);
  const tsByKey = multiset(tsSyms, symbolKey);
  const rustKeys = new Set(rustByKey.keys());
  const tsKeys = new Set(tsByKey.keys());
  const onlyRustKeys = [...rustKeys].filter((key) => !tsKeys.has(key)).sort();
  const onlyTsKeys = [...tsKeys].filter((key) => !rustKeys.has(key)).sort();

  console.log(
    `\nUnique keys (basename(filePath)::name): TS ${tsKeys.size} | Rust ${rustKeys.size}`,
  );
  console.log(
    `Keys only in Rust: ${onlyRustKeys.length} | only in TS: ${onlyTsKeys.length}`,
  );

  const byBasename = new Map<string, number>();
  for (const key of onlyTsKeys) {
    const basename = key.split("::")[0] ?? key;
    byBasename.set(basename, (byBasename.get(basename) ?? 0) + 1);
  }
  const topBasenames = [...byBasename.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);
  if (topBasenames.length > 0) {
    console.log(`\nTS-only keys by file (top ${topBasenames.length}):`);
    for (const [file, count] of topBasenames) {
      console.log(`  ${count.toString().padStart(5)}  ${file}`);
    }
  }

  if (onlyRustKeys.length > 0 && listLimit > 0) {
    console.log(`\nSample Rust-only keys (up to ${listLimit}):`);
    onlyRustKeys.slice(0, listLimit).forEach((key) => console.log(`  ${key}`));
  }
  if (onlyTsKeys.length > 0 && listLimit > 0) {
    console.log(`\nSample TS-only keys (up to ${listLimit}):`);
    onlyTsKeys.slice(0, listLimit).forEach((key) => console.log(`  ${key}`));
  }

  if (onlyInTs.length > 0 && listLimit > 0) {
    console.log(
      `\nSymbols in TS missing same id in Rust: ${onlyInTs.length} (sample)`,
    );
    onlyInTs
      .slice(0, Math.min(listLimit, onlyInTs.length))
      .forEach((symbol) => {
        console.log(
          `   ${symbol.id} (${symbol.kindName}) [${path.basename(symbol.filePath)}] :: ${symbol.name}`,
        );
      });
  }
  if (onlyInRust.length > 0 && listLimit > 0) {
    console.log(
      `\nSymbols in Rust missing same id in TS: ${onlyInRust.length} (sample)`,
    );
    onlyInRust
      .slice(0, Math.min(listLimit, onlyInRust.length))
      .forEach((symbol) => {
        console.log(
          `   ${symbol.id} (${symbol.kindName}) [${path.basename(symbol.filePath)}] :: ${symbol.name}`,
        );
      });
  }

  console.log("");
}

// --- CLI ---
const rawArgs = process.argv.slice(2);
let mode: "workspace" | "first-package" | "package" = "workspace";
let listLimit = 30;
let minDelta = 1;
let namedPackage: string | undefined;

for (let index = 0; index < rawArgs.length; index++) {
  const arg = rawArgs[index]!;
  if (arg === "workspace" || arg === "--workspace") mode = "workspace";
  else if (arg === "first-package" || arg === "--first-package")
    mode = "first-package";
  else if (arg === "package" && rawArgs[index + 1]) {
    mode = "package";
    namedPackage = rawArgs[++index];
  } else if (arg === "--limit" && rawArgs[index + 1]) {
    listLimit = Math.max(1, parseInt(rawArgs[++index]!, 10) || 30);
  } else if (arg === "--min-delta-symbols" && rawArgs[index + 1]) {
    minDelta = Math.max(0, parseInt(rawArgs[++index]!, 10) || 0);
  }
}

if (mode === "workspace") {
  runWorkspace(minDelta);
} else if (mode === "package") {
  if (!namedPackage) {
    console.error(
      "Usage: npx tsx scripts/audit-nci-parity.ts package <name> [--limit N]",
    );
    process.exit(1);
  }
  runNamedPackage(namedPackage, listLimit);
} else {
  runFirstPackage(listLimit);
}
