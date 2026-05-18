/**
 * Ensures every docs page.mdx exports metadata from the registry (build-time sync).
 * Run: node scripts/sync-docs-metadata.mjs
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(scriptDir, "..");
const registryPath = path.join(webRoot, "lib/docs/registry.ts");

function readDocSlugsFromRegistry() {
  const source = fs.readFileSync(registryPath, "utf8");
  const slugs = [...source.matchAll(/slug:\s*"(\/docs[^"]*)"/g)].map(
    (match) => match[1],
  );
  if (slugs.length === 0) {
    throw new Error("no doc slugs found in registry.ts");
  }
  return slugs;
}

function slugToPageMdx(slug) {
  if (slug === "/docs") {
    return path.join(webRoot, "app/docs/page.mdx");
  }
  const tail = slug.replace(/^\/docs\/?/, "");
  return path.join(webRoot, "app/docs", tail, "page.mdx");
}

const METADATA_IMPORT =
  'import { metadataForDocsPath } from "@/lib/docs/page-metadata";';

function metadataExportLine(slug) {
  return `export const metadata = metadataForDocsPath("${slug}");`;
}

function stripExistingMetadataBlock(source) {
  const importPattern =
    /^import\s+\{\s*metadataForDocsPath\s*\}\s+from\s+["']@\/lib\/docs\/page-metadata["'];\s*\n/gm;
  const exportPattern =
    /^export\s+const\s+metadata\s*=\s*metadataForDocsPath\([^)]+\);\s*\n*/gm;
  return source.replace(importPattern, "").replace(exportPattern, "").trimStart();
}

function findImportBlockEnd(lines) {
  let lineIndex = 0;
  let importEnd = 0;
  while (lineIndex < lines.length) {
    const trimmed = lines[lineIndex].trim();
    if (trimmed === "" || trimmed.startsWith("//")) {
      lineIndex += 1;
      continue;
    }
    if (!trimmed.startsWith("import ")) {
      break;
    }
    do {
      importEnd = lineIndex + 1;
      if (lines[lineIndex].includes(";")) {
        lineIndex = importEnd;
        break;
      }
      lineIndex += 1;
    } while (lineIndex < lines.length);
  }
  return importEnd;
}

function insertMetadataBlock(source, slug) {
  const body = stripExistingMetadataBlock(source);
  const lines = body.split("\n");
  const importEnd = findImportBlockEnd(lines);
  const metadataLines = ["", METADATA_IMPORT, "", metadataExportLine(slug), ""];
  if (importEnd === 0) {
    return [...metadataLines, ...lines].join("\n");
  }
  return [
    ...lines.slice(0, importEnd),
    ...metadataLines,
    ...lines.slice(importEnd),
  ].join("\n");
}

function syncFile(slug) {
  const filePath = slugToPageMdx(slug);
  if (!fs.existsSync(filePath)) {
    console.warn(`skip missing: ${filePath}`);
    return false;
  }
  const original = fs.readFileSync(filePath, "utf8");
  const next = insertMetadataBlock(original, slug);
  if (next !== original) {
    fs.writeFileSync(filePath, next);
    console.log(`synced: ${path.relative(webRoot, filePath)}`);
  }
  return true;
}

if (!fs.existsSync(registryPath)) {
  console.error(`registry not found: ${registryPath}`);
  process.exit(1);
}

const docSlugs = readDocSlugsFromRegistry();
let syncedCount = 0;
for (const slug of docSlugs) {
  if (syncFile(slug)) syncedCount += 1;
}
console.log(`\n${syncedCount}/${docSlugs.length} docs pages synced.`);
