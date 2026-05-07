import { z } from "zod";

/**
 * Optional filter fields shared by `query find` (FTS) and `query symbol` (exact name).
 * Mirror of `nci query find/symbol` CLI flags. All optional.
 */
const symbolFilterShape = {
  package_name: z
    .string()
    .optional()
    .describe(
      "Restrict hits to this indexed npm package name (CLI: `--package`).",
    ),
  package_version: z
    .string()
    .optional()
    .describe(
      "Pin to a specific indexed package version (CLI: `--package-version`). Pair with package_name.",
    ),
  source_package_name: z
    .string()
    .optional()
    .describe(
      "Restrict to declarations authored by this npm package (CLI: `--source-package`). Useful when types live in a different package than the indexed install (e.g. types in @types/foo or in a transitive dep).",
    ),
  kind_name: z
    .string()
    .optional()
    .describe(
      "Filter by AST kind name, e.g. InterfaceDeclaration, FunctionDeclaration, TypeAliasDeclaration (CLI: `--kind`).",
    ),
  file_path_contains: z
    .string()
    .optional()
    .describe(
      "Substring filter against the stored declaration file_path (CLI: `--file`).",
    ),
  public_only: z
    .boolean()
    .optional()
    .describe(
      "When true, hide symbols flagged as internal to the package's export surface (CLI: `--public-only`). Use when you only care about the publicly-exported API.",
    ),
} as const;

const databaseField = z
  .string()
  .optional()
  .describe(
    "Path to nci.sqlite. Optional: when omitted the `nci` CLI uses its configured database (same as running `nci query` without `--database`). Pass this only to override for one call. Read `nci://database/active` if you need the resolved path.",
  );

export const nciQueryInputSchema = z.discriminatedUnion("subcommand", [
  z.object({
    subcommand: z
      .literal("find")
      .describe("Full-text search across indexed symbols."),
    database: databaseField,
    fts_query: z
      .string()
      .describe(
        "FTS5 query string. Dotted names often need to be tokenized (e.g. 'foo bar' instead of 'foo.bar').",
      ),
    limit: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Max hits to return (CLI: `-n` / `--limit`; default 20)."),
    ...symbolFilterShape,
  }),
  z.object({
    subcommand: z
      .literal("symbol")
      .describe("Exact symbol-name lookup with optional filters."),
    database: databaseField,
    name: z.string().describe("Exact symbol name (case-sensitive)."),
    limit: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Max hits to return (CLI: `-n`; default 20)."),
    ...symbolFilterShape,
  }),
  z.object({
    subcommand: z
      .literal("show")
      .describe("Show one symbol row by stable symbols.id."),
    database: databaseField,
    id: z
      .string()
      .describe(
        "Stable symbols.id, including any overload suffix (e.g. `pick#2`).",
      ),
  }),
  z.object({
    subcommand: z
      .literal("snippet")
      .describe("Cite-ready signature snippet for a stable symbols.id."),
    database: databaseField,
    id: z.string().describe("Stable symbols.id."),
  }),
  z.object({
    subcommand: z
      .literal("overloads")
      .describe(
        "List overload siblings (same package_id + name + parent_symbol_id) for one symbols.id.",
      ),
    database: databaseField,
    id: z.string().describe("Stable symbols.id of any sibling in the group."),
  }),
  z.object({
    subcommand: z
      .literal("packages")
      .describe("List all packages currently indexed in the database."),
    database: databaseField,
  }),
  z.object({
    subcommand: z
      .literal("package_versions")
      .describe("List indexed versions for one package name."),
    database: databaseField,
    name: z.string().describe("Indexed npm package name."),
  }),
  z.object({
    subcommand: z
      .literal("package_deps")
      .describe(
        "List declared package dependencies for one indexed package@version.",
      ),
    database: databaseField,
    name: z.string().describe("Indexed npm package name."),
    version: z.string().describe("Indexed package version."),
  }),
  z.object({
    subcommand: z
      .literal("source_packages")
      .describe(
        "List distinct source packages (declaration owners) under one indexed package@version.",
      ),
    database: databaseField,
    name: z.string().describe("Indexed npm package name."),
    version: z.string().describe("Indexed package version."),
  }),
  z.object({
    subcommand: z
      .literal("active_package")
      .describe(
        "Resolve which installed package version(s) are active under the project/workspace node_modules tree.",
      ),
    database: databaseField,
    name: z.string().describe("npm package name to resolve."),
  }),
  z.object({
    subcommand: z
      .literal("symbols")
      .describe(
        "Paginated symbol listing for one indexed package@version (uses --offset/-n, not max-rows).",
      ),
    database: databaseField,
    name: z.string().describe("Indexed npm package name."),
    version: z.string().describe("Indexed package version."),
    limit: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Page size (CLI: `-n`; default 100)."),
    offset: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("Skip this many rows before returning (CLI: `--offset`)."),
  }),
]);

