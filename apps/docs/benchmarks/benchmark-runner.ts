import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Agent } from "@cursor/sdk";
import type { SDKMessage, SDKToolUseMessage } from "@cursor/sdk";
import type {
  AgentEvidence,
  AgentRuntimeMetrics,
  BenchmarkDifficulty,
  BenchmarkRunFile,
  BenchmarkRunRecord,
  BenchmarkRuntime,
  BenchmarkStrategy,
  CapabilityMatrix,
  NciStageResult,
  PackageManifest,
  PromptContract,
  TaskManifest,
} from "@repo/benchmark-contract/benchmark-types";
import { detectCapabilities } from "./benchmark-capabilities";
import { buildFullDataset, buildSummaryDataset } from "./benchmark-statistics";
import { runIndexingMetricsStage } from "./benchmark-nci";
import {
  buildBenchmarkPrompt,
  parseEvidenceFromResponse,
} from "./benchmark-prompts";
import { resolveNciBinaryPath } from "./benchmark-runtime";
import { runSqlValidationStage } from "./benchmark-sql-validation";
import { verifyResponse } from "./benchmark-verifiers";
import {
  DEFAULT_PILOT_SEQUENTIAL_STEP_FILENAME,
  pickNextPilotTask,
  readPilotSequentialStepState,
  syncCompletedIdsWithPilotSet,
  writePilotSequentialStepState,
} from "./benchmark-sequential-step";
import { shuffleArray } from "./benchmark-task-order";

export const DEFAULT_TASK_MANIFEST_FILE_NAME = "tasks-manifest.json";

export interface RunnerOptions {
  workspaceRoot: string;
  docsRoot: string;
  taskManifestFileName: string;
  /**
   * Stored in outputs / filename stem; enables `sequentialStep` only when `pilot`. Does not select tasks by itself.
   */
  mode: "pilot" | "full";
  protocolVersion: string;
  modelId: string;
  nciBinaryPath?: string;
  performExecution: boolean;
  includeCloudRuntime: boolean;
  /**
   * Restrict runs to these task ids only (manifest order among matches). Omit to include every task
   * (after `difficultyFilter`, if any).
   */
  taskIds?: string[];
  /**
   * Restrict runs to tasks whose `difficulty` is listed (e.g. `easy,medium`). Omit for all difficulties.
   * Example: replicate the old pilot slice with `--difficulty=easy,medium --task-limit=4`.
   */
  difficultyFilter?: BenchmarkDifficulty[];
  /**
   * After task selection, order tasks by manifest (default) or shuffle before `taskLimit`.
   * Use `random` with `taskLimit: 1` to sample one task without always using the first.
   */
  taskOrder?: "manifest" | "random";
  /** When `taskOrder` is `random`, optional string seed for a reproducible shuffle. */
  randomSeed?: string;
  /**
   * Pilot only: each invocation runs the **next** pilot task in manifest order, then advances
   * persisted progress (see `sequentialStepStatePath`). Ignores `taskOrder`/`taskLimit`.
   */
  sequentialStep?: boolean;
  /** JSON file tracking completed pilot task IDs (default: `benchmarks/.pilot-sequential-step.json`). */
  sequentialStepStatePath?: string;
  /** Clear sequential-step progress before running (or exit after clear if `sequentialStep` is false). */
  resetSequentialStep?: boolean;
  /**
   * When true, sequential step advances only if every record for the selected task is success + correct.
   * Default false preserves "always advance after running the task" behavior.
   */
  sequentialStepRequireCorrectness?: boolean;
  /** Limit how many tasks run after mode selection (manifest order). Omit for no limit. */
  taskLimit?: number;
  /** Log progress to the console (tool lines and periodic heartbeats during agent runs). */
  verbose?: boolean;
  /** Fixed stem for output filenames (tests). If omitted, `{2hex}-{UTC date}-{UTC time}-{mode}` is generated. */
  outputStem?: string;
}

