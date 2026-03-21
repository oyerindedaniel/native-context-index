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

### Generic Notation (The "Noten" Concept)

All fixtures and test symbols must use **functional, purpose-driven notation**. This ensures that the test suite decoupled from implementation details.

1.  **Fixtures**: Names must describe the technical scenario (e.g., `complex-wildcard-subpaths`), not the development status (❌ `resolver-final-gap`) or internal branch (❌ `resolver-branch-test`).
2.  **Comments**: Avoid referencing line numbers or coverage metrics. Use descriptions of the behavior being verified (e.g., "Verifies recursive wildcard success" instead of ❌ "Triggers Line 343").
3.  **Symbols**: All test variables and objects must have descriptive roles. Use `mockPackageJson` or `fixturePath` instead of single-letter variables (❌ `p`, `f`).

### Test Descriptions

`describe` and `it` blocks must use generic, purpose-driven language. They should describe **what** the code solves or **how** it behaves, rather than referencing internal metrics like "coverage" or implementation details like "testing the if statement."

**Example**:
- ❌ `it("hits the else branch in parseFile for coverage")`
- ✅ `it("handles missing module specifiers gracefully")`
