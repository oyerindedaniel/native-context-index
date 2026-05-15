import { describe, expect, it } from "vitest";
import {
  buildFlagCopyText,
  type FlagCopyInput,
} from "@/components/docs/widgets/flag-table-copy";

function flag(partial: FlagCopyInput): FlagCopyInput {
  return partial;
}

describe("buildFlagCopyText", () => {
  it("copies global flags as nci --flag with placeholder", () => {
    expect(
      buildFlagCopyText(
        flag({
          long: "--database",
          valuePlaceholder: "<PATH>",
          subcommand: "global",
        }),
      ),
    ).toBe("nci --database <PATH>");
  });

  it("copies top-level flags when subcommand is omitted", () => {
    expect(
      buildFlagCopyText(
        flag({
          long: "--format",
          valuePlaceholder: "<plain|json|jsonl>",
        }),
      ),
    ).toBe("nci --format <plain|json|jsonl>");
  });

  it("chains nested subcommands before the flag", () => {
    expect(
      buildFlagCopyText(
        flag({
          long: "--limit",
          valuePlaceholder: "<N>",
          subcommand: "query find",
        }),
      ),
    ).toBe("nci query find --limit <N>");
  });

  it("chains db subcommands", () => {
    expect(
      buildFlagCopyText(
        flag({
          long: "--check",
          subcommand: "db status",
        }),
      ),
    ).toBe("nci db status --check");
  });

  it("prefers long flag name and includes short-only when long is absent", () => {
    expect(
      buildFlagCopyText(
        flag({
          short: "-y",
          long: "--defaults",
          subcommand: "init",
        }),
      ),
    ).toBe("nci init --defaults");
  });

  it("uses copyText override when provided", () => {
    expect(
      buildFlagCopyText(
        flag({
          long: "--limit",
          subcommand: "query find",
          copyText: "nci query find -n 50",
        }),
      ),
    ).toBe("nci query find -n 50");
  });
});
