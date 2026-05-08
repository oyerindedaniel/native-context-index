import type { SDKToolUseMessage } from "@cursor/sdk";

export type BenchmarkDifficulty = "easy" | "medium" | "hard";
export type BenchmarkLane =
  | "artifact_only"
  | "github_baseline"
  | "architecture_github";
export type BenchmarkRuntime = "local" | "cloud";
export type BenchmarkStrategy = "baseline" | "nci_first";
export type VerifierType =
  | "contains_all"
  | "json_contract"
  | "practical_json_contract";

export interface PackageEntry {
  id: string;
  tier: BenchmarkDifficulty;
  registry: "npm";
  package_name: string;
  package_version: string;
  language_family: "typescript" | "javascript";
  declaration_source: "bundled" | "external_types";
  types_package_name?: string;
  types_package_version?: string;
  github: {
    owner: string;
    repo: string;
    default_branch: string;
    pinned_sha: string;
    license: string;
  };
}

export interface PackageManifest {
  version: string;
  selection_policy: string;
  packages: PackageEntry[];
}

export interface ContainsAllVerifier {
  type: "contains_all";
  required_substrings: string[];
  forbidden_substrings: string[];
}

export interface JsonContractVerifier {
  type: "json_contract";
  required_substrings: string[];
  forbidden_substrings: string[];
  /** When true, response must mention a TS declaration path ending in `.d.ts`, `.d.mts`, or `.d.cts`. */
  require_declaration_path?: boolean;
}

export interface PracticalJsonContractVerifier {
  type: "practical_json_contract";
  required_substrings: string[];
  forbidden_substrings: string[];
  /** When true, response must mention a TS declaration path ending in `.d.ts`, `.d.mts`, or `.d.cts`. */
  require_declaration_path?: boolean;
}

export type TaskVerifier =
  | ContainsAllVerifier
  | JsonContractVerifier
  | PracticalJsonContractVerifier;

export interface BenchmarkTask {
  id: string;
  difficulty: BenchmarkDifficulty;
  lane: BenchmarkLane;
  package_id: string;
  question: string;
  verifier: TaskVerifier;
}

export interface TaskManifest {
  version: string;
  evaluation_focus: string;
  tasks: BenchmarkTask[];
}

export interface SingleVerifierResult {
  isCorrect: boolean;
  missingSubstrings: string[];
  forbiddenMatches: string[];
}

export interface NciStageResult {
  stageType: "indexing_metrics" | "sql_validation";
  packageId: string;
  command: string;
  durationMs: number;
  success: boolean;
  outputDigest: string;
  metadata: Record<string, string | number | boolean>;
}

export interface AgentEvidence {
  declarationPaths: string[];
  nciQuerySnippet?: string;
  nciSqlSnippet?: string;
}

export interface PromptContract {
  strategy: BenchmarkStrategy;
  lane: BenchmarkLane;
  requiresNciCliUsage: boolean;
  requiresSqlEvidence: boolean;
  requiresGithubEvidence: boolean;
}

export interface AgentRuntimeMetrics {
  toolCallsStarted: number;
  toolCallsCompleted: number;
  toolCallsErrored: number;
  /** Tool calls that started but never reached `completed`/`error` on the SDK stream (see finalize step). */
  toolCallsUnfinished?: number;
  totalTokenCount?: number;
  inputTokenCount?: number;
  outputTokenCount?: number;
  toolCallDetails?: SDKToolUseMessage[];
}

export interface CapabilityCheck {
  available: boolean;
  detail: string;
}

export interface CapabilityMatrix {
  cursorApiKey: CapabilityCheck;
  local: {
    nciCli: CapabilityCheck;
  };
  cloud: {
    connectedRepositories?: CapabilityCheck;
  };
}

export interface BenchmarkRunRecord {
  runId: string;
  timestampIso: string;
  runtime: BenchmarkRuntime;
  strategy: BenchmarkStrategy;
  taskId: string;
  packageId: string;
  packageVersion: string;
  difficulty: BenchmarkDifficulty;
  lane: BenchmarkLane;
  prompt: string;
  promptContract: PromptContract;
  responseText: string;
  evidence: AgentEvidence;
  modelId: string;
  durationMs: number;
  sdkDurationMs?: number;
  runtimeMetrics: AgentRuntimeMetrics;
  isCorrect: boolean;
  missingSubstrings: string[];
  forbiddenMatches: string[];
  retries: number;
  status: "success" | "failure" | "skipped";
  skippedReason?: string;
  errorMessage?: string;
  indexingStage?: NciStageResult;
  sqlValidationStage?: NciStageResult;
}

