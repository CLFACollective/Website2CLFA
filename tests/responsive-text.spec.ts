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

test("'Here's what partnering with us is actually like.': lines don't collide (the g of partnering vs the ll of actually)", async ({ page }) => {
  await page.goto("/");
  const { lh, fs } = await page.$eval("h2.win__partnering-head", (el) => {
    const cs = getComputedStyle(el);
    return { lh: parseFloat(cs.lineHeight), fs: parseFloat(cs.fontSize) };
  });
  expect(lh / fs).toBeGreaterThanOrEqual(1.02);
});

test("page hero copy uses the full width on phones (no desktop measure pinching it)", async ({ page, isMobile }) => {
  test.skip(!isMobile, "phones");
  for (const [path, sel] of [["/about", ".abt__stand"], ["/what-we-do", ".wwd__stand"]]) {
    await page.goto(path);
    const g = await page.$eval(sel, (el) => {
      const p = el.parentElement!, cs = getComputedStyle(p);
      const parent = p.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      return { max: getComputedStyle(el).maxWidth, w: el.getBoundingClientRect().width, parent };
    });
    expect(g.max, sel).toBe("none");
    expect(Math.abs(g.w - g.parent), sel).toBeLessThan(2);
  }
});

test("What We Do opener: 'Strategy, creative, and execution…' flows as one paragraph, no forced breaks", async ({ page }) => {
  await page.goto("/what-we-do");
  await expect(page.locator(".wwd__stand br")).toHaveCount(0);
});

test("What We Do: the heading and the intro split 50/50, the intro stacked (question 1.2× the paragraph) and smaller than the heading", async ({ page, isMobile }) => {
  test.skip(isMobile, "stacked on phones");
  await page.goto("/what-we-do");
  const g = await page.evaluate(() => {
    const fs = (sel: string) => parseFloat(getComputedStyle(document.querySelector(sel)!).fontSize);
    const r = (sel: string) => document.querySelector(sel)!.getBoundingClientRect();
    const head = r(".mfe__head"), intro = r(".mfe__intro"), ask = r(".mfe__ask"), lede = r(".mfe__lede");
    const cols = getComputedStyle(document.querySelector(".mfe__top")!).gridTemplateColumns.split(" ").map(parseFloat);
    return { ratio: fs(".mfe__ask") / fs(".mfe__lede"), headFs: fs(".mfe__head"), askFs: fs(".mfe__ask"), cols, askBottom: ask.bottom, ledeTop: lede.top, sideBySide: head.right <= intro.left };
  });
  expect(g.ratio).toBeCloseTo(1.2, 2);
  expect(g.askBottom, "question on top").toBeLessThanOrEqual(g.ledeTop);
  expect(g.sideBySide).toBe(true);
  expect(g.cols).toHaveLength(2);
  expect(Math.abs(g.cols[0] - g.cols[1]), "two equal columns").toBeLessThan(1);
  expect(g.askFs, "less prominent than the heading").toBeLessThan(g.headFs * 0.6);
});

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
