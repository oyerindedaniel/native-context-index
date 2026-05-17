import {
  NPM_PUBLISH_PACKAGES,
  repoRootFromImportMeta,
  syncPublishVersions,
} from "./publish-versions-lib.ts";

const root = repoRootFromImportMeta(import.meta.url);
const version = syncPublishVersions(root);

const targets = NPM_PUBLISH_PACKAGES.map((entry) => entry.label).join(", ");
console.log(
  `synced ${targets} to ${version} (from packages/nci-engine/Cargo.toml)`,
);
