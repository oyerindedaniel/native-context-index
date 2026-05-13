import type {
  AggregatedMetric,
  BenchmarkRunRecord,
  FullDataset,
  PairwiseAggregates,
  PairwiseJudgeResult,
  PairwiseJudgmentRecord,
  SummaryDataset,
} from "@repo/benchmark-contract/benchmark-types";
import { resolvedToolCallsUnfinished } from "./runtime-metrics-finalize";

function sorted(values: number[]): number[] {
  return [...values].sort(
    (firstValue, secondValue) => firstValue - secondValue,
  );
}

function percentile(values: number[], percentileValue: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sortedValues = sorted(values);
  const rawIndex = Math.ceil((percentileValue / 100) * sortedValues.length) - 1;
  const boundedIndex = Math.max(0, Math.min(sortedValues.length - 1, rawIndex));
  return sortedValues[boundedIndex] ?? 0;
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const totalValue = values.reduce(
    (runningTotal, currentValue) => runningTotal + currentValue,
    0,
  );
  return totalValue / values.length;
}

function standardDeviation(values: number[]): number {
  if (values.length <= 1) {
    return 0;
  }
  const meanValue = average(values);
  const squaredDifferences = values.map(
    (currentValue) => (currentValue - meanValue) ** 2,
  );
  return Math.sqrt(average(squaredDifferences));
}

function confidenceInterval95(values: number[]): { low: number; high: number } {
  if (values.length === 0) {
    return { low: 0, high: 0 };
  }
  if (values.length === 1) {
    const onlyValue = values[0] ?? 0;
    return { low: onlyValue, high: onlyValue };
  }
  const meanValue = average(values);
  const deviationValue = standardDeviation(values);
  const standardError = deviationValue / Math.sqrt(values.length);
  const margin = 1.96 * standardError;
  return { low: meanValue - margin, high: meanValue + margin };
}

function aggregateGroup(
  groupKey: string,
  records: BenchmarkRunRecord[],
): AggregatedMetric {
  const durations = records.map((record) => record.durationMs);
  const toolCallsStarted = records.map(
    (record) => record.runtimeMetrics.toolCallsStarted,
  );
  const toolCallsCompleted = records.map(
    (record) => record.runtimeMetrics.toolCallsCompleted,
  );
  const toolCallsErrored = records.map(
    (record) => record.runtimeMetrics.toolCallsErrored,
  );
  const toolCallsUnfinished = records.map((record) =>
    resolvedToolCallsUnfinished(record.runtimeMetrics),
  );
  const toolCallDetailCount = records.map(
    (record) => record.runtimeMetrics.toolCallDetails?.length ?? 0,
  );
  const successfulRecords = records.filter((record) => record.isCorrect);
  const confidenceInterval = confidenceInterval95(durations);
  return {
    groupKey,
    count: records.length,
    successRate:
      records.length === 0 ? 0 : successfulRecords.length / records.length,
    medianDurationMs: percentile(durations, 50),
    p90DurationMs: percentile(durations, 90),
    ci95LowMs: confidenceInterval.low,
    ci95HighMs: confidenceInterval.high,
    avgToolCallsStarted: average(toolCallsStarted),
    avgToolCallsCompleted: average(toolCallsCompleted),
    avgToolCallsErrored: average(toolCallsErrored),
    avgToolCallsUnfinished: average(toolCallsUnfinished),
    avgToolCallDetailCount: average(toolCallDetailCount),
  };
}

function aggregateByKey(
  records: BenchmarkRunRecord[],
  selector: (record: BenchmarkRunRecord) => string,
): AggregatedMetric[] {
  const groupedRecords = new Map<string, BenchmarkRunRecord[]>();
  for (const record of records) {
    const keyValue = selector(record);
    const existingGroup = groupedRecords.get(keyValue) ?? [];
    existingGroup.push(record);
    groupedRecords.set(keyValue, existingGroup);
  }
  return [...groupedRecords.entries()]
    .map(([groupKey, grouped]) => aggregateGroup(groupKey, grouped))
    .sort((firstGroup, secondGroup) =>
      firstGroup.groupKey.localeCompare(secondGroup.groupKey),
    );
}

function countDimensionWins(
  judges: PairwiseJudgeResult[],
  dimension: "correctness" | "actionability",
): { nci_first: number; baseline: number; tie: number } {
  const wins = { nci_first: 0, baseline: 0, tie: 0 };
  for (const judge of judges) {
    const nciScore =
      dimension === "correctness"
        ? judge.nciFirstCorrectness
        : judge.nciFirstActionability;
    const baselineScore =
      dimension === "correctness"
        ? judge.baselineCorrectness
        : judge.baselineActionability;
    if (nciScore > baselineScore) {
      wins.nci_first += 1;
    } else if (nciScore < baselineScore) {
      wins.baseline += 1;
    } else {
      wins.tie += 1;
    }
  }
  return wins;
}

