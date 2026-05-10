import { createHash } from "node:crypto";
import type {
  NciStageResult,
  PackageEntry,
} from "@repo/benchmark-contract/benchmark-types";
import { runShellCommand } from "./benchmark-shell";

export function executeCommand(
  command: string,
  commandArguments: string[],
  cwdPath: string,
): Promise<{
  success: boolean;
  output: string;
  durationMs: number;
  exitCode: number;
  stderr: string;
}> {
  return runShellCommand(command, commandArguments, cwdPath).then((result) => {
    return {
      success: result.exitCode === 0,
      output: result.output,
      durationMs: result.durationMs,
      exitCode: result.exitCode,
      stderr: result.stderr,
    };
  });
}

function digestOutput(outputText: string): string {
  return createHash("sha256").update(outputText).digest("hex").slice(0, 16);
}

function resolvePackageSelector(packageEntry: PackageEntry): string {
  if (
    packageEntry.declaration_source === "external_types" &&
    packageEntry.types_package_name
  ) {
    return packageEntry.types_package_name;
  }
  return packageEntry.package_name;
}

export async function runIndexingMetricsStage(
  packageEntry: PackageEntry,
  workspaceRoot: string,
  nciBinaryPath: string,
): Promise<NciStageResult> {
  const packageSelector = resolvePackageSelector(packageEntry);
  // The benchmark indexes a specific package by name regardless of the consumer
  // `package.json` dependency-section scope. Pass `--package-scope all-installed`
  // so the default `package_scope: ["dependencies"]` filter does not drop
  // selectors (devDeps, types packages, tooling, etc.) that are not in the
  // consumer's `dependencies` map under the resolved `project_root`.
  const indexArguments = [
    "index",
    "-p",
    packageSelector,
    "--package-scope",
    "all-installed",
  ];
  const command = `"${nciBinaryPath}" ${indexArguments
    .map((argumentText) =>
      argumentText.includes(" ") ? `"${argumentText}"` : argumentText,
    )
    .join(" ")}`;

  const indexResult = await executeCommand(
    nciBinaryPath,
    indexArguments,
    workspaceRoot,
  );

  return {
    stageType: "indexing_metrics",
    packageId: packageEntry.id,
    command,
    durationMs: indexResult.durationMs,
    success: indexResult.success,
    outputDigest: digestOutput(indexResult.output),
    metadata: {
      packageSelector,
      packageName: packageEntry.package_name,
      packageVersion: packageEntry.package_version,
    },
  };
}
