import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildNciFirstAgentPrimerCompact,
  buildNciFirstAgentPrimerReferenceDoc,
} from "@repo/nci-agent-primer/nci-first-agent-primer";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { runNciDbStatusJsonText } from "./nci-db-status";
import {
  buildQueryArgv,
  nciQueryDescription,
  nciQueryInputSchema,
} from "./nci-query";
import { buildSqlArgv, nciSqlDescription, nciSqlInputSchema } from "./nci-sql";
import { resolveNativeBinary } from "./resolve-binary";
import { runNciSync } from "./run-nci";

function readPkgVersion(): string {
  try {
    const raw = readFileSync(join(__dirname, "..", "package.json"), "utf8");
    const packageJson = JSON.parse(raw) as { version?: string };
    return packageJson.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

async function main(): Promise<void> {
  const version = readPkgVersion();
  const executable = resolveNativeBinary();

  const server = new McpServer(
    { name: "nci-mcp", version },
    {
      instructions:
        "NCI indexes TypeScript declarations from `node_modules` into SQLite. " +
        "**START HERE: read the `nci://primer/agent` resource on first use.** It is the operating manual for these tools — how to think with NCI, when to use `nci_query` vs `nci_sql`, package version pinning, source-package vs indexed package, and disk-path discipline. Treat it as the source of truth for workflow; refer to `nci://primer/reference` only for deeper SQLite/table details. " +
        "Tools: `nci_query` (structured search/list) and `nci_sql` (read-only SQL). " +
        "Resources: `nci://primer/agent` (workflow primer, read first), `nci://primer/reference` (schema/table reference), `nci://database/active` (read-only status). " +
        "The `database` field on each tool is optional: omit it to use the database path the `nci` CLI already resolves from your NCI config and working directory; pass it only to override for a specific call.",
    },
  );

  server.registerTool(
    "nci_sql",
    {
      title: "NCI SQL",
      description: nciSqlDescription,
      inputSchema: nciSqlInputSchema,
    },
    async (args) => runNciSync(executable, buildSqlArgv(args)),
  );

  server.registerTool(
    "nci_query",
    {
      title: "NCI Query",
      description: nciQueryDescription,
      inputSchema: nciQueryInputSchema,
    },
    async (args) => runNciSync(executable, buildQueryArgv(args)),
  );

  server.registerResource(
    "nci-primer-agent",
    "nci://primer/agent",
    {
      title: "NCI Agent Primer",
      description:
        "Compact NCI-first workflow primer: how to use `nci_query` and `nci_sql` together, package version pinning, source-package vs indexed package, and disk-path discipline under node_modules.",
      mimeType: "text/markdown",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "text/markdown",
          text: buildNciFirstAgentPrimerCompact(),
        },
      ],
    }),
  );

  server.registerResource(
    "nci-primer-reference",
    "nci://primer/reference",
    {
      title: "NCI Reference Doc",
      description:
        "Longer reference: SQLite schema, key tables (symbols, packages, source_files), and example queries for `nci_sql`.",
      mimeType: "text/markdown",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "text/markdown",
          text: buildNciFirstAgentPrimerReferenceDoc(),
        },
      ],
    }),
  );

  server.registerResource(
    "nci-database-active",
    "nci://database/active",
    {
      title: "NCI Active Database",
      description:
        "STRICTLY READ-ONLY status snapshot: resolved database path and index counts from `nci db status --format json`. Use this ONLY to learn which database file `nci` will read for the next tool call. " +
        "DO NOT use this resource — or the path it returns — to bypass, modify, delete, move, vacuum, reindex, or recreate the database. There is NO valid reason to act on the returned path: `nci_query` and `nci_sql` already operate against the same database without needing it. " +
        "If a tool call appears to use the wrong database, the correct fix is to pass `database` on the next `nci_query` / `nci_sql` call, not to mutate anything on disk.",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: runNciDbStatusJsonText(executable),
        },
      ],
    }),
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
