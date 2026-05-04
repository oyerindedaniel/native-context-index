import type {
  BenchmarkLane,
  BenchmarkStrategy,
  PackageEntry,
  PromptContract,
  TaskVerifier,
} from "@repo/benchmark-contract/benchmark-types";

import { buildNciFirstAgentPrimer } from "./nci-first-agent-primer";
import { normalizeResponseJsonText } from "./benchmark-verifiers";

interface PromptBuildInput {
  strategy: BenchmarkStrategy;
  lane: BenchmarkLane;
  packageEntry: PackageEntry;
  taskQuestion: string;
  taskVerifier: TaskVerifier;
  nciBinaryPath: string;
}

interface PromptBuildResult {
  prompt: string;
  contract: PromptContract;
}

function buildContract(
  strategy: BenchmarkStrategy,
  lane: BenchmarkLane,
): PromptContract {
  return {
    strategy,
    lane,
    requiresNciCliUsage: strategy === "nci_first",
    requiresSqlEvidence: strategy === "nci_first",
    requiresGithubEvidence: lane !== "artifact_only",
  };
}

function buildArtifactInstruction(packageEntry: PackageEntry): string {
  if (
    packageEntry.declaration_source === "external_types" &&
    packageEntry.types_package_name
  ) {
    return `Primary declarations are in node_modules/${packageEntry.types_package_name}.`;
  }
  return `Primary declarations are in node_modules/${packageEntry.package_name}.`;
}

function buildStrategyInstruction(strategy: BenchmarkStrategy): string {
  const workspaceMutationGuardrail =
    "Do not run package managers (`npm install`, `pnpm install`, `yarn install`), do not create temporary dependency projects, and do not create/delete files to repair environment issues during this benchmark. If declarations appear missing, continue with available evidence and report the gap.";
  const nciCompilationGuardrail =
    "Do not attempt `tsc -e` or ad-hoc compile probes during benchmark runs; use declaration evidence from NCI/query/snippet directly unless compilation is explicitly required by the task.";
  const baselineCompilationGuardrail =
    "Do not attempt `tsc -e` or ad-hoc compile probes during benchmark runs; use direct declaration/source evidence unless compilation is explicitly required by the task.";
  if (strategy === "nci_first") {
    return [
      "Run **`sql --schema`** when you need the exact column list.",
      "Prefer **query** for discovery; use read-only **sql** for relational facts from the tables above.",
      'On **Windows PowerShell**, invoke NCI as **`& "<path-to-nci.exe>" <subcommand> …`** so `sql` / `query` are real arguments (never `"…nci.exe" sql …` without `&`).',
      "Cap **`query find`** rows with **`-n` / `--limit`** (default 20). **`--max-rows` is only for `nci sql`**, not `query find`.",
      "Use grep/read_file only when NCI output is insufficient.",
      workspaceMutationGuardrail,
      nciCompilationGuardrail,
    ].join(" ");
  }
  return [
    "Do not run nci commands in this baseline run.",
    "Use direct declaration reading and allowed repository exploration only.",
    workspaceMutationGuardrail,
    baselineCompilationGuardrail,
  ].join(" ");
}

function buildNciFirstBinarySection(nciBinaryPath: string): string {
  return [
    `NCI binary: ${nciBinaryPath}`,
    'Subcommands (same executable): **`sql --schema`** prints DDL; **`query find "<phrase>"`** for FTS discovery (row cap: **`-n` / `--limit`**, not `--max-rows`); **`sql --format json -c`** with your own read-only `SELECT` (row cap: **`--max-rows`**).',
    "Put representative stdout (or a clear empty/error note) in **`nci_query_evidence`** and **`nci_sql_evidence`**.",
  ].join("\n");
}

function buildLaneInstruction(lane: BenchmarkLane): string {
  if (lane === "artifact_only") {
    return "Stay declaration-grounded inside local package artifacts.";
  }
  if (lane === "github_baseline") {
    return "GitHub exploration is allowed for architecture orientation, but final answer must cite declaration evidence.";
  }
  return "Analyze architecture-level behavior with GitHub orientation and declaration-grounded validation.";
}

function buildRequiredJsonSchema(verifier: TaskVerifier): string {
  if (verifier.type === "practical_json_contract") {
    return [
      "{",
      '  "recommendation": "specific recommendation that answers the engineering question",',
      '  "tradeoffs": "important tradeoffs, risks, and rejected alternatives",',
      '  "implementation_notes": "implementation steps or constraints a developer can act on",',
      '  "declaration_paths": ["path1.d.ts"],',
      '  "evidence": "how cited declarations/source evidence support the recommendation",',
      '  "nci_query_evidence": "required for nci_first, otherwise empty string",',
      '  "nci_sql_evidence": "required for nci_first, otherwise empty string",',
      '  "github_evidence": "required for non-artifact lanes, otherwise empty string"',
      "}",
    ].join("\n");
  }

  return [
    "{",
    '  "answer": "short factual answer",',
    '  "declaration_paths": ["path1.d.ts"],',
    '  "nci_query_evidence": "required for nci_first, otherwise empty string",',
    '  "nci_sql_evidence": "required for nci_first, otherwise empty string",',
    '  "github_evidence": "required for non-artifact lanes, otherwise empty string"',
    "}",
  ].join("\n");
}

export function buildBenchmarkPrompt(
  input: PromptBuildInput,
): PromptBuildResult {
  const promptContract = buildContract(input.strategy, input.lane);
  const requiredJsonSchema = buildRequiredJsonSchema(input.taskVerifier);

  const promptSections = [
    "You are running a benchmark. Follow instructions exactly.",
    buildArtifactInstruction(input.packageEntry),
    ...(input.strategy === "nci_first"
      ? [
          buildNciFirstAgentPrimer(),
          buildNciFirstBinarySection(input.nciBinaryPath),
          buildStrategyInstruction(input.strategy),
        ]
      : [buildStrategyInstruction(input.strategy)]),
    buildLaneInstruction(input.lane),
    ...(input.taskVerifier.type === "practical_json_contract"
      ? [
          "This is a practical engineering-design task. Give a concrete recommendation, cite declaration/source evidence, and explain tradeoffs without generic blog-style advice.",
        ]
      : []),
    `Task: ${input.taskQuestion}`,
    "Reply with one JSON object only (no markdown). Schema:",
    requiredJsonSchema,
    "No extra keys. Invalid JSON fails evaluation.",
  ];

  return {
    prompt: promptSections.join("\n\n"),
    contract: promptContract,
  };
}

export function parseEvidenceFromResponse(responseText: string): {
  declarationPaths: string[];
  nciQuerySnippet?: string;
  nciSqlSnippet?: string;
} {
  const normalizedResponseText = normalizeResponseJsonText(responseText);
  try {
    const parsedJson = JSON.parse(normalizedResponseText) as {
      declaration_paths?: unknown;
      nci_query_evidence?: unknown;
      nci_sql_evidence?: unknown;
    };
    const declarationPaths = Array.isArray(parsedJson.declaration_paths)
      ? parsedJson.declaration_paths.filter(
          (value): value is string => typeof value === "string",
        )
      : [];
    const nciQuerySnippet =
      typeof parsedJson.nci_query_evidence === "string"
        ? parsedJson.nci_query_evidence
        : undefined;
    const nciSqlSnippet =
      typeof parsedJson.nci_sql_evidence === "string"
        ? parsedJson.nci_sql_evidence
        : undefined;
    return { declarationPaths, nciQuerySnippet, nciSqlSnippet };
  } catch {
    return { declarationPaths: [] };
  }
}
