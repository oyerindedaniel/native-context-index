import { describe, expect, it } from "vitest";
import type { PackageEntry } from "@repo/benchmark-contract/benchmark-types";
import {
  buildBenchmarkPrompt,
  parseEvidenceFromResponse,
} from "../benchmark-prompts";

const packageEntry: PackageEntry = {
  id: "express",
  tier: "medium",
  registry: "npm",
  package_name: "express",
  package_version: "5.2.1",
  language_family: "javascript",
  declaration_source: "external_types",
  types_package_name: "@types/express",
  types_package_version: "5.0.6",
  github: {
    owner: "expressjs",
    repo: "express",
    default_branch: "master",
    pinned_sha: "sha",
    license: "MIT",
  },
};

describe("benchmark prompt builder", () => {
  it("requires nci usage for nci_first strategy", () => {
    const result = buildBenchmarkPrompt({
      strategy: "nci_first",
      lane: "artifact_only",
      packageEntry,
      taskQuestion: "Find RequestHandler declaration",
      nciBinaryPath: "target/debug/nci.exe",
    });
    expect(result.contract.requiresNciCliUsage).toBe(true);
    expect(result.contract.requiresSqlEvidence).toBe(true);
    expect(result.prompt).toContain("target/debug/nci.exe");
    expect(result.prompt).toContain('"<nci-path>" query');
    expect(result.prompt).toContain('"<nci-path>" sql');
  });

  it("disables nci usage for baseline strategy", () => {
    const result = buildBenchmarkPrompt({
      strategy: "baseline",
      lane: "artifact_only",
      packageEntry,
      taskQuestion: "Find RequestHandler declaration",
      nciBinaryPath: "target/debug/nci.exe",
    });
    expect(result.contract.requiresNciCliUsage).toBe(false);
    expect(result.prompt).toContain("Do not run nci commands");
  });

  it("extracts evidence from valid json response", () => {
    const evidence = parseEvidenceFromResponse(
      JSON.stringify({
        declaration_paths: ["node_modules/@types/express/index.d.ts"],
        nci_query_evidence: "query output",
        nci_sql_evidence: "sql output",
      }),
    );
    expect(evidence.declarationPaths).toHaveLength(1);
    expect(evidence.nciQuerySnippet).toBe("query output");
    expect(evidence.nciSqlSnippet).toBe("sql output");
  });
});
