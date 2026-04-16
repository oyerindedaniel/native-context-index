/**
 * Normalized signature text for stable dedupe keys (overload identity).
 */
export function normalizeSignature(signature: string | undefined): string {
  if (!signature) return "";
  return signature.trim().replace(/\s+/g, " ");
}

/**
 * Crawl / graph dedupe: same declaration only — overloads differ by signature.
 */
export function symbolDedupeKey(
  file: string,
  name: string,
  kind: number,
  signature: string | undefined,
): string {
  return `${file}::${name}::${kind}::${normalizeSignature(signature)}`;
}
