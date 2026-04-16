import ts from "typescript";
import type { SymbolNode } from "./types.js";

/**
 * Prefer a parent container when `filePath::parentName` maps to multiple symbol ids (namespace vs
 * function homonyms, namespace vs interface, etc.).
 */
function rankParentKindForMember(
  parentKind: ts.SyntaxKind,
  member: SymbolNode,
): number {
  const memberKind = member.kind;

  // Class instance/static body (homonym namespace + class): prefer Class.
  if (
    memberKind === ts.SyntaxKind.MethodDeclaration ||
    memberKind === ts.SyntaxKind.PropertyDeclaration
  ) {
    if (parentKind === ts.SyntaxKind.ClassDeclaration) return 0;
    if (parentKind === ts.SyntaxKind.InterfaceDeclaration) return 1;
    if (parentKind === ts.SyntaxKind.ModuleDeclaration) return 2;
    if (parentKind === ts.SyntaxKind.FunctionDeclaration) return 3;
    return 5;
  }

  // Nested exported decls under a namespace merge (`merged.Config`): prefer Namespace before homonym Interface.
  if (
    memberKind === ts.SyntaxKind.InterfaceDeclaration ||
    memberKind === ts.SyntaxKind.ClassDeclaration ||
    memberKind === ts.SyntaxKind.EnumDeclaration ||
    memberKind === ts.SyntaxKind.TypeAliasDeclaration
  ) {
    if (parentKind === ts.SyntaxKind.ModuleDeclaration) return 0;
    if (parentKind === ts.SyntaxKind.ClassDeclaration) return 1;
    if (parentKind === ts.SyntaxKind.EnumDeclaration) return 2;
    if (parentKind === ts.SyntaxKind.InterfaceDeclaration) return 3;
    if (parentKind === ts.SyntaxKind.FunctionDeclaration) return 4;
    return 5;
  }

  // Interface/type member shapes (e.g. `MergedBox.width`): prefer Interface over Namespace.
  const typeShapeMember =
    member.symbolSpace === "type" ||
    memberKind === ts.SyntaxKind.PropertySignature ||
    memberKind === ts.SyntaxKind.MethodSignature ||
    memberKind === ts.SyntaxKind.CallSignature ||
    memberKind === ts.SyntaxKind.IndexSignature ||
    memberKind === ts.SyntaxKind.ConstructSignature ||
    memberKind === ts.SyntaxKind.GetAccessor ||
    memberKind === ts.SyntaxKind.SetAccessor;

  if (typeShapeMember) {
    if (parentKind === ts.SyntaxKind.InterfaceDeclaration) return 0;
    if (parentKind === ts.SyntaxKind.TypeAliasDeclaration) return 1;
    if (parentKind === ts.SyntaxKind.ClassDeclaration) return 2;
    if (parentKind === ts.SyntaxKind.ModuleDeclaration) return 3;
    if (parentKind === ts.SyntaxKind.FunctionDeclaration) return 4;
    return 5;
  }

  if (parentKind === ts.SyntaxKind.ModuleDeclaration) return 0;
  if (parentKind === ts.SyntaxKind.ClassDeclaration) return 1;
  if (parentKind === ts.SyntaxKind.EnumDeclaration) return 2;
  if (parentKind === ts.SyntaxKind.FunctionDeclaration) return 3;
  if (parentKind === ts.SyntaxKind.InterfaceDeclaration) return 4;
  return 5;
}

function pickPreferredParentId(
  candidateIds: string[],
  member: SymbolNode,
  idToKind: Map<string, ts.SyntaxKind>,
): string | undefined {
  if (candidateIds.length === 0) return undefined;
  const ranked = [...candidateIds].sort((leftId, rightId) => {
    const leftKind = idToKind.get(leftId) ?? ts.SyntaxKind.Unknown;
    const rightKind = idToKind.get(rightId) ?? ts.SyntaxKind.Unknown;
    const leftRank = rankParentKindForMember(leftKind, member);
    const rightRank = rankParentKindForMember(rightKind, member);
    if (leftRank !== rightRank) return leftRank - rightRank;
    return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
  });
  return ranked[0];
}

/**
 * Sets `parentSymbolId` using the same `filePath::name` → ids and `name → id` maps from id assignment
 * (extended after heritage flatten for synthetic rows). Bucket arrays must be sorted by id string;
 * call after deps resolve so order changes do not affect resolution.
 */
export function assignParentSymbolIds(
  symbols: SymbolNode[],
  fileLocalToIds: Map<string, string[]>,
  nameToId: Map<string, string>,
  idToKind: Map<string, ts.SyntaxKind>,
): void {
  for (const node of symbols) {
    const parentName = parentNameForDottedMember(node.name);
    if (parentName === undefined) continue;
    const fileKey = `${node.filePath}::${parentName}`;
    const fileLocal = fileLocalToIds.get(fileKey);
    if (fileLocal && fileLocal.length > 0) {
      const chosen =
        fileLocal.length === 1
          ? fileLocal[0]!
          : pickPreferredParentId(fileLocal, node, idToKind);
      if (chosen !== undefined) {
        node.parentSymbolId = chosen;
        continue;
      }
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
