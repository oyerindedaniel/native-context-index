# nci-mcp — monorepo dev

```bash
pnpm install
pnpm --filter @nativecontextindex/mcp build
cargo build -p nci-engine   # native nci binary
```

**Local MCP:** copy [`mcp.local.sample.json`](./mcp.local.sample.json) into Cursor (`~/.cursor/mcp.json` or `.cursor/mcp.json`). Set **absolute** paths to `packages/nci-mcp/dist/index.js` and `target/debug/nci` (or `nci.exe` on Windows).

```bash
pnpm --filter @nativecontextindex/mcp test
```

Publish: `pnpm --filter @nativecontextindex/mcp publish` (runs `prepublishOnly` → build). See root `AGENTS.md` / release docs for the full workflow.
