# NCI Benchmark Pipeline

## Goal

- Measure practical agent performance for declaration and architecture tasks.
- Compare `baseline` versus `nci_first`.
- Keep indexing speed as a separate metric from answer speed.

## What each mode means

- `baseline`: agent must not use NCI CLI.
- `nci_first`: agent must use `nci query` and `nci sql` during the run and return evidence.

## What each lane means

- `artifact_only`: declaration lookup tasks solved from local indexed artifacts.
- `github_baseline`: GitHub orientation allowed, final answer still declaration-grounded.
- `architecture_github`: architecture understanding tasks that can use GitHub context plus declaration validation.

## Runtime meaning

- `local`: agent runs with local workspace context on your machine.
- `cloud`: agent runs in Cursor cloud runtime and can include connected repository context.

## Metrics captured

- Indexing metrics: `nci index` duration per package, recorded separately from answer latency.
- Run latency: wall-clock duration and SDK duration for each task run.
- Deterministic correctness: verifier pass/fail with missing and forbidden evidence detail.
- Agent practical signals: tool call counts from SDK stream events and token fields when available.
- Capability matrix: local and cloud preflight checks persisted in run output.

## Capability preflight

- Local checks: `nci` availability, `gh` availability, `gh auth status`.
- Cloud checks: `CURSOR_API_KEY` availability and connected repository check.
- Runs are skipped with explicit `skippedReason` when required capabilities are missing.
- GitHub lanes require GitHub capabilities for local runs.

## Pipeline

1. Load [package-manifest.json](./package-manifest.json) and [tasks-manifest.json](./tasks-manifest.json).
2. Run indexing metrics stage for each package (`nci index`) and store timing separately.
3. Detect capability matrix and gate unsupported runs.
4. For each task, runtime, and strategy:
   - Build robust prompt contract.
   - Run SQL validation stage for `nci_first` (`nci sql` read-only checks).
   - Run agent prompt.
   - Verify output with deterministic verifier rules.
5. Write JSON (same **stem** on every file so you can pair them at a glance):
   - `apps/docs/benchmarks/runs/<stem>-run.json` — full run (includes `runStem`, prompts, tool traces).
   - `apps/docs/benchmarks/runs/<stem>-metrics.json` — compact per-record metrics + `pairedFromRepoRoot` paths.
   - `apps/web/data/benchmarks/<stem>-summary.json` — aggregates for charts.
   - `apps/web/data/benchmarks/<stem>-full.json` — full dataset for the web app.
   - **Stem format:** `<2-hex>-<YYYYMMDD>-<HHMMSS>-<pilot|full>` in UTC (override in tests with `outputStem`).

## Commands

- Prepare only, no execution: `pnpm --filter docs run bench:prepare`
- Pilot execution: `pnpm --filter docs run bench:pilot`
- Full execution: `pnpm --filter docs run bench:full`
- Docs benchmark tests: `pnpm --filter docs run test:benchmarks`
- Web benchmark component tests: `pnpm --filter web run test:benchmarks`
- Optional NCI binary override: `--nci-binary-path=<absolute-path-to-nci-executable>`

## Model selection

- Benchmark execution uses `composer-2` by default.
- Override with `--model-id=<your-model-id>` on `benchmark-cli.ts`.

## NCI executable resolution

- Default NCI executable path is `<workspace>/target/debug/nci.exe` on Windows and `<workspace>/target/debug/nci` on Unix.
- This benchmark does not require globally installed `nci`.

## Where to continue

- Prompt contract logic: [benchmark-prompts.ts](./benchmark-prompts.ts)
- Runner orchestration: [benchmark-runner.ts](./benchmark-runner.ts)
- SQL validation stage: [benchmark-sql-validation.ts](./benchmark-sql-validation.ts)
- Deterministic verifier logic: [benchmark-verifiers.ts](./benchmark-verifiers.ts)
- Aggregation logic: [benchmark-statistics.ts](./benchmark-statistics.ts)
