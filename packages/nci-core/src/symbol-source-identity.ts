/**
 * Derives display and filter fields for a symbol from the indexed package name/version and the
 * package-relative storage path: which npm package owns the declaration, optional semver when the
 * declaration belongs to that indexed package, and the file path inside that owning package.
 * For paths under `__nci_external__/…`, the owning package is taken from the first
 * `node_modules/<pkg>/` segment; dependency semver is not inferred from parent folder names.
 */
export interface SymbolSourceRow {
  sourcePackageName: string;
  /** Indexed-package semver, or `null` for external dependency declarations. */
  sourcePackageVersion: string | null;
  sourceFilePath: string;
}

export function symbolSourceRowFromEncodedPath(
  indexedPackageName: string,
  indexedPackageVersion: string,
  encodedFilePath: string,
): SymbolSourceRow {
  if (!encodedFilePath.startsWith("__nci_external__/")) {
    return {
      sourcePackageName: indexedPackageName,
      sourcePackageVersion: indexedPackageVersion,
      sourceFilePath: encodedFilePath,
    };
  }

  const segments = encodedFilePath.split("/");
  const nodeModulesIndex = segments.indexOf("node_modules");
  if (nodeModulesIndex === -1) {
    return {
      sourcePackageName: indexedPackageName,
      sourcePackageVersion: indexedPackageVersion,
      sourceFilePath: encodedFilePath,
    };
  }

  const firstPackageIndex = nodeModulesIndex + 1;
  const firstPackageSegment = segments[firstPackageIndex];
  if (firstPackageSegment === undefined) {
    return {
      sourcePackageName: indexedPackageName,
      sourcePackageVersion: indexedPackageVersion,
      sourceFilePath: encodedFilePath,
    };
  }

  let resolvedSourcePackage: string;
  let pathStartIndex: number;
  if (firstPackageSegment.startsWith("@")) {
    const secondScopeSegment = segments[firstPackageIndex + 1];
    if (secondScopeSegment === undefined) {
      return {
        sourcePackageName: indexedPackageName,
        sourcePackageVersion: indexedPackageVersion,
        sourceFilePath: encodedFilePath,
      };
    }
    resolvedSourcePackage = `${firstPackageSegment}/${secondScopeSegment}`;
    pathStartIndex = firstPackageIndex + 2;
  } else {
    resolvedSourcePackage = firstPackageSegment;
    pathStartIndex = firstPackageIndex + 1;
  }

  const tail = segments.slice(pathStartIndex).join("/");
  const relativeWithinDependency = tail.length > 0 ? tail : encodedFilePath;

  return {
    sourcePackageName: resolvedSourcePackage,
    sourcePackageVersion: null,
    sourceFilePath: relativeWithinDependency,
  };
}
