#!/usr/bin/env npx tsx
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildPackageGraph } from "../src/graph.js";
import type { PackageGraph, PackageInfo } from "../src/types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fixturesDir = path.resolve(__dirname, "../fixtures");
const snapshotDir = path.resolve(
  __dirname,
  "../../../crates/nci-engine/tests/snapshots/oracle"
);

const args = process.argv.slice(2);
const targetFixtures: string[] = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--fixture" && args[i + 1]) {
    targetFixtures.push(args[i + 1]!);
    i++;
  }
}

fs.mkdirSync(snapshotDir, { recursive: true });

const allFixtures = fs
  .readdirSync(fixturesDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

const fixtures =
  targetFixtures.length > 0
    ? allFixtures.filter((name) => targetFixtures.includes(name))
    : allFixtures;

if (fixtures.length === 0) {
  process.exit(1);
}

function normaliseGraph(graph: PackageGraph, fixtureDir: string): PackageGraph {
  const normalise = (p: string): string => {
    const forward = p.replace(/\\/g, "/");
    const base = fixtureDir.replace(/\\/g, "/");
    if (forward.startsWith(base)) {
      const rel = forward.slice(base.length);
      return rel.startsWith("/") ? rel.slice(1) : rel;
    }
    return forward;
  };

  return {
    ...graph,
    symbols: graph.symbols.map((sym) => ({
      ...sym,
      filePath: normalise(sym.filePath),
      additionalFiles: sym.additionalFiles?.map(normalise),
      rawDependencies: undefined,
    })),
    crawlDurationMs: 0,
  };
}

for (const fixtureName of fixtures) {
  const fixtureDir = path.join(fixturesDir, fixtureName);
  const pkgJsonPath = path.join(fixtureDir, "package.json");

  let info: PackageInfo;
  if (fs.existsSync(pkgJsonPath)) {
    const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8"));
    info = {
      name: pkgJson.name ?? fixtureName,
      version: pkgJson.version ?? "1.0.0",
      dir: fixtureDir,
      isScoped: (pkgJson.name ?? fixtureName).startsWith("@"),
    };
  } else {
    info = {
      name: fixtureName,
      version: "1.0.0",
      dir: fixtureDir,
      isScoped: fixtureName.startsWith("@"),
    };
  }

  try {
    const graph = buildPackageGraph(info);
    const normalised = normaliseGraph(graph, fixtureDir);
    const outputPath = path.join(snapshotDir, `${fixtureName}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(normalised, null, 2) + "\n");
    console.log(`   ✅ ${fixtureName}`);
  } catch (err) {
    console.log(`   ❌ ${fixtureName} — ${err instanceof Error ? err.message : err}`);
  }
}
