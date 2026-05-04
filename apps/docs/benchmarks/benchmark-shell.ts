import { spawn } from "node:child_process";

export interface ShellCommandResult {
  exitCode: number;
  output: string;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export function runShellCommand(
  command: string,
  commandArguments: string[],
  cwdPath: string,
): Promise<ShellCommandResult> {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const processHandle = spawn(command, commandArguments, {
      cwd: cwdPath,
      shell: false,
      windowsHide: true,
    });

    let stdoutOutput = "";
    let stderrOutput = "";

    processHandle.stdout.on("data", (chunkValue: Buffer) => {
      stdoutOutput += chunkValue.toString("utf8");
    });

    processHandle.stderr.on("data", (chunkValue: Buffer) => {
      stderrOutput += chunkValue.toString("utf8");
    });

    processHandle.on("error", (errorValue) => {
      stderrOutput += errorValue.message;
      resolve({
        exitCode: 1,
        output: `${stdoutOutput}\n${stderrOutput}`.trim(),
        stdout: stdoutOutput,
        stderr: stderrOutput,
        durationMs: Date.now() - startedAt,
      });
    });

    processHandle.on("close", (exitCode) => {
      resolve({
        exitCode: exitCode ?? 1,
        output: `${stdoutOutput}\n${stderrOutput}`.trim(),
        stdout: stdoutOutput,
        stderr: stderrOutput,
        durationMs: Date.now() - startedAt,
      });
    });
  });
}
