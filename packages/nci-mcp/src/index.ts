import { readFileSync } from "node:fs";
import { join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
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

const nciSqlDescription =
  "Run read-only SQL against an NCI SQLite database (same as `nci sql`). " +
  "With `--format json` (default), stdout is a **raw JSON array** of row objects — not wrapped in {\"ok\":...}. " +
  "Use schema: true to print table DDL instead of running SQL.";

const nciSqlInputSchema = z
  .object({
    database: z.string().describe("Path to nci.sqlite"),
    schema: z
      .boolean()
      .optional()
      .describe("If true, print NCI table DDL (nci sql --schema) and exit"),
    command: z
      .string()
      .optional()
      .describe("SQL string for -c/--command (single read-only statement)"),
    sql_parts: z
      .array(z.string())
      .optional()
      .describe("Extra words joined as SQL after command; use when SQL starts with '-' (passed after --)"),
    max_rows: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Cap rows; command fails if more rows exist (--max-rows)"),
    format: z
      .enum(["json", "jsonl", "plain"])
      .optional()
      .default("json")
      .describe("Row output format"),
  })
  .superRefine((sqlInput, refinementCtx) => {
    if (
      !sqlInput.schema &&
      sqlInput.command === undefined &&
      (!sqlInput.sql_parts || sqlInput.sql_parts.length === 0)
    ) {
      refinementCtx.addIssue({
        code: "custom",
        message: "Provide schema: true, command, and/or sql_parts",
        path: ["command"],
      });
    }
  });

const nciQueryDescription =
  "Query the NCI index (same as `nci query`). With --format json, output is the CLI envelope: " +
  '{"ok":true,"data":...} or {"ok":false,...}.';

const nciQueryInputSchema = z.discriminatedUnion("subcommand", [
  z.object({
    subcommand: z.literal("find"),
    database: z.string().describe("Path to nci.sqlite"),
    fts_query: z.string().describe("Full-text query string"),
    limit: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Max results (default 20 if omitted)"),
  }),
  z.object({
    subcommand: z.literal("packages"),
    database: z.string().describe("Path to nci.sqlite"),
  }),
  z.object({
    subcommand: z.literal("symbols"),
    database: z.string().describe("Path to nci.sqlite"),
    name: z.string().describe("Package name"),
    version: z.string().describe("Package version"),
  }),
]);

function buildSqlArgv(input: z.infer<typeof nciSqlInputSchema>): string[] {
  const args: string[] = ["--database", input.database, "--format", input.format, "sql"];
  if (input.schema) {
    args.push("--schema");
  }
  if (input.max_rows != null) {
    args.push("--max-rows", String(input.max_rows));
  }
  if (input.command != null && input.command.length > 0) {
    args.push("-c", input.command);
  }
  if (input.sql_parts && input.sql_parts.length > 0) {
    args.push("--", ...input.sql_parts);
  }
  return args;
}

function buildQueryArgv(input: z.infer<typeof nciQueryInputSchema>): string[] {
  const base = ["--database", input.database, "--format", "json", "query"];
  switch (input.subcommand) {
    case "find": {
      const queryArgv = [...base, "find"];
      if (input.limit != null) {
        queryArgv.push("-n", String(input.limit));
      }
      queryArgv.push(input.fts_query);
      return queryArgv;
    }
    case "packages":
      return [...base, "packages"];
    case "symbols":
      return [...base, "symbols", input.name, input.version];
    default: {
      const _exhaustive: never = input;
      return _exhaustive;
    }
  }
}

async function main(): Promise<void> {
  const version = readPkgVersion();
  const executable = resolveNativeBinary();

  const server = new McpServer(
    { name: "nci-mcp", version },
    {
      instructions:
        "Tools spawn the native `nci` binary. " +
        "Set env NCI_BINARY to the executable if it is not beside this package under vendor/. " +
        "nci_sql JSON output is a raw row array; nci_query JSON output uses the CLI ok/data envelope.",
    },
  );

  server.registerTool(
    "nci_sql",
    {
      description: nciSqlDescription,
      inputSchema: nciSqlInputSchema,
    },
    async (args) => runNciSync(executable, buildSqlArgv(args)),
  );

  server.registerTool(
    "nci_query",
    {
      description: nciQueryDescription,
      inputSchema: nciQueryInputSchema,
    },
    async (args) => runNciSync(executable, buildQueryArgv(args)),
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
