# NCI MCP

Use when the **host already runs `nci-mcp`** for you (Cursor, Claude, Codex, OpenCode, Antigravity, etc.). CLI-only work: use [PRIMER.md](PRIMER.md) instead.

MCP is configured in the **host’s MCP config** — not by running `npx @nativecontextindex/mcp` in a chat terminal. The IDE/agent spawns that process over stdio.

## First connection (every session)

1. Read MCP resource **`nci://primer/agent`** before any tool call (same workflow as [PRIMER.md](PRIMER.md)).
2. Use **`nci_query`** (structured search) and **`nci_sql`** (read-only SQL).
3. Optional: **`nci://primer/reference`** (schema depth). **`nci://database/active`** = status only (see [SKILL.md](SKILL.md) — do not mutate the DB file).

Omit `database` on tools unless overriding the sqlite path from `nci.config.json`. Wrong DB → pass **`database`** on the next tool call; do not move or recreate files on disk.

## Host wiring

If you need the JSON/TOML block for a specific client, fetch setup text from the docs API:

```http
GET /api/docs/integration?host=cursor
```

Hosts: `cursor`, `claude`, `codex`, `opencode`, `antigravity`. Omit `host` for the index list.

Use the site origin where NCI docs are deployed, for example:

```bash
curl -fsSL "https://<docs-host>/api/docs/integration?host=cursor"
```

## Project prerequisites

In the **opened workspace** (not in MCP config):

```bash
nci init -y
nci index
```

Re-run `nci index` when dependencies change. MCP tools read the index; they do not build it.

## Tool mapping

| MCP | CLI |
| --- | --- |
| `nci_query` → `active-package` | `nci query active-package <name>` (required first) |
| `nci_query` → `evidence` | `nci query evidence --package … --symbol …` and/or `--phrase …` |
| `nci_query` → `symbol` / `find` / `snippet` | Lighter paths when `meta.suggestions` says so |
| `nci_sql` | `nci sql` (read-only; `--max-rows` on SQL only) |

On JSON responses, read **`meta.durationMs`**, **`meta.cost`**, and **`meta.suggestions`**. Prefer **`evidence`** when you need symbols plus cite-ready signatures in one call; use **`--phrase`** for architectural or vague discovery, not only exact names. If **`data.snippets`** already has what you need, stop even when **`meta.cost`** is `heavy`.

## Strict answers

For signature-proof type reasoning, also follow skill **`nci-answer-quality`** after the primer.
