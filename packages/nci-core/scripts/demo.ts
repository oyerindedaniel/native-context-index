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
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scanPackages } from "../src/scanner.js";
import { resolveTypesEntry } from "../src/resolver.js";
import { buildPackageGraph } from "../src/graph.js";
import type { PackageGraph, PackageInfo } from "../src/types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── CLI args ────────────────────────────────────────────────
const args = process.argv.slice(2);
const outputIdx = args.indexOf("--output");
const outputPath = outputIdx !== -1 && args[outputIdx + 1]
  ? path.resolve(args[outputIdx + 1])
  : path.resolve(__dirname, "../nci-report.json");

// Collect --package flags
const targetPackages: string[] = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--package" && args[i + 1]) {
    targetPackages.push(args[i + 1]!);
  }
}

// ─── Discover packages ───────────────────────────────────────
const rootNodeModules = path.resolve(__dirname, "../../../node_modules");
const localNodeModules = path.resolve(__dirname, "../node_modules");

console.log("🔍 Scanning node_modules...\n");

let allPackages: PackageInfo[] = [];

if (fs.existsSync(rootNodeModules)) {
  allPackages.push(...scanPackages(rootNodeModules));
}
if (fs.existsSync(localNodeModules)) {
  const localPkgs = scanPackages(localNodeModules);
  // Add only packages not already found in root
  const existingNames = new Set(allPackages.map((p) => p.name));
  for (const pkg of localPkgs) {
    if (!existingNames.has(pkg.name)) {
      allPackages.push(pkg);
    }
  }
}

// Filter by --package if specified
if (targetPackages.length > 0) {
  allPackages = allPackages.filter((p) => targetPackages.includes(p.name));
  if (allPackages.length === 0) {
    console.error(`❌ No packages found matching: ${targetPackages.join(", ")}`);
    process.exit(1);
  }
}

console.log(`📦 Found ${allPackages.length} packages\n`);

// ─── Process each package ────────────────────────────────────
interface PackageReport {
  name: string;
  version: string;
  entries: number;
  totalSymbols: number;
  totalFiles: number;
  crawlDurationMs: number;
  graph: PackageGraph;
  error?: string;
}

const reports: PackageReport[] = [];
const errors: { name: string; error: string }[] = [];
const startTime = performance.now();

for (const pkg of allPackages) {
  process.stdout.write(`   ${pkg.name}...`);

  try {
    const entry = resolveTypesEntry(pkg.dir);
    const graph = buildPackageGraph(pkg, { maxDepth: 5 });

    reports.push({
      name: pkg.name,
      version: pkg.version,
      entries: entry.typesEntries.length,
      totalSymbols: graph.totalSymbols,
      totalFiles: graph.totalFiles,
      crawlDurationMs: Math.round(graph.crawlDurationMs),
      graph,
    });

    console.log(` ${graph.totalSymbols} symbols, ${graph.totalFiles} files (${Math.round(graph.crawlDurationMs)}ms)`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    errors.push({ name: pkg.name, error: message });
    console.log(` ❌ ${message}`);
  }
}

const totalTime = Math.round(performance.now() - startTime);

// ─── Summary ─────────────────────────────────────────────────
console.log("\n" + "═".repeat(70));
console.log("📊 SUMMARY\n");
console.log(`   Total packages:  ${reports.length}`);
console.log(`   With types:      ${reports.filter((r) => r.totalSymbols > 0).length}`);
console.log(`   Without types:   ${reports.filter((r) => r.totalSymbols === 0).length}`);
console.log(`   Errors:          ${errors.length}`);
console.log(`   Total symbols:   ${reports.reduce((sum, r) => sum + r.totalSymbols, 0)}`);
console.log(`   Total files:     ${reports.reduce((sum, r) => sum + r.totalFiles, 0)}`);
console.log(`   Total time:      ${totalTime}ms\n`);

console.log("   " + "Package".padEnd(40) + "Entries".padStart(8) + "Symbols".padStart(9) + "Files".padStart(7) + "Time".padStart(8));
console.log("   " + "─".repeat(72));

for (const r of reports.sort((a, b) => b.totalSymbols - a.totalSymbols)) {
  console.log(
    "   " +
    r.name.padEnd(40) +
    String(r.entries).padStart(8) +
    String(r.totalSymbols).padStart(9) +
    String(r.totalFiles).padStart(7) +
    `${r.crawlDurationMs}ms`.padStart(8)
  );
}

if (errors.length > 0) {
  console.log("\n   ❌ ERRORS:");
  for (const e of errors) {
    console.log(`   ${e.name}: ${e.error}`);
  }
}

// ─── Save to file ────────────────────────────────────────────
const output = {
  generatedAt: new Date().toISOString(),
  totalPackages: reports.length,
  totalSymbols: reports.reduce((sum, r) => sum + r.totalSymbols, 0),
  totalFiles: reports.reduce((sum, r) => sum + r.totalFiles, 0),
  totalTimeMs: totalTime,
  errors,
  packages: reports.map((r) => r.graph),
};

fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
console.log(`\n💾 Report saved to: ${outputPath}`);
console.log(`   File size: ${(fs.statSync(outputPath).size / 1024).toFixed(1)} KB\n`);