export type NciQueryInput = z.infer<typeof nciQueryInputSchema>;

export const nciQueryDescription =
  "Query the NCI index for symbols, packages, and source packages (CLI equivalent: `nci query <subcommand>`). " +
  "Subcommands: find (FTS), symbol (exact), show, snippet, overloads, packages, package_versions, package_deps, source_packages, active_package, symbols (paginated). " +
  'JSON output uses the CLI envelope: `{"ok":true,"data":...}` on success, `{"ok":false,...}` on error. ' +
  "Use `nci_sql` for relational joins. Use `-n` / `limit` to cap result counts (NOT `max_rows`).";

type SymbolFilterInput = {
  package_name?: string;
  package_version?: string;
  source_package_name?: string;
  kind_name?: string;
  file_path_contains?: string;
  public_only?: boolean;
};

function appendSymbolFilters(argv: string[], input: SymbolFilterInput): void {
  if (input.package_name) {
    argv.push("--package", input.package_name);
  }
  if (input.package_version) {
    argv.push("--package-version", input.package_version);
  }
  if (input.source_package_name) {
    argv.push("--source-package", input.source_package_name);
  }
  if (input.kind_name) {
    argv.push("--kind", input.kind_name);
  }
  if (input.file_path_contains) {
    argv.push("--file", input.file_path_contains);
  }
  if (input.public_only) {
    argv.push("--public-only");
  }
}

function baseArgv(database: string | undefined): string[] {
  const argv: string[] = [];
  if (database && database.length > 0) {
    argv.push("--database", database);
  }
  argv.push("--format", "json", "query");
  return argv;
}

export function buildQueryArgv(input: NciQueryInput): string[] {
  const argv = baseArgv(input.database);
  switch (input.subcommand) {
    case "find": {
      argv.push("find");
      if (input.limit != null) {
        argv.push("-n", String(input.limit));
      }
      appendSymbolFilters(argv, input);
      argv.push(input.fts_query);
      return argv;
    }
    case "symbol": {
      argv.push("symbol", input.name);
      if (input.limit != null) {
        argv.push("-n", String(input.limit));
      }
      appendSymbolFilters(argv, input);
      return argv;
    }
    case "show":
      argv.push("show", input.id);
      return argv;
    case "snippet":
      argv.push("snippet", input.id);
      return argv;
    case "overloads":
      argv.push("overloads", input.id);
      return argv;
    case "packages":
      argv.push("packages");
      return argv;
    case "package_versions":
      argv.push("package-versions", input.name);
      return argv;
    case "package_deps":
      argv.push("package-deps", input.name, input.version);
      return argv;
    case "source_packages":
      argv.push("source-packages", input.name, input.version);
      return argv;
    case "active_package":
      argv.push("active-package", input.name);
      return argv;
    case "symbols": {
      argv.push("symbols", input.name, input.version);
      if (input.limit != null) {
        argv.push("-n", String(input.limit));
      }
      if (input.offset != null && input.offset > 0) {
        argv.push("--offset", String(input.offset));
      }
      return argv;
    }
    default: {
      const _never: never = input;
      return _never;
    }
  }
}
