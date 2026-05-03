import { describe, expect, it } from "vitest";
import type {
  PromptContract,
  TaskVerifier,
} from "@repo/benchmark-contract/benchmark-types";
import { verifyResponse } from "../benchmark-verifiers";

const baselineContract: PromptContract = {
  strategy: "baseline",
  lane: "artifact_only",
  requiresNciCliUsage: false,
  requiresSqlEvidence: false,
  requiresGithubEvidence: false,
};

describe("benchmark verifiers", () => {
  it("passes contains_all verifier when required values are present", () => {
    const verifier: TaskVerifier = {
      type: "contains_all",
      required_substrings: ["requesthandler", ".d.ts"],
      forbidden_substrings: ["guess"],
    };
    const result = verifyResponse(
      "RequestHandler is in index.d.ts",
      verifier,
      baselineContract,
    );
    expect(result.isCorrect).toBe(true);
  });

  it("fails json_contract when nci evidence is missing", () => {
    const verifier: TaskVerifier = {
      type: "json_contract",
      required_substrings: [],
      forbidden_substrings: [],
    };
    const result = verifyResponse(
      JSON.stringify({
        declaration_paths: ["node_modules/example/index.d.ts"],
      }),
      verifier,
      {
        ...baselineContract,
        strategy: "nci_first",
        requiresNciCliUsage: true,
        requiresSqlEvidence: true,
      },
    );
    expect(result.isCorrect).toBe(false);
    expect(result.missingSubstrings).toContain("nci_query_evidence");
    expect(result.missingSubstrings).toContain("nci_sql_evidence");
  });

  it("fails invalid json for json_contract verifier", () => {
    const verifier: TaskVerifier = {
      type: "json_contract",
      required_substrings: [],
      forbidden_substrings: [],
    };
    const result = verifyResponse("not-json", verifier, baselineContract);
    expect(result.isCorrect).toBe(false);
    expect(result.missingSubstrings).toContain("valid_json");
  });

  it("enforces practical json structure and substring gates", () => {
    const verifier: TaskVerifier = {
      type: "practical_json_contract",
      required_substrings: ["RequestHandler"],
      forbidden_substrings: ["hand-wave"],
    };
    const result = verifyResponse(
      JSON.stringify({
        recommendation:
          "Use async handlers with centralized middleware around RequestHandler.",
        tradeoffs: "Tradeoffs include explicit error mapping.",
        implementation_notes: "Wrap route handlers and keep middleware typed.",
        declaration_paths: ["node_modules/@types/express/index.d.ts"],
        evidence: "Declaration evidence comes from RequestHandler middleware.",
        nci_query_evidence: "",
        nci_sql_evidence: "",
        github_evidence: "",
      }),
      verifier,
      baselineContract,
    );
    expect(result.isCorrect).toBe(true);
  });

  it("fails practical json when required fields are empty", () => {
    const verifier: TaskVerifier = {
      type: "practical_json_contract",
      required_substrings: [],
      forbidden_substrings: [],
    };
    const result = verifyResponse(
      JSON.stringify({
        recommendation: "",
        tradeoffs: "Tradeoffs around cache freshness.",
        implementation_notes: "",
        declaration_paths: [],
        evidence: "",
        nci_query_evidence: "",
        nci_sql_evidence: "",
        github_evidence: "",
      }),
      verifier,
      baselineContract,
    );
    expect(result.isCorrect).toBe(false);
    expect(result.missingSubstrings).toContain("recommendation");
    expect(result.missingSubstrings).toContain("implementation_notes");
    expect(result.missingSubstrings).toContain("declaration_paths");
    expect(result.missingSubstrings).toContain("evidence");
  });
});
