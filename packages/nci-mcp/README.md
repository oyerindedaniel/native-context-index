<p align="center">
  <a href="https://nativecontextindex.com">
    <img src="https://nativecontextindex.com/nci-full-logo.svg" alt="Native Context Index" width="320" />
  </a>
</p>

# @nativecontextindex/mcp

Stdio MCP server for the [Native Context Index](https://nativecontextindex.com). It runs the native **`nci`** binary and exposes query tools plus primer resources for agents.

## Requirements

- Node.js 18+
- A native **`nci`** executable from [`@nativecontextindex/cli`](https://www.npmjs.com/package/@nativecontextindex/cli)

## Install the CLI

```bash
npm install -g @nativecontextindex/cli
```

`pnpm`, `yarn`, and `bun`: [Installation](https://nativecontextindex.com/docs/installation).

## MCP config

Add to your editor’s MCP settings (e.g. `~/.cursor/mcp.json`). Details: [MCP docs](https://nativecontextindex.com/docs/mcp) · [Cursor](https://nativecontextindex.com/docs/integrations/cursor) · [Claude](https://nativecontextindex.com/docs/integrations/claude)

```json
{
  "mcpServers": {
    "nci": {
      "command": "npx",
      "args": ["-y", "@nativecontextindex/mcp"],
      "env": {
        "NCI_BINARY": "/absolute/path/to/nci"
      }
    }
  }
}
```

Set **`NCI_BINARY`** when the IDE’s PATH does not include `nci`. Run `nci binary-path` in a terminal to get the path.

In the workspace, run `nci init -y` and `nci index` before querying.

## Tools

| Tool        | Purpose                                                                                                               |
| ----------- | --------------------------------------------------------------------------------------------------------------------- |
| `nci_query` | Structured search (`query find`, `query symbol`, `query evidence`, …) — JSON envelope `{"ok":true,"data":…,"meta":…}` |
| `nci_sql`   | Read-only SQL on the index database — default `format: json` returns a JSON array of rows                             |

Optional **`database`** on either tool overrides the SQLite path for that call; omit it to use the same resolution as the CLI (`nci.config.json`, cwd, cache dir).

## Resources

| URI                      | Use                                                       |
| ------------------------ | --------------------------------------------------------- |
| `nci://primer/agent`     | Read first — workflow for NCI tools                       |
| `nci://primer/reference` | Schema / table reference                                  |
| `nci://database/active`  | Active DB path and status (`nci db status --format json`) |

## Docs

- [MCP reference](https://nativecontextindex.com/docs/mcp) — tools, resources, wiring
- [CLI reference](https://nativecontextindex.com/docs/cli) — flags and subcommands
- [Quickstart](https://nativecontextindex.com/docs/quickstart) — install, init, index

## License

Apache-2.0