export function buildPairwiseAggregates(
  pairwiseJudgments: PairwiseJudgmentRecord[],
): PairwiseAggregates {
  const attemptedPairCount = pairwiseJudgments.length;
  const completedJudgments = pairwiseJudgments.filter(
    (judgment) =>
      judgment.status === "completed" && judgment.judge !== undefined,
  );
  const skippedJudgments = pairwiseJudgments.filter(
    (judgment) => judgment.status === "skipped",
  );
  const skippedReasonCounts: Record<string, number> = {};
  for (const judgment of skippedJudgments) {
    const reasonKey = judgment.skippedReason ?? "unknown";
    skippedReasonCounts[reasonKey] = (skippedReasonCounts[reasonKey] ?? 0) + 1;
  }
  const judges: PairwiseJudgeResult[] = [];
  for (const judgment of completedJudgments) {
    if (judgment.judge !== undefined) {
      judges.push(judgment.judge);
    }
  }
  const completedPairCount = judges.length;
  const skippedPairCount = skippedJudgments.length;

  const meanDeltaCorrectness =
    completedPairCount === 0
      ? 0
      : average(
          judges.map(
            (judge) => judge.nciFirstCorrectness - judge.baselineCorrectness,
          ),
        );
  const meanDeltaActionability =
    completedPairCount === 0
      ? 0
      : average(
          judges.map(
            (judge) =>
              judge.nciFirstActionability - judge.baselineActionability,
          ),
        );

  const correctnessWinCounts = countDimensionWins(judges, "correctness");
  const actionabilityWinCounts = countDimensionWins(judges, "actionability");

  const preferredCounts = { nci_first: 0, baseline: 0, tie: 0 };
  const confidenceCounts = { high: 0, medium: 0, low: 0 };
  for (const judge of judges) {
    preferredCounts[judge.preferred] += 1;
    confidenceCounts[judge.confidence] += 1;
  }

  return {
    attemptedPairCount,
    completedPairCount,
    skippedPairCount,
    skippedReasonCounts,
    meanDeltaCorrectness,
    meanDeltaActionability,
    correctnessWinCounts,
    actionabilityWinCounts,
    preferredCounts,
    confidenceCounts,
    meanBaselineCorrectness:
      completedPairCount === 0
        ? 0
        : average(judges.map((judge) => judge.baselineCorrectness)),
    meanBaselineActionability:
      completedPairCount === 0
        ? 0
        : average(judges.map((judge) => judge.baselineActionability)),
    meanNciFirstCorrectness:
      completedPairCount === 0
        ? 0
        : average(judges.map((judge) => judge.nciFirstCorrectness)),
    meanNciFirstActionability:
      completedPairCount === 0
        ? 0
        : average(judges.map((judge) => judge.nciFirstActionability)),
  };
}

export function buildSummaryDataset(
  records: BenchmarkRunRecord[],
  protocolVersion: string,
  pairwiseJudgments?: PairwiseJudgmentRecord[],
): SummaryDataset {
  const generatedAt = new Date();
  const evaluatedRecords = records.filter(
    (record) => record.status !== "skipped",
  );
  const skippedCount = records.length - evaluatedRecords.length;
  const successCount = evaluatedRecords.filter(
    (record) => record.isCorrect,
  ).length;
  const failureCount = evaluatedRecords.length - successCount;
  const totals = evaluatedRecords.reduce(
    (runningTotals, record) => {
      runningTotals.toolCallsStarted += record.runtimeMetrics.toolCallsStarted;
      runningTotals.toolCallsCompleted +=
        record.runtimeMetrics.toolCallsCompleted;
      runningTotals.toolCallsErrored += record.runtimeMetrics.toolCallsErrored;
      runningTotals.toolCallsUnfinished += resolvedToolCallsUnfinished(
        record.runtimeMetrics,
      );
      runningTotals.toolCallDetailCount +=
        record.runtimeMetrics.toolCallDetails?.length ?? 0;
      return runningTotals;
    },
    {
      toolCallsStarted: 0,
      toolCallsCompleted: 0,
      toolCallsErrored: 0,
      toolCallsUnfinished: 0,
      toolCallDetailCount: 0,
    },
  );
  const summary: SummaryDataset = {
    generatedAtIso: generatedAt.toISOString(),
    generatedAtLocalIso: generatedAt.toString(),
    generatedAtEpochMs: generatedAt.getTime(),
    protocolVersion,
    totals: {
      runCount: evaluatedRecords.length,
      skippedCount,
      successCount,
      failureCount,
      successRate:
        evaluatedRecords.length === 0
          ? 0
          : successCount / evaluatedRecords.length,
      toolCallsStarted: totals.toolCallsStarted,
      toolCallsCompleted: totals.toolCallsCompleted,
      toolCallsErrored: totals.toolCallsErrored,
      toolCallsUnfinished: totals.toolCallsUnfinished,
      toolCallDetailCount: totals.toolCallDetailCount,
    },
    byStrategy: aggregateByKey(evaluatedRecords, (record) => record.strategy),
    byDifficulty: aggregateByKey(
      evaluatedRecords,
      (record) => record.difficulty,
    ),
  };

  if (pairwiseJudgments !== undefined && pairwiseJudgments.length > 0) {
    summary.pairwise = buildPairwiseAggregates(pairwiseJudgments);
  }

  return summary;
}

export function buildFullDataset(
  records: BenchmarkRunRecord[],
  protocolVersion: string,
  pairwiseJudgments?: PairwiseJudgmentRecord[],
): FullDataset {
  const summaryDataset = buildSummaryDataset(
    records,
    protocolVersion,
    pairwiseJudgments,
  );
  const dataset: FullDataset = {
    ...summaryDataset,
    byTask: aggregateByKey(records, (record) => record.taskId),
    byPackage: aggregateByKey(records, (record) => record.packageId),
    ganttSeries: records.map((record) => ({
      runId: record.runId,
      taskId: record.taskId,
      strategy: record.strategy,
      runtime: record.runtime,
      durationMs: record.durationMs,
      difficulty: record.difficulty,
    })),
  };

  if (pairwiseJudgments !== undefined && pairwiseJudgments.length > 0) {
    dataset.pairwiseJudgments = pairwiseJudgments;
  }

  return dataset;
}
