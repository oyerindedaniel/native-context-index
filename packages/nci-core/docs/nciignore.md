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

`.nciignore` composes with package include/exclude filters:

1. Include filters (`packages.include`, CLI package globs).
2. `.nciignore` rules.
3. Exclude filters (`packages.exclude`).

If any stage excludes a package, the package is filtered out.
