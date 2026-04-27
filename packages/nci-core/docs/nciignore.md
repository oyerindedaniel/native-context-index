# .nciignore Contract

This document defines `.nciignore` behavior and pattern syntax.

## Contract

- `.nciignore` is package-name filtering input for index selection.
- The active `.nciignore` is loaded from the nearest discovered config directory.
- There is no implicit root+workspace ignore merge.
- Last matching rule wins.

## Pattern Rules

- Empty lines are ignored.
- Lines starting with `#` are comments.
- `!pattern` negates a previous ignore match.
- `*` wildcard is supported.
- Scoped patterns like `@types/*` are supported.

## Sample `.nciignore`

```text
# Ignore all eslint packages
eslint*

# Keep one specific package
!eslint-config-prettier

# Ignore a whole scope
@internal/*

# Ignore react-native variants
react-native*
```

## How Rules Apply

Given:

```text
@types/*
!@types/react
@types/react
```

Result:

- `@types/node` is ignored.
- `@types/react` is ignored (last match wins).

## Monorepo Scope Examples

### Root Run

- Root config selected.
- Root `.nciignore` applied.
- Workspace `.nciignore` files are not merged.

### Workspace Run With Local Config

- Workspace config selected.
- Workspace `.nciignore` applied.
- Root `.nciignore` is not merged.

## Interaction With `nci.config.json` Package Filters

All of these operate on the **npm package name** (the `"name"` field), not arbitrary repo paths.

Evaluation order in the indexer (each step is a gate; failing any step drops the package):

1. **`include_names`** (exact allow-list), if non-empty.
2. **`include_globs`** — `packages.include` from config, plus any CLI `--package` globs, if that combined list is non-empty.
3. **`dep_kind_filter`** — when not `All`, the name must appear in the allowed dependency sections of the consumer `package.json` (default CLI indexing uses `All`).
4. **`.nciignore`** — last matching rule wins; `!pattern` negates for this file only.
5. **`exclude_patterns`** — `packages.exclude` in config plus CLI `--exclude` globs.

So:

- A name that never passes **`include_globs`** is dropped **before** `.nciignore` runs.
- **`packages.exclude` / CLI `--exclude` always run after `.nciignore`**. A line like `!shadow-blocked` can undo an ignore inside `.nciignore`, but if `shadow-blocked` still matches `packages.exclude`, it is **dropped anyway** (config exclude wins that contradiction).

Example (contradiction):

```text
# .nciignore
shadow-*
!shadow-blocked
```

```json
{
  "packages": {
    "exclude": ["shadow-blocked"]
  }
}
```

- `shadow-kept` matches `shadow-*` only → **ignored** by `.nciignore`.
- `shadow-blocked` is **not** ignored by `.nciignore` (negation wins), but **`packages.exclude` removes it**.
- `other-pkg` is unaffected by `.nciignore` and exclude → **indexed** (subject to earlier include gates).
