import { describe, expect, it } from "vitest";
import { runShellCommand } from "../benchmark-shell";

describe("benchmark shell command runner", () => {
  it("passes arguments containing spaces without shell splitting", async () => {
    const expectedSqlArgument =
      "SELECT p.name, COUNT(s.symbol_id) FROM packages p";
    const result = await runShellCommand(
      process.execPath,
      [
        "-e",
        [
          "const expectedSqlArgument = process.argv[1];",
          "const actualSqlArgument = process.argv[2];",
          "if (actualSqlArgument !== expectedSqlArgument) {",
          "  console.error(JSON.stringify(process.argv));",
          "  process.exit(7);",
          "}",
        ].join(" "),
        expectedSqlArgument,
        expectedSqlArgument,
      ],
      process.cwd(),
    );

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
  });
});