function buildRunOutputStem(mode: "pilot" | "full"): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  const datePart = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}`;
  const timePart = `${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`;
  const pair = randomBytes(1).toString("hex");
  return `${pair}-${datePart}-${timePart}-${mode}`;
}

function logBench(line: string): void {
  console.log(`[bench] ${line}`);
}

function resolveTaskManifestPath(
  benchmarkRoot: string,
  taskManifestFileName: string,
): string {
  if (
    path.basename(taskManifestFileName) !== taskManifestFileName ||
    taskManifestFileName.length === 0
  ) {
    throw new Error(`Invalid task manifest filename: ${taskManifestFileName}`);
  }
  return path.join(benchmarkRoot, taskManifestFileName);
}

interface ExecutionResult {
  responseText: string;
  durationMs: number;
  sdkDurationMs?: number;
  runtimeMetrics: AgentRuntimeMetrics;
  errorMessage?: string;
}

interface RunnerDependencies {
  runIndexingStage: typeof runIndexingMetricsStage;
  runSqlStage: typeof runSqlValidationStage;
  detectCapabilities: typeof detectCapabilities;
}

type TaskDefinition = TaskManifest["tasks"][number];

type PackageEntry = PackageManifest["packages"][number];

interface RunCombination {
  task: TaskDefinition;
  packageEntry: PackageEntry;
  runtime: BenchmarkRuntime;
  strategy: BenchmarkStrategy;
}

function createEmptyRuntimeMetrics(): AgentRuntimeMetrics {
  return {
    toolCallsStarted: 0,
    toolCallsCompleted: 0,
    toolCallsErrored: 0,
  };
}

function buildBenchmarkRunRecord(
  shared: {
    task: TaskDefinition;
    packageEntry: PackageEntry;
    runtime: BenchmarkRuntime;
    strategy: BenchmarkStrategy;
    prompt: string;
    promptContract: PromptContract;
    modelId: string;
    indexingStage?: NciStageResult;
  },
  outcome:
    | { kind: "skipped"; skippedReason: string }
    | {
        kind: "executed";
        responseText: string;
        evidence: AgentEvidence;
        durationMs: number;
        sdkDurationMs?: number;
        runtimeMetrics: AgentRuntimeMetrics;
        isCorrect: boolean;
        missingSubstrings: string[];
        forbiddenMatches: string[];
        status: "success" | "failure";
        errorMessage?: string;
        sqlValidationStage?: NciStageResult;
      },
): BenchmarkRunRecord {
  const head = {
    runId: randomUUID(),
    timestampIso: new Date().toISOString(),
    runtime: shared.runtime,
    strategy: shared.strategy,
    taskId: shared.task.id,
    packageId: shared.packageEntry.id,
    packageVersion: shared.packageEntry.package_version,
    difficulty: shared.task.difficulty,
    lane: shared.task.lane,
    prompt: shared.prompt,
    promptContract: shared.promptContract,
    modelId: shared.modelId,
    indexingStage: shared.indexingStage,
    retries: 0,
  };
  if (outcome.kind === "skipped") {
    return {
      ...head,
      responseText: "",
      evidence: { declarationPaths: [] },
      durationMs: 0,
      sdkDurationMs: 0,
      runtimeMetrics: createEmptyRuntimeMetrics(),
      isCorrect: false,
      missingSubstrings: [],
      forbiddenMatches: [],
      status: "skipped",
      skippedReason: outcome.skippedReason,
    };
  }
  return {
    ...head,
    responseText: outcome.responseText,
    evidence: outcome.evidence,
    durationMs: outcome.durationMs,
    sdkDurationMs: outcome.sdkDurationMs,
    runtimeMetrics: outcome.runtimeMetrics,
    isCorrect: outcome.isCorrect,
    missingSubstrings: outcome.missingSubstrings,
    forbiddenMatches: outcome.forbiddenMatches,
    status: outcome.status,
    errorMessage: outcome.errorMessage,
    sqlValidationStage: outcome.sqlValidationStage,
  };
}

function tryReadNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function firstNumberProperty(
  objectValue: Record<string, unknown>,
  candidateKeys: string[],
): number | undefined {
  for (const candidateKey of candidateKeys) {
    const numericValue = tryReadNumber(objectValue[candidateKey]);
    if (numericValue !== undefined) {
      return numericValue;
    }
  }
  return undefined;
}

function applyTokenDelta(
  updateValue: unknown,
  runtimeMetrics: AgentRuntimeMetrics,
): void {
  if (!updateValue || typeof updateValue !== "object") {
    return;
  }
  const updateObject = updateValue as Record<string, unknown>;
  const inputTokenCount = firstNumberProperty(updateObject, [
    "inputTokens",
    "promptTokens",
    "cumulativeInputTokens",
  ]);
  const outputTokenCount = firstNumberProperty(updateObject, [
    "outputTokens",
    "completionTokens",
    "cumulativeOutputTokens",
  ]);
  const totalTokenCount = firstNumberProperty(updateObject, [
    "totalTokens",
    "cumulativeTotalTokens",
  ]);

  if (inputTokenCount !== undefined) {
    runtimeMetrics.inputTokenCount = inputTokenCount;
  }
  if (outputTokenCount !== undefined) {
    runtimeMetrics.outputTokenCount = outputTokenCount;
  }
  if (totalTokenCount !== undefined) {
    runtimeMetrics.totalTokenCount = totalTokenCount;
  }
}

function applyStreamMessageMetrics(
  sdkMessage: SDKMessage,
  runtimeMetrics: AgentRuntimeMetrics,
): void {
  if (sdkMessage.type !== "tool_call") {
    return;
  }
  const toolCallId = sdkMessage.call_id;
  const mergedDetail: SDKToolUseMessage = { ...sdkMessage };
  if (!runtimeMetrics.toolCallDetails) {
    runtimeMetrics.toolCallDetails = [];
  }
  const existingIndex = runtimeMetrics.toolCallDetails.findIndex(
    (detail) => detail.call_id === toolCallId,
  );
  if (existingIndex >= 0) {
    const priorDetail = runtimeMetrics.toolCallDetails[existingIndex]!;
    runtimeMetrics.toolCallDetails[existingIndex] = {
      ...priorDetail,
      ...mergedDetail,
      args: mergedDetail.args ?? priorDetail.args,
      result: mergedDetail.result ?? priorDetail.result,
      truncated: mergedDetail.truncated ?? priorDetail.truncated,
    };
  } else {
    runtimeMetrics.toolCallDetails.push(mergedDetail);
  }

  if (sdkMessage.status === "running") {
    runtimeMetrics.toolCallsStarted += 1;
  } else if (sdkMessage.status === "completed") {
    runtimeMetrics.toolCallsCompleted += 1;
  } else if (sdkMessage.status === "error") {
    runtimeMetrics.toolCallsErrored += 1;
  }
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  const content = await readFile(filePath, "utf8");
  return JSON.parse(content) as T;
}

async function ensureParentDirectory(filePath: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
}

export function filterManifestTasksForRun(
  taskManifest: TaskManifest,
  filters: {
    taskIds?: string[];
    difficultyFilter?: BenchmarkDifficulty[];
  },
): TaskDefinition[] {
  const idAllowlist =
    filters.taskIds !== undefined && filters.taskIds.length > 0
      ? new Set(filters.taskIds)
      : undefined;
  const difficultyAllowlist =
    filters.difficultyFilter !== undefined &&
    filters.difficultyFilter.length > 0
      ? new Set(filters.difficultyFilter)
      : undefined;

  if (idAllowlist) {
    const manifestIds = new Set(taskManifest.tasks.map((task) => task.id));
    for (const taskId of idAllowlist) {
      if (!manifestIds.has(taskId)) {
        throw new Error(
          `Unknown task id in --task-ids: ${taskId} (not present in task manifest).`,
        );
      }
    }
  }

  return taskManifest.tasks.filter((task) => {
    if (idAllowlist && !idAllowlist.has(task.id)) {
      return false;
    }
    if (difficultyAllowlist && !difficultyAllowlist.has(task.difficulty)) {
      return false;
    }
    return true;
  });
}

interface AgentRunProgress {
  verbose: boolean;
  label: string;
}

async function executeSingleRun(
  prompt: string,
  runName: string,
  modelId: string,
  runtime: BenchmarkRuntime,
  workspaceRoot: string,
  performExecution: boolean,
  progress?: AgentRunProgress,
): Promise<ExecutionResult> {
  const startedAt = Date.now();
  const runtimeMetrics = createEmptyRuntimeMetrics();

  if (!performExecution) {
    const responseText = JSON.stringify(
      {
        answer: "execution_disabled",
        declaration_paths: ["node_modules/example/index.d.ts"],
        nci_query_evidence: "execution_disabled",
        nci_sql_evidence: "execution_disabled",
        github_evidence: "execution_disabled",
      },
      null,
      2,
    );
    return {
      responseText,
      durationMs: 0,
      sdkDurationMs: 0,
      runtimeMetrics,
    };
  }

  const runtimeOptions =
    runtime === "cloud"
      ? { cloud: { env: { type: "cloud" as const } } }
      : { local: { cwd: workspaceRoot } };

  const heartbeatMs = 30_000;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  if (progress?.verbose && performExecution) {
    logBench(
      `${progress.label} starting agent (model=${modelId}, runtime=${runtime}, run=${runName})`,
    );
    heartbeat = setInterval(() => {
      const elapsedSec = Math.round((Date.now() - startedAt) / 1000);
      logBench(`${progress.label} still running (${elapsedSec}s elapsed)...`);
    }, heartbeatMs);
  }

  let agent: Awaited<ReturnType<typeof Agent.create>> | undefined;
  try {
    agent = await Agent.create({
      name: runName,
      model: { id: modelId },
      apiKey: process.env.CURSOR_API_KEY,
      ...runtimeOptions,
    });
    const run = await agent.send(prompt, {
      onDelta: ({ update }) => {
        applyTokenDelta(update, runtimeMetrics);
      },
    });
    for await (const sdkMessage of run.stream()) {
      applyStreamMessageMetrics(sdkMessage, runtimeMetrics);
      if (
        progress?.verbose &&
        sdkMessage.type === "tool_call" &&
        sdkMessage.status === "running"
      ) {
        logBench(`${progress.label}   tool: ${sdkMessage.name}`);
      }
    }
    const runResult = await run.wait();
    const responseText = runResult.result ?? "";
    const durationMs = Date.now() - startedAt;
    if (progress?.verbose && performExecution) {
      logBench(
        `${progress.label} finished in ${durationMs}ms (sdk ${runResult.durationMs ?? "?"}ms, status=${runResult.status})`,
      );
    }
    return {
      responseText,
      durationMs,
      sdkDurationMs: runResult.durationMs,
      runtimeMetrics,
    };
  } catch (errorValue) {
    const errorMessage =
      errorValue instanceof Error ? errorValue.message : String(errorValue);
    if (progress?.verbose && performExecution) {
      logBench(
        `${progress.label} failed after ${Date.now() - startedAt}ms: ${errorMessage}`,
      );
    }
    return {
      responseText: "",
      durationMs: Date.now() - startedAt,
      runtimeMetrics,
      errorMessage,
    };
  } finally {
    if (heartbeat) {
      clearInterval(heartbeat);
    }
    if (agent !== undefined) {
      await agent[Symbol.asyncDispose]();
    }
  }
}

export async function runBenchmarks(options: RunnerOptions): Promise<void> {
  await runBenchmarksWithDependencies(options, {
    runIndexingStage: runIndexingMetricsStage,
    runSqlStage: runSqlValidationStage,
    detectCapabilities,
  });
}

function isGithubLane(lane: TaskManifest["tasks"][number]["lane"]): boolean {
  return lane === "github_baseline" || lane === "architecture_github";
}

function shouldSkipRun(
  runtime: BenchmarkRuntime,
  strategy: BenchmarkStrategy,
  lane: TaskDefinition["lane"],
  capabilities: CapabilityMatrix,
): string | undefined {
  if (strategy === "nci_first" && !capabilities.local.nciCli.available) {
    return "nci_cli_unavailable";
  }
  if (!capabilities.cursorApiKey.available) {
    return "cursor_api_key_unavailable";
  }
  if (
    runtime === "cloud" &&
    isGithubLane(lane) &&
    capabilities.cloud.connectedRepositories &&
    !capabilities.cloud.connectedRepositories.available
  ) {
    return "cloud_connected_repositories_unavailable";
  }
  return undefined;
}

function createRunCombinations(
  selectedTasks: TaskDefinition[],
  packageById: Map<string, PackageManifest["packages"][number]>,
  runtimes: BenchmarkRuntime[],
  strategies: BenchmarkStrategy[],
): RunCombination[] {
  const combinations: RunCombination[] = [];
  for (const task of selectedTasks) {
    const packageEntry = packageById.get(task.package_id);
    if (!packageEntry) {
      continue;
    }
    for (const runtime of runtimes) {
      for (const strategy of strategies) {
        combinations.push({ task, packageEntry, runtime, strategy });
      }
    }
  }
  return combinations;
}

export async function runBenchmarksWithDependencies(
  options: RunnerOptions,
  dependencies: RunnerDependencies,
): Promise<void> {
  const benchmarkRoot = path.join(options.docsRoot, "benchmarks");
  const packageManifestPath = path.join(benchmarkRoot, "package-manifest.json");
  const taskManifestPath = resolveTaskManifestPath(
    benchmarkRoot,
    options.taskManifestFileName,
  );
  const nciBinaryPath = resolveNciBinaryPath(
    options.workspaceRoot,
    options.nciBinaryPath,
  );

  const packageManifest =
    await readJsonFile<PackageManifest>(packageManifestPath);
  const taskManifest = await readJsonFile<TaskManifest>(taskManifestPath);
  const capabilities = await dependencies.detectCapabilities(
    options.workspaceRoot,
    nciBinaryPath,
  );

  const defaultSequentialStatePath = path.join(
    benchmarkRoot,
    DEFAULT_PILOT_SEQUENTIAL_STEP_FILENAME,
  );
  const resolvedSequentialStatePath =
    options.sequentialStepStatePath === undefined
      ? defaultSequentialStatePath
      : path.isAbsolute(options.sequentialStepStatePath)
        ? options.sequentialStepStatePath
        : path.join(options.docsRoot, options.sequentialStepStatePath);

  if (options.resetSequentialStep) {
    const emptyState: { version: 1; completedTaskIds: never[] } = {
      version: 1,
      completedTaskIds: [],
    };
    await writePilotSequentialStepState(
      resolvedSequentialStatePath,
      emptyState,
    );
    logBench(`reset sequential step state: ${resolvedSequentialStatePath}`);
    if (!options.sequentialStep) {
      return;
    }
  }

  if (options.verbose) {
    logBench(
      `mode=${options.mode} manifest=${options.taskManifestFileName} model=${options.modelId} execute=${options.performExecution} cloud=${options.includeCloudRuntime} sequentialStep=${options.sequentialStep ?? false} sequentialStepRequireCorrectness=${options.sequentialStepRequireCorrectness ?? false} taskOrder=${options.taskOrder ?? "manifest"} randomSeed=${options.randomSeed ?? "none"} taskLimit=${options.taskLimit ?? "none"} taskIds=${options.taskIds?.join(",") ?? "none"} difficulty=${options.difficultyFilter?.join(",") ?? "none"}`,
    );
    logBench(
      `capabilities: cursorApiKey=${capabilities.cursorApiKey.available ? "ok" : "no"} nciCli=${capabilities.local.nciCli.available ? "ok" : "no"}`,
    );
  }

  const orderedModeTasks = filterManifestTasksForRun(taskManifest, {
    taskIds: options.taskIds,
    difficultyFilter: options.difficultyFilter,
  });

  let sequentialAdvanceTaskId: string | undefined;
  let selectedTasks: TaskDefinition[];

  if (options.sequentialStep) {
    if (options.mode !== "pilot") {
      throw new Error("sequentialStep is only supported with mode=pilot");
    }
    if (options.verbose && options.taskOrder === "random") {
      logBench(
        "task order is manifest (random ignored while sequentialStep is enabled)",
      );
    }

    let stepState = await readPilotSequentialStepState(
      resolvedSequentialStatePath,
    );
    const pilotOrderedIds = orderedModeTasks.map((task) => task.id);
    stepState = {
      version: 1,
      completedTaskIds: syncCompletedIdsWithPilotSet(
        stepState.completedTaskIds,
        pilotOrderedIds,
      ),
    };

    const nextTask = pickNextPilotTask(
      orderedModeTasks,
      stepState.completedTaskIds,
    );
    if (!nextTask) {
      logBench(
        "pilot sequential step: all tasks in this pilot set are complete — use --reset-sequential-step=true to run the sequence again from the first task",
      );
      return;
    }

    sequentialAdvanceTaskId = nextTask.id;
    selectedTasks = [nextTask];

    if (options.verbose) {
      const doneCount = stepState.completedTaskIds.length;
      const total = orderedModeTasks.length;
      logBench(
        `sequential step: task ${doneCount + 1}/${total} — ${nextTask.id}`,
      );
    }
  } else {
    selectedTasks = orderedModeTasks;
    if (options.taskOrder === "random") {
      selectedTasks = shuffleArray(selectedTasks, options.randomSeed);
    }
    if (options.taskLimit !== undefined) {
      selectedTasks = selectedTasks.slice(0, options.taskLimit);
    }
  }
  const packageById = new Map(
    packageManifest.packages.map((packageEntry) => [
      packageEntry.id,
      packageEntry,
    ]),
  );

  const indexingMetrics: NciStageResult[] = [];
  for (const packageEntry of packageManifest.packages) {
    if (options.verbose) {
      logBench(
        `NCI indexing: package ${packageEntry.id} (${packageEntry.package_name})...`,
      );
    }
    const indexingResult = await dependencies.runIndexingStage(
      packageEntry,
      options.workspaceRoot,
      nciBinaryPath,
    );
    indexingMetrics.push(indexingResult);
    if (options.verbose) {
      logBench(
        `NCI indexing: package ${packageEntry.id} done in ${indexingResult.durationMs}ms (success=${indexingResult.success})`,
      );
    }
  }

  const indexingByPackageId = new Map(
    indexingMetrics.map((indexingStage) => [
      indexingStage.packageId,
      indexingStage,
    ]),
  );

  const runRecords: BenchmarkRunRecord[] = [];
  const runtimes: BenchmarkRuntime[] = options.includeCloudRuntime
    ? ["local", "cloud"]
    : ["local"];
  const strategies: BenchmarkStrategy[] = ["baseline", "nci_first"];
  const runCombinations = createRunCombinations(
    selectedTasks,
    packageById,
    runtimes,
    strategies,
  );

  if (options.verbose) {
    logBench(
      `tasks in this run: ${selectedTasks.length} (${selectedTasks.map((t) => t.id).join(", ") || "none"})`,
    );
    logBench(
      `run matrix: ${runCombinations.length} combination(s) (runtimes × strategies × tasks)`,
    );
  }

  for (
    let combinationIndex = 0;
    combinationIndex < runCombinations.length;
    combinationIndex += 1
  ) {
    const runCombination = runCombinations[combinationIndex]!;
    const { task, packageEntry, runtime, strategy } = runCombination;
    const progressLabel = `[${combinationIndex + 1}/${runCombinations.length}] ${task.id} ${runtime} ${strategy}`;
    const promptBuildResult = buildBenchmarkPrompt({
      strategy,
      lane: task.lane,
      packageEntry,
      taskQuestion: task.question,
      taskVerifier: task.verifier,
      nciBinaryPath,
    });
    const skippedReason = shouldSkipRun(
      runtime,
      strategy,
      task.lane,
      capabilities,
    );
    const indexingStage = indexingByPackageId.get(packageEntry.id);

    if (skippedReason) {
      if (options.verbose) {
        logBench(`${progressLabel} skipped (${skippedReason})`);
      }
      runRecords.push(
        buildBenchmarkRunRecord(
          {
            task,
            packageEntry,
            runtime,
            strategy,
            prompt: promptBuildResult.prompt,
            promptContract: promptBuildResult.contract,
            modelId: options.modelId,
            indexingStage,
          },
          { kind: "skipped", skippedReason },
        ),
      );
      continue;
    }

    const sqlValidationResult =
      strategy === "nci_first"
        ? await dependencies.runSqlStage(
            packageEntry,
            options.workspaceRoot,
            nciBinaryPath,
          )
        : undefined;

    const executionResult = await executeSingleRun(
      promptBuildResult.prompt,
      `nci-benchmark-${task.id}-${runtime}-${strategy}`,
      options.modelId,
      runtime,
      options.workspaceRoot,
      options.performExecution,
    );
    const evidence = parseEvidenceFromResponse(executionResult.responseText);

    const verifierResult = verifyResponse(
      executionResult.responseText,
      task.verifier,
      promptBuildResult.contract,
    );

    runRecords.push(
      buildBenchmarkRunRecord(
        {
          task,
          packageEntry,
          runtime,
          strategy,
          prompt: promptBuildResult.prompt,
          promptContract: promptBuildResult.contract,
          modelId: options.modelId,
          indexingStage,
        },
        {
          kind: "executed",
          responseText: executionResult.responseText,
          evidence,
          durationMs: executionResult.durationMs,
          sdkDurationMs: executionResult.sdkDurationMs,
          runtimeMetrics: executionResult.runtimeMetrics,
          isCorrect: verifierResult.isCorrect,
          missingSubstrings: verifierResult.missingSubstrings,
          forbiddenMatches: verifierResult.forbiddenMatches,
          status: executionResult.errorMessage ? "failure" : "success",
          errorMessage: executionResult.errorMessage,
          sqlValidationStage: sqlValidationResult,
        },
      ),
    );
  }

  const runStem = options.outputStem ?? buildRunOutputStem(options.mode);

  const runFile: BenchmarkRunFile = {
    generatedAtIso: new Date().toISOString(),
    protocolVersion: options.protocolVersion,
    mode: options.mode,
    runStem,
    capabilities,
    indexingMetrics,
    records: runRecords,
  };

  const summaryDataset = buildSummaryDataset(
    runRecords,
    options.protocolVersion,
  );
  const fullDataset = buildFullDataset(runRecords, options.protocolVersion);

  const runsOutputPath = path.join(
    benchmarkRoot,
    "runs",
    `${runStem}-run.json`,
  );
  const metricsOutputPath = path.join(
    benchmarkRoot,
    "runs",
    `${runStem}-metrics.json`,
  );
  const summaryOutputPath = path.join(
    options.workspaceRoot,
    "apps",
    "web",
    "data",
    "benchmarks",
    `${runStem}-summary.json`,
  );
  const fullOutputPath = path.join(
    options.workspaceRoot,
    "apps",
    "web",
    "data",
    "benchmarks",
    `${runStem}-full.json`,
  );

  const pairedFromRepoRoot = {
    run: path
      .relative(options.workspaceRoot, runsOutputPath)
      .replaceAll("\\", "/"),
    metrics: path
      .relative(options.workspaceRoot, metricsOutputPath)
      .replaceAll("\\", "/"),
    summary: path
      .relative(options.workspaceRoot, summaryOutputPath)
      .replaceAll("\\", "/"),
    full: path
      .relative(options.workspaceRoot, fullOutputPath)
      .replaceAll("\\", "/"),
  };

  const metricsFile = {
    runStem,
    generatedAtIso: runFile.generatedAtIso,
    mode: runFile.mode,
    protocolVersion: runFile.protocolVersion,
    pairedFromRepoRoot,
    records: runRecords.map((record) => ({
      taskId: record.taskId,
      strategy: record.strategy,
      runtime: record.runtime,
      status: record.status,
      isCorrect: record.isCorrect,
      durationMs: record.durationMs,
      sdkDurationMs: record.sdkDurationMs,
      toolCallsStarted: record.runtimeMetrics.toolCallsStarted,
      toolCallsCompleted: record.runtimeMetrics.toolCallsCompleted,
      toolCallsErrored: record.runtimeMetrics.toolCallsErrored,
      toolCallDetailCount: record.runtimeMetrics.toolCallDetails?.length ?? 0,
      missingSubstrings: record.missingSubstrings,
      forbiddenMatches: record.forbiddenMatches,
      skippedReason: record.skippedReason,
      harnessSqlProbeSuccess: record.sqlValidationStage?.success,
    })),
  };

  await ensureParentDirectory(runsOutputPath);
  await ensureParentDirectory(metricsOutputPath);
  await ensureParentDirectory(summaryOutputPath);
  await ensureParentDirectory(fullOutputPath);

  if (options.verbose) {
    logBench(`writing outputs: ${runsOutputPath}`);
    logBench(`writing metrics: ${metricsOutputPath}`);
  }

  await writeFile(runsOutputPath, JSON.stringify(runFile, null, 2), "utf8");
  await writeFile(
    metricsOutputPath,
    JSON.stringify(metricsFile, null, 2),
    "utf8",
  );
  await writeFile(
    summaryOutputPath,
    JSON.stringify(summaryDataset, null, 2),
    "utf8",
  );
  await writeFile(fullOutputPath, JSON.stringify(fullDataset, null, 2), "utf8");

  if (options.sequentialStep && sequentialAdvanceTaskId) {
    const recordsForAdvancedTask = runRecords.filter(
      (record) => record.taskId === sequentialAdvanceTaskId,
    );
    const requireCorrectness =
      options.sequentialStepRequireCorrectness === true;
    const canAdvanceSequentialStep = requireCorrectness
      ? recordsForAdvancedTask.every(
          (record) => record.status === "success" && record.isCorrect,
        )
      : recordsForAdvancedTask.every((record) => record.status !== "skipped");
    if (canAdvanceSequentialStep) {
      const currentState = await readPilotSequentialStepState(
        resolvedSequentialStatePath,
      );
      const nextCompletedTaskIds = syncCompletedIdsWithPilotSet(
        currentState.completedTaskIds,
        orderedModeTasks.map((task) => task.id),
      );
      if (!nextCompletedTaskIds.includes(sequentialAdvanceTaskId)) {
        nextCompletedTaskIds.push(sequentialAdvanceTaskId);
        await writePilotSequentialStepState(resolvedSequentialStatePath, {
          version: 1,
          completedTaskIds: nextCompletedTaskIds,
        });
        if (options.verbose) {
          logBench(
            `sequential step advanced: ${sequentialAdvanceTaskId} (${nextCompletedTaskIds.length}/${orderedModeTasks.length})`,
          );
        }
      }
    } else if (options.verbose) {
      const failureSummary = recordsForAdvancedTask
        .filter((record) => record.status !== "success" || !record.isCorrect)
        .map(
          (record) =>
            `${record.strategy}/${record.runtime}: status=${record.status} isCorrect=${record.isCorrect} missing=[${record.missingSubstrings.join(",")}] forbidden=[${record.forbiddenMatches.join(",")}]`,
        );
      logBench(
        `sequential step NOT advanced for ${sequentialAdvanceTaskId} (requireCorrectness=${requireCorrectness}) due to failing records: ${failureSummary.join(" | ")}`,
      );
    }
  }

  if (options.verbose) {
    logBench(`done. records=${runRecords.length} stem=${runStem}`);
  }
}
