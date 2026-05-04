import type {
  PromptContract,
  SingleVerifierResult,
  TaskVerifier,
} from "@repo/benchmark-contract/benchmark-types";

function includesCaseInsensitive(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function requireStringField(
  parsedJson: Record<string, unknown>,
  fieldName: string,
  missingSubstrings: string[],
): void {
  if (!isNonEmptyString(parsedJson[fieldName])) {
    missingSubstrings.push(fieldName);
  }
}

function extractFirstJsonObject(responseText: string): string | undefined {
  const startIndex = responseText.indexOf("{");
  if (startIndex < 0) {
    return undefined;
  }
  let depth = 0;
  let isInsideString = false;
  let isEscaping = false;
  for (let index = startIndex; index < responseText.length; index += 1) {
    const currentCharacter = responseText[index];
    if (isEscaping) {
      isEscaping = false;
      continue;
    }
    if (currentCharacter === "\\") {
      isEscaping = true;
      continue;
    }
    if (currentCharacter === '"') {
      isInsideString = !isInsideString;
      continue;
    }
    if (isInsideString) {
      continue;
    }
    if (currentCharacter === "{") {
      depth += 1;
      continue;
    }
    if (currentCharacter === "}") {
      depth -= 1;
      if (depth === 0) {
        return responseText.slice(startIndex, index + 1);
      }
    }
  }
  return undefined;
}

export function normalizeResponseJsonText(responseText: string): string {
  if (responseText.trim().length === 0) {
    return responseText;
  }
  try {
    JSON.parse(responseText);
    return responseText;
  } catch {
    const extractedJson = extractFirstJsonObject(responseText);
    if (extractedJson === undefined) {
      return responseText;
    }
    try {
      JSON.parse(extractedJson);
      return extractedJson;
    } catch {
      return responseText;
    }
  }
}

export function verifyResponse(
  responseText: string,
  verifier: TaskVerifier,
  promptContract: PromptContract,
): SingleVerifierResult {
  const normalizedResponseText = normalizeResponseJsonText(responseText);
  const missingSubstrings: string[] = [];
  const forbiddenMatches: string[] = [];

  for (const requiredSubstring of verifier.required_substrings) {
    if (!includesCaseInsensitive(normalizedResponseText, requiredSubstring)) {
      missingSubstrings.push(requiredSubstring);
    }
  }

  for (const forbiddenSubstring of verifier.forbidden_substrings) {
    if (includesCaseInsensitive(normalizedResponseText, forbiddenSubstring)) {
      forbiddenMatches.push(forbiddenSubstring);
    }
  }

  if (
    verifier.type === "json_contract" ||
    verifier.type === "practical_json_contract"
  ) {
    try {
      const parsedJson = JSON.parse(normalizedResponseText) as Record<
        string,
        unknown
      > & {
        declaration_paths?: unknown;
        nci_query_evidence?: unknown;
        nci_sql_evidence?: unknown;
        github_evidence?: unknown;
      };
      const declarationPaths = parsedJson.declaration_paths;
      if (!Array.isArray(declarationPaths) || declarationPaths.length === 0) {
        missingSubstrings.push("declaration_paths");
      }
      if (
        promptContract.requiresNciCliUsage &&
        typeof parsedJson.nci_query_evidence !== "string"
      ) {
        missingSubstrings.push("nci_query_evidence");
      }
      if (
        promptContract.requiresSqlEvidence &&
        typeof parsedJson.nci_sql_evidence !== "string"
      ) {
        missingSubstrings.push("nci_sql_evidence");
      }
      if (
        promptContract.requiresGithubEvidence &&
        typeof parsedJson.github_evidence !== "string"
      ) {
        missingSubstrings.push("github_evidence");
      }
      if (verifier.type === "practical_json_contract") {
        requireStringField(parsedJson, "recommendation", missingSubstrings);
        requireStringField(parsedJson, "tradeoffs", missingSubstrings);
        requireStringField(
          parsedJson,
          "implementation_notes",
          missingSubstrings,
        );
        requireStringField(parsedJson, "evidence", missingSubstrings);
      }
    } catch {
      missingSubstrings.push("valid_json");
    }
  }

  return {
    isCorrect: missingSubstrings.length === 0 && forbiddenMatches.length === 0,
    missingSubstrings,
    forbiddenMatches,
  };
}
