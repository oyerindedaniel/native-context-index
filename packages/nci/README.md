<p align="center">
  <a href="https://nativecontextindex.com">
    <img src="https://nativecontextindex.com/nci-full-logo.svg" alt="Native Context Index" width="320" />
  </a>
</p>

# @nativecontextindex/cli

npm wrapper for the **Native Context Index** (`nci`) — indexes TypeScript declaration graphs from `node_modules` into SQLite for search and agent tooling.

## Install

Global install (recommended):

```bash
npm install -g @nativecontextindex/cli
```

One-off without installing:

```bash
npx @nativecontextindex/cli --help
```

Other package managers (`pnpm`, `yarn`, `bun`) and platform notes: [Installation](https://nativecontextindex.com/docs/installation).

`postinstall` downloads a prebuilt native binary into `vendor/` (per platform). Override with **`NCI_BINARY`**.

## Quick start

```bash
nci init -y
nci index
nci query find --phrase "RequestHandler" --package express
nci db status
```

Full walkthrough: [Quickstart](https://nativecontextindex.com/docs/quickstart).

## MCP

Wire the server in your editor’s MCP config — see [MCP docs](https://nativecontextindex.com/docs/mcp). Set `NCI_BINARY` to `nci binary-path` when the host cannot find `nci`.

## Docs

- [CLI reference](https://nativecontextindex.com/docs/cli) — every flag and subcommand
- [Indexing](https://nativecontextindex.com/docs/indexing) — scan, filter, graph, store
- [Configuration](https://nativecontextindex.com/docs/config) — `nci.config.json`

## License

Apache-2.0