export interface BenchmarkRunFile {
  generatedAtIso: string;
  generatedAtLocalIso?: string;
  generatedAtEpochMs?: number;
  protocolVersion: string;
  mode: "pilot" | "full";
  /** Output file stem (e.g. `7a-20260501-234438-pilot`) for pairing run + metrics + web exports. */
  runStem?: string;
  capabilities: CapabilityMatrix;
  indexingMetrics: NciStageResult[];
  records: BenchmarkRunRecord[];
  /** Optional per-pair LLM judgments (baseline vs nci_first). Present only when `--pairwise-judge=true`. */
  pairwiseJudgments?: PairwiseJudgmentRecord[];
}

/**
 * Independent dimension scores per arm, plus holistic preference. Two-dimension design (correctness vs
 * actionability) lets summaries attribute NCI's contribution rather than blending it into a single
 * overall score (see plan: `pairwise_judge_benchmark_*.plan.md`).
 */
export interface PairwiseJudgeResult {
  modelId: string;
  baselineCorrectness: number;
  baselineActionability: number;
  nciFirstCorrectness: number;
  nciFirstActionability: number;
  comparisonNotes: string;
  preferred: "baseline" | "nci_first" | "tie";
  confidence: "high" | "medium" | "low";
  durationMs?: number;
  judgePromptDigest?: string;
}

export interface PairwiseJudgmentRecord {
  taskId: string;
  packageId: string;
  runtime: BenchmarkRuntime;
  baselineRunId?: string;
  nciRunId?: string;
  status: "completed" | "skipped";
  skippedReason?: string;
  judge?: PairwiseJudgeResult;
}

/**
 * Pairwise aggregates for the summary/full datasets. Dimension-level deltas are the source of truth
 * for proving NCI's contribution; holistic `preferred` counts are auxiliary.
 */
export interface PairwiseAggregates {
  attemptedPairCount: number;
  completedPairCount: number;
  skippedPairCount: number;
  skippedReasonCounts: Record<string, number>;
  meanDeltaCorrectness: number;
  meanDeltaActionability: number;
  correctnessWinCounts: { nci_first: number; baseline: number; tie: number };
  actionabilityWinCounts: { nci_first: number; baseline: number; tie: number };
  preferredCounts: { nci_first: number; baseline: number; tie: number };
  confidenceCounts: { high: number; medium: number; low: number };
  meanBaselineCorrectness: number;
  meanBaselineActionability: number;
  meanNciFirstCorrectness: number;
  meanNciFirstActionability: number;
}

export interface AggregatedMetric {
  groupKey: string;
  count: number;
  successRate: number;
  medianDurationMs: number;
  p90DurationMs: number;
  ci95LowMs: number;
  ci95HighMs: number;
  avgToolCallsStarted: number;
  avgToolCallsCompleted: number;
  avgToolCallsErrored: number;
  avgToolCallsUnfinished: number;
  avgToolCallDetailCount: number;
}

export interface SummaryDataset {
  generatedAtIso: string;
  generatedAtLocalIso?: string;
  generatedAtEpochMs?: number;
  protocolVersion: string;
  totals: {
    runCount: number;
    skippedCount: number;
    successCount: number;
    failureCount: number;
    successRate: number;
    toolCallsStarted: number;
    toolCallsCompleted: number;
    toolCallsErrored: number;
    toolCallsUnfinished: number;
    toolCallDetailCount: number;
  };
  byStrategy: AggregatedMetric[];
  byDifficulty: AggregatedMetric[];
  /** Optional pairwise aggregates; present only when the run produced `pairwiseJudgments`. */
  pairwise?: PairwiseAggregates;
}

export interface FullDataset extends SummaryDataset {
  byTask: AggregatedMetric[];
  byPackage: AggregatedMetric[];
  ganttSeries: Array<{
    runId: string;
    taskId: string;
    strategy: BenchmarkStrategy;
    runtime: BenchmarkRuntime;
    durationMs: number;
    difficulty: BenchmarkDifficulty;
  }>;
  pairwiseJudgments?: PairwiseJudgmentRecord[];
}
