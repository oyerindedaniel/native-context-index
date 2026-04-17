#!/usr/bin/env npx tsx
/**
 * Fuzzy parity: TS symbol ids missing in Rust, then same-name + same-file
 * matches (overload `#n` stripped) vs truly absent rows — one package or all.
 *
 * Shared flags (`scripts/nci-report-cli.ts`): `--ts-report`, `--rust-report`,
 * `--package`, `--all-packages`, `--limit`, …
 *
 * Modes:
 *   (default)        — first package in each JSON
 *   --package <name> — match `package` field
 *   --all-packages   — compact one line per package in both reports
 *
 * Usage (repo root):
 *   npx tsx scripts/fuzzy-audit.ts
 *   npx tsx scripts/fuzzy-audit.ts --package typescript
 *   npx tsx scripts/fuzzy-audit.ts --all-packages
 */
import fs from "node:fs";
import path from "node:path";
import {
  packageVersionLookupKey,
  parseParityCli,
  requireBothReportsOrExit,
  resolveParityPackagePair,
  warnUnknownParityArgs,
} from "./nci-report-cli.ts";

const cli = parseParityCli(process.argv.slice(2));
warnUnknownParityArgs(cli.unknownArgs);

if (cli.packageName && cli.allPackages) {
  console.error("Use either --package <name> or --all-packages, not both.");
  process.exit(1);
}

requireBothReportsOrExit(cli.tsReportPath, cli.rustReportPath);

interface ReportSymbol {
  id: string;
  name: string;
  kindName: string;
  filePath: string;
}

interface PackageRow {
  package?: string;
  version?: string;
  symbols: ReportSymbol[];
}

interface Report {
  packages: PackageRow[];
}

function computeFuzzySummary(
  tsSymbols: ReportSymbol[],
  rustSymbols: ReportSymbol[],
): {
  tsMissingIdCount: number;
  fuzzyMatchedCount: number;
  reallyMissingCount: number;
} {
  const rustSymbolIds = new Set(rustSymbols.map((rustSymbol) => rustSymbol.id));
  const missingInRust = tsSymbols.filter(
    (tsSymbol) => !rustSymbolIds.has(tsSymbol.id),
  );

  let fuzzyMatchedCount = 0;
  for (const tsSymbol of missingInRust) {
    const baseName = tsSymbol.name.split("#")[0]!;
    const hasNameFileMatch = rustSymbols.some((rustItem) => {
      const rustBaseName = rustItem.name.split("#")[0]!;
      return (
        rustBaseName === baseName && rustItem.filePath === tsSymbol.filePath
      );
    });
    if (hasNameFileMatch) {
      fuzzyMatchedCount += 1;
    }
  }

  const reallyMissingCount = missingInRust.filter((tsSymbol) => {
    const baseName = tsSymbol.name.split("#")[0]!;
    return !rustSymbols.some((rustItem) => {
      const rustBaseName = rustItem.name.split("#")[0]!;
      return (
        rustBaseName === baseName && rustItem.filePath === tsSymbol.filePath
      );
    });
  }).length;

  return {
    tsMissingIdCount: missingInRust.length,
    fuzzyMatchedCount,
    reallyMissingCount,
  };
}

function fuzzyAuditForPackage(
  tsSymbols: ReportSymbol[],
  rustSymbols: ReportSymbol[],
  displayName: string,
  sampleCap: number,
): void {
  const rustSymbolIds = new Set(rustSymbols.map((rustSymbol) => rustSymbol.id));
  const missingInRust = tsSymbols.filter(
    (tsSymbol) => !rustSymbolIds.has(tsSymbol.id),
  );

  console.log(`\n🔍 FUZZY AUDIT — ${displayName}\n`);

  console.log(`Analyzing ${missingInRust.length} TS ids missing in Rust…\n`);

  const fuzzyMatches: string[] = [];
  const totalNamesakes = new Map<string, number>();

  missingInRust.forEach((tsSymbol) => {
    const baseName = tsSymbol.name.split("#")[0]!;

    const matches = rustSymbols.filter((rustItem) => {
      const rustBaseName = rustItem.name.split("#")[0]!;
      return (
        rustBaseName === baseName && rustItem.filePath === tsSymbol.filePath
      );
    });

    if (matches.length > 0) {
      fuzzyMatches.push(
        `TS: ${tsSymbol.id} (${tsSymbol.kindName}) -> RUST: ${matches.map((rustSymbol) => rustSymbol.id).join(", ")}`,
      );
      totalNamesakes.set(baseName, (totalNamesakes.get(baseName) || 0) + 1);
    }
  });

  console.log(
    `✅ FOUND ${fuzzyMatches.length} FUZZY MATCHES (Same Name/File, Different ID)\n`,
  );

  const topN = Math.min(10, sampleCap);
  if (fuzzyMatches.length > 0) {
    console.log(`Top ${topN} fuzzy match samples:`);
    fuzzyMatches
      .slice(0, topN)
      .forEach((matchLine) => console.log(`   ${matchLine}`));

    console.log("\nTop colliding names (TS counts):");
    const sortedNames = Array.from(totalNamesakes.entries())
      .sort((left, right) => right[1] - left[1])
      .slice(0, topN);

    sortedNames.forEach(([symbolBaseName, collisionCount]) => {
      console.log(`   - ${symbolBaseName}: ${collisionCount} missing IDs`);
    });
  } else {
    console.log(`Top ${topN} fuzzy match samples: 0`);
    console.log(`Top colliding names (TS counts): 0`);
  }

  const reallyMissing = missingInRust.filter((tsSymbol) => {
    const baseName = tsSymbol.name.split("#")[0]!;
    return !rustSymbols.some((rustItem) => {
      const rustBaseName = rustItem.name.split("#")[0]!;
      return (
        rustBaseName === baseName && rustItem.filePath === tsSymbol.filePath
      );
    });
  });

  console.log(
    `\n❌ REALLY MISSING (No name/file match at all in Rust): ${reallyMissing.length}`,
  );
  if (reallyMissing.length > 0) {
    reallyMissing.slice(0, topN).forEach((missingSymbol) => {
      console.log(
        `   - ${missingSymbol.id} [${path.basename(missingSymbol.filePath)}]`,
      );
    });
  }
}

