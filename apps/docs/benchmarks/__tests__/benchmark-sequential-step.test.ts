import { describe, expect, it } from "vitest";
import {
  pickNextPilotTask,
  syncCompletedIdsWithPilotSet,
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
});
