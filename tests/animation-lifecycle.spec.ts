import { test, expect, type Page } from "@playwright/test";
import { skipHeroMovie } from "./helpers";

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
 * (shimmer dots, card icons) — ShineField's sparkle squares are
 * canvas-drawn now, not a native CSS animation at all; see the
 * canvas-checksum-based test below instead.
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

// Every test in this file scrolls at some point, and Hero plays a
// locked ~9.5s intro movie on load before scrolling works at all (see
// hero-movie.spec.ts) — fast-forward it once, up front, for the whole
// file rather than repeating that in every single test.
test.beforeEach(async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await skipHeroMovie(page);
});

/**
 * ShineField used to be an SVG <pattern> of ~760 squares (~30 of them
 * individually CSS-animated for the sparkle twinkle) masked with
 * CSS mask-image — two independent, confirmed sources of sustained
 * memory growth on iPad (a mask-image whose calc()-driven value
 * changes every frame, and animating content inside an SVG <pattern>,
 * which forces the browser to continuously re-rasterize and re-tile
 * the entire fill area since the pattern's cache is never stable).
 * Rebuilt as a canvas: no mask-image, no SVG, no pattern to
 * invalidate. This guards the structural fix, not just the visual —
 * a future edit could reintroduce either without changing how
 * anything looks in a screenshot.
 */
test.describe("ShineField is canvas-drawn, not SVG/mask-image", () => {
  test("every instance is a canvas with no mask-image, no SVG pattern", async ({ page }) => {
    const info = await page.evaluate(() => {
      const wraps = Array.from(document.querySelectorAll<HTMLElement>(".shine-wrap"));
      return wraps.map((el) => ({
        tag: el.tagName,
        maskImage: getComputedStyle(el).maskImage,
        webkitMaskImage: getComputedStyle(el).getPropertyValue("-webkit-mask-image"),
      }));
    });
    expect(info.length).toBeGreaterThan(0);
    for (const el of info) {
      expect(el.tag).toBe("CANVAS");
      expect(el.maskImage).toBe("none");
      expect(el.webkitMaskImage === "none" || el.webkitMaskImage === "").toBe(true);
    }
    const svgCount = await page.locator(".shine-wrap svg, .shine-wrap pattern").count();
    expect(svgCount).toBe(0);
  });
});

/** Sum of every RGBA byte in a canvas's pixel buffer — cheap way to
 *  detect "did anything at all change" without tracking one exact
 *  pixel (fragile against sub-pixel/grid alignment, confirmed flaky
 *  elsewhere in this suite for exactly that reason). */
async function canvasChecksum(page: Page, selector: string): Promise<number> {
  return page.evaluate((sel) => {
    const el = document.querySelector<HTMLCanvasElement>(sel)!;
    const data = el.getContext("2d")!.getImageData(0, 0, el.width, el.height).data;
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) sum += data[i + 3]; // alpha channel is enough
    return sum;
  }, selector);
}

