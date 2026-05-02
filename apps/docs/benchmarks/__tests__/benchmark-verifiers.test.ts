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
});
