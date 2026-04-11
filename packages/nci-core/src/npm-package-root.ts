/**
 * Normalized npm package root for dependency-stub matching.
 * Returns null when the string is not a bare registry-style package name (relative paths, `node:`,
 * `file:` URLs, Windows drive paths, other `scheme:` forms, etc.).
 */
function isAsciiAlphabetic(character: string): boolean {
  if (character.length === 0) return false;
  const code = character.charCodeAt(0);
  return (code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a);
}

export function npmPackageRoot(specifier: string): string | null {
  const trimmed = specifier.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (trimmed.startsWith(".")) {
    return null;
  }
  if (trimmed.startsWith("/")) {
    return null;
  }
  // Drive letters (`C:\`) and similar: ASCII letter, colon, then path separator.
  if (
    trimmed.length >= 3 &&
    isAsciiAlphabetic(trimmed[0]!) &&
    trimmed[1] === ":" &&
    (trimmed[2] === "/" || trimmed[2] === "\\")
  ) {
    return null;
  }
  // Node built-ins are case-insensitive (`NODE:fs` is still `node:`).
  if (trimmed.length >= 5 && trimmed.slice(0, 5).toLowerCase() === "node:") {
    return null;
  }
  // `file:` specifiers are not npm package names; without this, `file:///…` would parse as root `file:`.
  if (trimmed.length >= 5 && trimmed.slice(0, 5).toLowerCase() === "file:") {
    return null;
  }
  // `http(s)://`, `file://`, and other URI forms are never bare npm package ids.
  if (trimmed.includes("://")) {
    return null;
  }
  // Remaining `letter:...` forms (e.g. unknown `x:` schemes) are not bare package roots.
  if (trimmed.length >= 2 && isAsciiAlphabetic(trimmed[0]!) && trimmed[1] === ":") {
    return null;
  }

  if (trimmed.startsWith("@")) {
    const afterAt = trimmed.slice(1);
    const scopeDelim = afterAt.indexOf("/");
    if (scopeDelim <= 0 || scopeDelim + 1 >= afterAt.length) {
      return null;
    }
    const scopeSegment = afterAt.slice(0, scopeDelim);
    const afterScope = afterAt.slice(scopeDelim + 1);
    const sepInPackage = afterScope.search(/[/\\]/);
    const packageNameEnd = sepInPackage === -1 ? afterScope.length : sepInPackage;
    if (packageNameEnd === 0) {
      return null;
    }
    const packageNameSegment = afterScope.slice(0, packageNameEnd);
    return `@${scopeSegment.toLowerCase()}/${packageNameSegment.toLowerCase()}`;
  }

  const firstSep = trimmed.search(/[/\\]/);
  const rootEnd = firstSep === -1 ? trimmed.length : firstSep;
  if (rootEnd === 0) {
    return null;
  }
  const firstSegment = trimmed.slice(0, rootEnd);
  return firstSegment.toLowerCase();
}
