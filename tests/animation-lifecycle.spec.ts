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

  test("Hero's SCROLL cue pulse freezes once scrolled far away, resumes back at top", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });

    const readTransform = () =>
      page.evaluate(() => getComputedStyle(document.querySelector(".hcb__cue i")!).transform);

    await scrollToFooter(page);
    expect(await isStatic(page, readTransform)).toBe(true);

    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);
    expect(await isStatic(page, readTransform)).toBe(false);
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

/**
 * GridField's cursor-follow highlight (the lit grid cell behind Window
 * A / KeepUp) used to fade in/out via a hand-rolled requestAnimationFrame
 * loop with manual lerp easing; now it's a GSAP tween of a plain state
 * object driving canvas redraws. Desktop-only: the underlying script
 * already ignores non-"mouse" pointerType (touch fires pointermove too,
 * which isn't what this decoration is for), and Playwright's mobile
 * projects don't reliably produce a real "mouse" pointerType for
 * page.mouse.move() to begin with (see CLAUDE.md).
 */
test.describe("GridField cursor-follow fade is GSAP-driven", () => {
  test.skip(({ isMobile }) => isMobile, "mouse-only decoration, not reliably emulated on mobile projects");

  test("lit cell fades in on hover and fades back out when the pointer leaves", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    const canvas = page.locator(".grid-field").first();
    await canvas.scrollIntoViewIfNeeded();

    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    const { x, y, width, height } = box!;
    const cx = x + width / 2;
    const cy = y + height / 2;

    // Max alpha over a small region around the hover point, not one exact
    // pixel: the lit cell is a real 32px grid cell, and which cell that
    // is depends on where the cursor falls relative to the grid's own
    // origin — a single sampled pixel can land a fraction of a pixel
    // outside its bounds depending on sub-pixel scroll/viewport
    // rounding, and miss it entirely (confirmed flaky this way).
    const readMaxAlpha = () =>
      page.evaluate(() => {
        const el = document.querySelectorAll<HTMLCanvasElement>(".grid-field")[0];
        const r = el.getBoundingClientRect();
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const cx2 = Math.round((r.width / 2) * dpr);
        const cy2 = Math.round((r.height / 2) * dpr);
        const span = 40;
        const data = el.getContext("2d")!.getImageData(cx2 - span, cy2 - span, span * 2, span * 2).data;
        let max = 0;
        for (let i = 3; i < data.length; i += 4) if (data[i] > max) max = data[i];
        return max;
      });

    // baseline: grid lines alone contribute some alpha in this region
    // even with nothing lit, so "faded back out" means "back down near
    // this," not "down to exactly zero."
    const baseline = await readMaxAlpha();

    await page.mouse.move(cx, cy);
    await page.waitForTimeout(450); // let the GSAP fade-in settle
    const settled = await readMaxAlpha();
    expect(settled).toBeGreaterThan(baseline);

    // top-left corner of the viewport — guaranteed outside a mid-page
    // section's canvas, unlike an arbitrary offset from its own centre
    // which can still land inside a large canvas
    await page.mouse.move(2, 2);
    await page.waitForTimeout(450);
    const faded = await readMaxAlpha();
    expect(faded).toBeLessThan(settled);
  });
});
