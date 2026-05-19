<p align="center">
  <a href="https://nativecontextindex.com">
    <img src="https://nativecontextindex.com/nci-full-logo.svg" alt="Native Context Index" width="320" />
  </a>
</p>

# Native Context Index

Indexes TypeScript declaration graphs from `node_modules` so agents and tools can search symbols in milliseconds.

## Install

```bash
npm install -g @nativecontextindex/cli
```

```bash
curl -fsSL https://nativecontextindex.com/install.sh | sh
```

[Installation](https://nativecontextindex.com/docs/installation) · `cargo install` for source builds

## Quick start

In a repo with `package.json` and `node_modules`:

```bash
nci init -y
nci index
nci query find "useState" --limit 5
```

Optional: [MCP](https://nativecontextindex.com/docs/mcp) (`@nativecontextindex/mcp`) · [Quickstart](https://nativecontextindex.com/docs/quickstart) · [CLI](https://nativecontextindex.com/docs/cli)

## Docs

- [nativecontextindex.com/docs](https://nativecontextindex.com/docs)
- [`@nativecontextindex/cli`](packages/nci/README.md) · [`@nativecontextindex/mcp`](packages/nci-mcp/README.md)

## License

Apache-2.0

---

## Monorepo (development)

TypeScript apps, Rust `nci-engine`, and npm wrappers. From the repo root:

```bash
pnpm install
pnpm build
```

| Package | Role |
| --- | --- |
| [`packages/nci-engine`](packages/nci-engine) | Rust `nci` binary |
| [`packages/nci`](packages/nci) | npm CLI shim + vendor binary |
| [`packages/nci-mcp`](packages/nci-mcp) | MCP stdio server |
| [`packages/nci-core`](packages/nci-core) | TS indexer libraries |
| [`apps/web`](apps/web) | Docs site |

`pnpm exec turbo run <task> --filter=<package>` for one package. [`install.sh`](install.sh) is synced to `apps/web/public/` on web prebuild.
