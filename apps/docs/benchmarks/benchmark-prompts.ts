import type {
  BenchmarkLane,
  BenchmarkStrategy,
  PackageEntry,
  PromptContract,
} from "@repo/benchmark-contract/benchmark-types";

interface PromptBuildInput {
  strategy: BenchmarkStrategy;
  lane: BenchmarkLane;
  packageEntry: PackageEntry;
  taskQuestion: string;
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
  if (strategy === "nci_first") {
    return "Use the NCI binary above. Use query for flexible symbol lookup; use a read-only sql probe when graph facts help. Use grep/glob or read_file only if you still need extra confirmation.";
  }
  return [
    "Do not run nci commands in this baseline run.",
    "Use direct declaration reading and allowed repository exploration only.",
  ].join(" ");
}

function buildNciFirstBinarySection(nciBinaryPath: string): string {
  return [
    `NCI binary: ${nciBinaryPath}`,
    'Subcommands (same executable): `sql --schema` for table layout; `query find "<phrase>"` for symbol discovery; `sql --format json -c` for read-only SQL—any valid pattern is fine; shape the query from the schema and what you need (joins, filters, aggregates, etc.); use `--max-rows` only to cap how many rows come back.',
    "Put representative stdout (or a clear empty/error note) in nci_query_evidence and nci_sql_evidence.",
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

export function buildBenchmarkPrompt(
  input: PromptBuildInput,
): PromptBuildResult {
  const promptContract = buildContract(input.strategy, input.lane);
  const requiredJsonSchema = [
    "{",
    '  "answer": "short factual answer",',
    '  "declaration_paths": ["path1.d.ts"],',
    '  "nci_query_evidence": "required for nci_first, otherwise empty string",',
    '  "nci_sql_evidence": "required for nci_first, otherwise empty string",',
    '  "github_evidence": "required for non-artifact lanes, otherwise empty string"',
    "}",
  ].join("\n");

  const promptSections = [
    "You are running a benchmark. Follow instructions exactly.",
    buildArtifactInstruction(input.packageEntry),
    ...(input.strategy === "nci_first"
      ? [
          buildNciFirstBinarySection(input.nciBinaryPath),
          buildStrategyInstruction(input.strategy),
        ]
      : [buildStrategyInstruction(input.strategy)]),
    buildLaneInstruction(input.lane),
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
  try {
    const parsedJson = JSON.parse(responseText) as {
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
