import type {
  AggregatedMetric,
  BenchmarkRunRecord,
  FullDataset,
  SummaryDataset,
} from "@repo/benchmark-contract/benchmark-types";

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

export function buildSummaryDataset(
  records: BenchmarkRunRecord[],
  protocolVersion: string,
): SummaryDataset {
  const evaluatedRecords = records.filter(
    (record) => record.status !== "skipped",
  );
  const skippedCount = records.length - evaluatedRecords.length;
  const successCount = evaluatedRecords.filter(
    (record) => record.isCorrect,
  ).length;
  const failureCount = evaluatedRecords.length - successCount;
  return {
    generatedAtIso: new Date().toISOString(),
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
    },
    byStrategy: aggregateByKey(evaluatedRecords, (record) => record.strategy),
    byDifficulty: aggregateByKey(
      evaluatedRecords,
      (record) => record.difficulty,
    ),
  };
}

export function buildFullDataset(
  records: BenchmarkRunRecord[],
  protocolVersion: string,
): FullDataset {
  const summaryDataset = buildSummaryDataset(records, protocolVersion);
  return {
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
}
