---
name: nci
description: Onboards agents to Native Context Index — verify the CLI, init and index the project, then follow the NCI-first query workflow before any API lookup. Use when the agent has no NCI context, the user asks how to use NCI, or before the first nci query or MCP nci_query call. Do not delete, move, or recreate the NCI SQLite file when tools fail — re-index or fix config instead.
---

# NCI (Native Context Index)

NCI indexes TypeScript declarations from `node_modules` into SQLite for symbol discovery — not a full typechecker. Run this skill from the **project root** (where `package.json` and `node_modules` live).

## When to use

- Fresh context: you do not know what NCI is or whether it is set up here.
- Before the first `nci query …` or MCP `nci_query` / `nci_sql` call.
- User asks to "use NCI", "check the indexed API", or wire declaration context into an answer.

Skip NCI when there is no TypeScript `node_modules` tree to index.

## 1. CLI installed

```bash
nci --version
```

If that fails, install the published CLI and retry:

```bash
npm install -g @nativecontextindex/cli
# or: pnpm add -g @nativecontextindex/cli
# or: yarn global add @nativecontextindex/cli
```

Optional: `nci binary-path` prints the executable path (useful for `NCI_BINARY` with MCP).

## 2. Project initialized and indexed

```bash
nci init -y
nci index
```

- `nci init -y` writes `nci.config.json` and opens the database (migrations).
- `nci index` scans `node_modules` into the index (first run is slowest).
- Check health: `nci db status`
- Preview without writing: `nci index --dry-run`

## Do not “fix” NCI by touching the database file

If MCP tools, `nci query`, or `nci_sql` fail, return empty results, or look broken:

**Never** delete, move, copy, rename, vacuum, hand-edit, or recreate the SQLite index file. **Never** swap in another `.sqlite` because a call failed. **`nci://database/active`** and **`nci db status`** are read-only status — use them only to see path/counts, **not** as a license to change anything on disk. Tools already read the same database; you do not need the path to query.

**Instead:** re-run **`nci index`** from project root (stale/missing packages); pass **`database`** on the next **`nci_query`** / **`nci_sql`** if the wrong DB is selected; fix workspace root, MCP config, or **`nci.config.json`** — not the sqlite file.

## 3. Load the operating manual (pick one)

| You have | Read this |
| -------- | ----------- |
| MCP `nci` server connected | Resource **`nci://primer/agent`** first (required on first use). Schema depth: `nci://primer/reference`. |
| CLI / shell only | **[PRIMER.md](PRIMER.md)** in this skill folder (same compact text as the MCP resource). |
| MCP setup help | **[MCP.md](MCP.md)** in this skill folder. Host JSON blocks: `GET /api/docs/integration?host=<cursor\|claude\|codex\|opencode\|antigravity>` on the docs site (see MCP.md). |

Do not guess flags or table shapes — use the primer. On successful `query --format json`, read **`meta`** next to **`data`**: **`durationMs`**, **`cost`**, limits/truncation, and **`suggestions`** when a heavy call was slow and unproductive.

## 4. First real calls (after primer)

Always from project root, JSON when automating:

```bash
nci --format json query active-package <PackageName>
nci --format json query evidence --package <IndexedPackage> --package-version <V> --symbol <Anchor>
# architectural / vague: add --phrase "<terms>"
```

Pin **`package_version`** from `active-package` in every follow-up call unless you intentionally compare versions.

If `data.snippets` already has cite-ready `signature` / `js_doc`, **stop** — do not `read_file` or grep `node_modules` to re-prove the same declaration.

## 5. Strict type-level answers

When the user wants signature-proof correctness (composition direction, overloads, "using nci" with strict checks), also follow skill **`nci-answer-quality`** after steps 1–3.

## Quick checklist

- [ ] `nci --version` succeeds
- [ ] `nci.config.json` exists; `nci index` has been run
- [ ] Read `nci://primer/agent` or [PRIMER.md](PRIMER.md)
- [ ] `active-package` → `evidence` with pinned version before disk greps
