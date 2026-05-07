import type { SDKToolUseMessage } from "@cursor/sdk";
import type { AgentRuntimeMetrics } from "@repo/benchmark-contract/benchmark-types";
import { describe, expect, it } from "vitest";
import {
  finalizeRuntimeMetrics,
  resolvedToolCallsUnfinished,
} from "../runtime-metrics-finalize";

describe("finalizeRuntimeMetrics", () => {
  it("marks unfinished when a tool_call stays running with no terminal event", () => {
    const runningTool = {
      type: "tool_call",
      status: "running",
      call_id: "call-1",
      name: "grep",
    } as SDKToolUseMessage;
    const metrics: AgentRuntimeMetrics = {
      toolCallsStarted: 1,
      toolCallsCompleted: 0,
      toolCallsErrored: 0,
      toolCallDetails: [runningTool],
    };
    finalizeRuntimeMetrics(metrics);
    expect(metrics.toolCallsErrored).toBe(0);
    expect(metrics.toolCallsUnfinished).toBeGreaterThan(0);
    expect(resolvedToolCallsUnfinished(metrics)).toBe(
      metrics.toolCallsUnfinished,
    );
  });

  it("matches counter formula when details omit running rows", () => {
    const metrics: AgentRuntimeMetrics = {
      toolCallsStarted: 3,
      toolCallsCompleted: 2,
      toolCallsErrored: 0,
    };
    finalizeRuntimeMetrics(metrics);
    expect(metrics.toolCallsUnfinished).toBe(1);
  });
});
