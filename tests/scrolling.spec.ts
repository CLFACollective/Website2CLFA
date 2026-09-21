import { test, expect, type Page } from "@playwright/test";
import { collectErrors, skipHeroMovie } from "./helpers";

/**
 * Scroll mechanics on iPad/iPhone specifically — this is where the
 * reported crashes actually happened (see conversation history: the
 * will-change layer retention and unbounded-animation fixes). Runs on
 * mobile-chromium, mobile-webkit, and ipad; skipped on desktop, which
 * has its own separate `.is-gone`-based logo behavior and isn't what
 * was reported.
 *
 * Two complementary techniques:
 * - Instant `window.scrollTo()` jumps for precise position/state
 *   assertions (did this sticky section actually pin, then release?).
 * - Gradual `mouse.wheel()` deltas for the "does it ever visibly
 *   stall" check — closer to a real scroll gesture than a JS jump,
 *   which bypasses whatever native scroll handling a stuck page would
 *   actually get stuck in.
 */
test.describe("scroll mechanics on iPad/iPhone", () => {
  test.skip(({ isMobile }) => !isMobile, "desktop has different logo/pin timing, not what was reported");

  async function docRect(page: Page, selector: string) {
    return page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { top: r.top + window.scrollY, height: r.height };
    }, selector);
  }

  async function stageTop(page: Page, selector: string) {
    return page.evaluate((sel) => document.querySelector(sel)?.getBoundingClientRect().top ?? null, selector);
  }

  test.beforeEach(async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    await skipHeroMovie(page);
  });

  // BrandInMotionCards drops its sticky pin entirely under 1000px (see
  // BrandInMotionCards.astro's `@media (max-width: 999px)` block) in
  // favor of a JS-driven reveal-stack — every mobile/tablet project this
  // describe runs on is under that width, so it's not a pin candidate
  // here at all and is checked separately below. Hero itself no longer
  // pins at all (see hero-movie.spec.ts) so it's dropped from this list
  // entirely rather than given a noBeforeCheck escape hatch.
  const PINS = [
    { name: "DayOne", wrapper: "#partnering", stage: "#partnering .pinday__stage" },
    { name: "Momentum", wrapper: "#momentum", stage: "#momentum .pin__stage" },
  ];

  for (const { name, wrapper, stage } of PINS) {
    test(`${name}: sticky stage pins while its section is active, releases after`, async ({ page }) => {
      const rect = await docRect(page, wrapper);
      expect(rect, `${wrapper} should exist`).not.toBeNull();
      const { top, height } = rect!;

      // before entering: not yet pinned (stage sits below the viewport top)
      await page.evaluate((y) => window.scrollTo(0, y), Math.max(0, top - 50));
      await page.waitForTimeout(150);
      const beforeTop = await stageTop(page, stage);
      expect(beforeTop, `${name} should not be pinned before its section`).toBeGreaterThan(20);

      // mid-section: pinned to the top of the viewport
      await page.evaluate((y) => window.scrollTo(0, y), top + height * 0.5);
      await page.waitForTimeout(150);
      const midTop = await stageTop(page, stage);
      expect(Math.abs(midTop ?? 999), `${name} should be pinned (top ~= 0) mid-section`).toBeLessThan(5);

      // well past: released, scrolled normally off the top
      await page.evaluate((y) => window.scrollTo(0, y), top + height + 300);
      await page.waitForTimeout(150);
      const afterTop = await stageTop(page, stage);
      expect(afterTop, `${name} should release (top well negative) after its section`).toBeLessThan(-50);
    });
  }

  test("BrandInMotionCards: uses the static reveal-stack (not sticky pin) at this width", async ({ page }) => {
    const errors = collectErrors(page);
    const position = await page.evaluate(
      () => getComputedStyle(document.querySelector("#motion .bmc__stage")!).position,
    );
    expect(position).toBe("static");

    const rect = await docRect(page, "#motion .bmc__pin");
    expect(rect).not.toBeNull();
    const { top, height } = rect!;
    for (const frac of [0.25, 0.5, 0.75, 1]) {
      await page.evaluate((y) => window.scrollTo(0, y), top + height * frac);
      await page.waitForTimeout(120);
    }
    expect(errors).toEqual([]);
  });

  test("BrandInMotionCards: a card's icon lights up once it's slid into its resting position", async ({ page }) => {
    // Touch devices have no :hover, and the reveal-stack has no single
    // "current" card the way the desktop arc does (every dealt card
    // stays visible) — an icon lighting up here has to be driven by
    // the card having finished sliding into place, not by hover or a
    // scroll-driven "lead card" concept.
    const rect = await docRect(page, "#motion .bmc__pin");
    expect(rect).not.toBeNull();
    const { top, height } = rect!;

    const readActive = () =>
      page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>("#motion .bmc__card")).map((c) => c.dataset.active));

    // at rest (top of the stack): the first card starts already dealt
    await page.evaluate((y) => window.scrollTo(0, y), top);
    await page.waitForTimeout(150);
    const atStart = await readActive();
    expect(atStart[0]).toBe("true");
    expect(atStart[4]).toBe("false");

    // scrolled through the whole pile: every card has settled into place
    await page.evaluate((y) => window.scrollTo(0, y), top + height);
    await page.waitForTimeout(300);
    const atEnd = await readActive();
    expect(atEnd.every((v) => v === "true")).toBe(true);
  });

  test("Momentum: vertical scroll through the pin drives the horizontal panel pan", async ({ page }) => {
    const rect = await docRect(page, "#momentum");
    expect(rect).not.toBeNull();
    const { top, height } = rect!;

    const readX = () => page.evaluate(() => getComputedStyle(document.getElementById("hsTrack")!).transform);

    await page.evaluate((y) => window.scrollTo(0, y), top + height * 0.3);
    await page.waitForTimeout(300);
    const x1 = await readX();

    await page.evaluate((y) => window.scrollTo(0, y), top + height * 0.7);
    await page.waitForTimeout(300);
    const x2 = await readX();

    expect(x1).not.toBe(x2);
  });

  test("gradual scroll never stalls across the full page, forward and back", async ({ page, browserName }) => {
    const errors = collectErrors(page);

    const scrollHeight = await page.evaluate(() => document.body.scrollHeight);
    const positions: number[] = [];

    // `page.mouse.wheel()` isn't supported in Playwright's mobile WebKit
    // emulation (no touch-swipe gesture API exists there either), so on
    // webkit projects (mobile-webkit, ipad) fall back to stepped
    // `scrollBy` calls — still gradual/incremental, still exercises the
    // "does position keep advancing" check, just not a literal hardware
    // wheel event.
    const step =
      browserName === "webkit"
        ? async () => page.evaluate(() => window.scrollBy(0, 400))
        : async () => page.mouse.wheel(0, 400);

    for (let i = 0; i < 60; i++) {
      await step();
      await page.waitForTimeout(40);
      positions.push(await page.evaluate(() => window.scrollY));
      if (positions.at(-1)! >= scrollHeight - (page.viewportSize()?.height ?? 0) - 5) break;
    }

    // scroll position should have made real forward progress overall,
    // and never gone a long stretch of steps with zero movement (a
    // stall) except right at the bottom, where it's expected to stop
    let stalledSteps = 0;
    let maxStall = 0;
    for (let i = 1; i < positions.length; i++) {
      if (positions[i] === positions[i - 1]) {
        stalledSteps++;
        maxStall = Math.max(maxStall, stalledSteps);
      } else {
        stalledSteps = 0;
      }
    }
    // allow a handful of consecutive no-movement steps (e.g. sitting in
    // a pinned section can occasionally coincide with a wheel event
    // that doesn't register as scrollY movement) but not a long freeze
    expect(maxStall, "scroll position should not freeze for many consecutive steps").toBeLessThan(15);
    expect(positions.at(-1)!).toBeGreaterThan(scrollHeight * 0.5);

    // and back up
    const stepBack =
      browserName === "webkit"
        ? async () => page.evaluate(() => window.scrollBy(0, -400))
        : async () => page.mouse.wheel(0, -400);
    for (let i = 0; i < 60; i++) {
      await stepBack();
      await page.waitForTimeout(40);
      if ((await page.evaluate(() => window.scrollY)) <= 5) break;
    }
    const finalY = await page.evaluate(() => window.scrollY);
    expect(finalY).toBeLessThan(200);

    expect(errors).toEqual([]);
  });
});
