"use client";

import React from "react";
import type { AggregatedMetric } from "@repo/benchmark-contract/benchmark-types";

interface BenchmarkBarChartProps {
  title: string;
  metrics: AggregatedMetric[];
  valueKey: "medianDurationMs" | "p90DurationMs" | "successRate";
}

function formatValue(
  metric: AggregatedMetric,
  valueKey: BenchmarkBarChartProps["valueKey"],
): string {
  if (valueKey === "successRate") {
    return `${(metric.successRate * 100).toFixed(1)}%`;
  }
  return `${Math.round(metric[valueKey])}ms`;
}

export function BenchmarkBarChart({
  title,
  metrics,
  valueKey,
}: BenchmarkBarChartProps) {
  const maxValue = Math.max(
    1,
    ...metrics.map((metric) =>
      valueKey === "successRate" ? metric.successRate : metric[valueKey],
    ),
  );

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-5">
      <h3 className="text-lg font-semibold text-neutral-900">{title}</h3>
      <div className="mt-4 flex flex-col gap-3">
        {metrics.map((metric) => {
          const rawValue =
            valueKey === "successRate" ? metric.successRate : metric[valueKey];
          const barWidthPercent = (rawValue / maxValue) * 100;
          return (
            <div key={metric.groupKey} className="space-y-1">
              <div className="flex items-center justify-between text-sm text-neutral-700">
                <span>{metric.groupKey}</span>
                <span>{formatValue(metric, valueKey)}</span>
              </div>
              <div className="h-2 rounded-full bg-neutral-100">
                <div
                  className="h-2 rounded-full bg-neutral-900 transition-all"
                  style={{ width: `${barWidthPercent}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
