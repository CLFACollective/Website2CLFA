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

  // Day One used to pin here too; it plays on a timer now (see
  // animation-lifecycle.spec.ts). The cards deck is the one pin left.
  test("BrandInMotionCards: pins as a deck — the heading stays visible below the nav the whole way through", async ({ page }) => {
    const errors = collectErrors(page);
    const position = await page.evaluate(
      () => getComputedStyle(document.querySelector("#motion .bmc__stage")!).position,
    );
    expect(position).toBe("sticky");

    const rect = await docRect(page, "#motion .bmc__pin");
    expect(rect).not.toBeNull();
    const { top, height } = rect!;
    const vh = await page.evaluate(() => innerHeight);
    for (const frac of [0, 0.25, 0.5, 0.75, 1]) {
      await page.evaluate((y) => window.scrollTo(0, y), top + (height - vh) * frac);
      await page.waitForTimeout(450);
      const g = await page.evaluate(() => {
        const q = document.querySelector("#motion .bmc__q")!.getBoundingClientRect();
        const nav = document.querySelector(".nav__logo")!.getBoundingClientRect();
        const card = Array.from(document.querySelectorAll<HTMLElement>("#motion .bmc__card"))
          .find((c) => c.dataset.active === "true")?.getBoundingClientRect();
        return { qTop: q.top, qBottom: q.bottom, navBottom: nav.bottom, cardTop: card?.top ?? null };
      });
      expect(g.qTop, `heading in view at ${frac}`).toBeGreaterThanOrEqual(g.navBottom);
      expect(g.qBottom).toBeLessThan(vh);
      if (g.cardTop !== null) expect(g.cardTop, `front card clear of the heading at ${frac}`).toBeGreaterThan(g.qBottom - 4);
    }
    expect(errors).toEqual([]);
  });

  test("BrandInMotionCards: each card comes to the front of the deck in turn, centred and fully on screen", async ({ page }) => {
    // touch has no :hover — the front card's icon lights up instead
    const rect = await docRect(page, "#motion .bmc__pin");
    expect(rect).not.toBeNull();
    const { top, height } = rect!;
    const vh = await page.evaluate(() => innerHeight);
    const front = () =>
      page.evaluate(() => {
        const cards = Array.from(document.querySelectorAll<HTMLElement>("#motion .bmc__card"));
        const i = cards.findIndex((c) => c.dataset.active === "true");
        const r = cards[i]?.getBoundingClientRect();
        return { i, active: cards.filter((c) => c.dataset.active === "true").length, r: r && { left: r.left, right: r.right, top: r.top, bottom: r.bottom }, vw: innerWidth };
      });
    const n = await page.locator("#motion .bmc__card").count();
    for (let card = 0; card < n; card++) {
      // each card's hold is the middle of its stretch of the pin
      const p = n > 1 ? card / (n - 1) : 0;
      await page.evaluate((y) => window.scrollTo(0, y), top + (height - vh) * p);
      await page.waitForTimeout(500);
      const f = await front();
      expect(f.i, `card ${card} in front`).toBe(card);
      expect(f.active).toBe(1);
      expect(Math.abs((f.r!.left + f.r!.right) / 2 - f.vw / 2)).toBeLessThan(2);
      expect(f.r!.top).toBeGreaterThan(0);
      expect(f.r!.bottom).toBeLessThan(vh);
    }
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
