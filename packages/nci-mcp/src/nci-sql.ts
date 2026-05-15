import { z } from "zod";

export const nciSqlDescription =
  "Run read-only SQL against the NCI SQLite database (CLI equivalent: `nci sql`). " +
  'Default `format=json` returns a raw JSON array of row objects (not the `{"ok":...,"meta":...}` envelope used by `nci_query`). ' +
  "Use `schema: true` to print the full table DDL instead of running SQL. " +
  "Omitting **max_rows** defaults to **500** (`--max-rows`) so accidental unbounded SELECTs stay rare.";

export const nciSqlInputSchema = z
  .object({
    database: z
      .string()
      .optional()
      .describe(
        "Path to nci.sqlite. Optional: when omitted the `nci` CLI uses its configured database (same as running `nci sql` without `--database`). Pass this only to override for one call. Read `nci://database/active` if you need the resolved path.",
      ),
    schema: z
      .boolean()
      .optional()
      .describe(
        "If true, print the NCI table DDL (CLI: `nci sql --schema`) instead of executing SQL.",
      ),
    command: z
      .string()
      .optional()
      .describe(
        "Single read-only SQL statement (CLI: `-c` / `--command`). Use this for normal SELECTs.",
      ),
    sql_parts: z
      .array(z.string())
      .optional()
      .describe(
        "Extra SQL words appended after `--`. Use only when your SQL starts with `-` and would be misparsed as a flag.",
      ),
    max_rows: z
      .number()
      .int()
      .positive()
      .optional()
      .default(500)
      .describe(
        "Hard cap on rows (CLI: `--max-rows`); fails if the result would exceed it. `nci sql` only, not `nci_query`. Defaults to 500 when omitted.",
      ),
    format: z
      .enum(["json", "jsonl", "plain"])
      .optional()
      .default("json")
      .describe(
        "Row output format. `json` is one big array, `jsonl` is one row per line, `plain` is tab-separated text.",
      ),
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

export type NciSqlInput = z.infer<typeof nciSqlInputSchema>;

export function buildSqlArgv(input: NciSqlInput): string[] {
  const args: string[] = [];
  if (input.database && input.database.length > 0) {
    args.push("--database", input.database);
  }
  args.push("--format", input.format, "sql");
  if (input.schema) {
    args.push("--schema");
  }
  // `nci sql --schema` prints DDL and exits before any SELECT; `--max-rows` is ignored there,
  // so omit it to keep argv aligned with what the CLI actually uses.
  if (!input.schema) {
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
