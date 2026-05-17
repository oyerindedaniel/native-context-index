import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ENGINE_CARGO_REL = [
  "packages",
  "nci-engine",
  "Cargo.toml",
] as const;

export const NPM_PUBLISH_PACKAGES = [
  {
    label: "@nativecontextindex/cli",
    rel: ["packages", "nci", "package.json"],
  },
  {
    label: "@nativecontextindex/mcp",
    rel: ["packages", "nci-mcp", "package.json"],
  },
] as const;

export function repoRootFromImportMeta(metaUrl: string): string {
  return join(dirname(fileURLToPath(metaUrl)), "..");
}

export function readEngineVersion(root: string): string {
  const cargoPath = join(root, ...ENGINE_CARGO_REL);
  const cargoText = readFileSync(cargoPath, "utf8");
  const versionLine = cargoText
    .split(/\r?\n/)
    .find((line) => line.startsWith("version = "));
  if (!versionLine) {
    throw new Error(`no version = in ${cargoPath}`);
  }
  const match = versionLine.match(/^version = "([^"]+)"$/);
  if (!match) {
    throw new Error(`unexpected version line: ${versionLine}`);
  }
  return match[1];
}

export function readPackageVersion(
  root: string,
  packageJsonRel: readonly string[],
): string {
  const pkgPath = join(root, ...packageJsonRel);
  const meta = JSON.parse(readFileSync(pkgPath, "utf8")) as { version: string };
  if (!meta.version) {
    throw new Error(`no version in ${pkgPath}`);
  }
  return meta.version;
}

export function syncPublishVersions(root: string): string {
  const version = readEngineVersion(root);
  for (const entry of NPM_PUBLISH_PACKAGES) {
    const pkgPath = join(root, ...entry.rel);
    const meta = JSON.parse(readFileSync(pkgPath, "utf8")) as {
      version: string;
    };
    meta.version = version;
    writeFileSync(pkgPath, `${JSON.stringify(meta, null, 2)}\n`, "utf8");
  }
  return version;
}

export function verifyPublishVersions(root: string): void {
  const engineVersion = readEngineVersion(root);
  const mismatches: string[] = [];
  for (const entry of NPM_PUBLISH_PACKAGES) {
    const pkgVersion = readPackageVersion(root, entry.rel);
    if (pkgVersion !== engineVersion) {
      mismatches.push(
        `${entry.label} (${entry.rel.join("/")}): ${pkgVersion} != engine ${engineVersion}`,
      );
    }
  }
  if (mismatches.length > 0) {
    throw new Error(
      `publish version mismatch:\n${mismatches.map((line) => `  - ${line}`).join("\n")}\nRun: pnpm release:sync-versions`,
    );
  }
}
