"use client";

import React from "react";
import type { FullDataset } from "@repo/benchmark-contract/benchmark-types";

interface BenchmarkGanttChartProps {
  title: string;
  dataset: FullDataset;
}

const difficultyColorMap: Record<"easy" | "medium" | "hard", string> = {
  easy: "bg-emerald-500",
  medium: "bg-amber-500",
  hard: "bg-rose-500",
};

export function BenchmarkGanttChart({
  title,
  dataset,
}: BenchmarkGanttChartProps) {
  const maxDuration = Math.max(
    1,
    ...dataset.ganttSeries.map((entry) => entry.durationMs),
  );

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-5">
      <h3 className="text-lg font-semibold text-neutral-900">{title}</h3>
      <div className="mt-4 flex flex-col gap-3">
        {dataset.ganttSeries.map((entry) => {
          const widthPercent = (entry.durationMs / maxDuration) * 100;
          return (
            <div key={entry.runId} className="space-y-1">
              <div className="flex items-center justify-between text-xs text-neutral-600">
                <span>
                  {entry.taskId} · {entry.strategy} · {entry.runtime}
                </span>
                <span>{Math.round(entry.durationMs)}ms</span>
              </div>
              <div className="h-2 rounded-full bg-neutral-100">
                <div
                  className={`h-2 rounded-full ${difficultyColorMap[entry.difficulty]}`}
                  style={{ width: `${widthPercent}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
