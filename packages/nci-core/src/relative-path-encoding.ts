/**
 * Encodes `path.relative` output when a file is outside the package root so `..` never appears in
 * stored paths (matches nci-engine `encode_outside_package_relative`).
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
