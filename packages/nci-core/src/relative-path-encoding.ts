import path from "node:path";

/**
 * Encodes `path.relative` output when a file is outside the package root so `..` never appears in
 * stored paths.
 */
export function encodeOutsidePackageRelative(relativePath: string): string {
  let rest = relativePath.replace(/\\/g, "/");
  while (rest.startsWith("./")) {
    rest = rest.slice(2).replace(/^\/+/, "");
  }
  let upCount = 0;
  while (rest.startsWith("../")) {
    upCount++;
    rest = rest.slice(3);
  }
  if (rest === "..") {
    upCount++;
    rest = "";
  }
  const tail = rest.replace(/^\/+/, "");
  const segments = ["__nci_external__"];
  for (let i = 0; i < upCount; i++) {
    segments.push("__up__");
  }
  if (tail.length > 0) {
    segments.push(tail);
  }
  return segments.join("/");
}

/** Package root–relative path (same rules as the Rust engine `make_relative_to_package`). */
export function makePackageRelativePath(
  absPath: string,
  packageDir: string,
): string {
  const normalized = absPath.replace(/\\/g, "/");
  const normalizedDir = packageDir.replace(/\\/g, "/");

  if (normalized.startsWith(normalizedDir)) {
    return normalized.slice(normalizedDir.length + 1);
  }
  const rel = path.relative(packageDir, absPath).replace(/\\/g, "/");
  return encodeOutsidePackageRelative(rel);
}
