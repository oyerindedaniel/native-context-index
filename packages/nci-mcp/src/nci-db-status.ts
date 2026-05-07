import { spawnSync } from "node:child_process";

const MAX_BUFFER = 50 * 1024 * 1024;

/**
 * stdout of `nci db status --format json` (CLI envelope with path + index stats), or a plain-text error
 * if the process failed to run or exited non-zero.
 */
export function runNciDbStatusJsonText(executable: string): string {
  const outcome = spawnSync(executable, ["--format", "json", "db", "status"], {
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: MAX_BUFFER,
  });
  if (outcome.error) {
    return `nci spawn failed: ${outcome.error.message}`;
  }
  const stdout = (outcome.stdout ?? "").trimEnd();
  const stderr = (outcome.stderr ?? "").trimEnd();
  if (outcome.status !== 0) {
    return (
      [stderr, stdout].filter(Boolean).join("\n\n") ||
      `nci db status exited with code ${outcome.status}`
    );
  }
  return stdout || "(nci db status produced no stdout)";
}
