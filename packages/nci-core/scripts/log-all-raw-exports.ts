#!/usr/bin/env npx tsx
/**
 * Debug helper: enables `NCI_LOG_ALL_RAW_EXPORTS` and runs the **full graph pipeline**
 * (`buildPackageGraph`), so any code path that uses `nciLogAllRawExportsEnabled()` from
 * `nci-log-flags.ts` can emit logs—not only the crawler.
 *
 * Usage:
 *   npx tsx scripts/log-all-raw-exports.ts
 *   npx tsx scripts/log-all-raw-exports.ts path/to/package-or-fixture-dir
 *   npx tsx scripts/log-all-raw-exports.ts path/to/some.d.ts   (package root is found upward)
 *
 * To gate your own stderr logs:
 *   import { nciLogAllRawExportsEnabled } from "../src/nci-log-flags.js";
 *   if (nciLogAllRawExportsEnabled()) console.error("…", data);
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { PackageInfo } from "../src/types.js";
import { NCI_LOG_ALL_RAW_EXPORTS } from "../src/nci-log-flags.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function findPackageRoot(fromFileOrDir: string): string {
  let dir = fromFileOrDir;
  if (fs.existsSync(dir) && !fs.statSync(dir).isDirectory()) {
    dir = path.dirname(dir);
  }
  while (true) {
    if (fs.existsSync(path.join(dir, "package.json"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return fromFileOrDir.endsWith(".d.ts") ? path.dirname(fromFileOrDir) : fromFileOrDir;
}

function readPackageInfo(packageDir: string): PackageInfo {
  const pkgPath = path.join(packageDir, "package.json");
  if (!fs.existsSync(pkgPath)) {
    return {
      name: path.basename(packageDir),
      version: "0.0.0",
      dir: packageDir,
      isScoped: path.basename(packageDir).startsWith("@"),
    };
  }
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as {
    name?: string;
    version?: string;
  };
  const name = pkg.name ?? path.basename(packageDir);
  return {
    name,
    version: pkg.version ?? "0.0.0",
    dir: packageDir,
    isScoped: name.startsWith("@"),
  };
}

function resolveTargetPath(userArg: string | undefined): string {
  const defaultDir = path.resolve(__dirname, "../fixtures/internal-overload-ref");
  return userArg ? path.resolve(userArg) : defaultDir;
}

async function main(): Promise<void> {
  process.env[NCI_LOG_ALL_RAW_EXPORTS] = "1";

  const { buildPackageGraph } = await import("../src/graph.js");

  const target = resolveTargetPath(process.argv[2]);
  const packageDir = findPackageRoot(target);
  const info = readPackageInfo(packageDir);

  console.error(
    `[nci] ${NCI_LOG_ALL_RAW_EXPORTS}=1 — building graph for ${info.name}@${info.version} (${info.dir})`
  );

  const graph = buildPackageGraph(info);

  console.error(
    `[nci] done: ${graph.symbols.length} symbols, ${graph.totalFiles} files, ${graph.crawlDurationMs.toFixed(1)}ms`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
