import { describe, expect, it } from "vitest";
import { shuffleArray } from "../benchmark-task-order";

describe("shuffleArray", () => {
  it("is deterministic for the same seed", () => {
    const items = ["a", "b", "c", "d", "e"];
    expect(shuffleArray(items, "pilot-step")).toEqual(
      shuffleArray(items, "pilot-step"),
    );
  });

  it("does not mutate the original array", () => {
    const items = ["a", "b", "c"];
    shuffleArray(items, "seed");
    expect(items).toEqual(["a", "b", "c"]);
  });

  it("returns an equivalent multiset without seed (structure check)", () => {
    const items = ["x", "y", "z"];
    const got = shuffleArray(items);
    expect(got.slice().sort()).toEqual(["x", "y", "z"]);
  });
});
