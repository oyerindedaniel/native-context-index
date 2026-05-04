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
      taskVerifier: {
        type: "json_contract",
        required_substrings: [],
        forbidden_substrings: [],
      },
      nciBinaryPath: "target/debug/nci.exe",
    });
    expect(result.contract.requiresNciCliUsage).toBe(true);
    expect(result.contract.requiresSqlEvidence).toBe(true);
    expect(result.prompt).toContain("target/debug/nci.exe");
    expect(result.prompt).toContain("Authoritative column list:");
    expect(result.prompt).toContain("symbol_dependencies");
    expect(result.prompt).toContain("entry_visibility_json");
    expect(result.prompt).toContain("sql --schema");
    expect(result.prompt).toContain('query find "<phrase>"');
    expect(result.prompt).toContain("__nci_external__");
    expect(result.prompt).toContain('& "<path-to-nci.exe>"');
    expect(result.prompt).toContain("-n` / `--limit`");
    expect(result.prompt).toContain("`--max-rows` is only for `nci sql`");
  });

  it("disables nci usage for baseline strategy", () => {
    const result = buildBenchmarkPrompt({
      strategy: "baseline",
      lane: "artifact_only",
      packageEntry,
      taskQuestion: "Find RequestHandler declaration",
      taskVerifier: {
        type: "json_contract",
        required_substrings: [],
        forbidden_substrings: [],
      },
      nciBinaryPath: "target/debug/nci.exe",
    });
    expect(result.contract.requiresNciCliUsage).toBe(false);
    expect(result.prompt).toContain("Do not run nci commands");
    expect(result.prompt).not.toContain("NCI/query/snippet");
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

  it("uses practical schema for practical verifier tasks", () => {
    const result = buildBenchmarkPrompt({
      strategy: "baseline",
      lane: "architecture_github",
      packageEntry,
      taskQuestion: "Recommend an Express error handling pattern",
      taskVerifier: {
        type: "practical_json_contract",
        required_substrings: ["RequestHandler"],
        forbidden_substrings: ["generic advice"],
      },
      nciBinaryPath: "target/debug/nci.exe",
    });
    expect(result.prompt).toContain('"recommendation"');
    expect(result.prompt).toContain('"tradeoffs"');
    expect(result.prompt).toContain('"implementation_notes"');
    expect(result.prompt).toContain('"evidence"');
    expect(result.prompt).not.toContain('"answer"');
  });
});
