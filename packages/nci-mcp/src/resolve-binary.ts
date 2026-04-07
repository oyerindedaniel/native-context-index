import { existsSync } from "node:fs";
import { join } from "node:path";

/** Package root: dist/index.js -> .. */
function packageRoot(): string {
  return join(__dirname, "..");
}

/**
 * Same resolution as [packages/nci/src/bin/nci.ts](packages/nci/src/bin/nci.ts):
 * NCI_BINARY, else vendor/nci or vendor/nci.exe under this package root.
 */
export function resolveNativeBinary(): string {
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
        `Install the \`nci\` npm package (postinstall downloads the binary), set NCI_BINARY, ` +
        `or copy a built nci executable to vendor/nci(.exe) under this package.`,
    );
  }
  return executable;
}
