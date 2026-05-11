import type { FlagDescriptor } from "@/components/docs/widgets/flag-table";

export const cliSubcommands = [
  "global",
  "init",
  "index",
  "query find",
  "query symbol",
  "query evidence",
  "query symbols",
  "db status",
  "db clear",
  "db remove",
  "db remove-glob",
  "db destroy",
  "sql",
  "completions",
] as const;

export const cliFlags: FlagDescriptor[] = [
  {
    id: "global-database",
    long: "--database",
    valuePlaceholder: "<PATH>",
    subcommand: "global",
    description:
      "Path to nci.sqlite. Overrides `database` in `nci.config.json`. Available on every subcommand.",
  },
  {
    id: "global-format",
    long: "--format",
    valuePlaceholder: "<plain|json|jsonl>",
    subcommand: "global",
    description:
      "Output format for commands that support it. Overrides `format` in `nci.config.json`.",
  },
  {
    id: "init-defaults",
    short: "-y",
    long: "--defaults",
    subcommand: "init",
    description:
      "Accept all defaults — write `nci.config.json` non-interactively.",
  },
  {
    id: "index-project-root",
    short: "-r",
    long: "--project-root",
    valuePlaceholder: "<DIR>",
    subcommand: "index",
    description:
      "Index this directory instead of the one in `nci.config.json`. Defaults to `.`.",
  },
  {
    id: "index-max-hops",
    short: "-m",
    long: "--max-hops",
    valuePlaceholder: "<N>",
    subcommand: "index",
    description:
      "Re-export resolution depth. `0` = entry only. `-1` = unlimited.",
  },
  {
    id: "index-package",
    short: "-p",
    long: "--package",
    valuePlaceholder: "<GLOB>",
    subcommand: "index",
    description:
      "Repeatable. Restrict the run to packages matching the glob, on top of `package_scope`.",
  },
  {
    id: "index-dependency-stub",
    short: "-s",
    long: "--dependency-stub-package",
    valuePlaceholder: "<PKG>",
    subcommand: "index",
    description:
      "Repeatable. Treat this package's dependencies as `npm::…` stubs only — do not parse them. Unioned with `dependency_stub_packages` from `nci.config.json`.",
  },
  {
    id: "index-package-scope",
    long: "--package-scope",
    valuePlaceholder: "<dependencies|dev-dependencies|all-installed>",
    subcommand: "index",
    description:
      "Comma-separated or repeated. `package.json` sections whose names gate indexing. `all-installed` (alone) disables the gate. Overrides `package_scope` in `nci.config.json`.",
  },
  {
    id: "index-skip-root-workspace",
    long: "--skip-root-workspace",
    subcommand: "index",
    description:
      "Skip `<project_root>/node_modules`. Conflicts with `--include-root-workspace`.",
  },
  {
    id: "index-include-root-workspace",
    long: "--include-root-workspace",
    subcommand: "index",
    description:
      "Force-include `<project_root>/node_modules`. Conflicts with `--skip-root-workspace`.",
  },
  {
    id: "index-dry-run",
    long: "--dry-run",
    subcommand: "index",
    description:
      "Walk scan and filter only. No SQLite writes. Useful as a CI sanity gate.",
  },
  {
    id: "query-find-limit",
    short: "-n",
    long: "--limit",
    valuePlaceholder: "<N>",
    subcommand: "query find",
    defaultValue: "20",
    description:
      "Cap FTS hits. `--max-rows` does not apply here — that flag is only for `nci sql`.",
  },
  {
    id: "query-find-package",
    long: "--package",
    valuePlaceholder: "<NAME>",
    subcommand: "query find",
    description: "Filter hits to one indexed package name.",
  },
  {
    id: "query-find-package-version",
    long: "--package-version",
    valuePlaceholder: "<VERSION>",
    subcommand: "query find",
    description: "Filter hits to one indexed package version.",
  },
  {
    id: "query-find-source-package",
    long: "--source-package",
    valuePlaceholder: "<NAME>",
    subcommand: "query find",
    description:
      "Filter hits to declarations authored by this source package (the package whose `.d.ts` declared the symbol).",
  },
  {
    id: "query-find-kind",
    long: "--kind",
    valuePlaceholder: "<KIND>",
    subcommand: "query find",
    description:
      "Filter by `kind_name`, e.g. `InterfaceDeclaration`, `FunctionDeclaration`, `ClassDeclaration`.",
  },
  {
    id: "query-find-file",
    long: "--file",
    valuePlaceholder: "<TEXT>",
    subcommand: "query find",
    description: "Filter to hits whose stored `file_path` contains this text.",
  },
  {
    id: "query-find-public-only",
    long: "--public-only",
    subcommand: "query find",
    description: "Hide symbols flagged internal to the package export surface.",
  },
  {
    id: "query-symbol-limit",
    short: "-n",
    long: "--limit",
    valuePlaceholder: "<N>",
    subcommand: "query symbol",
    defaultValue: "20",
    description: "Cap exact-name hits.",
  },
  {
    id: "query-evidence-package",
    long: "--package",
    valuePlaceholder: "<NAME>",
    subcommand: "query evidence",
    description: "Required. Indexed package whose declarations to search.",
  },
  {
    id: "query-evidence-package-version",
    long: "--package-version",
    valuePlaceholder: "<VERSION>",
    subcommand: "query evidence",
    description: "Pin to one indexed version.",
  },
  {
    id: "query-evidence-source-package",
    long: "--source-package",
    valuePlaceholder: "<NAME>",
    subcommand: "query evidence",
    description: "Filter to declarations authored by this source package.",
  },
  {
    id: "query-evidence-symbol",
    long: "--symbol",
    valuePlaceholder: "<NAME>",
    subcommand: "query evidence",
    description:
      "Repeatable. Exact symbol name to look up. Provide at least one of `--symbol` or `--phrase`.",
  },
  {
    id: "query-evidence-phrase",
    long: "--phrase",
    valuePlaceholder: "<TEXT>",
    subcommand: "query evidence",
    description:
      "Repeatable. FTS phrase to match. Falls back when an exact symbol name is unknown.",
  },
  {
    id: "query-evidence-kind",
    long: "--kind",
    valuePlaceholder: "<KIND>",
    subcommand: "query evidence",
    description:
      "Apply one literal `kind_name` filter to every anchor — passing the wrong kind returns 0 hits.",
  },
  {
    id: "query-evidence-public-only",
    long: "--public-only",
    subcommand: "query evidence",
    description: "Hide rows where `symbols.is_internal = 1`.",
  },
  {
    id: "query-evidence-limit",
    short: "-n",
    long: "--limit",
    valuePlaceholder: "<N>",
    subcommand: "query evidence",
    defaultValue: "10",
    description: "Cap deduped hits in `data.symbols`.",
  },
  {
    id: "query-evidence-snippet-limit",
    long: "--snippet-limit",
    valuePlaceholder: "<N>",
    subcommand: "query evidence",
    description:
      "Cap how many returned hits get a snippet attached. Default matches `--limit` (1:1 coverage).",
  },
  {
    id: "query-symbols-limit",
    short: "-n",
    long: "--limit",
    valuePlaceholder: "<N>",
    subcommand: "query symbols",
    defaultValue: "100",
    description:
      "Page size for the paginated symbol listing. Pair with `--offset`.",
  },
  {
    id: "query-symbols-offset",
    long: "--offset",
    valuePlaceholder: "<N>",
    subcommand: "query symbols",
    description: "Skip this many rows before returning.",
  },
  {
    id: "db-status-check",
    long: "--check",
    subcommand: "db status",
    description: "Run `PRAGMA quick_check`. Conflicts with `--deep`.",
  },
  {
    id: "db-status-deep",
    long: "--deep",
    subcommand: "db status",
    description:
      "Run `PRAGMA integrity_check`. Can take minutes on large databases.",
  },
  {
    id: "db-clear-yes",
    short: "-y",
    long: "--yes",
    subcommand: "db clear",
    description: "Skip the confirmation prompt before deleting all rows.",
  },
  {
    id: "db-remove-yes",
    short: "-y",
    long: "--yes",
    subcommand: "db remove",
    description: "Skip the confirmation prompt.",
  },
  {
    id: "db-remove-glob-yes",
    short: "-y",
    long: "--yes",
    subcommand: "db remove-glob",
    description: "Skip the confirmation prompt.",
  },
  {
    id: "db-destroy-force",
    long: "--force",
    subcommand: "db destroy",
    description:
      "Required confirmation. Deletes the SQLite file from disk — no prompt, no recovery.",
  },
  {
    id: "sql-schema",
    long: "--schema",
    subcommand: "sql",
    description:
      "Print the `CREATE TABLE` statements for NCI's tables, then exit.",
  },
  {
    id: "sql-command",
    short: "-c",
    long: "--command",
    valuePlaceholder: "<SQL>",
    subcommand: "sql",
    description:
      "One read-only SQL statement to run. Mutating commands (`INSERT` / `UPDATE` / `DELETE` / DDL) are rejected.",
  },
  {
    id: "sql-max-rows",
    long: "--max-rows",
    valuePlaceholder: "<N>",
    subcommand: "sql",
    description:
      "Print at most N rows. The command fails if the query would return more than N — useful for asserting query bounds in scripts.",
  },
];
