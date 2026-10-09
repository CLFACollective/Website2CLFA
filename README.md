# CLFA Collective

Astro rebuild of the CLFA Collective marketing site. Currently: the
homepage (`src/pages/index.astro`). Four more pages are planned — see
notes below on where the shared pieces live.

## Stack

- **Astro** — static site, no client framework required (every section
  is a plain `.astro` component with a small `<script type="module">`
  next to the markup it drives).
- **GSAP + ScrollTrigger** — every scroll-linked and interactive
  animation: the hero's scrollytelling sequence, the Day One rail, the
  Momentum horizontal pin, the brand-in-motion card arc, the mega menu,
  section reveals, count-up figures, and the marquees.
- **Plain CSS** — one stylesheet (`src/styles/global.css`) built on CSS
  custom properties for the palette/type/spacing scale, plus a scoped
  `<style>` block per component for anything section-specific.

Two effects are deliberately **not** GSAP: `BlingField` (the twinkling
dust canvas) and `GridField` (the interactive graph-paper ground) are
per-pixel `<canvas>` particle/line renderers on their own `rAF` loop —
GSAP animates discrete DOM/CSS properties, not raw pixels, so a plain
canvas loop is the right tool there, same as it was in the source.

## Commands

| Command           | Action                                      |
| ------------------ | -------------------------------------------- |
| `npm install`       | install dependencies                         |
| `npm run dev`        | start the dev server (`localhost:4321`, or the next free port) |
| `npm run build`       | production build to `dist/`                |
| `npm run preview`      | preview the production build              |

## Editing content (Sveltia CMS)

These areas are edited in [Sveltia CMS](https://sveltiacms.app) at
`/admin`, not in code. Each one is a JSON file the page reads at build time:

| Area | File |
| --- | --- |
| Site-wide: menu & footer links, LinkedIn URL | `src/data/navigation.json` |
| Home: intro paragraph, client marquee | `src/data/home.json` |
| Home: "Brand in motion" cards (up to 5, reorderable) | `src/data/cards.json` |
| Home: Ribbon Section (semicolon-separated phrases) | `src/data/ribbon.json` |
| Home: Momentum cards (add, remove, reorder stats and quotes) | `src/data/momentum.json` |
| What We Do: Services accordion | `src/data/services.json` |
| FAQs: groups and questions | `src/data/faqs.json` |

The CMS setup is `public/admin/config.yml`. Saving there commits the file
to the branch named under `backend.branch`, and Netlify rebuilds from that commit.

- **Locally:** run `npm run dev`, open `http://localhost:4321/admin/index.html`
  in Chrome or Edge, choose **Work with Local Repository**, and pick this
  folder. Saves go straight to the files on disk and the dev server reloads.
  Nothing is committed. Review the change with `git diff`, then commit it yourself.
- **On Netlify:** open `/admin/` on the deployed site and sign in with GitHub
  (Netlify's OAuth provider. One-time setup: `docs/cms-netlify-setup.md`).
  Editors need write access to the GitHub repo.
- Text fields are plain text. `**double asterisks**` make words bold where
  the field says so, and Enter makes a line break.
- **Adding a page:** pages are built in code (`src/pages/*.astro`), not in
  the CMS. Once a page exists, add its link under **Site-wide → Menu &
  footer links** (one entry feeds both). The test suite fails until every
  page is linked, and the sitemap picks new pages up automatically.
- Momentum's final screen uses the designed Figma layout while the cards
  follow the original pattern (short quote, three stats, long quote).
  Any other set of cards is laid out on an even grid automatically.

## Structure

```
src/
  components/   one .astro file per section (Nav, Hero, DayOne, …)
  layouts/      Layout.astro — <head>, global CSS, the logo symbol + cursor
  lib/          large static data ported from the source (SVG path data, card copy)
  pages/        index.astro — assembles the homepage from components
  scripts/      GSAP setup + one module per animated behaviour
  styles/       global.css — tokens, base styles, section CSS
```

For the next four pages: add `src/pages/<name>.astro`, reuse `Layout`,
`Nav`, `Footer`, and whichever section components apply — most were
written generically enough to drop into a new page as-is (`Ribbons`,
`LogoScroller`, `WindowA`/`WindowB` patterns, `BlingField`/`GridField`).
`global.css`'s tokens (`--pink`, `--flare`, `--gut`, `--maxw`, `--ease`,
etc.) are the source of truth for the design system — reach for them
before hard-coding a value.

## Notes on the port

- Ported from a Figma Make React/Vite export (`source/CFLA Homepage
  V2c`). Content and visual design are unchanged; the scroll
  choreography was rebuilt on GSAP/ScrollTrigger (the source drove it
  with hand-rolled `rAF` + CSS custom properties).
- Two dead CSS paths from the source were dropped rather than ported:
  a leftover `HeroOptionB` implementation (superseded by `HeroOptionC`,
  which is what actually ships) and a 320KB base64 photo (`--photo`)
  that no rendered element ever referenced.
- The footer's internal draft/version note ("Draft R21 light · landing
  page only") was cut as clearly-internal copy that shouldn't ship.
- `PinkCursor` is a straight port of the source's custom cursor
  (hidden system cursor on fine-pointer devices, a dot that follows the
  mouse and flips white over `data-cursor="invert"` elements), now
  smoothed with `gsap.quickTo` instead of a raw transform assignment.
