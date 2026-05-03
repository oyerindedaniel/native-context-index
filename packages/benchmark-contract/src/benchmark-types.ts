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
}

export interface PracticalJsonContractVerifier {
  type: "practical_json_contract";
  required_substrings: string[];
  forbidden_substrings: string[];
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
  protocolVersion: string;
  mode: "pilot" | "full";
  /** Output file stem (e.g. `7a-20260501-234438-pilot`) for pairing run + metrics + web exports. */
  runStem?: string;
  capabilities: CapabilityMatrix;
  indexingMetrics: NciStageResult[];
  records: BenchmarkRunRecord[];
}

export interface AggregatedMetric {
  groupKey: string;
  count: number;
  successRate: number;
  medianDurationMs: number;
  p90DurationMs: number;
  ci95LowMs: number;
  ci95HighMs: number;
}

export interface SummaryDataset {
  generatedAtIso: string;
  protocolVersion: string;
  totals: {
    runCount: number;
    skippedCount: number;
    successCount: number;
    failureCount: number;
    successRate: number;
  };
  byStrategy: AggregatedMetric[];
  byDifficulty: AggregatedMetric[];
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
}
