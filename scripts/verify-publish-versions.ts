import { verifyChangelogForEngineVersion } from "./changelog-lib.ts";
import {
  NPM_PUBLISH_PACKAGES,
  readEngineVersion,
  repoRootFromImportMeta,
  verifyPublishVersions,
} from "./publish-versions-lib.ts";

const root = repoRootFromImportMeta(import.meta.url);
verifyPublishVersions(root);
verifyChangelogForEngineVersion(root, readEngineVersion(root));

const version = readEngineVersion(root);
const targets = NPM_PUBLISH_PACKAGES.map((entry) => entry.label).join(", ");
console.log(
  `publish versions OK: engine and ${targets} are all ${version}; CHANGELOG.md has [${version}]`,
);
