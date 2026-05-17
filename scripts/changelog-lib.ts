import { readFileSync } from "node:fs";
import { join } from "node:path";

export function readChangelogFile(root: string): string {
  return readFileSync(join(root, "CHANGELOG.md"), "utf8");
}

export function changelogHasReleaseSection(
  markdown: string,
  version: string,
): boolean {
  return markdown.includes(`## [${version}]`);
}

export function verifyChangelogForEngineVersion(
  root: string,
  engineVersion: string,
): void {
  const markdown = readChangelogFile(root);
  if (!changelogHasReleaseSection(markdown, engineVersion)) {
    throw new Error(
      `CHANGELOG.md is missing a release section for ${engineVersion} (expected "## [${engineVersion}]").`,
    );
  }
}
