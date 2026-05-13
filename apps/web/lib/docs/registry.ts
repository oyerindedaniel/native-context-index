export type DocsGroupId =
  | "getting-started"
  | "core-concepts"
  | "integrations"
  | "guides"
  | "architecture"
  | "reference"
  | "reference-tables";

export type DocsIconName =
  | "RocketLaunchIcon"
  | "LightBulbIcon"
  | "BookOpenIcon"
  | "CommandLineIcon"
  | "RectangleStackIcon"
  | "BookmarkSquareIcon"
  | "TableCellsIcon";

export interface DocsPage {
  slug: string;
  title: string;
  eyebrow: string;
  groupId: DocsGroupId;
  summary: string;
}

export interface DocsGroup {
  id: DocsGroupId;
  title: string;
  iconName: DocsIconName;
  pages: DocsPage[];
}

export const docsGroups: DocsGroup[] = [
  {
    id: "getting-started",
    title: "Getting Started",
    iconName: "RocketLaunchIcon",
    pages: [
      {
        slug: "/docs",
        title: "Introduction",
        eyebrow: "Introduction",
        groupId: "getting-started",
        summary:
          "Why NCI exists, who it is for, and what it replaces in an agent workflow.",
      },
      {
        slug: "/docs/quickstart",
        title: "Quickstart",
        eyebrow: "Quickstart",
        groupId: "getting-started",
        summary:
          "Five minutes from zero: install, init, index, query against your own node_modules.",
      },
      {
        slug: "/docs/installation",
        title: "Installation",
        eyebrow: "Installation",
        groupId: "getting-started",
        summary:
          "pnpm, npm, yarn, cargo, prebuilt binaries, and platform notes for Windows, macOS, Linux.",
      },
    ],
  },
  {
    id: "core-concepts",
    title: "Core Concepts",
    iconName: "LightBulbIcon",
    pages: [
      {
        slug: "/docs/indexing",
        title: "Deep Indexing",
        eyebrow: "Deep Indexing",
        groupId: "core-concepts",
        summary:
          "Scan, filter, parse, resolve, graph, store. The five stages and what each one actually does.",
      },
      {
        slug: "/docs/signatures",
        title: "Signatures",
        eyebrow: "Signatures",
        groupId: "core-concepts",
        summary:
          "What NCI extracts from a .d.ts and stores verbatim — and what the three query surfaces actually return.",
      },
      {
        slug: "/docs/integration",
        title: "Agent Integration",
        eyebrow: "Integration",
        groupId: "core-concepts",
        summary:
          "How a reasoning model actually uses NCI inside its loop, and why a local index beats RAG for code.",
      },
    ],
  },
  {
    id: "integrations",
    title: "Integrations",
    iconName: "CommandLineIcon",
    pages: [
      {
        slug: "/docs/integrations/claude",
        title: "Claude Setup",
        eyebrow: "Integrations",
        groupId: "integrations",
        summary:
          "Wire nci-mcp into Claude Desktop (claude_desktop_config.json) and Claude Code (claude mcp add) with one entry that works for both.",
      },
      {
        slug: "/docs/integrations/cursor",
        title: "Cursor Setup",
        eyebrow: "Integrations",
        groupId: "integrations",
        summary:
          "Wire nci-mcp into Cursor so the agent reaches your local index inside the editor.",
      },
      {
        slug: "/docs/integrations/codex",
        title: "Codex Setup",
        eyebrow: "Integrations",
        groupId: "integrations",
        summary:
          "Add nci-mcp to OpenAI Codex's config.toml so the CLI and the IDE extension share one entry across every session.",
      },
      {
        slug: "/docs/integrations/antigravity",
        title: "Antigravity Setup",
        eyebrow: "Integrations",
        groupId: "integrations",
        summary:
          "Drop nci-mcp into Google Antigravity's mcp_config.json so the Gemini agent can quote your installed packages.",
      },
      {
        slug: "/docs/integrations/opencode",
        title: "OpenCode Setup",
        eyebrow: "Integrations",
        groupId: "integrations",
        summary:
          "Register nci-mcp in opencode.json (or shared .mcp.json) for terminal-first agent sessions.",
      },
    ],
  },
  {
    id: "guides",
    title: "Guides",
    iconName: "BookOpenIcon",
    pages: [
      {
        slug: "/docs/guides/monorepo",
        title: "Monorepo Indexing",
        eyebrow: "Guides",
        groupId: "guides",
        summary:
          "Use workspaces and package_scope together to index every dependency across a pnpm or yarn monorepo.",
      },
      {
        slug: "/docs/guides/skills",
        title: "NCI Skills",
        eyebrow: "Guides",
        groupId: "guides",
        summary:
          "Skills shipped under skills/, when each one applies, and how to author the next one.",
      },
    ],
  },
  {
    id: "architecture",
    title: "Architecture",
    iconName: "RectangleStackIcon",
    pages: [
      {
        slug: "/docs/architecture/pipeline",
        title: "Indexing Pipeline",
        eyebrow: "Architecture",
        groupId: "architecture",
        summary:
          "Engine internals end to end: scanner, filter, parser, resolver, graph builder, SQLite writer.",
      },
      {
        slug: "/docs/architecture/symbol-graph",
        title: "Symbol Graph Model",
        eyebrow: "Architecture",
        groupId: "architecture",
        summary:
          "ParsedExport, ParsedImport, SymbolRow, and the rules that decide what the public surface contains.",
      },
      {
        slug: "/docs/architecture/re-exports",
        title: "Re-export Resolution",
        eyebrow: "Architecture",
        groupId: "architecture",
        summary:
          "How NCI resolves alias, default, namespace, and two-statement re-exports back to a single concrete declaration.",
      },
      {
        slug: "/docs/architecture/sqlite-schema",
        title: "SQLite Schema",
        eyebrow: "Architecture",
        groupId: "architecture",
        summary:
          "Every table, every column, every index, and the queries that justify each one.",
      },
      {
        slug: "/docs/architecture/local-vs-rag",
        title: "Local vs RAG",
        eyebrow: "Architecture",
        groupId: "architecture",
        summary:
          "Why a structured local index beats an embedded vector store for code: freshness, accuracy, latency.",
      },
    ],
  },
  {
    id: "reference",
    title: "Reference",
    iconName: "BookmarkSquareIcon",
    pages: [
      {
        slug: "/docs/cli",
        title: "CLI API",
        eyebrow: "CLI",
        groupId: "reference",
        summary:
          "Every subcommand and flag, generated from the binary itself so the docs never drift from the code.",
      },
      {
        slug: "/docs/mcp",
        title: "MCP Protocol",
        eyebrow: "MCP",
        groupId: "reference",
        summary:
          "Tool catalog, resource catalog, error envelopes, and the wiring snippets that connect agents to the index.",
      },
      {
        slug: "/docs/config",
        title: "Configuration",
        eyebrow: "Config",
        groupId: "reference",
        summary:
          "nci.config.json schema with a live builder. package_scope, workspaces, env vars, DB paths.",
      },
      {
        slug: "/docs/primer",
        title: "Agent Primer",
        eyebrow: "Primer",
        groupId: "reference",
        summary:
          "The full nci://primer/agent text the MCP server returns to a fresh agent on first contact.",
      },
    ],
  },
  {
    id: "reference-tables",
    title: "Reference Tables",
    iconName: "TableCellsIcon",
    pages: [
      {
        slug: "/docs/reference/exit-codes",
        title: "Exit Codes",
        eyebrow: "Tables",
        groupId: "reference-tables",
        summary:
          "Every exit code the CLI can return, what triggers it, and the recommended response for an automation.",
      },
      {
        slug: "/docs/reference/env-vars",
        title: "Environment Variables",
        eyebrow: "Tables",
        groupId: "reference-tables",
        summary:
          "NCI_BANNER, NCI_PROGRESS, NCI_CACHE_DIR, NCI_LOG, and the default each one falls back to.",
      },
      {
        slug: "/docs/reference/json-schemas",
        title: "JSON Output Schemas",
        eyebrow: "Tables",
        groupId: "reference-tables",
        summary:
          "Response shape for query, symbols, and source, plus the canonical error envelope.",
      },
      {
        slug: "/docs/reference/mcp-methods",
        title: "MCP Method Registry",
        eyebrow: "Tables",
        groupId: "reference-tables",
        summary:
          "Every MCP method NCI exposes with its params, returns, and known error codes.",
      },
      {
        slug: "/docs/reference/sql-helpers",
        title: "SQL Helpers",
        eyebrow: "Tables",
        groupId: "reference-tables",
        summary:
          "Views and helper functions exposed for nci_sql, with example queries you can copy.",
      },
    ],
  },
];

