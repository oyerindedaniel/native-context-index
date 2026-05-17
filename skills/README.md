# NCI Skills

Agent skills for [Native Context Index](https://github.com/oyerindedaniel/native-context-index). Each skill is a folder with a `SKILL.md` file ( [Agent Skills](https://agentskills.io/) shape).

## Install with npx skills

From [vercel-labs/skills](https://github.com/vercel-labs/skills):

```bash
# List skills in this repo
npx skills add oyerindedaniel/native-context-index --list

# Onboarding only (recommended first)
npx skills add oyerindedaniel/native-context-index --skill nci -a cursor -y

# Both shipped skills
npx skills add oyerindedaniel/native-context-index --skill nci --skill nci-answer-quality -y
```

Symlink (default) keeps one canonical copy per agent; use `--copy` when symlinks are unsupported.

## Shipped skills

| Skill | Purpose |
| ----- | ------- |
| **`nci`** | Fresh-agent onboarding: CLI check → `init` / `index` → read compact primer → `active-package` + `evidence` fast path. |
| **`nci-answer-quality`** | Strict signature-backed answers: proof, wrong-alternative check, confidence line. Use after `nci` when correctness matters. |

`skills/nci/PRIMER.md` is generated from `@repo/nci-agent-primer` (same text as MCP `nci://primer/agent`). Regenerate after primer edits:

```bash
pnpm sync:skill-primer
```

## Layout

```
skills/
  nci/
    SKILL.md      # onboarding protocol
    PRIMER.md     # generated compact primer
    MCP.md        # MCP host quick reference
  nci-answer-quality/
    SKILL.md
```

The `nci` CLI does not read this directory; skills are for agent hosts (Cursor, Claude Code, Codex, OpenCode, etc.).
