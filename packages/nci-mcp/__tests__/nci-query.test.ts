import { describe, expect, it } from "vitest";
import { nciQueryInputSchema } from "../src/nci-query";

const stableId = "pkg@1.0.0::SomeSymbol";

describe("nci-query id alias canonicalization", () => {
  it.each([
    ["symbol_id", { symbol_id: stableId }],
    ["symbolId", { symbolId: stableId }],
    ["symbolID", { symbolID: stableId }],
  ] as const)("rewrites %s to id for snippet", (_label, aliasFields) => {
    const parsed = nciQueryInputSchema.safeParse({
      subcommand: "snippet",
      ...aliasFields,
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data).toMatchObject({
      subcommand: "snippet",
      id: stableId,
    });
  });

  it("accepts aliases on show and overloads", () => {
    const show = nciQueryInputSchema.safeParse({
      subcommand: "show",
      symbol_id: stableId,
    });
    expect(show.success).toBe(true);
    if (show.success) {
      expect(show.data).toMatchObject({ subcommand: "show", id: stableId });
    }

    const overloads = nciQueryInputSchema.safeParse({
      subcommand: "overloads",
      symbolId: stableId,
    });
    expect(overloads.success).toBe(true);
    if (overloads.success) {
      expect(overloads.data).toMatchObject({
        subcommand: "overloads",
        id: stableId,
      });
    }
  });

  it("rejects unknown alias sym_id (does not map to id)", () => {
    const parsed = nciQueryInputSchema.safeParse({
      subcommand: "snippet",
      sym_id: stableId,
    });
    expect(parsed.success).toBe(false);
  });
});
