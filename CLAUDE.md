# CLAUDE.md

Project overview, stack, and structure: see `README.md`. This file is
Claude-Code-specific working instructions.

## Testing workflow

This project has a Playwright suite in `tests/`. Follow this workflow,
not just ad-hoc manual checking:

- **After any nontrivial change — especially anything touching layout,
  a component's markup/CSS, or an animation script — run the suite
  before doing anything else:**
  ```
  npm test
  ```
  Fix failures before considering the task done. A failure here means
  something regressed; don't just eyeball the page and call it fine.

- **When adding a new feature or fixing a bug that's easy to regress
  silently** (a line that must not wrap, a focus behavior, an element
  that must pause/resume, a color/position pulled from a Figma
  reference), **add a Playwright test for it in the same change**, not
  just a scratch script used to debug and then thrown away. Put it in
  the most relevant existing `tests/*.spec.ts` file, or add a new one
  if it's its own concern.

- **For UI changes, verify visually too, not only via assertions** —
  navigate with a real browser (Playwright's `page.screenshot()`, or
  `mcp__playwright__browser_*` if available in this session) and
  actually look at before/after, especially for anything spacing- or
  Figma-reference-driven where "the assertion passed" doesn't confirm
  it *looks* right.

- Tests run against `astro dev` by default (fast, auto-started by
  `playwright.config.ts`'s `webServer`). Before calling a **large**
  change done, do one pass against the production build too — dev and
  prod have occasionally differed in this project:
  ```
  npm run build && npm run preview &
  PW_BASE_URL=http://localhost:4321 npm test
  ```

- `npm run test:ui` for interactive/watch mode while writing a test.
  `npm run test:report` to open the last HTML report.

### Projects

Three Playwright projects run every test by default: `desktop`
(1440×900 Chromium), `mobile-chromium`, and `mobile-webkit` (both
iPhone-sized). **Don't drop `mobile-webkit` for speed** — this
codebase has repeatedly hit real bugs that only show up on the actual
WebKit engine (mask-image compositing cost, `will-change` layer
retention causing iPad memory crashes), invisible on Chromium alone.

### A real gotcha when writing new tests

**`element.getAnimations()` does not see GSAP-driven animations** —
only native CSS `@keyframes`/Web Animations. Most of this site's
motion is GSAP tweening a CSS custom property or `x`/`xPercent`
directly via its own ticker, not the native Animations API. Checking
play state with `getAnimations()` on a GSAP-driven element silently
always reports empty and gives a false pass.

- **GSAP-driven** (ShineField's sweep bands, the marquees, Day One's
  rail-halo pulses, the count-up figures, the Momentum panel pan):
  verify by **sampling a value twice with a wait in between**
  (`getComputedStyle(...).transform`, or a custom property like
  `--band`) and asserting it did/didn't change.
- **Native CSS `@keyframes`** (ShineField's sparkle squares, the
  shimmer dust dots, BrandInMotionCards' idle icon animations):
  `element.getAnimations()` + checking `playState` is valid here.

See `tests/animation-lifecycle.spec.ts` for both patterns side by
side.

### Keyboard-navigation tests are desktop-only

Playwright's mobile device emulation (`isMobile`/`hasTouch`) doesn't
reliably drive sequential `Tab` focus navigation — confirmed directly
(`page.keyboard.press("Tab")` never moves focus off `<body>` on the
mobile projects, even though the underlying mechanism is unchanged and
passes on desktop). Tab/Escape-key navigation is inherently an
external-keyboard concern anyway. Scope keyboard-interaction tests to
skip on mobile (`test.skip(({ isMobile }) => isMobile, "...")`) rather
than fighting the emulation — see `tests/accessibility.spec.ts`.
