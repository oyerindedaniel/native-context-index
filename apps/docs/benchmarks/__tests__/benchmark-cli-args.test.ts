import { describe, expect, it } from "vitest";
import {
  flag,
  parseDifficultyList,
  parseEqualsStyleFlags,
  parsePositiveIntFlag,
  splitCommaList,
} from "../benchmark-cli-args";

describe("benchmark-cli-args", () => {
  it("parseEqualsStyleFlags reads only name=value tokens", () => {
    const f = parseEqualsStyleFlags([
      "node",
      "cli.js",
      "--mode=full",
      "--execute=true",
      "--no-equals",
    ]);
    expect(flag(f, "--mode")).toBe("full");
    expect(flag(f, "--execute")).toBe("true");
    expect(flag(f, "--no-equals")).toBeUndefined();
  });

  it("parsePositiveIntFlag", () => {
    expect(parsePositiveIntFlag("3", "--x")).toBe(3);
    expect(parsePositiveIntFlag(undefined, "--x")).toBeUndefined();
    expect(() => parsePositiveIntFlag("0", "--task-limit")).toThrow();
  });

  it("splitCommaList and parseDifficultyList", () => {
    expect(splitCommaList("a, b")).toEqual(["a", "b"]);
    expect(parseDifficultyList("easy,medium")).toEqual(["easy", "medium"]);
    expect(() => parseDifficultyList("nope")).toThrow();
  });
});
