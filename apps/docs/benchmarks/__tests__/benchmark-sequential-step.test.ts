import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  pickNextPilotTask,
  readPilotSequentialStepState,
  syncCompletedIdsWithPilotSet,
  writePilotSequentialStepState,
} from "../benchmark-sequential-step";

describe("benchmark sequential step", () => {
  it("filters completed task ids to current pilot set", () => {
    expect(
      syncCompletedIdsWithPilotSet(["a", "z", "b"], ["a", "b", "c"]),
    ).toEqual(["a", "b"]);
  });

  it("picks next unfinished task in order", () => {
    const tasks = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(pickNextPilotTask(tasks, ["a"])).toEqual({ id: "b" });
    expect(pickNextPilotTask(tasks, ["a", "b", "c"])).toBeUndefined();
  });

  it("round-trips lastBenchmarkRunStem on disk", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "pilot-seq-"));
    const statePath = path.join(dir, "state.json");
    try {
      await writePilotSequentialStepState(statePath, {
        version: 1,
        completedTaskIds: ["task-a"],
        lastBenchmarkRunStem: "ed-20260504-190607-pilot",
      });
      const raw = await readFile(statePath, "utf8");
      expect(raw).toContain("lastBenchmarkRunStem");
      const loaded = await readPilotSequentialStepState(statePath);
      expect(loaded.completedTaskIds).toEqual(["task-a"]);
      expect(loaded.lastBenchmarkRunStem).toBe("ed-20260504-190607-pilot");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
