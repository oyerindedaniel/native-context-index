import { describe, it, expect } from "vitest";
import { parentNameForDottedMember } from "./parent-symbol.js";

describe("parentNameForDottedMember", () => {
  it("returns undefined when there is no dot in the name", () => {
    expect(parentNameForDottedMember("Foo")).toBeUndefined();
  });

  it("uses the segment before the last dot for nested paths", () => {
    expect(parentNameForDottedMember("A.B.c")).toBe("A.B");
  });

  // Matches graph parentSymbolId: prefix before `.prototype.`, not `A.prototype`.
  it("maps A.prototype.b to parent A", () => {
    expect(parentNameForDottedMember("A.prototype.b")).toBe("A");
  });

  it("maps Outer.Inner.prototype.member to parent Outer.Inner (qualified class before prototype)", () => {
    expect(parentNameForDottedMember("Outer.Inner.prototype.slot")).toBe(
      "Outer.Inner",
    );
  });

  it("maps nested namespace-style paths before prototype", () => {
    expect(parentNameForDottedMember("A.B.prototype.c")).toBe("A.B");
  });
});
