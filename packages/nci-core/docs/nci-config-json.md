# nci.config.json Contract

This document defines the user-facing `nci.config.json` contract.

## Contract

- Config is discovered by walking upward to the nearest `nci.config.json`.
- All keys are optional.
- CLI flags override config values.
- `parallel` and `parallel_resolve_deps` are internal-only and not part of the user contract.
- `database` path semantics are explicit:
  - absolute path: used as-is.
  - relative path: resolved from the owning `nci.config.json` directory.
  - missing key: default fallback cache path is used.

## Supported Keys

- `database`: path to SQLite database file.
- `project_root`: default project root when `-r/--project-root` is not passed.
- `format`: default output format (`plain`, `json`, or `jsonl`).
- `max_hops`: declaration crawl depth (`0` entry-only, `-1` unlimited).
- `packages.include`: package-name include globs.
- `packages.exclude`: package-name exclude globs.
- `dependency_stub_packages`: package roots resolved as `npm::...` stubs.
- `workspaces`: workspace directory patterns used for monorepo package discovery.

## Complete Example

```json
{
  "database": ".nci/nci.sqlite",
  "project_root": ".",
  "format": "json",
  "max_hops": 10,
  "packages": {
    "include": ["@scope/*", "react*"],
    "exclude": ["@scope/experimental-*", "react-native*"]
  },
  "dependency_stub_packages": ["packages/app-a", "packages/app-b"],
  "workspaces": ["apps/*", "packages/*"]
}
```

## Database Path Examples

### Relative Database Path

```json
{
  "database": ".nci/nci.sqlite"
}
```

If this file is `C:/repo/nci.config.json`, DB resolves to `C:/repo/.nci/nci.sqlite`.

### Absolute Database Path

```json
{
  "database": "C:/Users/doyer/AppData/Local/nci/nci.sqlite"
}
```

This path is used exactly as written.

## Discovery and Precedence

1. Nearest `nci.config.json` is selected.
2. Config values are read from that file.
3. CLI flags override config values.

### Package name filters (indexing)

These control **which discovered `node_modules` packages** are indexed. Order:

1. `include_names` (if used; exact match).
2. `packages.include` globs, merged with CLI `--package` globs when that combined list is non-empty.
3. Dependency-section filter when enabled (otherwise all sections).
4. `.nciignore` from the same nearest-config directory (gitignore-style; last match wins).
5. `packages.exclude` globs merged with CLI `--exclude`.

If `packages.exclude` matches a name, that package is dropped **even** when `.nciignore` would have un-ignored it with `!…`.

## Monorepo Behavior

- Running from root usually resolves root config.
- Running from a workspace with its own `nci.config.json` resolves workspace config.
- Ignore file scope follows the same nearest-config owner rule.
