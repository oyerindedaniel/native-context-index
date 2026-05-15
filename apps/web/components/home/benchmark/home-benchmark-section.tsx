"use client";

import * as React from "react";
import { BenchmarkVessel } from "@/components/benchmarks/benchmark-vessel";

const PREVIEW_MAX_MS = 1200;

const PREVIEW_COLUMNS = [
  {
    value: 980,
    fillColor: "var(--nci-color-primary)",
    caliperId: "benchmark-vessel-1",
  },
  { value: 1200, fillColor: "#4a4760", caliperId: "benchmark-vessel-2" },
  {
    value: 720,
    fillColor: "var(--nci-color-primary)",
    caliperId: "benchmark-vessel-3",
  },
  { value: 1050, fillColor: "#4a4760", caliperId: "benchmark-vessel-4" },
  {
    value: 540,
    fillColor: "var(--nci-color-primary)",
    caliperId: "benchmark-vessel-5",
  },
  { value: 890, fillColor: "#4a4760", caliperId: "benchmark-vessel-6" },
] as const;

export function HomeBenchmarkSection() {
  const [replayToken, setReplayToken] = React.useState(0);
  const [resetToken, setResetToken] = React.useState(0);

  const handlePlay = React.useCallback(() => {
    setReplayToken((previous) => previous + 1);
  }, []);

  const handleReset = React.useCallback(() => {
    setResetToken((previous) => previous + 1);
  }, []);

  return (
    <section
      id="home-benchmark-section"
      data-caliper-id="home-benchmark-section"
      className="flex min-h-[min(72vh,40rem)] flex-col bg-white"
      aria-label="Benchmark preview"
    >
      <div
        data-caliper-id="benchmark-vessel-dev-controls"
        className="flex shrink-0 justify-center gap-2 border-b border-border/60"
      >
        <button
          type="button"
          onClick={handleReset}
          className="rounded-md border border-border px-3 py-1 text-xs font-semibold text-ink/80 hover:bg-surface"
        >
          Reset
        </button>
        <button
          type="button"
          onClick={handlePlay}
          className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primary/90"
        >
          Play
        </button>
      </div>

      <div
        data-caliper-id="home-benchmark-vessels"
        className="grid min-h-0 flex-1 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6"
      >
        {PREVIEW_COLUMNS.map((column, columnIndex) => (
          <BenchmarkVessel
            key={column.caliperId}
            id={column.caliperId}
            data-caliper-id={column.caliperId}
            value={column.value}
            max={PREVIEW_MAX_MS}
            suffix="ms"
            fillColor={column.fillColor}
            replayToken={replayToken}
            resetToken={resetToken}
            aria-label={`Benchmark column ${columnIndex + 1}`}
            className="h-full w-full border-r border-border/40 last:border-r-0"
          />
        ))}
      </div>
    </section>
  );
}
