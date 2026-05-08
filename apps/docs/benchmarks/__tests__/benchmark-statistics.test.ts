import { describe, expect, it } from "vitest";
import type {
  BenchmarkRunRecord,
  BenchmarkStrategy,
} from "@repo/benchmark-contract/benchmark-types";
import {
  buildFullDataset,
  buildPairwiseAggregates,
  buildSummaryDataset,
} from "../benchmark-statistics";

function createRecord(
  runId: string,
  strategy: BenchmarkStrategy,
  durationMs: number,
  isCorrect: boolean,
  toolCallsStarted = 0,
  toolCallsCompleted = 0,
  toolCallsErrored = 0,
): BenchmarkRunRecord {
  return {
    runId,
    timestampIso: new Date().toISOString(),
    runtime: "local",
    strategy,
    taskId: "task",
    packageId: "pkg",
    packageVersion: "1.0.0",
    difficulty: "easy",
    lane: "artifact_only",
    prompt: "prompt",
    promptContract: {
      strategy,
      lane: "artifact_only",
      requiresNciCliUsage: strategy === "nci_first",
      requiresSqlEvidence: strategy === "nci_first",
      requiresGithubEvidence: false,
    },
    responseText: "{}",
    evidence: { declarationPaths: [] },
    modelId: "model",
    durationMs,
    isCorrect,
    runtimeMetrics: {
      toolCallsStarted,
      toolCallsCompleted,
      toolCallsErrored,
      toolCallsUnfinished: 0,
    },
    missingSubstrings: [],
    forbiddenMatches: [],
    retries: 0,
    status: "success",
  };
}

describe("benchmark statistics", () => {
  it("computes totals and grouped metrics", () => {
    const records = [
      createRecord("1", "baseline", 1000, true, 2, 2, 0),
      createRecord("2", "baseline", 1500, false, 3, 3, 0),
      createRecord("3", "nci_first", 900, true, 5, 4, 1),
    ];
    const summary = buildSummaryDataset(records, "v1");
    expect(summary.totals.runCount).toBe(3);
    expect(summary.totals.toolCallsStarted).toBe(10);
    expect(summary.totals.toolCallsCompleted).toBe(9);
    expect(summary.totals.toolCallsErrored).toBe(1);
    expect(summary.totals.toolCallsUnfinished).toBe(0);
    expect(summary.byStrategy).toHaveLength(2);
    const baselineMetrics = summary.byStrategy.find(
      (metric) => metric.groupKey === "baseline",
    );
    expect(baselineMetrics?.avgToolCallsStarted).toBe(2.5);
  });

  it("builds gantt series in full dataset", () => {
    const records = [createRecord("1", "baseline", 1000, true)];
    const fullDataset = buildFullDataset(records, "v1");
    expect(fullDataset.ganttSeries).toHaveLength(1);
    const firstEntry = fullDataset.ganttSeries.at(0);
    expect(firstEntry?.durationMs).toBe(1000);
  });

  it("aggregates pairwise judgments into summary.full when provided", () => {
    const records = [createRecord("1", "baseline", 1000, true)];
    const pairwise = [
      {
        taskId: "t1",
        packageId: "pkg",
        runtime: "local" as const,
        baselineRunId: "b1",
        nciRunId: "n1",
        status: "completed" as const,
        judge: {
          modelId: "m",
          baselineCorrectness: 5,
          baselineActionability: 5,
          nciFirstCorrectness: 7,
          nciFirstActionability: 8,
          comparisonNotes: "notes",
          preferred: "nci_first" as const,
          confidence: "high" as const,
        },
      },
    ];
    const summary = buildSummaryDataset(records, "v1", pairwise);
    expect(summary.pairwise?.completedPairCount).toBe(1);
    expect(summary.pairwise?.meanDeltaCorrectness).toBe(2);
    expect(summary.pairwise?.meanDeltaActionability).toBe(3);

    const aggregates = buildPairwiseAggregates(pairwise);
    expect(aggregates.preferredCounts.nci_first).toBe(1);
    expect(aggregates.correctnessWinCounts.nci_first).toBe(1);
  });
});
