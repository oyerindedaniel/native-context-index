import { describe, expect, it } from "vitest";
import {
  buildPairwiseJudgeUserPrompt,
  parsePairwiseJudgeResponse,
} from "../benchmark-pairwise-judge";

describe("pairwise judge harness", () => {
  it("parses strict judge JSON", () => {
    const parsed = parsePairwiseJudgeResponse(
      JSON.stringify({
        baseline_correctness: 7,
        baseline_actionability: 6,
        nci_first_correctness: 8,
        nci_first_actionability: 9,
        comparison_notes: "NCI-first cites declarations more tightly.",
        preferred: "nci_first",
        confidence: "high",
      }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    expect(parsed.judge.baselineCorrectness).toBe(7);
    expect(parsed.judge.nciFirstActionability).toBe(9);
    expect(parsed.judge.comparisonNotes).toContain("declarations");
  });

  it("rejects invalid judge JSON", () => {
    const parsed = parsePairwiseJudgeResponse("{");
    expect(parsed.ok).toBe(false);
  });

  it("asks the model for brief comparison_notes in words (no harness truncation)", () => {
    const prompt = buildPairwiseJudgeUserPrompt({
      taskQuestion: "Example?",
      baselineArmText: "{}",
      nciFirstArmText: "{}",
    });
    expect(prompt.toLowerCase()).toContain("400 words");
    expect(prompt.toLowerCase()).toContain("comparison_notes");
  });
});
