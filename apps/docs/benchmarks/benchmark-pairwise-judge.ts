import { createHash } from "node:crypto";
import { Agent } from "@cursor/sdk";
import type { AgentOptions, RunResult } from "@cursor/sdk";
import type {
  BenchmarkRunRecord,
  BenchmarkRuntime,
  PairwiseJudgeResult,
  PairwiseJudgmentRecord,
  TaskManifest,
} from "@repo/benchmark-contract/benchmark-types";
import { extractPrimaryRecommendation } from "./benchmark-prompts";
import { z } from "zod";

const pairwiseJudgeResponseSchema = z.object({
  baseline_correctness: z.coerce.number().min(0).max(10),
  baseline_actionability: z.coerce.number().min(0).max(10),
  nci_first_correctness: z.coerce.number().min(0).max(10),
  nci_first_actionability: z.coerce.number().min(0).max(10),
  comparison_notes: z.string(),
  preferred: z.enum(["baseline", "nci_first", "tie"]),
  confidence: z.enum(["high", "medium", "low"]),
});

export type ParsedPairwiseJudgeBody = Omit<
  PairwiseJudgeResult,
  "modelId" | "durationMs" | "judgePromptDigest"
>;

export function digestJudgePrompt(prompt: string): string {
  return createHash("sha256").update(prompt, "utf8").digest("hex");
}

function stripOptionalJsonFence(raw: string): string {
  const trimmed = raw.trim();
  const fenceMatch = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/m.exec(trimmed);
  if (fenceMatch?.[1]) {
    return fenceMatch[1].trim();
  }
  return trimmed;
}

export function parsePairwiseJudgeResponse(
  rawText: string,
):
  | { ok: true; judge: ParsedPairwiseJudgeBody }
  | { ok: false; reason: "judge_invalid_json" } {
  const stripped = stripOptionalJsonFence(rawText);
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(stripped);
  } catch {
    return { ok: false, reason: "judge_invalid_json" };
  }
  const parsed = pairwiseJudgeResponseSchema.safeParse(parsedJson);
  if (!parsed.success) {
    return { ok: false, reason: "judge_invalid_json" };
  }
  const row = parsed.data;
  return {
    ok: true,
    judge: {
      baselineCorrectness: row.baseline_correctness,
      baselineActionability: row.baseline_actionability,
      nciFirstCorrectness: row.nci_first_correctness,
      nciFirstActionability: row.nci_first_actionability,
      comparisonNotes: row.comparison_notes,
      preferred: row.preferred,
      confidence: row.confidence,
    },
  };
}

export function buildPairwiseJudgeUserPrompt(input: {
  taskQuestion: string;
  baselineArmText: string;
  nciFirstArmText: string;
}): string {
  return [
    "You are an impartial benchmark judge for TypeScript declaration-grounded responses.",
    "Compare two model outputs for the SAME task: **baseline** (no NCI tools) vs **nci_first** (NCI-assisted).",
    "Score each arm independently on two 0–10 dimensions:",
    "- **correctness**: factual accuracy and alignment with declaration/source evidence.",
    "- **actionability**: clarity, concrete steps, and usefulness for an engineer implementing or deciding.",
    "Then choose which arm you prefer overall (`preferred`) and your **confidence** in that preference.",
    "The full model outputs appear below—use them as-is (do not ask for more text).",
    "Keep `comparison_notes` brief: a few short paragraphs, well under 400 words, focusing only on contrasts that explain your scores.",
    "",
    `Task:\n${input.taskQuestion}`,
    "",
    "### Baseline response",
    input.baselineArmText,
    "",
    "### NCI-first response",
    input.nciFirstArmText,
    "",
    "Reply with **one JSON object only** (no markdown fences). Keys and types:",
    "{",
    '  "baseline_correctness": <number 0-10>,',
    '  "baseline_actionability": <number 0-10>,',
    '  "nci_first_correctness": <number 0-10>,',
    '  "nci_first_actionability": <number 0-10>,',
    '  "comparison_notes": <string: brief per instructions above>,',
    '  "preferred": "baseline" | "nci_first" | "tie",',
    '  "confidence": "high" | "medium" | "low"',
    "}",
  ].join("\n");
}

