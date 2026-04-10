import type { SymbolNode } from "./types.js";

/**
 * Sets `parentSymbolId` using the same `filePath::name` → ids and `name → id` maps from id assignment
 * (extended after heritage flatten for synthetic rows). Bucket arrays must be sorted by id string;
 * call after deps resolve so order changes do not affect resolution.
 */
export function assignParentSymbolIds(
  symbols: SymbolNode[],
  fileLocalToIds: Map<string, string[]>,
  nameToId: Map<string, string>
): void {
  for (const node of symbols) {
    const parentName = parentNameForDottedMember(node.name);
    if (parentName === undefined) continue;
    const fileKey = `${node.filePath}::${parentName}`;
    const fileLocal = fileLocalToIds.get(fileKey);
    if (fileLocal && fileLocal.length > 0) {
      node.parentSymbolId = fileLocal[0]!;
      continue;
    }
    const pkgId = nameToId.get(parentName);
    if (pkgId !== undefined) {
      node.parentSymbolId = pkgId;
    }
  }
}

/**
 * Lexical parent symbol name for dotted member `name` strings (Rust `parent_name_for_dotted_member`).
 * `Foo.bar` → `Foo`; `A.B.C` → `A.B`; `A.prototype.b` → `A`.
 */
export function parentNameForDottedMember(name: string): string | undefined {
  if (!name.includes(".")) {
    return undefined;
  }
  if (name.includes(".prototype.")) {
    const segments = name.split(".");
    if (segments.includes("prototype")) {
      const prototypeIndex = segments.indexOf("prototype");
      const parentPrefix = segments.slice(0, prototypeIndex).join(".");
      return parentPrefix.length > 0 ? parentPrefix : undefined;
    }
  }
  const lastDot = name.lastIndexOf(".");
  if (lastDot <= 0) {
    return undefined;
  }
  return name.slice(0, lastDot);
}
