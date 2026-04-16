#!/usr/bin/env npx tsx
/**
 * Validate a Rust NCI JSON report for duplicates that violate SQLite constraints
 * used by NciDatabase::save_package:
 *
 *   - symbols: UNIQUE(package_id, id) → unique `id` within each package
 *   - symbol_dependencies: PK (from_symbol_id, to_symbol_id_text)
 *   - symbol_additional_files: PK (symbol_id, file_path)
 *   - symbol_heritage: PK (symbol_id, heritage)
 *   - symbol_modifiers: PK (symbol_id, modifier)
 *
 * Usage (repo root):
 *   npx tsx scripts/check-nci-report-duplicates.ts
 *   npx tsx scripts/check-nci-report-duplicates.ts packages/nci-engine/nci-report-rust.json
 *
 * Exit: 0 = OK, 1 = violations found, 2 = IO/parse error
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const DEFAULT_REPORT = path.join(REPO_ROOT, "nci-report-rust.json");

interface ReportSymbol {
  id?: string;
  dependencies?: string[];
  heritage?: string[];
  modifiers?: string[];
  additionalFiles?: string[];
}

interface ReportPackage {
  package?: string;
  symbols?: ReportSymbol[];
}

interface ReportRoot {
  packages?: ReportPackage[];
}

function distinctDuplicates(values: string[]): string[] {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .filter(([, count]) => count > 1)
    .map(([value]) => value)
    .sort();
}

function checkListField(
  packageName: string,
  symbolId: string,
  fieldLabel: string,
  items: unknown,
  violations: string[],
): void {
  if (!Array.isArray(items) || items.length === 0) {
    return;
  }
  const strings = items.map((entry) => String(entry));
  for (const duplicate of distinctDuplicates(strings)) {
    violations.push(
      `  ${packageName}  symbol id=${JSON.stringify(symbolId)}  ${fieldLabel}: duplicate ${JSON.stringify(duplicate)}`,
    );
  }
}

function validateReport(report: ReportRoot): string[] {
  const violations: string[] = [];
  const packages = report.packages;

  if (packages === undefined) {
    return ["Missing top-level key 'packages'."];
  }
  if (!Array.isArray(packages)) {
    return ["Top-level 'packages' must be a JSON array."];
  }

  for (const packageEntry of packages) {
    if (packageEntry === null || typeof packageEntry !== "object") {
      violations.push("Package entry is not an object.");
      continue;
    }

    const packageName = String(packageEntry.package ?? "<unknown-package>");
    const symbols = packageEntry.symbols;

    if (!Array.isArray(symbols)) {
      violations.push(`${packageName}: 'symbols' is not an array.`);
      continue;
    }

    const symbolIds = symbols.map((symbolEntry) =>
      typeof symbolEntry === "object" &&
      symbolEntry !== null &&
      "id" in symbolEntry
        ? String((symbolEntry as ReportSymbol).id ?? "")
        : "",
    );

    for (const duplicateId of distinctDuplicates(
      symbolIds.filter((id) => id.length > 0),
    )) {
      violations.push(
        `${packageName}: duplicate symbol id ${JSON.stringify(duplicateId)} ` +
          `(SQLite UNIQUE(package_id, id)).`,
      );
    }

    let symbolIndex = 0;
    for (const symbolEntry of symbols) {
      if (symbolEntry === null || typeof symbolEntry !== "object") {
        symbolIndex += 1;
        violations.push(
          `${packageName}: symbol entry at index ${symbolIndex} is not an object.`,
        );
        continue;
      }

      const typedSymbol = symbolEntry as ReportSymbol;
      const symbolId =
        typedSymbol.id !== undefined && typedSymbol.id !== null
          ? String(typedSymbol.id)
          : `<no-id-at-index-${symbolIndex}>`;

      checkListField(
        packageName,
        symbolId,
        "dependencies",
        typedSymbol.dependencies,
        violations,
      );
      checkListField(
        packageName,
        symbolId,
        "heritage",
        typedSymbol.heritage,
        violations,
      );
      checkListField(
        packageName,
        symbolId,
        "modifiers",
        typedSymbol.modifiers,
        violations,
      );
      checkListField(
        packageName,
        symbolId,
        "additionalFiles",
        typedSymbol.additionalFiles,
        violations,
      );

      symbolIndex += 1;
    }
  }

  return violations;
}

function main(): number {
  const argumentPath = process.argv[2];
  const reportPath = argumentPath
    ? path.resolve(process.cwd(), argumentPath)
    : DEFAULT_REPORT;

  if (!fs.existsSync(reportPath)) {
    console.error(`Error: file not found: ${reportPath}`);
    return 2;
  }

  let reportText: string;
  try {
    reportText = fs.readFileSync(reportPath, "utf8");
  } catch (readError) {
    console.error(`Error reading ${reportPath}:`, readError);
    return 2;
  }

  let reportData: unknown;
  try {
    reportData = JSON.parse(reportText) as unknown;
  } catch (parseError) {
    console.error("Invalid JSON:", parseError);
    return 2;
  }

  if (reportData === null || typeof reportData !== "object") {
    console.error("Top-level JSON value must be an object.");
    return 2;
  }

  const violationLines = validateReport(reportData as ReportRoot);
  console.log(`Report: ${reportPath}`);

  if (violationLines.length === 0) {
    console.log(
      "OK — no duplicate keys that would violate Nci SQLite constraints.",
    );
    return 0;
  }

  console.log(`FAIL — ${violationLines.length} issue(s):\n`);
  for (const line of violationLines) {
    console.log(line);
  }
  return 1;
}

process.exit(main());
