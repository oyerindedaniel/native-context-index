import path from "node:path";

export function resolveNciBinaryPath(
  workspaceRoot: string,
  overridePath?: string,
): string {
  if (overridePath && overridePath.trim().length > 0) {
    return overridePath;
  }
  const executableName = process.platform === "win32" ? "nci.exe" : "nci";
  return path.join(workspaceRoot, "target", "debug", executableName);
}
