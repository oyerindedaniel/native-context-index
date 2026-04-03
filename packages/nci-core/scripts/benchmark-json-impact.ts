#!/usr/bin/env npx tsx
/**
 * Compare JSON.stringify compact vs pretty for elapsed time and rough heap delta.
 * Does not write a file.
 *
 * Usage:
 *   cd packages/nci-core
 *   npx tsx scripts/benchmark-json-impact.ts
 *   npx tsx scripts/benchmark-json-impact.ts --package effect
 *
 * With optional GC (more stable heap numbers): node --expose-gc node_modules/tsx/dist/cli.mjs scripts/benchmark-json-impact.ts --package effect
 */
import v8 from "node:v8";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scanPackages } from "../src/scanner.js";
import { buildPackageGraph } from "../src/graph.js";
import type { PackageInfo } from "../src/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function heapUsedMb(): number {
  if (global.gc) global.gc();
  return Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
}

function runCase(
  produceString: () => string
): { millis: number; heapDeltaMb: number; outLen: number } {
  const heapBeforeMb = heapUsedMb();
  const timeStart = performance.now();
  const serialized = produceString();
  const millis = Math.round(performance.now() - timeStart);
  const heapAfterMb = heapUsedMb();
  return { millis, heapDeltaMb: heapAfterMb - heapBeforeMb, outLen: serialized.length };
}

const args = process.argv.slice(2);
let pkgName: string | undefined;
for (let argIndex = 0; argIndex < args.length; argIndex++) {
  if (args[argIndex] === "--package" && args[argIndex + 1]) {
    pkgName = args[argIndex + 1];
    argIndex++;
  }
}

const rootNodeModules = path.resolve(__dirname, "../../../node_modules");
const localNodeModules = path.resolve(__dirname, "../node_modules");

let info: PackageInfo;

if (pkgName) {
  const all: PackageInfo[] = [];
  if (fs.existsSync(rootNodeModules)) all.push(...scanPackages(rootNodeModules));
  if (fs.existsSync(localNodeModules)) {
    const names = new Set(all.map((packageInfo) => packageInfo.name));
    for (const packageInfo of scanPackages(localNodeModules)) {
      if (!names.has(packageInfo.name)) {
        names.add(packageInfo.name);
        all.push(packageInfo);
      }
    }
  }
  const found = all.find((packageInfo) => packageInfo.name === pkgName);
  if (!found) {
    console.error(`Package not found in node_modules: ${pkgName}`);
    process.exit(1);
  }
  info = found;
} else {
  info = {
    name: "re-export-chain",
    version: "1.0.0",
    dir: path.join(__dirname, "../fixtures/re-export-chain"),
    isScoped: false,
  };
}

console.log(`Package: ${info.name}@${info.version}`);

const buildStart = performance.now();
const graph = buildPackageGraph(info, { maxDepth: 10 });
const buildMillis = Math.round(performance.now() - buildStart);
console.log(`buildPackageGraph: ${buildMillis}ms | symbols=${graph.totalSymbols} files=${graph.totalFiles}`);

const payload = {
  generatedAt: new Date().toISOString(),
  packages: [graph],
};

const compact = runCase(() => JSON.stringify(payload));
const pretty = runCase(() => JSON.stringify(payload, null, 2));

console.log("\nJSON.stringify (one graph in memory; demo avoids duplicating graphs in an extra wrapper):\n");
console.log(
  `  compact: ${compact.millis}ms  len=${compact.outLen.toLocaleString()} chars  heap delta ~${compact.heapDeltaMb} MiB`
);
console.log(
  `  pretty:  ${pretty.millis}ms  len=${pretty.outLen.toLocaleString()} chars  heap delta ~${pretty.heapDeltaMb} MiB`
);
if (compact.millis > 0) {
  console.log(`  pretty / compact time ratio: ${(pretty.millis / compact.millis).toFixed(2)}×`);
}

try {
  const stats = v8.getHeapStatistics();
  console.log(`\nV8 heap limit: ${Math.round(stats.heap_size_limit / 1024 / 1024)} MiB`);
} catch {
  /* ignore */
}
