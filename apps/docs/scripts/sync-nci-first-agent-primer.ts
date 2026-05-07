import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildNciFirstAgentPrimerReferenceDoc } from "@repo/nci-agent-primer/nci-first-agent-primer";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const outPath = join(scriptDir, "..", "nci-first-agent-primer.md");

writeFileSync(outPath, buildNciFirstAgentPrimerReferenceDoc() + "\n", "utf8");
process.stdout.write(`Wrote ${outPath}\n`);