export const docsPagesOrder: DocsPage[] = docsGroups.flatMap(
  (group) => group.pages,
);

export const docsPagesBySlug: Record<string, DocsPage> = Object.fromEntries(
  docsPagesOrder.map((page) => [page.slug, page]),
);

export function normalizeDocsPath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

export interface AdjacentPages {
  current?: DocsPage;
  group?: DocsGroup;
  prev?: DocsPage;
  next?: DocsPage;
}

export function getAdjacentPages(slug: string): AdjacentPages {
  const normalizedSlug = normalizeDocsPath(slug);
  const currentIndex = docsPagesOrder.findIndex(
    (page) => page.slug === normalizedSlug,
  );
  if (currentIndex === -1) {
    return {};
  }
  const current = docsPagesOrder[currentIndex];
  if (!current) {
    return {};
  }
  const group = docsGroups.find((entry) => entry.id === current.groupId);
  const prev = currentIndex > 0 ? docsPagesOrder[currentIndex - 1] : undefined;
  const next =
    currentIndex < docsPagesOrder.length - 1
      ? docsPagesOrder[currentIndex + 1]
      : undefined;
  return { current, group, prev, next };
}

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export function getBreadcrumb(slug: string): BreadcrumbItem[] {
  const normalizedSlug = normalizeDocsPath(slug);
  const { current, group } = getAdjacentPages(normalizedSlug);
  if (!current || !group) {
    return [];
  }
  if (current.slug === "/docs") {
    return [{ label: current.title }];
  }
  return [{ label: group.title }, { label: current.title }];
}
