#!/usr/bin/env npx tsx
/**
 * Runs crawl() on a fixture so discover fills allRawExports; prints that map when NCI_LOG_ALL_RAW_EXPORTS is set (this script sets it).
 *
 *   npx tsx scripts/log-all-raw-exports.ts
 *   npx tsx scripts/log-all-raw-exports.ts path/to/fixture-dir-or-entry.d.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { crawl } from "../src/crawler.js";
import { normalizePath } from "../src/resolver.js";

process.env.NCI_LOG_ALL_RAW_EXPORTS = "1";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveEntry(userPath: string | undefined): string {
  const defaultDir = path.resolve(__dirname, "../fixtures/internal-overload-ref");
  const base = userPath ? path.resolve(userPath) : defaultDir;
  if (fs.existsSync(base) && fs.statSync(base).isDirectory()) {
    const idx = path.join(base, "index.d.ts");
    if (fs.existsSync(idx)) return normalizePath(idx);
    throw new Error(`No index.d.ts in ${base}`);
  }
  if (fs.existsSync(base) && base.endsWith(".d.ts")) return normalizePath(base);
  throw new Error(`Not a .d.ts file or fixture directory: ${base}`);
}

const entry = resolveEntry(process.argv[2]);
crawl(entry);
