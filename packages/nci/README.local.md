# nci CLI package — monorepo dev

Thin Node launcher: `dist/bin/nci.js` spawns the Rust binary from `packages/nci-engine`.

```bash
pnpm install
pnpm --filter @nativecontextindex/cli build
cargo build -p nci-engine
```

Run without publishing:

```bash
pnpm exec nci --help
# or set NCI_BINARY to target/debug/nci(.exe)
```

Release binary packaging and `postinstall` download logic live under `packages/nci/scripts/`. Engine and CLI flags are implemented in `packages/nci-engine`.
