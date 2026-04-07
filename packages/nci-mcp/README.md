# nci-mcp

Stdio MCP server for the Native Context Index CLI (`nci`). Exposes two tools that spawn the **native** `nci` executable directly:

| Tool        | CLI equivalent |
| ----------- | -------------- |
| `nci_sql`   | `nci sql …`    |
| `nci_query` | `nci query …`  |

**Output shapes**

- **`nci_sql`** with `format: json` (default): stdout from `nci` is a **raw JSON array** of row objects (no `{"ok":…}` wrapper).
- **`nci_query`** (always JSON): same envelope as the CLI: `{"ok":true,"data":…}` or `{"ok":false,…}`.

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

```json
{
  "mcpServers": {
    "nci": {
      "command": "node",
      "args": ["C:/path/to/native-context-modules/packages/nci-mcp/dist/index.js"],
      "env": {
        "NCI_BINARY": "C:/path/to/native-context-modules/packages/nci/vendor/nci.exe"
      }
    }
  }
}
```

Use absolute paths. After `pnpm --filter nci-mcp build`, `dist/index.js` is the entrypoint.

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

MIT
