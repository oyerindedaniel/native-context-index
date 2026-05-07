import type { AgentRuntimeMetrics } from "@repo/benchmark-contract/benchmark-types";

/**
 * Best-effort count of tool calls that received `running` but never reached a terminal
 * `completed` / `error` status on the SDK stream (early termination, hang, etc.).
 */
export function resolvedToolCallsUnfinished(
  metrics: AgentRuntimeMetrics,
): number {
  if (typeof metrics.toolCallsUnfinished === "number") {
    return metrics.toolCallsUnfinished;
  }
  const details = metrics.toolCallDetails ?? [];
  const runningFromDetails = details.filter(
    (detail) => detail.status === "running",
  ).length;
  const fromCounters = Math.max(
    0,
    metrics.toolCallsStarted -
      metrics.toolCallsCompleted -
      metrics.toolCallsErrored,
  );
  return Math.max(runningFromDetails, fromCounters);
}

/** Mutates `metrics` and sets `toolCallsUnfinished` at end-of-run. */
export function finalizeRuntimeMetrics(metrics: AgentRuntimeMetrics): void {
  metrics.toolCallsUnfinished = resolvedToolCallsUnfinished(metrics);
}
