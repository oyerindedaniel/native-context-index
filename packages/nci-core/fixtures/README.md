# Fixtures Directory

This directory contains test fixtures for the `nci-core` package.

## Convention

### Static Fixtures (committed)

Stable, reusable test scenarios live as committed directories (e.g., `simple-export/`, `re-export-chain/`). Each directory represents a minimal package structure with a `package.json` and `.d.ts` files.

Use static fixtures when the test data is:
- Deterministic and reproducible
- Reused across multiple tests
- Worth inspecting manually during debugging

### Dynamic Temps (runtime-created)

Edge cases that cannot be committed (broken symlinks, corrupt JSON, platform-specific scenarios) are created at runtime using `os.tmpdir()` and cleaned up in `finally` blocks.

Use dynamic temps when:
- The scenario involves OS-level operations (symlinks, permissions)
- The file content is intentionally invalid (corrupt JSON)
- The test is platform-specific

### Naming

- Static fixtures use `kebab-case` names (e.g., `subpath-exports/`)
- Dynamic temps use `nci-test-` prefix in `os.tmpdir()` (e.g., `nci-test-broken-symlink`)
- The `.gitignore` includes `__*` as a safety net for any leftover temp dirs
