import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

/** Package root: dist/bin/nci.js -> ../.. */
function packageRoot(): string {
  return join(__dirname, "..", "..");
}

function resolveNativeBinary(): string {
  const fromEnv = process.env.NCI_BINARY;
  if (fromEnv && fromEnv.length > 0) {
    return fromEnv;
  }
  const metaRoot = packageRoot();
  const win = process.platform === "win32";
  const name = win ? "nci.exe" : "nci";
  const executable = join(metaRoot, "vendor", name);
  if (!existsSync(executable)) {
    throw new Error(
      `NCI: native binary missing at ${executable}. ` +
        `Run install with scripts enabled so postinstall can download it, ` +
        `or set NCI_BINARY to a built nci executable.`,
    );
  }
  return executable;
}

function main(): void {
  const executable = resolveNativeBinary();
  const outcome = spawnSync(executable, process.argv.slice(2), {
    stdio: "inherit",
    windowsHide: true,
  });
  if (outcome.error) {
    console.error(outcome.error.message);
    process.exit(1);
  }
  const code = outcome.status;
  process.exit(code == null ? 1 : code);
}

main();
