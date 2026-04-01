#!/usr/bin/env npx tsx
/**
 * Inspect nci-report.json: resolve a symbol id, list name collisions (#N suffix), optional source grep.
 *
 * Usage:
 *   npx tsx scripts/inspect-report-id.ts --id "effect@3.21.0::filter#14"
 *   npx tsx scripts/inspect-report-id.ts --name filter --package effect
 *   npx tsx scripts/inspect-report-id.ts --id "..." --grep-node-modules effect
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

type Report = {
  packages?: Array<{ package: string; version: string; symbols: ReportSymbol[] }>;
};

type ReportSymbol = {
  id: string;
  name: string;
  kindName?: string;
  filePath?: string;
  signature?: string;
  [key: string]: unknown;
};

function parseArgs() {
  const argv = process.argv.slice(2);
  const out: {
    id?: string;
    name?: string;
    pkg?: string;
    report?: string;
    grep?: string;
    schema?: string;
  } = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--id" && argv[i + 1]) {
      out.id = argv[++i];
    } else if (argv[i] === "--name" && argv[i + 1]) {
      out.name = argv[++i];
    } else if (argv[i] === "--package" && argv[i + 1]) {
      out.pkg = argv[++i];
    } else if (argv[i] === "--report" && argv[i + 1]) {
      out.report = argv[++i];
    } else if (argv[i] === "--grep-node-modules" && argv[i + 1]) {
      out.grep = argv[++i];
    } else if (argv[i] === "--schema" && argv[i + 1]) {
      out.schema = argv[++i];
    }
  }
  return out;
}

function main() {
  const args = parseArgs();
  const reportPath = path.resolve(
    args.report ?? path.join(__dirname, "..", "nci-report.json")
  );

  if (!fs.existsSync(reportPath)) {
    console.error("Report not found:", reportPath);
    process.exit(1);
  }

  console.log("Loading", reportPath, "…");
  const raw = fs.readFileSync(reportPath, "utf-8");
  const report = JSON.parse(raw) as Report;

  const allSymbols: ReportSymbol[] = [];
  for (const p of report.packages ?? []) {
    allSymbols.push(...p.symbols);
  }

  console.log("Total symbols:", allSymbols.length);

  if (args.id) {
    const sym = allSymbols.find((s) => s.id === args.id);
    if (!sym) {
      console.error("No symbol with id:", args.id);
      process.exit(2);
    }
    console.log("\n--- Symbol ---\n");
    console.log(JSON.stringify(sym, null, 2));
  }

  if (args.name && args.pkg) {
    const needle = `${args.pkg}@`;
    const matches = allSymbols.filter(
      (s) => s.name === args.name && s.id.startsWith(needle)
    );
    matches.sort((a, b) => a.id.localeCompare(b.id));
    console.log(
      `\n--- All symbols named "${args.name}" in package "${args.pkg}" (${matches.length}) ---\n`
    );
    for (const m of matches) {
      console.log(m.id);
      console.log(
        `  kind=${m.kindName} file=${m.filePath}\n  sig=${(m.signature ?? "").slice(0, 120)}${(m.signature?.length ?? 0) > 120 ? "…" : ""}\n`
      );
    }
  }

  if (args.grep) {
    const nm = path.join(__dirname, "..", "node_modules", args.grep);
    if (!fs.existsSync(nm)) {
      console.error("node_modules not found:", nm);
      process.exit(3);
    }
    const sub = args.schema ?? "dist/dts/Schema.d.ts";
    const schemaPath = path.join(nm, sub);
    if (!fs.existsSync(schemaPath)) {
      console.error("File not found:", schemaPath);
      process.exit(4);
    }
    const text = fs.readFileSync(schemaPath, "utf-8");
    const lines = text.split("\n");
    console.log(`\n--- Lines mentioning interface/function filter in ${sub} ---\n`);
    let n = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      if (
        /interface filter\s*</.test(line) ||
        /declare function filter/.test(line) ||
        /interface filterEffect/.test(line)
      ) {
        console.log(`${i + 1}: ${line.slice(0, 160)}${line.length > 160 ? "…" : ""}`);
        if (++n >= 30) break;
      }
    }
    if (n === 0) {
      console.log("(no lines matched; try --schema path/inside/package.d.ts)");
    }
  }

  if (!args.id && !args.name && !args.grep) {
    console.log(
      "Usage: --id <id> | --name <name> --package <pkg> [--grep-node-modules <packageDir>]"
    );
  }
}

main();
