#!/usr/bin/env npx tsx
/**
 * Audit TS oracle vs Rust NCI reports (same paths as compare-engines.ts).
 *
 * Explains count gaps when `basename(filePath)::name` keys match but row counts differ
 * (usually Rust keeping one row per overload; TS often one row per key for referenced libs).
 *
 * Usage (repo root):
 *   npx tsx scripts/audit-report-parity.ts
 *   npx tsx scripts/audit-report-parity.ts --limit 50
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

const RUST_REPORT = path.join(REPO_ROOT, "packages/nci-engine/nci-report-rust.json");
const TS_REPORT = path.join(REPO_ROOT, "packages/nci-core/nci-report.json");

interface SymbolEntry {
  id: string;
  name: string;
  filePath: string;
  kindName: string;
  isInherited?: boolean;
  signature?: string;
}

interface Report {
  packages: Array<{
    package: string;
    version: string;
    symbols: SymbolEntry[];
  }>;
}

function symbolKey(s: SymbolEntry): string {
  return `${path.basename(s.filePath)}::${s.name}`;
}

function multiset<T>(items: T[], keyFn: (t: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const item of items) {
    const k = keyFn(item);
    let arr = m.get(k);
    if (!arr) {
      arr = [];
      m.set(k, arr);
    }
    arr.push(item);
  }
  return m;
}

const args = process.argv.slice(2);
let listLimit = 30;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--limit" && args[i + 1]) {
    listLimit = Math.max(1, parseInt(args[i + 1]!, 10) || 30);
    i++;
  }
}

if (!fs.existsSync(RUST_REPORT) || !fs.existsSync(TS_REPORT)) {
  console.error("Missing reports. Run TS + Rust demos first:");
  console.error("  packages/nci-core:  npx tsx scripts/demo.ts --package <pkg>");
  console.error("  packages/nci-engine: cargo run --example demo -- --package <pkg>");
  process.exit(1);
}

const rustData: Report = JSON.parse(fs.readFileSync(RUST_REPORT, "utf8"));
const tsData: Report = JSON.parse(fs.readFileSync(TS_REPORT, "utf8"));

const rustSyms = rustData.packages[0]!.symbols;
const tsSyms = tsData.packages[0]!.symbols;
const pkg = `${rustData.packages[0]!.package}@${rustData.packages[0]!.version}`;

const rustByKey = multiset(rustSyms, symbolKey);
const tsByKey = multiset(tsSyms, symbolKey);

const rustKeys = new Set(rustByKey.keys());
const tsKeys = new Set(tsByKey.keys());

const onlyRustKeys = [...rustKeys].filter((k) => !tsKeys.has(k)).sort();
const onlyTsKeys = [...tsKeys].filter((k) => !rustKeys.has(k)).sort();

const rustDupKeys = [...rustByKey.entries()]
  .filter(([, rows]) => rows.length > 1)
  .sort((a, b) => b[1].length - a[1].length);

const tsDupKeys = [...tsByKey.entries()]
  .filter(([, rows]) => rows.length > 1)
  .sort((a, b) => b[1].length - a[1].length);

const extraRustRows = rustDupKeys.reduce((n, [, rows]) => n + rows.length - 1, 0);
const extraTsRows = tsDupKeys.reduce((n, [, rows]) => n + rows.length - 1, 0);

console.log(`\nPackage: ${pkg}`);
console.log(`\nRow counts:`);
console.log(`  TS:   ${tsSyms.toLocaleString()}`);
console.log(`  Rust: ${rustSyms.toLocaleString()}`);
console.log(`  Δ:    ${(rustSyms.length - tsSyms.length).toLocaleString()} (Rust − TS)`);

console.log(`\nUnique keys (basename(filePath)::name):`);
console.log(`  TS:   ${tsKeys.size.toLocaleString()}`);
console.log(`  Rust: ${rustKeys.size.toLocaleString()}`);

console.log(`\nSet difference:`);
console.log(`  Keys only in Rust: ${onlyRustKeys.length}`);
console.log(`  Keys only in TS:   ${onlyTsKeys.length}`);

if (onlyRustKeys.length > 0 && listLimit > 0) {
  console.log(`\n  Sample Rust-only keys (up to ${listLimit}):`);
  onlyRustKeys.slice(0, listLimit).forEach((k) => console.log(`    ${k}`));
}
if (onlyTsKeys.length > 0 && listLimit > 0) {
  console.log(`\n  Sample TS-only keys (up to ${listLimit}):`);
  onlyTsKeys.slice(0, listLimit).forEach((k) => console.log(`    ${k}`));
}

console.log(`\nDuplicate keys (same key, multiple rows):`);
console.log(`  Rust: ${rustDupKeys.length} keys → +${extraRustRows} extra rows vs unique`);
console.log(`  TS:   ${tsDupKeys.length} keys → +${extraTsRows} extra rows vs unique`);

if (rustDupKeys.length > 0) {
  console.log(`\n  Rust duplicate keys by count (top N=${Math.min(listLimit, rustDupKeys.length)}):`);
  for (const [key, rows] of rustDupKeys.slice(0, listLimit)) {
    const kind = rows[0]!.kindName;
    console.log(`    ${rows.length}×  [${kind}] ${key}`);
  }
  const first = rustDupKeys[0];
  if (first) {
    const [, sampleRows] = first;
    console.log(`\n  Example expanded — ${first[0]}:`);
    sampleRows.slice(0, 3).forEach((s, i) => {
      const sig = (s.signature ?? "").split("\n")[0]?.slice(0, 120) ?? "";
      console.log(`    [${i}] ${s.kindName} ${sig}`);
    });
    if (sampleRows.length > 3) {
      console.log(`    … +${sampleRows.length - 3} more overloads/rows`);
    }
  }
}

console.log(
  `\nInterpretation: if “only in *” is 0 but Rust rows > TS, Rust is emitting duplicate rows per key (often method overloads in \`typescript.d.ts\`-style refs). TS oracle often collapses to one row per key.`,
);
console.log("");
