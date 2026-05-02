import { createHash } from "node:crypto";
import type {
  NciStageResult,
  PackageEntry,
} from "@repo/benchmark-contract/benchmark-types";
import { executeCommand } from "./benchmark-nci";

function digestOutput(outputText: string): string {
  return createHash("sha256").update(outputText).digest("hex").slice(0, 16);
}

export function buildSqlCommand(packageEntry: PackageEntry): string {
  return [
    "SELECT p.name, p.version, COUNT(s.symbol_id) AS symbol_count",
    "FROM packages p",
    "LEFT JOIN symbols s ON p.package_id = s.package_id",
    `WHERE p.name = '${packageEntry.package_name.replaceAll("'", "''")}'`,
    `AND p.version = '${packageEntry.package_version.replaceAll("'", "''")}'`,
    "GROUP BY p.name, p.version",
    "LIMIT 1",
  ].join(" ");
}

export async function runSqlValidationStage(
  packageEntry: PackageEntry,
  workspaceRoot: string,
  nciBinaryPath: string,
): Promise<NciStageResult> {
  const sqlCommand = buildSqlCommand(packageEntry);
  const fullCommand = `"${nciBinaryPath}" sql --format json -c "${sqlCommand}" --max-rows 1`;
  const queryResult = await executeCommand(
    nciBinaryPath,
    ["sql", "--format", "json", "-c", sqlCommand, "--max-rows", "1"],
    workspaceRoot,
  );

  return {
    stageType: "sql_validation",
    packageId: packageEntry.id,
    command: fullCommand,
    durationMs: queryResult.durationMs,
    success: queryResult.success,
    outputDigest: digestOutput(queryResult.output),
    metadata: {
      packageName: packageEntry.package_name,
      packageVersion: packageEntry.package_version,
    },
  };
}
