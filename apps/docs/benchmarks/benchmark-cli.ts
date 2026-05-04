import path from "node:path";
import {
  DEFAULT_TASK_MANIFEST_FILE_NAME,
  runBenchmarks,
} from "./benchmark-runner";
import {
  flag,
  parseDifficultyList,
  parseEqualsStyleFlags,
  parsePositiveIntFlag,
  splitCommaList,
} from "./benchmark-cli-args";

async function main(): Promise<void> {
  const flags = parseEqualsStyleFlags(process.argv);

  const taskOrderRaw = flag(flags, "--task-order");
  if (
    taskOrderRaw !== undefined &&
    taskOrderRaw !== "manifest" &&
    taskOrderRaw !== "random"
  ) {
    throw new Error(
      `Invalid --task-order=${taskOrderRaw} (expected manifest or random).`,
    );
  }

  await runBenchmarks({
    workspaceRoot: path.resolve(process.cwd(), "..", ".."),
    docsRoot: process.cwd(),
    taskManifestFileName:
      flag(flags, "--task-manifest") ?? DEFAULT_TASK_MANIFEST_FILE_NAME,
    mode: flag(flags, "--mode") === "full" ? "full" : "pilot",
    protocolVersion: flag(flags, "--protocol-version") ?? "2026-05-01",
    modelId: flag(flags, "--model-id") ?? "composer-2",
    nciBinaryPath: flag(flags, "--nci-binary-path"),
    performExecution: flag(flags, "--execute") === "true",
    includeCloudRuntime: flag(flags, "--include-cloud") === "true",
    taskIds: splitCommaList(flag(flags, "--task-ids")),
    difficultyFilter: parseDifficultyList(flag(flags, "--difficulty")),
    taskOrder: taskOrderRaw === "random" ? "random" : "manifest",
    randomSeed: flag(flags, "--random-seed"),
    sequentialStep: flag(flags, "--sequential-step") === "true",
    sequentialStepStatePath: flag(flags, "--sequential-step-state-path"),
    resetSequentialStep: flag(flags, "--reset-sequential-step") === "true",
    sequentialStepRequireCorrectness:
      flag(flags, "--sequential-step-require-correctness") === "true",
    taskLimit: parsePositiveIntFlag(
      flag(flags, "--task-limit"),
      "--task-limit",
    ),
    verbose: flag(flags, "--verbose") !== "false",
  });
}

main().catch((errorValue) => {
  const message =
    errorValue instanceof Error ? errorValue.message : String(errorValue);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
