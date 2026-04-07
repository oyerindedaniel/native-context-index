import { spawnSync } from "node:child_process";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

const MAX_BUFFER = 50 * 1024 * 1024;

export function runNciSync(executable: string, args: string[]): CallToolResult {
  const outcome = spawnSync(executable, args, {
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: MAX_BUFFER,
  });
  if (outcome.error) {
    return {
      content: [
        {
          type: "text",
          text: `nci spawn failed: ${outcome.error.message}`,
        },
      ],
      isError: true,
    };
  }
  const status = outcome.status;
  const stdout = outcome.stdout ?? "";
  const stderr = outcome.stderr ?? "";
  if (status !== 0 && status !== null) {
    const parts = [stderr.trimEnd(), stdout.trimEnd()].filter(Boolean);
    return {
      content: [
        {
          type: "text",
          text: parts.join("\n\n") || `nci exited with code ${status}`,
        },
      ],
      isError: true,
    };
  }
  if (status === null) {
    return {
      content: [
        {
          type: "text",
          text: [stderr.trimEnd(), stdout.trimEnd(), "nci process was interrupted (null exit code)"]
            .filter(Boolean)
            .join("\n\n"),
        },
      ],
      isError: true,
    };
  }
  const text = stdout.trimEnd() || "(nci produced no stdout)";
  return {
    content: [{ type: "text", text }],
  };
}
