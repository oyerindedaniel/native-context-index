/**
 * Writes skills/nci/PRIMER.md from buildNciFirstAgentPrimerCompact().
 *
 * Do not edit skills/nci/PRIMER.md by hand — change nci-first-agent-primer.ts and run:
 *   pnpm sync:skill-primer
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildNciFirstAgentPrimerCompact } from "../src/nci-first-agent-primer.js";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const outPath = join(scriptDir, "..", "..", "..", "skills", "nci", "PRIMER.md");

writeFileSync(outPath, buildNciFirstAgentPrimerCompact() + "\n", "utf8");
process.stdout.write(`Wrote ${outPath}\n`);
