#!/usr/bin/env npx tsx
/**
 * NCI Core — Demo Script
 *
 * Scans all packages from node_modules, builds their symbol graphs,
 * and saves everything to a JSON report file.
 *
 * Usage:
 *   npx tsx scripts/demo.ts
 *   npx tsx scripts/demo.ts --output ./my-report.json
 *   npx tsx scripts/demo.ts --package effect
 *   npx tsx scripts/demo.ts --package vitest --package prettier
 *
 * Discovers packages from repo root, `nci-core`, and `nci-engine` node_modules (in that order)
 * and skips duplicate installs that share the same real directory (pnpm-style duplicates).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scanPackages } from "../src/scanner.js";
import { buildPackageGraph } from "../src/graph.js";
import type { PackageGraph, PackageInfo } from "../src/types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const args = process.argv.slice(2);
const outputIdx = args.indexOf("--output");
const outputPath =
  outputIdx !== -1 && args[outputIdx + 1]
    ? path.resolve(args[outputIdx + 1])
    : path.resolve(__dirname, "../nci-report.json");

const prettyPrint = args.includes("--pretty");
if (args.includes("--profile")) {
  process.env.NCI_PROFILE = "1";
}

const targetPackages: string[] = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--package" && args[i + 1]) {
    targetPackages.push(args[i + 1]!);
  }
}

const repoRoot = path.resolve(__dirname, "../../../");
const nciCoreRoot = path.resolve(__dirname, "..");
const nciEngineRoot = path.resolve(__dirname, "../../nci-engine");

const nodeModulesRoots = [
  path.join(repoRoot, "node_modules"),
  path.join(nciCoreRoot, "node_modules"),
  path.join(nciEngineRoot, "node_modules"),
];

const realpathCanonical =
  typeof fs.realpathSync.native === "function"
    ? (dir: string) => fs.realpathSync.native(dir)
    : (dir: string) => fs.realpathSync(dir);

/** First root wins; same physical package dir (realpath) is only indexed once. */
function mergePackagesFromNodeModulesRoots(roots: string[]): PackageInfo[] {
  const seenCanonicalDirs = new Set<string>();
  const merged: PackageInfo[] = [];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const pkg of scanPackages(root)) {
      let canonicalDir: string;
      try {
        canonicalDir = realpathCanonical(pkg.dir);
      } catch {
        canonicalDir = path.resolve(pkg.dir);
      }
      if (seenCanonicalDirs.has(canonicalDir)) continue;
      seenCanonicalDirs.add(canonicalDir);
      merged.push(pkg);
    }
  }
  return merged;
}

console.log("🔍 Scanning node_modules...\n");

const scanStart = performance.now();
const allPackages = mergePackagesFromNodeModulesRoots(nodeModulesRoots);
const scanMs = Math.round(performance.now() - scanStart);

let packagesToIndex = allPackages;
if (targetPackages.length > 0) {
  packagesToIndex = allPackages.filter((pkg) =>
    targetPackages.includes(pkg.name),
  );
  if (packagesToIndex.length === 0) {
    console.error(
      `❌ No packages found matching: ${targetPackages.join(", ")}`,
    );
    process.exit(1);
  }
}

console.log(`📦 Found ${packagesToIndex.length} packages\n`);

interface PackageReport {
  name: string;
  version: string;
  totalSymbols: number;
  totalFiles: number;
  crawlDurationMs: number;
  buildDurationMs: number;
  graph: PackageGraph;
}

const reports: PackageReport[] = [];
const errors: { name: string; error: string }[] = [];
const startTime = performance.now();

for (const pkg of packagesToIndex) {
  process.stdout.write(`   ${pkg.name}...`);

  try {
    const graph = buildPackageGraph(pkg, { maxHops: 10 });

    reports.push({
      name: pkg.name,
      version: pkg.version,
      totalSymbols: graph.totalSymbols,
      totalFiles: graph.totalFiles,
      crawlDurationMs: Math.round(graph.crawlDurationMs),
      buildDurationMs: Math.round(graph.buildDurationMs),
      graph,
    });

    console.log(
      ` ${graph.totalSymbols} symbols, ${graph.totalFiles} files (crawl ${Math.round(graph.crawlDurationMs)}ms build ${Math.round(graph.buildDurationMs)}ms)`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    errors.push({ name: pkg.name, error: message });
    console.log(` ❌ ${message}`);
  }
}

const totalTime = Math.round(performance.now() - startTime);

console.log("\n" + "═".repeat(70));
console.log("📊 SUMMARY\n");
console.log(`   Scan time:       ${scanMs}ms`);
console.log(`   Total packages:  ${reports.length}`);
console.log(
  `   With types:      ${reports.filter((report) => report.totalSymbols > 0).length}`,
);
console.log(
  `   Without types:   ${reports.filter((report) => report.totalSymbols === 0).length}`,
);
console.log(`   Errors:          ${errors.length}`);
console.log(
  `   Total symbols:   ${reports.reduce((sum, report) => sum + report.totalSymbols, 0)}`,
);
console.log(
  `   Total files:     ${reports.reduce((sum, report) => sum + report.totalFiles, 0)}`,
);
console.log(`   Graph time:      ${totalTime}ms\n`);

console.log(
  "   " +
    "Package".padEnd(36) +
    "Symbols".padStart(9) +
    "Files".padStart(7) +
    "Crawl".padStart(8) +
    "Build".padStart(8),
);
console.log("   " + "─".repeat(76));

for (const report of reports.sort((a, b) => b.totalSymbols - a.totalSymbols)) {
  console.log(
    "   " +
      report.name.padEnd(36) +
      String(report.totalSymbols).padStart(9) +
      String(report.totalFiles).padStart(7) +
      `${report.crawlDurationMs}ms`.padStart(8) +
      `${report.buildDurationMs}ms`.padStart(8),
  );
}

if (errors.length > 0) {
  console.log("\n   ❌ ERRORS:");
  for (const errorEntry of errors) {
    console.log(`   ${errorEntry.name}: ${errorEntry.error}`);
  }
}

const output = {
  generatedAt: new Date().toISOString(),
  totalPackages: reports.length,
  totalSymbols: reports.reduce((sum, report) => sum + report.totalSymbols, 0),
  totalFiles: reports.reduce((sum, report) => sum + report.totalFiles, 0),
  totalTimeMs: totalTime,
  errors,
  packages: reports.map((report) => report.graph),
};

const stringifyStart = performance.now();
const jsonStr = prettyPrint
  ? JSON.stringify(output, null, 2)
  : JSON.stringify(output);
const stringifyMs = Math.round(performance.now() - stringifyStart);

const writeStart = performance.now();
fs.writeFileSync(outputPath, jsonStr);
const writeMs = Math.round(performance.now() - writeStart);
const fileSizeKB = (fs.statSync(outputPath).size / 1024).toFixed(1);

console.log(`\n💾 Report saved to: ${outputPath}`);
console.log(`   File size: ${fileSizeKB} KB`);
console.log(
  `   Stringify: ${stringifyMs}ms | Write: ${writeMs}ms${prettyPrint ? " (pretty)" : " (compact)"}\n`,
);
