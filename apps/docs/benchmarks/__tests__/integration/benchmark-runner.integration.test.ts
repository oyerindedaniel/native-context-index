import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type {
  CapabilityMatrix,
  NciStageResult,
  PackageEntry,
} from "@repo/benchmark-contract/benchmark-types";
import { runBenchmarksWithDependencies } from "../../benchmark-runner";

function stageResult(
  stageType: "indexing_metrics" | "sql_validation",
  packageId: string,
): NciStageResult {
  return {
    stageType,
    packageId,
    command: "nci command",
    durationMs: 10,
    success: true,
    outputDigest: "digest",
    metadata: {},
  };
}

function createCapabilities(): CapabilityMatrix {
  return {
    cursorApiKey: { available: true, detail: "ok" },
    local: {
      nciCli: { available: true, detail: "ok" },
    },
    cloud: {
      connectedRepositories: { available: true, detail: "ok" },
    },
  };
}

describe("benchmark runner integration", () => {
  it("writes run and dataset files without executing agent calls", async () => {
    const sandboxRoot = await mkdtemp(path.join(tmpdir(), "nci-bench-"));
    const docsRoot = path.join(sandboxRoot, "apps", "docs");
    const benchmarkRoot = path.join(docsRoot, "benchmarks");
    const webDataRoot = path.join(
      sandboxRoot,
      "apps",
      "web",
      "data",
      "benchmarks",
    );
    await mkdir(benchmarkRoot, { recursive: true });
    await mkdir(webDataRoot, { recursive: true });

    const packageManifest = {
      version: "2026-05-01",
      selection_policy: "test",
      packages: [
        {
          id: "uuid",
          tier: "easy",
          registry: "npm",
          package_name: "uuid",
          package_version: "14.0.0",
          language_family: "typescript",
          declaration_source: "bundled",
          github: {
            owner: "uuidjs",
            repo: "uuid",
            default_branch: "main",
            pinned_sha: "sha",
            license: "MIT",
          },
        },
      ],
    };
    const taskManifest = {
      version: "2026-05-01",
      evaluation_focus: "test",
      tasks: [
        {
          id: "uuid-task",
          difficulty: "easy",
          lane: "artifact_only",
          package_id: "uuid",
          question: "Return uuid declaration signature",
          verifier: {
            type: "json_contract",
            required_substrings: [],
            forbidden_substrings: [],
          },
        },
      ],
    };

    await writeFile(
      path.join(benchmarkRoot, "package-manifest.json"),
      JSON.stringify(packageManifest, null, 2),
      "utf8",
    );
    await writeFile(
      path.join(benchmarkRoot, "tasks-manifest.json"),
      JSON.stringify(taskManifest, null, 2),
      "utf8",
    );

    const outputStem = "aa-test-pilot";

    await runBenchmarksWithDependencies(
      {
        workspaceRoot: sandboxRoot,
        docsRoot,
        taskManifestFileName: "tasks-manifest.json",
        mode: "pilot",
        protocolVersion: "test",
        modelId: "composer-2",
        nciBinaryPath: path.join(sandboxRoot, "target", "debug", "nci.exe"),
        performExecution: false,
        includeCloudRuntime: false,
        outputStem,
      },
      {
        runIndexingStage: async (packageEntry: PackageEntry) =>
          stageResult("indexing_metrics", packageEntry.id),
        runSqlStage: async (packageEntry: PackageEntry) =>
          stageResult("sql_validation", packageEntry.id),
        detectCapabilities: async () => createCapabilities(),
      },
    );

    const runOutput = JSON.parse(
      await readFile(
        path.join(benchmarkRoot, "runs", `${outputStem}-run.json`),
        "utf8",
      ),
    ) as { records: unknown[]; runStem?: string };
    const summaryOutput = JSON.parse(
      await readFile(
        path.join(webDataRoot, `${outputStem}-summary.json`),
        "utf8",
      ),
    ) as { totals: { runCount: number } };
    const metricsOutput = JSON.parse(
      await readFile(
        path.join(benchmarkRoot, "runs", `${outputStem}-metrics.json`),
        "utf8",
      ),
    ) as { runStem: string; records: unknown[] };
    expect(runOutput.records.length).toBeGreaterThan(0);
    expect(runOutput.runStem).toBe(outputStem);
    expect(summaryOutput.totals.runCount).toBeGreaterThan(0);
    expect(metricsOutput.runStem).toBe(outputStem);
    expect(metricsOutput.records.length).toBe(runOutput.records.length);
  });

  it("marks runs as skipped when CURSOR_API_KEY capability is unavailable", async () => {
    const sandboxRoot = await mkdtemp(path.join(tmpdir(), "nci-bench-skip-"));
    const docsRoot = path.join(sandboxRoot, "apps", "docs");
    const benchmarkRoot = path.join(docsRoot, "benchmarks");
    const webDataRoot = path.join(
      sandboxRoot,
      "apps",
      "web",
      "data",
      "benchmarks",
    );
    await mkdir(benchmarkRoot, { recursive: true });
    await mkdir(webDataRoot, { recursive: true });

    await writeFile(
      path.join(benchmarkRoot, "package-manifest.json"),
      JSON.stringify(
        {
          version: "2026-05-01",
          selection_policy: "test",
          packages: [
            {
              id: "pnpm",
              tier: "hard",
              registry: "npm",
              package_name: "pnpm",
              package_version: "10.33.2",
              language_family: "typescript",
              declaration_source: "bundled",
              github: {
                owner: "pnpm",
                repo: "pnpm",
                default_branch: "main",
                pinned_sha: "sha",
                license: "MIT",
              },
            },
          ],
        },
        null,
        2,
      ),
      "utf8",
    );
    await writeFile(
      path.join(benchmarkRoot, "tasks-manifest.json"),
      JSON.stringify(
        {
          version: "2026-05-01",
          evaluation_focus: "test",
          tasks: [
            {
              id: "pnpm-architecture",
              difficulty: "hard",
              lane: "architecture_github",
              package_id: "pnpm",
              question: "Explain workspace architecture",
              verifier: {
                type: "json_contract",
                required_substrings: [],
                forbidden_substrings: [],
              },
            },
          ],
        },
        null,
        2,
      ),
      "utf8",
    );

    const outputStemFull = "bb-test-full";

    await runBenchmarksWithDependencies(
      {
        workspaceRoot: sandboxRoot,
        docsRoot,
        taskManifestFileName: "tasks-manifest.json",
        mode: "full",
        protocolVersion: "test",
        modelId: "composer-2",
        nciBinaryPath: path.join(sandboxRoot, "target", "debug", "nci.exe"),
        performExecution: false,
        includeCloudRuntime: false,
        outputStem: outputStemFull,
      },
      {
        runIndexingStage: async (packageEntry: PackageEntry) =>
          stageResult("indexing_metrics", packageEntry.id),
        runSqlStage: async (packageEntry: PackageEntry) =>
          stageResult("sql_validation", packageEntry.id),
        detectCapabilities: async () => ({
          cursorApiKey: { available: false, detail: "missing" },
          local: {
            nciCli: { available: true, detail: "ok" },
          },
          cloud: {},
        }),
      },
    );

    const runOutput = JSON.parse(
      await readFile(
        path.join(benchmarkRoot, "runs", `${outputStemFull}-run.json`),
        "utf8",
      ),
    ) as {
      records: Array<{ status: string; skippedReason?: string }>;
    };
    expect(runOutput.records[0]?.status).toBe("skipped");
    expect(runOutput.records[0]?.skippedReason).toBe(
      "cursor_api_key_unavailable",
    );
  });

  it("can run against an alternate task manifest filename", async () => {
    const sandboxRoot = await mkdtemp(
      path.join(tmpdir(), "nci-bench-alt-manifest-"),
    );
    const docsRoot = path.join(sandboxRoot, "apps", "docs");
    const benchmarkRoot = path.join(docsRoot, "benchmarks");
    const webDataRoot = path.join(
      sandboxRoot,
      "apps",
      "web",
      "data",
      "benchmarks",
    );
    await mkdir(benchmarkRoot, { recursive: true });
    await mkdir(webDataRoot, { recursive: true });

    await writeFile(
      path.join(benchmarkRoot, "package-manifest.json"),
      JSON.stringify(
        {
          version: "2026-05-01",
          selection_policy: "test",
          packages: [
            {
              id: "swr",
              tier: "medium",
              registry: "npm",
              package_name: "swr",
              package_version: "2.4.1",
              language_family: "typescript",
              declaration_source: "bundled",
              github: {
                owner: "vercel",
                repo: "swr",
                default_branch: "main",
                pinned_sha: "sha",
                license: "MIT",
              },
            },
          ],
        },
        null,
        2,
      ),
      "utf8",
    );
    await writeFile(
      path.join(benchmarkRoot, "tasks-manifest.practical.json"),
      JSON.stringify(
        {
          version: "2026-05-01",
          evaluation_focus: "practical",
          tasks: [
            {
              id: "swr-practical",
              difficulty: "medium",
              lane: "artifact_only",
              package_id: "swr",
              question: "Recommend SWR mutation flow",
              verifier: {
                type: "practical_json_contract",
                required_substrings: ["mutate"],
                forbidden_substrings: ["manual DOM update"],
              },
            },
          ],
        },
        null,
        2,
      ),
      "utf8",
    );

    const outputStem = "cc-test-practical";

    await runBenchmarksWithDependencies(
      {
        workspaceRoot: sandboxRoot,
        docsRoot,
        taskManifestFileName: "tasks-manifest.practical.json",
        mode: "pilot",
        protocolVersion: "test",
        modelId: "composer-2",
        nciBinaryPath: path.join(sandboxRoot, "target", "debug", "nci.exe"),
        performExecution: false,
        includeCloudRuntime: false,
        outputStem,
      },
      {
        runIndexingStage: async (packageEntry: PackageEntry) =>
          stageResult("indexing_metrics", packageEntry.id),
        runSqlStage: async (packageEntry: PackageEntry) =>
          stageResult("sql_validation", packageEntry.id),
        detectCapabilities: async () => createCapabilities(),
      },
    );

    const runOutput = JSON.parse(
      await readFile(
        path.join(benchmarkRoot, "runs", `${outputStem}-run.json`),
        "utf8",
      ),
    ) as { records: Array<{ taskId: string; prompt: string }> };
    expect(runOutput.records[0]?.taskId).toBe("swr-practical");
    expect(runOutput.records[0]?.prompt).toContain('"recommendation"');
  });

  it("advances sequential step by default even when correctness fails", async () => {
    const sandboxRoot = await mkdtemp(path.join(tmpdir(), "nci-bench-seq-"));
    const docsRoot = path.join(sandboxRoot, "apps", "docs");
    const benchmarkRoot = path.join(docsRoot, "benchmarks");
    const webDataRoot = path.join(
      sandboxRoot,
      "apps",
      "web",
      "data",
      "benchmarks",
    );
    await mkdir(benchmarkRoot, { recursive: true });
    await mkdir(webDataRoot, { recursive: true });

    await writeFile(
      path.join(benchmarkRoot, "package-manifest.json"),
      JSON.stringify(
        {
          version: "2026-05-01",
          selection_policy: "test",
          packages: [
            {
              id: "uuid",
              tier: "easy",
              registry: "npm",
              package_name: "uuid",
              package_version: "14.0.0",
              language_family: "typescript",
              declaration_source: "bundled",
              github: {
                owner: "uuidjs",
                repo: "uuid",
                default_branch: "main",
                pinned_sha: "sha",
                license: "MIT",
              },
            },
          ],
        },
        null,
        2,
      ),
      "utf8",
    );
    await writeFile(
      path.join(benchmarkRoot, "tasks-manifest.json"),
      JSON.stringify(
        {
          version: "2026-05-01",
          evaluation_focus: "test",
          tasks: [
            {
              id: "uuid-seq",
              difficulty: "easy",
              lane: "artifact_only",
              package_id: "uuid",
              question: "Return uuid declaration signature",
              verifier: {
                type: "json_contract",
                required_substrings: [],
                forbidden_substrings: ["execution_disabled"],
              },
            },
          ],
        },
        null,
        2,
      ),
      "utf8",
    );

    await runBenchmarksWithDependencies(
      {
        workspaceRoot: sandboxRoot,
        docsRoot,
        taskManifestFileName: "tasks-manifest.json",
        mode: "pilot",
        protocolVersion: "test",
        modelId: "composer-2",
        nciBinaryPath: path.join(sandboxRoot, "target", "debug", "nci.exe"),
        performExecution: false,
        includeCloudRuntime: false,
        sequentialStep: true,
        sequentialStepStatePath: "benchmarks/.pilot-seq-test.json",
        outputStem: "dd-test-seq-default",
      },
      {
        runIndexingStage: async (packageEntry: PackageEntry) =>
          stageResult("indexing_metrics", packageEntry.id),
        runSqlStage: async (packageEntry: PackageEntry) =>
          stageResult("sql_validation", packageEntry.id),
        detectCapabilities: async () => createCapabilities(),
      },
    );

    const state = JSON.parse(
      await readFile(path.join(benchmarkRoot, ".pilot-seq-test.json"), "utf8"),
    ) as { completedTaskIds: string[] };
    expect(state.completedTaskIds).toContain("uuid-seq");
  });

  it("does not advance sequential step when strict correctness mode is enabled", async () => {
    const sandboxRoot = await mkdtemp(
      path.join(tmpdir(), "nci-bench-seq-strict-"),
    );
    const docsRoot = path.join(sandboxRoot, "apps", "docs");
    const benchmarkRoot = path.join(docsRoot, "benchmarks");
    const webDataRoot = path.join(
      sandboxRoot,
      "apps",
      "web",
      "data",
      "benchmarks",
    );
    await mkdir(benchmarkRoot, { recursive: true });
    await mkdir(webDataRoot, { recursive: true });

    await writeFile(
      path.join(benchmarkRoot, "package-manifest.json"),
      JSON.stringify(
        {
          version: "2026-05-01",
          selection_policy: "test",
          packages: [
            {
              id: "uuid",
              tier: "easy",
              registry: "npm",
              package_name: "uuid",
              package_version: "14.0.0",
              language_family: "typescript",
              declaration_source: "bundled",
              github: {
                owner: "uuidjs",
                repo: "uuid",
                default_branch: "main",
                pinned_sha: "sha",
                license: "MIT",
              },
            },
          ],
        },
        null,
        2,
      ),
      "utf8",
    );
    await writeFile(
      path.join(benchmarkRoot, "tasks-manifest.json"),
      JSON.stringify(
        {
          version: "2026-05-01",
          evaluation_focus: "test",
          tasks: [
            {
              id: "uuid-seq",
              difficulty: "easy",
              lane: "artifact_only",
              package_id: "uuid",
              question: "Return uuid declaration signature",
              verifier: {
                type: "json_contract",
                required_substrings: [],
                forbidden_substrings: ["execution_disabled"],
              },
            },
          ],
        },
        null,
        2,
      ),
      "utf8",
    );

    await runBenchmarksWithDependencies(
      {
        workspaceRoot: sandboxRoot,
        docsRoot,
        taskManifestFileName: "tasks-manifest.json",
        mode: "pilot",
        protocolVersion: "test",
        modelId: "composer-2",
        nciBinaryPath: path.join(sandboxRoot, "target", "debug", "nci.exe"),
        performExecution: false,
        includeCloudRuntime: false,
        sequentialStep: true,
        sequentialStepRequireCorrectness: true,
        sequentialStepStatePath: "benchmarks/.pilot-seq-test.json",
        outputStem: "ee-test-seq-strict",
      },
      {
        runIndexingStage: async (packageEntry: PackageEntry) =>
          stageResult("indexing_metrics", packageEntry.id),
        runSqlStage: async (packageEntry: PackageEntry) =>
          stageResult("sql_validation", packageEntry.id),
        detectCapabilities: async () => createCapabilities(),
      },
    );

    const statePath = path.join(benchmarkRoot, ".pilot-seq-test.json");
    let stateContent: string | undefined;
    try {
      stateContent = await readFile(statePath, "utf8");
    } catch {
      stateContent = undefined;
    }
    if (stateContent === undefined) {
      expect(true).toBe(true);
    } else {
      const state = JSON.parse(stateContent) as { completedTaskIds: string[] };
      expect(state.completedTaskIds).not.toContain("uuid-seq");
    }
  });
});
