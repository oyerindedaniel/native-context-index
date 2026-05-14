import { describe, expect, it } from "vitest";
import { buildSqlArgv, nciSqlInputSchema } from "../src/nci-sql";

describe("buildSqlArgv MCP defaults", () => {
  it("passes --max-rows 500 for SELECT when max_rows omitted", () => {
    const parsed = nciSqlInputSchema.parse({
      command: "SELECT 1",
    });
    expect(buildSqlArgv(parsed)).toEqual([
      "--format",
      "json",
      "sql",
      "--max-rows",
      "500",
      "-c",
      "SELECT 1",
    ]);
  });

  it("omits --max-rows for schema-only calls", () => {
    const parsed = nciSqlInputSchema.parse({
      schema: true,
    });
    expect(buildSqlArgv(parsed)).toEqual([
      "--format",
      "json",
      "sql",
      "--schema",
    ]);
  });
});