export async function runPairwiseJudgePrompt(args: {
  prompt: string;
  modelId: string;
  runtime: BenchmarkRuntime;
  localCwd: string;
  performExecution: boolean;
  /** Test-only override for the one-shot judge call. */
  promptAgent?: (message: string, options?: AgentOptions) => Promise<RunResult>;
}): Promise<{ resultText: string; durationMs: number; errorMessage?: string }> {
  if (!args.performExecution) {
    return {
      resultText: "",
      durationMs: 0,
      errorMessage: "pairwise_judge_execution_disabled",
    };
  }

  const runtimeOptions =
    args.runtime === "cloud"
      ? { cloud: { env: { type: "cloud" as const } } }
      : { local: { cwd: args.localCwd } };

  const promptAgent = args.promptAgent ?? Agent.prompt;
  const startedAt = Date.now();
  try {
    const runResult = await promptAgent(args.prompt, {
      model: { id: args.modelId },
      apiKey: process.env.CURSOR_API_KEY,
      ...runtimeOptions,
    });
    const durationMs = Date.now() - startedAt;
    if (runResult.status !== "finished") {
      return {
        resultText: runResult.result ?? "",
        durationMs,
        errorMessage: `judge_run_status_${runResult.status}`,
      };
    }
    return {
      resultText: runResult.result ?? "",
      durationMs: runResult.durationMs ?? durationMs,
    };
  } catch (errorValue) {
    const errorMessage =
      errorValue instanceof Error ? errorValue.message : String(errorValue);
    return {
      resultText: "",
      durationMs: Date.now() - startedAt,
      errorMessage,
    };
  }
}

type TaskDefinition = TaskManifest["tasks"][number];

export async function computePairwiseJudgment(args: {
  task: TaskDefinition;
  packageEntry: { id: string };
  runtime: BenchmarkRuntime;
  baselineRecord: BenchmarkRunRecord;
  nciRecord: BenchmarkRunRecord;
  judgeModelId: string;
  docsRoot: string;
  performExecution: boolean;
  promptAgent?: (message: string, options?: AgentOptions) => Promise<RunResult>;
}): Promise<PairwiseJudgmentRecord> {
  const shared: Pick<
    PairwiseJudgmentRecord,
    "taskId" | "packageId" | "runtime" | "baselineRunId" | "nciRunId"
  > = {
    taskId: args.task.id,
    packageId: args.packageEntry.id,
    runtime: args.runtime,
    baselineRunId: args.baselineRecord.runId,
    nciRunId: args.nciRecord.runId,
  };

  if (args.baselineRecord.status === "skipped") {
    return { ...shared, status: "skipped", skippedReason: "baseline_skipped" };
  }
  if (args.nciRecord.status === "skipped") {
    return { ...shared, status: "skipped", skippedReason: "nci_skipped" };
  }
  if (
    args.baselineRecord.status !== "success" ||
    args.baselineRecord.errorMessage
  ) {
    return {
      ...shared,
      status: "skipped",
      skippedReason: "baseline_not_success",
    };
  }
  if (args.nciRecord.status !== "success" || args.nciRecord.errorMessage) {
    return {
      ...shared,
      status: "skipped",
      skippedReason: "nci_not_success",
    };
  }

  if (!args.baselineRecord.responseText.trim()) {
    return {
      ...shared,
      status: "skipped",
      skippedReason: "empty_response_baseline",
    };
  }
  if (!args.nciRecord.responseText.trim()) {
    return {
      ...shared,
      status: "skipped",
      skippedReason: "empty_response_nci",
    };
  }

  const primaryBaseline = extractPrimaryRecommendation(
    args.baselineRecord.responseText,
    args.task.verifier,
  );
  const primaryNci = extractPrimaryRecommendation(
    args.nciRecord.responseText,
    args.task.verifier,
  );
  if (!primaryBaseline) {
    return {
      ...shared,
      status: "skipped",
      skippedReason: "empty_primary_baseline",
    };
  }
  if (!primaryNci) {
    return {
      ...shared,
      status: "skipped",
      skippedReason: "empty_primary_nci",
    };
  }

  const judgePrompt = buildPairwiseJudgeUserPrompt({
    taskQuestion: args.task.question,
    baselineArmText: args.baselineRecord.responseText,
    nciFirstArmText: args.nciRecord.responseText,
  });
  const judgePromptDigest = digestJudgePrompt(judgePrompt);

  const execResult = await runPairwiseJudgePrompt({
    prompt: judgePrompt,
    modelId: args.judgeModelId,
    runtime: args.runtime,
    localCwd: args.docsRoot,
    performExecution: args.performExecution,
    promptAgent: args.promptAgent,
  });

  if (execResult.errorMessage) {
    return {
      ...shared,
      status: "skipped",
      skippedReason: execResult.errorMessage,
    };
  }

  const parsed = parsePairwiseJudgeResponse(execResult.resultText);
  if (!parsed.ok) {
    return {
      ...shared,
      status: "skipped",
      skippedReason: parsed.reason,
    };
  }

  return {
    ...shared,
    status: "completed",
    judge: {
      modelId: args.judgeModelId,
      ...parsed.judge,
      durationMs: execResult.durationMs,
      judgePromptDigest,
    },
  };
}
