import { randomInt } from "node:crypto";

function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x0100_0193);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state += 0x6d2b79f5;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 0x1_0000_0000;
  };
}

/**
 * Fisher–Yates shuffle. With `seed`, order is stable for the same items + seed;
 * without `seed`, uses `crypto.randomInt` (non-deterministic).
 */
export function shuffleArray<T>(items: readonly T[], seed?: string): T[] {
  const copy = [...items];
  if (copy.length <= 1) {
    return copy;
  }
  if (seed !== undefined) {
    const random = mulberry32(fnv1a32(seed));
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const pick = Math.floor(random() * (index + 1));
      const atIndex = copy[index]!;
      copy[index] = copy[pick]!;
      copy[pick] = atIndex;
    }
  } else {
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const pick = randomInt(0, index + 1);
      const atIndex = copy[index]!;
      copy[index] = copy[pick]!;
      copy[pick] = atIndex;
    }
  }
  return copy;
}
