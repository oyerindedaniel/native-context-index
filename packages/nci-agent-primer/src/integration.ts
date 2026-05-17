/**
 * MCP integration setup for agents (curl / FetchMcpResource).
 * Not rendered as docs pages — served at `/api/docs/integration?host=<id>`.
 */

export const INTEGRATION_HOSTS = [
  "cursor",
  "claude",
  "codex",
  "opencode",
  "antigravity",
] as const;

export type IntegrationHost = (typeof INTEGRATION_HOSTS)[number];

const NCI_MCP_ARGS = '["-y", "@nativecontextindex/mcp"]';

function isIntegrationHost(value: string): value is IntegrationHost {
  return (INTEGRATION_HOSTS as readonly string[]).includes(value);
}

const SETUP_BY_HOST: Record<IntegrationHost, string> = {
  cursor: [
    "# Cursor — NCI MCP",
    "",
    "**Where:** `~/.cursor/mcp.json` (or **Cursor → Settings → MCP**).",
    "",
    "**Entry:**",
    "",
    "```json",
    "{",
    '  "mcpServers": {',
    '    "nci": {',
    '      "command": "npx",',
    `      "args": ${NCI_MCP_ARGS}`,
    "    }",
    "  }",
    "}",
    "```",
    "",
    '**If `nci` is not on the IDE PATH:** add `"env": { "NCI_BINARY": "<absolute path>" }` on the `nci` server object. Run `nci binary-path` in a terminal to get the path.',
    "",
    "**Apply:** save the file — Cursor reloads MCP on save (no full app restart). Confirm **two tools** (`nci_query`, `nci_sql`) and **three resources** (`nci://primer/agent`, `nci://primer/reference`, `nci://database/active`).",
    "",
    "**Workspace:** open the repo root; `nci-mcp` resolves `nci.config.json` from the workspace. Run `nci init -y` and `nci index` before querying. Read **`nci://primer/agent`** before the first tool call.",
  ].join("\n"),

  claude: [
    "# Claude — NCI MCP",
    "",
    "## Claude Desktop",
    "",
    "**Config paths:**",
    "",
    "- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`",
    "- Windows: `%APPDATA%\\Claude\\claude_desktop_config.json`",
    "- Linux: `~/.config/Claude/claude_desktop_config.json`",
    "",
    "```json",
    "{",
    '  "mcpServers": {',
    '    "nci": {',
    '      "command": "npx",',
    `      "args": ${NCI_MCP_ARGS}`,
    "    }",
    "  }",
    "}",
    "```",
    "",
    "**Reload:** quit the app fully (`⌘Q` / tray Quit) and relaunch — config is read only at startup.",
    "",
    "## Claude Code",
    "",
    "```bash",
    "claude mcp add --transport stdio --scope user nci -- npx -y @nativecontextindex/mcp",
    "```",
    "",
    "Project scope (`.mcp.json` in repo): use `--scope project` instead of `--scope user`.",
    "",
    "Verify: `claude mcp list` and `claude mcp get nci`.",
    "",
    "**Prerequisite:** `nci init -y`, `nci index`, then read **`nci://primer/agent`** on first use.",
  ].join("\n"),

  codex: [
    "# Codex — NCI MCP",
    "",
    "**Where:** `~/.codex/config.toml` (user) or `.codex/config.toml` (project, trusted repos only).",
    "",
    "**CLI register:**",
    "",
    "```bash",
    "codex mcp add nci -- npx -y @nativecontextindex/mcp",
    "```",
    "",
    "**Or hand-edit TOML:**",
    "",
    "```toml",
    "[mcp_servers.nci]",
    'command = "npx"',
    `args = ${NCI_MCP_ARGS}`,
    "enabled = true",
    "```",
    "",
    '**Optional:** `env = { NCI_BINARY = "/absolute/path/to/nci" }` in that block (`nci binary-path`).',
    "",
    "Verify: `codex mcp list` and `codex mcp get nci`. Start a **new session** after editing config.",
    "",
    "**Prerequisite:** `nci init -y`, `nci index`, then read **`nci://primer/agent`** on first use.",
  ].join("\n"),

  opencode: [
    "# OpenCode — NCI MCP",
    "",
    "**Where:** `opencode.json` / `opencode.jsonc` at project root, `~/.config/opencode/opencode.json`, or `.mcp.json` (Claude Code–compatible shape).",
    "",
    "```json",
    "{",
    '  "mcp": {',
    '    "nci": {',
    '      "type": "local",',
    '      "command": ["npx", "-y", "@nativecontextindex/mcp"],',
    '      "enabled": true',
    "    }",
    "  }",
    "}",
    "```",
    "",
    '**Optional:** `"environment": { "NCI_BINARY": "…" }` on the `nci` block.',
    "",
    "**Apply:** restart or reload OpenCode so MCP config is picked up. Check `/mcps` or `/status` for `nci_query` and `nci_sql`.",
    "",
    "**Prerequisite:** `nci init -y`, `nci index`, then read **`nci://primer/agent`** on first use.",
  ].join("\n"),

  antigravity: [
    "# Antigravity — NCI MCP",
    "",
    "**Where:** `~/.gemini/antigravity/mcp_config.json` (Windows: `%UserProfile%\\.gemini\\antigravity\\mcp_config.json`).",
    "",
    "```json",
    "{",
    '  "mcpServers": {',
    '    "nci": {',
    '      "command": "npx",',
    `      "args": ${NCI_MCP_ARGS}`,
    "    }",
    "  }",
    "}",
    "```",
    "",
    '**Optional:** `"env": { "NCI_BINARY": "…" }` (`nci binary-path`).',
    "",
    "**Reload:** restart Antigravity (or end and restart the agent session) after editing.",
    "",
    "**Prerequisite:** `nci init -y`, `nci index`, then read **`nci://primer/agent`** on first use.",
  ].join("\n"),
};

export function buildIntegrationIndex(): string {
  const lines = [
    "# NCI MCP integrations",
    "",
    "Host-specific MCP config snippets for agents.",
    "",
    "**Fetch one host** (replace origin with your deployed docs site):",
    "",
    "```",
    "GET /api/docs/integration?host=<host>",
    "```",
    "",
    "**Hosts:**",
    "",
    ...INTEGRATION_HOSTS.map((host) => `- \`${host}\` → \`?host=${host}\``),
    "",
    "**Always after MCP connects:** read resource `nci://primer/agent` before `nci_query` / `nci_sql`.",
  ];
  return lines.join("\n");
}

export function buildIntegration(host: string): string | null {
  if (!isIntegrationHost(host)) {
    return null;
  }
  return SETUP_BY_HOST[host];
}
