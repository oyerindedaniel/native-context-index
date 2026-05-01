import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BenchmarkGanttChart } from "../benchmark-gantt-chart";

describe("BenchmarkGanttChart", () => {
  it("renders gantt bars for each run entry", () => {
    render(
      <BenchmarkGanttChart
        title="Run Timeline"
        dataset={{
          generatedAtIso: new Date().toISOString(),
          protocolVersion: "test",
          totals: {
            runCount: 1,
            skippedCount: 0,
            successCount: 1,
            failureCount: 0,
            successRate: 1,
          },
          byStrategy: [],
          byDifficulty: [],
          byTask: [],
          byPackage: [],
          ganttSeries: [
            {
              runId: "run-1",
              taskId: "task-id",
              strategy: "nci_first",
              runtime: "local",
              durationMs: 1200,
              difficulty: "easy",
            },
          ],
        }}
      />,
    );
    expect(screen.getByText("Run Timeline")).toBeTruthy();
    expect(screen.getByText("task-id · nci_first · local")).toBeTruthy();
    expect(screen.getByText("1200ms")).toBeTruthy();
  });
});