test.describe("off-screen animations pause (GSAP-driven — value-sampled)", () => {
  test("ShineField sweep/sparkle redraw freezes once scrolled far away, resumes in view", async ({ page }) => {
    // in view first, to confirm it's actually redrawing at all
    await page.locator("#partnering").scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    const a1 = await canvasChecksum(page, ".shine-wrap");
    await page.waitForTimeout(1200);
    const a2 = await canvasChecksum(page, ".shine-wrap");
    expect(a2).not.toBe(a1);

    await scrollToFooter(page);
    const b1 = await canvasChecksum(page, ".shine-wrap");
    await page.waitForTimeout(1200);
    const b2 = await canvasChecksum(page, ".shine-wrap");
    expect(b2).toBe(b1);

    // scroll back to Day One and confirm it resumes
    await page.locator("#partnering").scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    const c1 = await canvasChecksum(page, ".shine-wrap");
    await page.waitForTimeout(1200);
    const c2 = await canvasChecksum(page, ".shine-wrap");
    expect(c2).not.toBe(c1);
  });

  test("Ribbons marquee tracks freeze once scrolled far away, resume in view", async ({ page }) => {
    await scrollToFooter(page);

    const readTransform = () =>
      page.evaluate(() => getComputedStyle(document.querySelector(".rib__track")!).transform);
    expect(await isStatic(page, readTransform)).toBe(true);

    await page.locator(".rib").scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    expect(await isStatic(page, readTransform)).toBe(false);
  });

  test("Day One rail-ball halo pulse freezes once scrolled far away", async ({ page }) => {
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

  test("Day One: copy columns stay hidden until their own dot is reached, then arrive centered under it", async ({ page }) => {
    // desktop rail only — mobile's vertical timeline is a different,
    // left-aligned layout with its own always-visible columns.
    const railVisible = await page.locator(".rail").isVisible().catch(() => false);
    test.skip(!railVisible, "rail is desktop-only");

    const rect = await page.evaluate(() => {
      const el = document.getElementById("partnering")!;
      const r = el.getBoundingClientRect();
      return { top: r.top + window.scrollY, height: r.height, vh: window.innerHeight };
    });
    // ScrollTrigger's progress is 0 at "top top" and 1 at "bottom
    // bottom" — the scrollable range that spans is the trigger's own
    // height MINUS the viewport (the last screenful is already "bottom
    // bottom" the moment the section's bottom edge appears), not its
    // full height.
    const scrollToFrac = async (p: number) => {
      await page.evaluate((y) => window.scrollTo(0, y), rect.top + (rect.height - rect.vh) * p);
      // the reveal is a .7s CSS transition off the class GSAP's
      // scroll-jump-triggered onUpdate adds instantly — waiting for
      // the jump alone isn't enough, this also waits out the transition
      await page.waitForTimeout(900);
    };
    const colOpacities = () =>
      page.evaluate(() =>
        Array.from(document.querySelectorAll<HTMLElement>("#dayone .col")).map((c) => parseFloat(getComputedStyle(c).opacity)),
      );

    // early — only the first stop has been reached
    await scrollToFrac(0.25);
    const early = await colOpacities();
    expect(early[0], "first column should already be revealed").toBeGreaterThan(0.9);
    expect(early[1], "second column shouldn't have arrived yet").toBeLessThan(0.1);
    expect(early[2], "third column shouldn't have arrived yet").toBeLessThan(0.1);

    // fully through — all three revealed, each centered under its own dot
    await scrollToFrac(0.98);
    const late = await colOpacities();
    expect(late.every((o) => o > 0.9), "all three columns should be revealed by the end").toBe(true);

    const offsets = await page.evaluate(() => {
      const paras = Array.from(document.querySelectorAll<HTMLElement>("#dayone .col p"));
      const stops = Array.from(document.querySelectorAll<HTMLElement>(".rail__stop"));
      return paras.map((p, i) => {
        const pr = p.getBoundingClientRect();
        const sr = stops[i].getBoundingClientRect();
        return Math.abs((pr.left + pr.width / 2) - (sr.left + sr.width / 2));
      });
    });
    for (const offset of offsets) expect(offset, "each column should be centered under its dot").toBeLessThan(20);
  });

  test("Hero's SCROLL cue pulse freezes once scrolled far away, resumes back at top", async ({ page }) => {
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
  // reliably "far from both" there. The very top of the page (above
  // Hero, BrandInMotionCards, Ribbons and WindowA) is unambiguously far
  // from both instances on any viewport, so use that instead.
  async function scrollFarFromShimmerHosts(page: Page) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);
  }

  test("shimmer dust dots are paused when far from both instances", async ({ page }) => {
    await scrollFarFromShimmerHosts(page);
    const { total, running } = await countRunning(page, ".shimmer i");
    expect(total).toBeGreaterThan(0);
    expect(running).toBe(0);
  });

  test("shimmer resumes for whichever instance is actually in view", async ({ page }) => {
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
    const canvas = page.locator(".grid-field").first();
    await canvas.scrollIntoViewIfNeeded();

    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    const { x, y, width, height } = box!;
    const cx = x + width / 2;
    const cy = y + height / 2;

    // Sum of alpha across the *entire* canvas, not a region around the
    // hover point: this canvas also has GridField's own vertical
    // parallax (drifts the grid's draw position by up to ±160px based
    // on scroll position), which under a full parallel suite run can
    // shift by the time GSAP's later onUpdate frames redraw versus
    // where the mouse first targeted — confirmed via a failure
    // screenshot showing a real, correctly-lit cell, just offset from
    // the cursor by exactly that kind of drift. Whether or not a given
    // pixel region catches it, the lit cell always adds real coverage
    // *somewhere* in the canvas, so summing the whole thing sidesteps
    // needing to know exactly where.
    const readAlphaSum = () =>
      page.evaluate(() => {
        const el = document.querySelectorAll<HTMLCanvasElement>(".grid-field")[0];
        const data = el.getContext("2d")!.getImageData(0, 0, el.width, el.height).data;
        let sum = 0;
        for (let i = 3; i < data.length; i += 4) sum += data[i];
        return sum;
      });

    // Polls instead of a single fixed sleep: under a full parallel
    // suite run (5 browsers competing for CPU), a fixed short wait
    // occasionally samples mid-tween rather than settled, since GSAP's
    // ticker is wall-clock-based and can genuinely fall behind under
    // contention. Waits for the value to stop changing between two
    // consecutive samples — but only after an initial wait long enough
    // that the tween has actually started moving; without it, two
    // samples taken back-to-back *before* a delayed tween has begun
    // can both still read the untouched starting value, look "stable,"
    // and return a false-early "settled" reading.
    const pollSettled = async (maxMs = 2000, stepMs = 100) => {
      await page.waitForTimeout(150);
      let prev = await readAlphaSum();
      for (let waited = 0; waited < maxMs; waited += stepMs) {
        await page.waitForTimeout(stepMs);
        const next = await readAlphaSum();
        if (next === prev) return next;
        prev = next;
      }
      return prev;
    };

    // baseline: grid lines alone contribute plenty of alpha across the
    // whole canvas even with nothing lit, so "faded back out" means
    // "back down near this," not "down to exactly zero."
    const baseline = await readAlphaSum();

    await page.mouse.move(cx, cy);
    const settled = await pollSettled();
    expect(settled).toBeGreaterThan(baseline);

    // top-left corner of the viewport — guaranteed outside a mid-page
    // section's canvas, unlike an arbitrary offset from its own centre
    // which can still land inside a large canvas
    await page.mouse.move(2, 2);
    const faded = await pollSettled();
    expect(faded).toBeLessThan(settled);
  });
});
