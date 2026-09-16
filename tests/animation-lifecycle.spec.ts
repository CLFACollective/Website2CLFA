import { test, expect, type Page } from "@playwright/test";

/**
 * ShineField, the ribbon/logo marquees, the shimmer dust, the
 * BrandInMotionCards idle icons, and Day One's rail-halo pulses all
 * used to animate forever once mounted, regardless of scroll position
 * — confirmed live (scrolled to the footer, animations were still
 * ticking) and identified as a real contributor to reported iPad
 * crashes: unbounded, never-paused work compounds across a long
 * scroll session. Each now pauses via IntersectionObserver when its
 * section leaves the viewport and resumes when it's back near it.
 *
 * IMPORTANT: several of these are GSAP-driven (xPercent, CSS custom
 * properties written directly via GSAP's ticker) rather than native
 * CSS @keyframes — element.getAnimations() does NOT see GSAP-driven
 * properties, only native Web Animations. Checking play state on a
 * GSAP-driven element via getAnimations() silently always reports
 * empty/not-running and gives a false pass. Use value-sampling
 * (readValue twice with a wait between) for anything GSAP-driven;
 * getAnimations() is only valid for the native-CSS-animation cases
 * (shimmer dots, ShineField sparkle squares, card icons).
 */

async function isStatic(page: Page, readValue: () => Promise<string>, waitMs = 1200): Promise<boolean> {
  const before = await readValue();
  await page.waitForTimeout(waitMs);
  const after = await readValue();
  return before === after;
}

async function scrollToFooter(page: Page) {
  const h = await page.evaluate(() => document.body.scrollHeight);
  await page.evaluate((y) => window.scrollTo(0, y), h);
  await page.waitForTimeout(500);
}

/**
 * ShineField's three sweep/fade masks used to be three nested masked
 * DOM elements (a static height-fade wrapping an animated vertical
 * sweep wrapping an animated horizontal sweep) — confirmed as a real
 * iPad crash: sitting in Day One in view, not scrolling (so the
 * off-screen pause never applies) was enough to bring the tab down,
 * on both Safari and Chrome (same WebKit engine on iOS). A
 * mask-of-a-mask forces the browser to composite the inner masked
 * layer to its own offscreen surface and then mask that again — two
 * animated backing stores kept in sync every frame. Collapsed to one
 * element with a single multi-layer mask-image (mask-composite:
 * intersect). This guards the structural fix, not just the visual —
 * a future edit could reintroduce a nested masked wrapper without
 * changing how anything looks in a screenshot.
 */
test.describe("ShineField uses a single masked layer, not nested masks", () => {
  test("only one masked element per ShineField instance", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    const counts = await page.evaluate(() => {
      const wraps = Array.from(document.querySelectorAll<HTMLElement>(".shine-wrap"));
      return wraps.map((wrap) => {
        const maskedDescendants = Array.from(wrap.querySelectorAll<HTMLElement>("*")).filter((el) => {
          const cs = getComputedStyle(el);
          return cs.maskImage !== "none" || cs.getPropertyValue("-webkit-mask-image") !== "none";
        });
        return maskedDescendants.length;
      });
    });
    expect(counts.length).toBeGreaterThan(0);
    for (const n of counts) expect(n).toBe(0);
  });

  test("the wrap's own mask combines all three bands with mask-composite: intersect", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    const { layerCount, composite } = await page.evaluate(() => {
      const wrap = document.querySelector(".shine-wrap")!;
      const cs = getComputedStyle(wrap);
      const image = cs.maskImage || cs.getPropertyValue("-webkit-mask-image");
      // top-level commas only — the gradient stops inside each
      // linear-gradient(...) have their own commas that don't count
      let depth = 0, layers = 1;
      for (const ch of image) {
        if (ch === "(") depth++;
        else if (ch === ")") depth--;
        else if (ch === "," && depth === 0) layers++;
      }
      return { layerCount: layers, composite: cs.getPropertyValue("mask-composite") };
    });
    expect(layerCount).toBe(3);
    expect(composite).toContain("intersect");
  });
});

test.describe("off-screen animations pause (GSAP-driven — value-sampled)", () => {
  test("ShineField sweep bands freeze once scrolled far away, resume in view", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    await scrollToFooter(page);

    const readBand = () =>
      page.evaluate(() => getComputedStyle(document.querySelector(".shine-wrap")!).getPropertyValue("--band"));
    expect(await isStatic(page, readBand)).toBe(true);

    // scroll back to Day One and confirm it resumes
    await page.locator("#partnering").scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    expect(await isStatic(page, readBand)).toBe(false);
  });

  test("Ribbons marquee tracks freeze once scrolled far away, resume in view", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    await scrollToFooter(page);

    const readTransform = () =>
      page.evaluate(() => getComputedStyle(document.querySelector(".rib__track")!).transform);
    expect(await isStatic(page, readTransform)).toBe(true);

    await page.locator(".rib").scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    expect(await isStatic(page, readTransform)).toBe(false);
  });

  test("Day One rail-ball halo pulse freezes once scrolled far away", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    // desktop-only feature (.rail is display:none under 799px)
    const railVisible = await page.locator(".rail").isVisible().catch(() => false);
    test.skip(!railVisible, "rail is desktop-only");

    await page.locator("#partnering").scrollIntoViewIfNeeded();
    await page.waitForTimeout(300); // let the halo tween actually start

    await scrollToFooter(page);
    const readHalo = () =>
      page.evaluate(() => getComputedStyle(document.querySelector(".rail__ball")!).getPropertyValue("--halo-o"));
    expect(await isStatic(page, readHalo)).toBe(true);
  });
});

test.describe("off-screen animations pause (native CSS — getAnimations is valid)", () => {
  async function countRunning(page: Page, selector: string) {
    return page.evaluate((sel) => {
      const els = Array.from(document.querySelectorAll(sel));
      let running = 0;
      for (const el of els) for (const a of (el as HTMLElement).getAnimations()) if (a.playState === "running") running++;
      return { total: els.length, running };
    }, selector);
  }

  // Both shimmer/sparkle hosts (DayOne, Momentum) sit close together
  // mid-page, with comparatively little content below Momentum before
  // the footer — on a tall viewport (e.g. iPad Pro's 1194px), scrolling
  // to the absolute bottom of the page can still leave Momentum within
  // the 200px IntersectionObserver rootMargin, so "at the footer" isn't
  // reliably "far from both" there. Hero's own height (620vh) makes the
  // very top of the page unambiguously far from both instances on any
  // viewport, so use that instead.
  async function scrollFarFromShimmerHosts(page: Page) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);
  }

  test("shimmer dust dots are paused when far from both instances", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    await scrollFarFromShimmerHosts(page);
    const { total, running } = await countRunning(page, ".shimmer i");
    expect(total).toBeGreaterThan(0);
    expect(running).toBe(0);
  });

  test("ShineField sparkle squares are paused when far from both instances", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    await scrollFarFromShimmerHosts(page);
    const { total, running } = await countRunning(page, ".shine-sparkle");
    expect(total).toBeGreaterThan(0);
    expect(running).toBe(0);
  });

  test("shimmer resumes for whichever instance is actually in view", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    await page.locator("#partnering").scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    const { running } = await countRunning(page, ".shimmer i");
    expect(running).toBeGreaterThan(0);
  });
});
