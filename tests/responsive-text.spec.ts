import { test, expect } from "@playwright/test";
import { skipHeroMovie } from "./helpers";

/**
 * A handful of headings/phrases were explicitly required to never wrap
 * mid-phrase, at any width the site ships at (see conversation history:
 * "And after day one?", "All of them are moving fast.", "strategy,
 * creative, and execution", the BrandInMotionCards "Ready to launch
 * (or...)" break). Each was fixed with either a measured font-size or
 * a forced line break — this suite catches the layout silently
 * drifting back into wrapping as copy, fonts, or breakpoints change.
 * Runs across every project (desktop + both mobile engines) since
 * these are required at every width, not just mobile.
 */
async function scrollToDoc(page: import("@playwright/test").Page, y: number) {
  await page.evaluate((yy) => window.scrollTo(0, yy), y);
  await page.waitForTimeout(150);
}

async function docTop(page: import("@playwright/test").Page, selector: string) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return r.top + window.scrollY;
  }, selector);
}

test.describe("required one-line phrases", () => {
  // Every test here scrolls, and Hero plays a locked ~9.5s intro movie
  // on load before scrolling works at all (see hero-movie.spec.ts) —
  // fast-forward it once, up front, for the whole file.
  test.beforeEach(async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    await skipHeroMovie(page);
  });

  test("KeepUp heading: both lines stay on one line each", async ({ page }) => {
    const y = await docTop(page, "[data-keep]");
    await scrollToDoc(page, (y ?? 0) - 100);

    const big = page.locator(".keepup__big");
    const lineTops = await big.evaluate((el) => {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      const tops = new Set<number>();
      let node: Node | null;
      // eslint-disable-next-line no-cond-assign
      while ((node = walker.nextNode())) {
        const r = document.createRange();
        r.selectNodeContents(node);
        for (const rect of r.getClientRects()) tops.add(Math.round(rect.top));
      }
      return tops.size;
    });
    // "And after day one?" + "We don't let up." -> exactly 2 lines
    expect(lineTops).toBe(2);

    const overflow = await big.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
    expect(overflow).toBe(false);
  });

  test('Who: "All of them are moving fast." is a single line', async ({ page }) => {
    const y = await docTop(page, "#who");
    await scrollToDoc(page, (y ?? 0) - 100);

    const hot = page.locator(".who__top p .hot");
    await expect(hot).toBeVisible();
    const lines = await hot.evaluate((el) => el.getClientRects().length);
    expect(lines).toBe(1);
  });

  test('Hero closing copy: "strategy, creative, and execution" is a single line', async ({ page }) => {
    await page.locator(".hcb__closing").scrollIntoViewIfNeeded();

    const strong = page.locator(".hcb__closing strong");
    const lines = await strong.evaluate((el) => el.getClientRects().length);
    expect(lines).toBe(1);
  });

  test("Hero closing copy: its own band after the hero, bold run on its own line with the period", async ({ page }) => {
    const closing = page.locator(".hcb__after .hcb__closing");
    await expect(closing).toHaveCount(1);
    expect(await closing.evaluate((el) => !el.closest("#hero"))).toBe(true);
    await closing.scrollIntoViewIfNeeded();
    // trailing punctuation stays with the bold line, never wraps alone
    const g = await closing.evaluate((el) => {
      const strong = el.querySelector("strong")!;
      const rects = Array.from(el.getClientRects());
      const last = el.lastChild;
      return { strongLines: strong.getClientRects().length, endsInStrong: last === strong || (last?.textContent ?? "").trim() === "" , n: rects.length };
    });
    expect(g.strongLines).toBe(1);
    expect(g.endsInStrong).toBe(true);
  });

  test('BrandInMotionCards: "Ready to launch" breaks before "(or..."', async ({ page }) => {
    // this card isn't required to scroll into view for its DOM/CSS to
    // be present — .bmc__copy always renders, only its animated
    // position depends on scroll
    const card = page.locator(".bmc__copy", { hasText: "Ready to launch" });
    await expect(card).toHaveCount(1);
    // a real <br>, not the .mobile-br that only breaks under 799px —
    // this one is required to break at every width
    const br = card.locator("br:not(.mobile-br)");
    await expect(br).toHaveCount(1);
    const fullText = (await card.innerText()).replace(/\s+/g, " ").trim();
    expect(fullText).toBe("Ready to launch (or should be ready to launch).");
  });
});