function runAllPackagesFuzzy(tsReport: Report, rustReport: Report): void {
  const tsMap = new Map<string, PackageRow>();
  for (const row of tsReport.packages ?? []) {
    const lookupKey = packageVersionLookupKey(row);
    if (lookupKey) {
      tsMap.set(lookupKey, row);
    }
  }
  const rustMap = new Map<string, PackageRow>();
  for (const row of rustReport.packages ?? []) {
    const lookupKey = packageVersionLookupKey(row);
    if (lookupKey) {
      rustMap.set(lookupKey, row);
    }
  }

  const sortedKeys = [...new Set([...tsMap.keys(), ...rustMap.keys()])].sort();
  const keysOnlyInTs: string[] = [];
  const keysOnlyInRust: string[] = [];

  console.log("\n🔍 FUZZY AUDIT — all packages (compact)\n");
  console.log(
    `${"Package@version".padEnd(40)} ${"TS ids!Rust".padStart(12)} ${"Fuzzy".padStart(8)} ${"ReallyMiss".padStart(11)}`,
  );
  console.log("─".repeat(76));

  let comparedCount = 0;
  let sumMissingIds = 0;
  let sumFuzzy = 0;
  let sumReally = 0;

  for (const lookupKey of sortedKeys) {
    const tsRow = tsMap.get(lookupKey);
    const rustRow = rustMap.get(lookupKey);
    if (!tsRow) {
      keysOnlyInRust.push(lookupKey);
      continue;
    }
    if (!rustRow) {
      keysOnlyInTs.push(lookupKey);
      continue;
    }
    const tsSymbols = tsRow.symbols ?? [];
    const rustSymbols = rustRow.symbols ?? [];
    const summary = computeFuzzySummary(tsSymbols, rustSymbols);
    comparedCount += 1;
    sumMissingIds += summary.tsMissingIdCount;
    sumFuzzy += summary.fuzzyMatchedCount;
    sumReally += summary.reallyMissingCount;

    const label =
      lookupKey.length > 39 ? `${lookupKey.slice(0, 36)}…` : lookupKey;
    console.log(
      `${label.padEnd(40)} ${String(summary.tsMissingIdCount).padStart(12)} ${String(summary.fuzzyMatchedCount).padStart(8)} ${String(summary.reallyMissingCount).padStart(11)}`,
    );
  }

  console.log("─".repeat(76));
  console.log(
    `Compared ${comparedCount} package(s) | Σ TS ids missing in Rust: ${sumMissingIds} | Σ fuzzy-explained: ${sumFuzzy} | Σ really missing: ${sumReally}`,
  );
  console.log(
    "\nUse --package <name> for samples / top lists on one package.\n",
  );

  if (keysOnlyInTs.length > 0) {
    console.warn(
      `TS-only keys (${keysOnlyInTs.length}):`,
      keysOnlyInTs.slice(0, 12).join(", "),
      keysOnlyInTs.length > 12 ? "…" : "",
    );
  }
  if (keysOnlyInRust.length > 0) {
    console.warn(
      `Rust-only keys (${keysOnlyInRust.length}):`,
      keysOnlyInRust.slice(0, 12).join(", "),
      keysOnlyInRust.length > 12 ? "…" : "",
    );
  }
}

const tsReport: Report = JSON.parse(fs.readFileSync(cli.tsReportPath, "utf-8"));
const rustReport: Report = JSON.parse(
  fs.readFileSync(cli.rustReportPath, "utf-8"),
);

if (cli.allPackages) {
  runAllPackagesFuzzy(tsReport, rustReport);
} else {
  const { tsPackage, rustPackage, displayName } = resolveParityPackagePair(
    tsReport.packages,
    rustReport.packages,
    cli.packageName,
  );
  fuzzyAuditForPackage(
    tsPackage.symbols,
    rustPackage.symbols,
    displayName,
    cli.limit,
  );
}
