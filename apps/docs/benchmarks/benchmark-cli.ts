import path from "node:path";
import { runBenchmarks } from "./benchmark-runner";

function parseArgumentValue(argumentName: string): string | undefined {
  const directMatch = process.argv.find((argumentValue) =>
    argumentValue.startsWith(`${argumentName}=`),
  );
  if (!directMatch) {
    return undefined;
  }
  return directMatch.slice(argumentName.length + 1);
}

function parsePositiveTaskLimit(
  rawValue: string | undefined,
): number | undefined {
  if (rawValue === undefined) {
    return undefined;
  }
  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error(
      `Invalid --task-limit=${rawValue} (expected a positive integer).`,
    );
  }
  return parsed;
}

async function main(): Promise<void> {
  const modeArgument = parseArgumentValue("--mode");
  const executeArgument = parseArgumentValue("--execute");
  const includeCloudArgument = parseArgumentValue("--include-cloud");
  const modelIdArgument = parseArgumentValue("--model-id");
  const nciBinaryPathArgument = parseArgumentValue("--nci-binary-path");
  const protocolVersion =
    parseArgumentValue("--protocol-version") ?? "2026-05-01";
  const verboseArgument = parseArgumentValue("--verbose");
  const taskLimit = parsePositiveTaskLimit(parseArgumentValue("--task-limit"));

  const mode = modeArgument === "full" ? "full" : "pilot";
  const performExecution = executeArgument === "true";
  const includeCloudRuntime = includeCloudArgument === "true";
  const modelId = modelIdArgument ?? "composer-2";
  const verbose = verboseArgument !== "false";

  const docsRoot = process.cwd();
  const workspaceRoot = path.resolve(docsRoot, "..", "..");

  await runBenchmarks({
    workspaceRoot,
    docsRoot,
    mode,
    protocolVersion,
    modelId,
    nciBinaryPath: nciBinaryPathArgument,
    performExecution,
    includeCloudRuntime,
    taskLimit,
    verbose,
  });
}

main().catch((errorValue) => {
  const message =
    errorValue instanceof Error ? errorValue.message : String(errorValue);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
