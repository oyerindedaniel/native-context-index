# nci-mcp

Stdio MCP server for the Native Context Index CLI (`nci`). Exposes two tools that spawn the **native** `nci` executable directly:

| Tool        | CLI equivalent |
| ----------- | -------------- |
| `nci_sql`   | `nci sql …`    |
| `nci_query` | `nci query …`  |

**Output shapes**

- **`nci_sql`** with `format: json` (default): stdout from `nci` is a **raw JSON array** of row objects (no `{"ok":…}` wrapper).
- **`nci_query`** (always JSON): same envelope as the CLI: `{"ok":true,"data":…}` or `{"ok":false,…}`.

## Optional `database` on tools

There is **no MCP-specific environment variable** for the SQLite path. Behavior matches the CLI:

- **Omit `database`** on `nci_sql` / `nci_query` so `nci` uses the database it already resolves from **NCI config**, `--database` defaults, and the **process working directory** (same as running `nci sql` / `nci query` in a shell without `--database`).
- **Pass `database`** only when you need to **override** which file is used for that single tool call (multiple DBs, scripts, or debugging).
- To **discover** the resolved path from inside MCP, read the **`nci://database/active`** resource (stdout of `nci db status --format json`). No extra MCP wiring is required beyond normal `nci` setup.

## Requirements

- Node.js 18+
- A native **`nci` binary** on your machine (see below)

## Native binary (`NCI_BINARY`)

Resolution matches the `nci` npm CLI wrapper:

1. If **`NCI_BINARY`** is set, that path is used.
2. Otherwise **`vendor/nci`** or **`vendor/nci.exe`** next to this package (under `node_modules/nci-mcp/vendor/` when installed).

**Typical setup:** install both packages so the CLI downloads the binary, then point MCP at that file:

```bash
npm install nci nci-mcp
```

**Scoped installs (recommended):** from the project where `nci` is a dependency, print the exact native path the CLI is using, then paste it into MCP `env.NCI_BINARY`:

```bash
pnpm exec nci binary-path
# or: npx nci binary-path
```

The `which` alias is the same as `binary-path`.

You can still locate the file by hand (examples):

- Unix-like: `node_modules/nci/vendor/nci`
- Windows: `node_modules\nci\vendor\nci.exe`

Set `NCI_BINARY` in the MCP config `env` to that absolute path.

## Install

From npm (when published):

```bash
npm install -g nci-mcp
# also install `nci` (or build from source) and set NCI_BINARY
```

From this monorepo:

```bash
pnpm install
pnpm --filter nci-mcp build
```

## Cursor / IDE MCP config

MCP runs **`nci-mcp` as a local process** (stdio). The host does not clone the repo; you choose the command and environment.

### Using global `nci-mcp` and `NCI_BINARY`

```json
{
  "mcpServers": {
    "nci": {
      "command": "nci-mcp",
      "env": {
        "NCI_BINARY": "/absolute/path/to/nci"
      }
    }
  }
}
```

On Windows, use a Windows path for `NCI_BINARY`, e.g. `C:\\path\\to\\nci.exe`.

### Monorepo / dev: `node` + built `dist/index.js`

A ready-to-paste sample lives at **[`mcp.local.sample.json`](./mcp.local.sample.json)** — copy it into your IDE's MCP config (Cursor: `~/.cursor/mcp.json` or `<repo>/.cursor/mcp.json`) and adjust the two absolute paths to match your machine.

```json
{
  "mcpServers": {
    "nci": {
      "command": "node",
      "args": [
        "C:/path/to/native-context-modules/packages/nci-mcp/dist/index.js"
      ],
      "env": {
        "NCI_BINARY": "C:/path/to/native-context-modules/target/debug/nci.exe"
      }
    }
  }
}
```

Both paths must be **absolute** — the MCP host launches the process from its own working directory, so relative paths will not resolve. Run `pnpm --filter nci-mcp build` first so `dist/index.js` exists, and build the Rust crate (e.g. `cargo build -p nci-engine`) so `target/debug/nci.exe` exists.

### `npx` (optional)

Depending on the host, you can try:

```json
{
  "mcpServers": {
    "nci": {
      "command": "npx",
      "args": ["-y", "nci-mcp"],
      "env": {
        "NCI_BINARY": "/absolute/path/to/nci"
      }
    }
  }
}
```

## Publishing

`nci-mcp` is a **separate** npm package from `nci`. Publish from `packages/nci-mcp` after `pnpm run build` (see `prepublishOnly` in `package.json`).

## License

Apache-2.0. See the [repository LICENSE](https://github.com/oyerindedaniel/native-context-index/blob/main/LICENSE).
