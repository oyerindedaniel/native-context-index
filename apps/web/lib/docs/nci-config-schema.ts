export type DependencySection = "dependencies" | "dev_dependencies";

export type PackageScopeSentinel = "all_installed";

export type PackageScope = DependencySection[] | PackageScopeSentinel;

export interface PackageFiltersConfig {
  include?: string[];
  exclude?: string[];
}

export type BannerMode = "auto" | "on" | "off";
export type ProgressMode = "auto" | "on" | "off";

export interface NciConfigFile {
  database?: string;
  project_root?: string;
  format?: string;
  banner?: BannerMode;
  progress?: ProgressMode;
  max_hops?: number;
  packages?: PackageFiltersConfig;
  package_scope?: PackageScope;
  dependency_stub_packages?: string[];
  workspaces?: string[];
  index_root_workspace?: boolean;
}

export type ValidationLevel = "error" | "warning" | "info";

export interface ValidationIssue {
  fieldPath: string;
  message: string;
  level: ValidationLevel;
}

export function validateConfig(config: NciConfigFile): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (
    Array.isArray(config.package_scope) &&
    config.package_scope.length === 0
  ) {
    issues.push({
      fieldPath: "package_scope",
      level: "error",
      message:
        'package_scope must list at least one section ("dependencies" or "dev_dependencies"), or use the "all_installed" sentinel.',
    });
  }

  if (
    typeof config.max_hops === "number" &&
    Number.isFinite(config.max_hops) &&
    config.max_hops < -1
  ) {
    issues.push({
      fieldPath: "max_hops",
      level: "error",
      message: "max_hops must be 0+, or -1 for unlimited.",
    });
  }

  if (
    config.index_root_workspace === false &&
    (!config.workspaces || config.workspaces.length === 0)
  ) {
    issues.push({
      fieldPath: "index_root_workspace",
      level: "error",
      message:
        "Disabling the root workspace requires at least one entry in workspaces, otherwise no install roots remain.",
    });
  }

  return issues;
}

export function stripUndefined<T extends object>(value: T): T {
  const result: Record<string, unknown> = {};
  Object.entries(value as Record<string, unknown>).forEach(
    ([key, candidate]) => {
      if (candidate === undefined || candidate === null) {
        return;
      }
      if (Array.isArray(candidate) && candidate.length === 0) {
        return;
      }
      if (
        typeof candidate === "object" &&
        !Array.isArray(candidate) &&
        Object.keys(candidate as Record<string, unknown>).length === 0
      ) {
        return;
      }
      result[key] = candidate;
    },
  );
  return result as T;
}
