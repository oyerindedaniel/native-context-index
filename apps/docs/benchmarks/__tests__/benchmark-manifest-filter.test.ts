import { describe, expect, it } from "vitest";
import type { TaskManifest } from "@repo/benchmark-contract/benchmark-types";
import { filterManifestTasksForRun } from "../benchmark-runner";

const manifest = {
  version: "2026-05-01",
  evaluation_focus: "test",
  tasks: [
    {
      id: "a",
      difficulty: "easy" as const,
      lane: "artifact_only" as const,
      package_id: "x",
      question: "q",
      verifier: {
        type: "json_contract" as const,
        required_substrings: [],
        forbidden_substrings: [],
      },
    },
    {
      id: "b",
      difficulty: "hard" as const,
      lane: "artifact_only" as const,
      package_id: "x",
      question: "q",
      verifier: {
        type: "json_contract" as const,
        required_substrings: [],
        forbidden_substrings: [],
      },
    },
    {
      id: "c",
      difficulty: "medium" as const,
      lane: "artifact_only" as const,
      package_id: "x",
      question: "q",
      verifier: {
        type: "json_contract" as const,
        required_substrings: [],
        forbidden_substrings: [],
      },
    },
  ],
} satisfies TaskManifest;

describe("filterManifestTasksForRun", () => {
  it("returns manifest order for all tasks when no filters", () => {
    expect(filterManifestTasksForRun(manifest, {}).map((t) => t.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("filters by difficulty", () => {
    expect(
      filterManifestTasksForRun(manifest, {
        difficultyFilter: ["easy", "medium"],
      }).map((t) => t.id),
    ).toEqual(["a", "c"]);
  });

  it("filters by task ids (manifest order preserved)", () => {
    expect(
      filterManifestTasksForRun(manifest, {
        taskIds: ["c", "a"],
      }).map((t) => t.id),
    ).toEqual(["a", "c"]);
  });

  it("combines id list and difficulty", () => {
    expect(
      filterManifestTasksForRun(manifest, {
        taskIds: ["b", "c"],
        difficultyFilter: ["medium"],
      }).map((t) => t.id),
    ).toEqual(["c"]);
  });

  it("throws on unknown task id", () => {
    expect(() =>
      filterManifestTasksForRun(manifest, { taskIds: ["nope"] }),
    ).toThrow("Unknown task id");
  });
});
