import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BenchmarkBarChart } from "../benchmark-bar-chart";

describe("BenchmarkBarChart", () => {
  it("renders metric labels and values", () => {
    render(
      <BenchmarkBarChart
        title="Strategy Latency"
        valueKey="medianDurationMs"
        metrics={[
          {
            groupKey: "baseline",
            count: 8,
            successRate: 0.5,
            medianDurationMs: 1000,
            p90DurationMs: 1800,
            ci95LowMs: 900,
            ci95HighMs: 1200,
          },
        ]}
      />,
    );
    expect(screen.getByText("Strategy Latency")).toBeTruthy();
    expect(screen.getByText("baseline")).toBeTruthy();
    expect(screen.getByText("1000ms")).toBeTruthy();
  });
});
