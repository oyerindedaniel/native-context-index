import type { BenchmarkDifficulty } from "@repo/benchmark-contract/benchmark-types";

/** Parses `--name=value` tokens only (CLI contract for this runner). */
export function parseEqualsStyleFlags(
  argv: string[],
): ReadonlyMap<string, string> {
  const map = new Map<string, string>();
  for (const token of argv) {
    if (!token.startsWith("--")) continue;
    const eq = token.indexOf("=");
    if (eq <= 2) continue;
    map.set(token.slice(0, eq), token.slice(eq + 1));
  }
  return map;
}

export function flag(
  flags: ReadonlyMap<string, string>,
  name: string,
): string | undefined {
  return flags.get(name);
}

export function parsePositiveIntFlag(
  raw: string | undefined,
  flagName: string,
): number | undefined {
  if (raw === undefined) {
    return undefined;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error(
      `Invalid ${flagName}=${raw} (expected a positive integer).`,
    );
  }
  return parsed;
}

export function splitCommaList(raw: string | undefined): string[] | undefined {
  if (raw === undefined || raw.trim() === "") {
    return undefined;
  }
  const parts = raw
    .split(",")
    .map((segment) => segment.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : undefined;
}

export function parseDifficultyList(
  raw: string | undefined,
): BenchmarkDifficulty[] | undefined {
  const parts = splitCommaList(raw);
  if (parts === undefined) {
    return undefined;
  }
  const allowed = new Set<string>(["easy", "medium", "hard"]);
  for (const part of parts) {
    if (!allowed.has(part)) {
      throw new Error(
        `Invalid --difficulty=${raw} (each entry must be easy, medium, or hard).`,
      );
    }
  }
  return parts as BenchmarkDifficulty[];
}
