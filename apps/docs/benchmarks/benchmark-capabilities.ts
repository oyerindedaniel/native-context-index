import { Cursor } from "@cursor/sdk";
import type { CapabilityMatrix } from "@repo/benchmark-contract/benchmark-types";
import { runShellCommand } from "./benchmark-shell";

export async function detectCapabilities(
  workspaceRoot: string,
  nciBinaryPath: string,
): Promise<CapabilityMatrix> {
  const nciVersionResult = await runShellCommand(
    nciBinaryPath,
    ["--version"],
    workspaceRoot,
  );

  const apiKeyValue = process.env.CURSOR_API_KEY;
  const hasCursorApiKey =
    typeof apiKeyValue === "string" && apiKeyValue.length > 0;

  let connectedRepositoriesCheck:
    | CapabilityMatrix["cloud"]["connectedRepositories"]
    | undefined;

  if (hasCursorApiKey) {
    try {
      const repositories = await Cursor.repositories.list({
        apiKey: apiKeyValue,
      });
      connectedRepositoriesCheck = {
        available: repositories.length > 0,
        detail:
          repositories.length > 0
            ? `${repositories.length} repositories connected`
            : "no connected repositories found",
      };
    } catch (errorValue) {
      const errorMessage =
        errorValue instanceof Error ? errorValue.message : String(errorValue);
      connectedRepositoriesCheck = {
        available: false,
        detail: `repository check failed: ${errorMessage}`,
      };
    }
  }

  return {
    cursorApiKey: {
      available: hasCursorApiKey,
      detail: hasCursorApiKey
        ? "CURSOR_API_KEY is present"
        : "CURSOR_API_KEY is missing",
    },
    local: {
      nciCli: {
        available: nciVersionResult.exitCode === 0,
        detail:
          nciVersionResult.exitCode === 0
            ? `nci binary available at ${nciBinaryPath}`
            : `nci check failed at ${nciBinaryPath}: ${nciVersionResult.output}`,
      },
    },
    cloud: {
      connectedRepositories: connectedRepositoriesCheck,
    },
  };
}
