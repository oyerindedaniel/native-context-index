# NCI Web Design System Guidelines

This workspace uses Tailwind CSS v4 with tokens defined in `app/globals.css` under `@theme`.

## Font system

- Font family: `Inter` only for now.
- The font is configured in `app/layout.tsx` as a CSS variable: `--font-inter`.
- Global alias for utilities/components: `--font-sans: var(--font-inter)`.

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

- Headings use tighter tracking for a sharper product feel:
  - `h1-h3`: `letter-spacing: -0.025em`, `line-height: 1.12`
  - `h4-h6`: `letter-spacing: -0.015em`, `line-height: 1.2`
- Body copy (`p`) keeps normal letter spacing with `line-height: 1.65` for readability.
- This creates hierarchy with one font family (Inter) without adding extra font complexity.

## Tooling note

Some editor CSS linters may warn on Tailwind v4 directives like `@theme` even when the app builds correctly. Use project lint/type/build scripts as the source of truth.
