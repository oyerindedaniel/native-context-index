import { describe, expect, it } from "vitest";
import type { PackageEntry } from "@repo/benchmark-contract/benchmark-types";
import { buildSqlCommand } from "../benchmark-sql-validation";

describe("benchmark sql validation", () => {
  it("builds deterministic sql command with package and version filters", () => {
    const packageEntry: PackageEntry = {
      id: "uuid",
      tier: "easy",
      registry: "npm",
      package_name: "uuid",
      package_version: "14.0.0",
      language_family: "typescript",
      declaration_source: "bundled",
      github: {
        owner: "uuidjs",
        repo: "uuid",
        default_branch: "main",
        pinned_sha: "sha",
        license: "MIT",
      },
    };
    const sqlCommand = buildSqlCommand(packageEntry);
    expect(sqlCommand).toContain("WHERE p.name = 'uuid'");
    expect(sqlCommand).toContain("AND p.version = '14.0.0'");
    expect(sqlCommand).toContain("COUNT(s.symbol_id)");
    expect(sqlCommand).toContain("ON p.package_id = s.package_id");
    expect(sqlCommand).toContain("LIMIT 1");
  });
});
