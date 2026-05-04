import { mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const docsRoot = join(scriptDir, "..");
const workspaceRoot = join(docsRoot, "..", "..");

const docsRuns = join(docsRoot, "benchmarks", "runs");
const webBenchData = join(workspaceRoot, "apps", "web", "data", "benchmarks");

for (const dir of [docsRuns, webBenchData]) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
}

process.stdout.write(
  `Cleaned and recreated empty:\n  ${docsRuns}\n  ${webBenchData}\n`,
);
