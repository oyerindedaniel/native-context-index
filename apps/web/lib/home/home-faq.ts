export interface HomeFaqItem {
  readonly id: string;
  readonly question: string;
  readonly answer: string;
}

export const HOME_FAQ_ITEMS: readonly HomeFaqItem[] = [
  {
    id: "what-is-nci",
    question: "What is NCI?",
    answer:
      "NCI builds a local SQLite index of TypeScript declarations and package relationships from the node_modules tree you actually compile against. Agents and the CLI query that index for exact signatures, overloads, and dependency edges instead of repeating open-ended text search every turn.",
  },
  {
    id: "vs-grep-docs",
    question:
      "How is this different from grepping node_modules or reading docs online?",
    answer:
      "Grep chases strings; public docs rarely match your pinned versions. NCI stores structured rows (symbols, versions, source packages) so nci query and nci sql return cite-ready answers from the same files on disk.",
  },
  {
    id: "reindex",
    question: "Do I need to re-index after every install?",
    answer:
      "Run nci index when dependencies change (after install, branch switch, or lockfile updates). The database is local; nothing is uploaded. Your config (nci.config.json) controls roots, scope, and output format.",
  },
  {
    id: "mcp",
    question: "Does it work with Cursor and other MCP clients?",
    answer:
      "Yes. nci-mcp exposes nci_query and nci_sql plus primer resources. The MCP server shells out to the same nci binary as your terminal, so CLI and agent stay aligned.",
  },
  {
    id: "disk-ci",
    question: "What does it cost in disk space and CI?",
    answer:
      "One shared nci.sqlite lives in your OS cache by default (set database or NCI_CACHE_DIR to override). Size grows with indexed packages—nci db status reports it; nci db clear wipes rows. Queries stay read-only.",
  },
  {
    id: "when-not",
    question: "When should I not use NCI?",
    answer:
      "Skip it if you have no installed packages to index, or your task is only about files you already have open in the editor. NCI pays off on large trees, generated .d.ts files, and recurring agent questions about third-party APIs.",
  },
] as const;

export const HOME_FAQ_DEFAULT_OPEN_ID = HOME_FAQ_ITEMS[0]?.id ?? null;
