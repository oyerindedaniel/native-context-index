# native-context-index

Monorepo for the Native Context Index: TypeScript tooling, Rust `nci` CLI, and related packages.

## Quick start

```bash
pnpm install
pnpm build
```

## Packages

- **`packages/nci-engine`** — Rust `nci` binary (index, query, SQL)
- **`packages/nci`** — npm wrapper (downloads / vendors the native binary)
- **`packages/nci-mcp`** — stdio MCP server; see [packages/nci-mcp/README.md](packages/nci-mcp/README.md)
- **`packages/nci-core`** and others — libraries and apps as listed under `packages/` and `apps/`

Use `pnpm exec turbo run <task> --filter=<name>` to target one package.
