# NCI Web Design System Guidelines

This workspace uses Tailwind CSS v4 with tokens defined in `app/globals.css` under `@theme`.

## Font system

- Fonts: `Inter` (sans), `Geist Mono` (monospace / code), and `Inter Tight` (display sans — **only** for the primary hero label `Native Context Index`).
- The fonts are configured in `app/layout.tsx` and exposed via `@theme` in `app/globals.css`.
- Global aliases: `--font-sans: var(--font-inter)`, `--font-mono: var(--font-geist-mono), …` — use Tailwind `font-mono` for all code, terminals, JSON snippets, and inline `<code>` in MDX.
- **Note**: `Inter Tight` is strictly reserved for the primary hero label (`Native Context Index`) and is not to be used elsewhere. All other uppercase labels should use standard `Inter` with appropriate tracking.

### Code & monospace

- Inline code in MDX maps to the `.nci-code-chip` utility (primary-tinted pill with inset shadow) so identifiers stand out from body copy.
- Fenced code blocks use `font-mono` (Geist Mono) inside `.nci-panel-stack` / `.nci-panel-stack-inner` for the nested rounded shell (matches docs dashboard panels).

### Stacked panels (dashboard shell)

- `.nci-panel-stack` — outer rounded frame (`rounded-3xl`), elevated background, thin border, inset highlight shadow.
- `.nci-panel-stack-inner` — inner rounded surface (`rounded-2xl`), `surface` background — use for docs page body, MDX `<pre>`, and compound widgets like `InstallPicker`.

## Color tokens

- `primary`: `#5A3CF0`
- `dark`: `#4429C6`
- `light`: `#7A63F5`
- `accent`: `#027582`
- `ink`: `#111318`
- `muted`: `#5F6675`
- `border`: `#DFE3EC`
- `surface`: `#F7F8FC`
- `surface-hover`: `#EEF1F9`
- `elevated`: `#FFFFFF`
- Solid buttons (`primary`, `accent`): hover uses `/90` on the fill (no separate hover token). Embossed shadow: `0 2px 4px #00000038, 0 6px 12px -4px #00000028, inset 0 -3px #00000026, inset 0 1px #ffffff52`

## Usage

- Prefer semantic usage (primary, muted, surface, border) over direct hex.
- Keep high contrast for text and interactive elements.
- Use `accent` sparingly for emphasis or secondary CTAs (see `Button` `accent` variant).

## Typography baseline

- Headings use extra tight tracking (`-0.05em`) for a sharper product feel:
  - `h1-h3`: `letter-spacing: -0.05em`, `line-height: 0.9`
  - `h4-h6`: `letter-spacing: -0.025em`, `line-height: 1.1`
- Body copy (`p`) uses tight tracking (`-0.025em`) with `line-height: 1.6` for readability.
- This creates hierarchy using Inter for almost all UI and copy, with Inter Tight reserved for the hero product name only.

## Letter-spacing tokens

The Tailwind theme exposes two custom tracking values; combined with two reserved arbitrary values for uppercase labels, this is the full vocabulary. Do not invent ad-hoc values without adding them here first.

| Class                | Value      | Use for                                                                                 |
| -------------------- | ---------- | --------------------------------------------------------------------------------------- |
| `tracking-tight-sub` | `-0.05em`  | Display headings (`h1`, `h2`, hero/product copy)                                        |
| `tracking-tight-p`   | `-0.025em` | Body paragraphs, captions, card descriptions                                            |
| `tracking-[0.11em]`  | `+0.11em`  | Primary uppercase eyebrows and labels (page intros, callout titles, hero label)         |
| `tracking-[0.08em]`  | `+0.08em`  | Smaller utility uppercase labels (sidebar groups, table column headers, kbd, footnotes) |

If a new value is needed, add a row above and link the consumer.

## Buttons

There are two interaction primitives for buttons. Always reach for these before writing custom button HTML.

- `Button` (`components/ui/button.tsx`) — single button. Variants: `primary`, `accent`, `outline`, `ghost`. Sizes: `sm`, `md`. The `primary` and `accent` variants carry the unique embossed shadow signature.
- `SplitButton` (`components/ui/split-button.tsx`) — segmented buttons sharing one rounded pill. Compound parts: `SplitButton.Root`, `SplitButton.Main`, `SplitButton.IconTrigger`. Variants/sizes match `Button`. Use this whenever a primary command needs a paired secondary action (copy, dropdown, change-context).

When a button-like surface needs custom internals (icon + text + kbd hint, etc.), wrap the children with `buttonVariants(...)` rather than reinventing the rounded pill, transitions, focus ring, and height. Only opt out of `Button`/`SplitButton` for non-action surfaces (tabs, filter pills, list rows, copy-icon affordances inside a code block).

When a new variant is needed, add it to `buttonVariants` and `splitButtonRootVariants` at the same time, and only ship a solid variant if it carries the embossed shadow signature.

## Compound components

`COMPOUND_COMPONENT.md` describes the namespaced compound pattern (`Component.Root`, `Component.Subpiece`, …) backed by an internal context. Use it for any widget with multiple sub-areas that share state.

The `/docs` surface ships these compounds under `apps/web/components/docs/widgets/`:

- `Callout` — `Root`, `Title`, `Body`. Variants: `info`, `tip`, `warning`, `success`.
- `Terminal` — `Root`, `Command`, `Output`. Typewriter activates on first `useInView`.
- `InstallPicker` — `Root`, `Control` — package manager chooser with `SplitButton` + `Popover` (stacked panel shell on the control).
- `CommandPalette` — `Root`, `Overlay`, `Input`, `PillRow`, `Results`, `Footer`. Opened with Cmd/Ctrl+K or `/`.
- `FlagTable` — `Root`, `Search`, `SubcommandFilter`, `Body`.
- `SideBySide` — `Root`, `Panel`, `Highlight`, `Reveal`, `DetailSlider`.
- `Pipeline` — `Root`, `Stage`, `StagePanel`, `StageNote`, `MaxHopsToggle`, `HopsResult`. Stages activate on `useInView`.
- `AgentLoop` — `Root`, `Frame`, `Thought`, `ToolCall`, `Response`, `Controls`. Scripted state machine.
- `ConfigBuilder` — `Root`, `GroupSection`, `Field`, `Preview`, `ValidationBadge`.

Note: `DocsNav` (`Root`, `Group`, `Item`) ships **named exports** rather than a namespace object. Reason: it is consumed by a server component (the docs layout). Namespace objects do not survive the server→client RSC boundary. This is the only intentional exception in the docs surface.
