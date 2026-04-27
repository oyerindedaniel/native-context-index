# Monorepo Ignore Scope Contract

This document defines the ignore-scope contract for NCI monorepos.

## Contract

- Ignore scope is owned by the nearest discovered `nci.config.json`.
- The `.nciignore` file loaded for indexing comes from that same directory.
- There is no implicit root+workspace multi-layer merge behavior.

## How Discovery Works

NCI discovers config by walking upward from the current working directory (or `--project-root` when provided) to find the nearest `nci.config.json`.

That discovered config directory is the ignore scope owner.

## Expected Behavior

### Run From Monorepo Root

- Nearest config is root `nci.config.json`.
- Root `.nciignore` is applied.
- Workspace-level `.nciignore` files are not merged automatically.

### Run From Workspace Directory With Local Config

- Nearest config is workspace `nci.config.json`.
- Workspace `.nciignore` is applied.
- Root `.nciignore` is not merged automatically.

## Examples

### Example A: Root Run

- Root has `nci.config.json` and `.nciignore` with `root-*`.
- Workspace has `.nciignore` with `workspace-*`.
- Running `nci index --dry-run` from root ignores `root-*` only.

### Example B: Workspace Run

- Root has `nci.config.json` and `.nciignore` with `root-*`.
- Workspace has its own `nci.config.json` and `.nciignore` with `workspace-*`.
- Running `nci index --dry-run` inside the workspace ignores `workspace-*` only.

## Interaction With Package Filters

`packages.include` / `packages.exclude` in `nci.config.json` still apply.

Filtering behavior is composed:

1. Include checks (`include_names`, `packages.include`, CLI package globs).
2. Dependency section checks (when enabled).
3. `.nciignore` checks from the active ignore scope.
4. Exclude pattern checks (`packages.exclude`, CLI excludes).

If any check excludes a package, it is filtered out.
