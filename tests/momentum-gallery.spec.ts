import { test, expect, type Page } from "@playwright/test";
import { skipHeroMovie } from "./helpers";

/**
 * MomentumGallery — plays like a short movie, not a scroll-scrubbed
 * carousel (see momentumGallery.ts's own top-of-file comment for the
 * full mechanic). Each slide: ARRIVE_DUR flying in from one of 4 sides,
 * HOLD_DUR holding readable at dead centre, DEPART_DUR flying on toward
 * the camera and off-screen — 2 seconds total, the same for every
 * slide, sequential (never two slides animating at once). It plays
 * automatically once the section scrolls into view; once it finishes,
 * or if the visitor scrolls away first, the section settles on a
 * static "overview" grid of every slide's content, with a "Replay"
 * button to watch it again from slide 0.
 *
 * The next slide doesn't wait for the current one's full cycle to
 * finish — it starts its own entrance once the current slide is
 * NEXT_START_PROGRESS (75%) through its own 2s, overlapping the tail of
 * one departure with the head of the next arrival in time. They're
 * tuned not to visually overlap: the departing slide's opacity fade is
 * shorter and front-loaded, so it's already faded out well before the
 * next slide becomes clearly visible.
 *
 * Most tests drive the movie via the exposed mgApi (playMovie/goTo)
 * rather than real scroll, for determinism and speed — a couple of
 * tests specifically exercise the real scroll-triggered auto-play,
 * scroll-away, and scroll-back-restarts behavior.
 */
const ARRIVE_DUR = 600; // ms
const HOLD_DUR = 700; // ms
const DEPART_DUR = 700; // ms
const SLIDE_TOTAL = ARRIVE_DUR + HOLD_DUR + DEPART_DUR; // 2000ms
const NEXT_START_PROGRESS = 0.75;
const ADVANCE_DELAY = SLIDE_TOTAL * NEXT_START_PROGRESS; // 1500ms — cadence between consecutive slides' own starts
const SETTLE = 300; // generic margin for a single phase to visibly complete
const N = 5;

async function scrollIntoGallery(page: Page) {
  await page.evaluate(() => document.getElementById("momentum")?.scrollIntoView({ block: "center" }));
  await page.waitForTimeout(200);
}

function getState(page: Page) {
  return page.evaluate(() => (document.getElementById("momentum") as any).mgApi.getState());
}

function activeIndex(page: Page): Promise<string | undefined> {
  return page.evaluate(() => document.querySelector<HTMLElement>('.mg__slide[data-active="true"]')?.dataset.mgIndex);
}

const readScale = (page: Page, i: number) =>
  page.evaluate((n) => {
    const el = document.querySelector<HTMLElement>(`.mg__slide[data-mg-index="${n}"]`);
    const m = el?.style.transform.match(/scale\(([\d.]+)\)/);
    return m ? parseFloat(m[1]) : null;
  }, i);

const readOpacity = (page: Page, i: number) =>
  page.evaluate((n) => parseFloat(getComputedStyle(document.querySelector(`.mg__slide[data-mg-index="${n}"]`)!).opacity), i);

const readOffsetFromCentre = (page: Page, i: number) =>
  page.evaluate((n) => {
    const el = document.querySelector<HTMLElement>(`.mg__slide[data-mg-index="${n}"]`);
    const m = el?.style.transform.match(/translate\(([-\d.]+)px, ([-\d.]+)px\)/);
    if (!m) return null;
    const scene = document.getElementById("mgScene")!.getBoundingClientRect();
    return { dx: parseFloat(m[1]) - scene.width / 2, dy: parseFloat(m[2]) - scene.height / 2 };
  }, i);

// Playwright's own retrying expect() rather than a fixed sleep — works
// equally well waiting out one slide or the whole 5-slide movie.
async function pollUntil(page: Page, predicate: (s: any) => boolean, timeout = 15000) {
  await expect(async () => {
    const s = await getState(page);
    expect(predicate(s)).toBe(true);
  }).toPass({ timeout });
}

test.describe("MomentumGallery: the movie", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    await skipHeroMovie(page);
  });

  test("before playing, nothing is active and the overview is hidden", async ({ page }) => {
    const state = await getState(page);
    expect(state.everActivated).toBe(false);
    expect(state.playing).toBe(false);
    await expect(page.locator("#mgOverview")).toBeHidden();
  });

  test("scrolling the section into view starts the movie automatically", async ({ page }) => {
    await scrollIntoGallery(page);
    await pollUntil(page, (s) => s.playing === true);
    expect(await activeIndex(page)).toBe("0");
  });

  test("slide 0 is the 'They move at the speed of business' quote", async ({ page }) => {
    await page.evaluate(() => (document.getElementById("momentum") as any).mgApi.playMovie());
    await page.waitForTimeout(SETTLE);
    const text = await page.evaluate(() => document.querySelector('.mg__slide[data-mg-index="0"] .mquote')?.textContent ?? "");
    expect(text).toContain("They move");
    expect(text).toContain("at the speed");
  });

  test("the movie advances through all 5 slides in order, automatically", async ({ page }) => {
    await page.evaluate(() => (document.getElementById("momentum") as any).mgApi.playMovie());
    for (let i = 0; i < N; i++) {
      await pollUntil(page, (s) => s.idx === i, 6000);
      expect(await activeIndex(page)).toBe(String(i));
    }
  });

  test("no slide is on screen for more than ~2 seconds", async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) < 1000, "desktop-only motion model — mobile's live scale isn't exposed via a regexable style.transform string");
    const start = Date.now();
    await page.evaluate(() => (document.getElementById("momentum") as any).mgApi.playMovie());
    // a tight manual poll, not expect().toPass — toPass's own backoff
    // (100ms, 250ms, 500ms...) can itself add most of a second of slack
    // before it happens to re-check, which would make this measurement
    // about the polling strategy rather than the actual animation.
    let elapsed = -1;
    for (let i = 0; i < 60; i++) {
      if ((await readOpacity(page, 0)) < 0.05) { elapsed = Date.now() - start; break; }
      await page.waitForTimeout(50);
    }
    expect(elapsed, "slide 0 should have fully faded out by now").toBeGreaterThan(0);
    // generous margin over the nominal 2000ms — this is a wall-clock
    // measurement across a real browser, not a precision check.
    expect(elapsed).toBeLessThan(2500);
  });

  test("a slide starts off to one side, not centre, and flies in from there", async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) < 1000, "desktop-only motion model");
    await page.evaluate(() => (document.getElementById("momentum") as any).mgApi.playMovie());
    await page.waitForTimeout(80); // early into the arrival
    const early = await readOffsetFromCentre(page, 0);
    const earlyDistance = Math.hypot(early!.dx, early!.dy);
    expect(earlyDistance, "should start noticeably off-centre, not already at the middle").toBeGreaterThan(60);

    await page.waitForTimeout(ARRIVE_DUR + 200);
    const late = await readOffsetFromCentre(page, 0);
    const lateDistance = Math.hypot(late!.dx, late!.dy);
    expect(lateDistance, "should have converged on dead centre once arrived").toBeLessThan(20);
  });

  test("a slide grows dramatically and fades as it departs — flying toward the camera and off-screen", async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) < 1000, "desktop-only motion model");
    await page.evaluate(() => (document.getElementById("momentum") as any).mgApi.playMovie());
    await pollUntil(page, (s) => s.idx === 0);
    await page.waitForTimeout(ARRIVE_DUR + HOLD_DUR + 50); // just past arrival+hold — departure should have just begun
    const settledScale = await readScale(page, 0);

    await page.waitForTimeout(DEPART_DUR * 0.7); // well into departure
    const departingScale = await readScale(page, 0);
    expect(departingScale!, "should be growing dramatically larger as it flies toward the camera").toBeGreaterThan(settledScale! * 1.5);

    await page.waitForTimeout(DEPART_DUR * 0.4);
    expect(await readOpacity(page, 0), "should be fully gone once departure completes").toBeLessThan(0.05);
  });

  test("a departing slide doesn't drift laterally — it flies straight through centre, not off to a side", async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) < 1000, "desktop-only motion model");
    await page.evaluate(() => (document.getElementById("momentum") as any).mgApi.playMovie());
    await pollUntil(page, (s) => s.idx === 0);
    await page.waitForTimeout(ARRIVE_DUR + HOLD_DUR + DEPART_DUR * 0.5);
    const mid = await readOffsetFromCentre(page, 0);
    expect(Math.abs(mid!.dx)).toBeLessThan(20);
    expect(Math.abs(mid!.dy)).toBeLessThan(20);
  });

  test("consecutive slides overlap in time but never both read as visible on screen", async ({ page }) => {
    await page.evaluate(() => (document.getElementById("momentum") as any).mgApi.playMovie());
    await pollUntil(page, (s) => s.idx === 0);
    // sample repeatedly through a full transition (slide 0 -> slide 1,
    // which now starts partway through slide 0's own departure — see
    // NEXT_START_PROGRESS) and confirm at most one slide ever reads
    // meaningfully visible, even though their animations do overlap.
    const deadline = Date.now() + SLIDE_TOTAL + 500;
    while (Date.now() < deadline) {
      const opacities = await page.evaluate(() =>
        Array.from(document.querySelectorAll<HTMLElement>("#mgScene > .mg__slide")).map((el) => parseFloat(getComputedStyle(el).opacity)),
      );
      const visibleCount = opacities.filter((o) => o > 0.5).length;
      expect(visibleCount, "at most one slide should read clearly visible at any sampled instant").toBeLessThanOrEqual(1);
      await page.waitForTimeout(80);
    }
  });

  test("the next slide starts at 75% through the current one, not after it fully finishes", async ({ page }) => {
    const start = Date.now();
    await page.evaluate(() => (document.getElementById("momentum") as any).mgApi.playMovie());
    await pollUntil(page, (s) => s.idx === 1, 4000);
    const elapsed = Date.now() - start;
    // should land close to ADVANCE_DELAY (1500ms), well short of the
    // full SLIDE_TOTAL (2000ms) a fully sequential handoff would take.
    expect(elapsed).toBeGreaterThan(ADVANCE_DELAY - 300);
    expect(elapsed).toBeLessThan(SLIDE_TOTAL);
  });

  test("a stat's number counts up exactly once, never resetting on a later preview", async ({ page }) => {
    await page.evaluate(() => (document.getElementById("momentum") as any).mgApi.goTo(1));
    const readFigure = () => page.evaluate(() => document.querySelector('.mg__slide[data-mg-index="1"] .mfig')?.textContent ?? "");
    // count-up starts at 75% of the arrival (COUNT_START_PROGRESS) and
    // takes its own 0.9s from there, independent of ARRIVE_DUR itself.
    await page.waitForTimeout(ARRIVE_DUR * 0.75 + 900 + 200);
    expect(await readFigure()).toContain("100");

    await page.evaluate(() => (document.getElementById("momentum") as any).mgApi.goTo(2));
    await page.waitForTimeout(300);
    await page.evaluate(() => (document.getElementById("momentum") as any).mgApi.goTo(1));
    await page.waitForTimeout(150); // early in the re-arrival — a reset-to-0 would be visible here
    expect(await readFigure()).toContain("100");
  });

  test("only the active slide is exposed to assistive tech at a time", async ({ page }) => {
    await page.evaluate(() => (document.getElementById("momentum") as any).mgApi.goTo(2));
    await page.waitForTimeout(SETTLE);
    const hidden = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>("#mgScene > .mg__slide")).map((el) => el.getAttribute("aria-hidden")),
    );
    expect(hidden[2]).toBeNull();
    hidden.forEach((h, i) => { if (i !== 2) expect(h).toBe("true"); });
  });

  test("the quote badge sits a small, fixed gap past the edge of its emphasis line, not overlapping it", async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) < 1000, "desktop-only motion model");
    await page.evaluate(() => (document.getElementById("momentum") as any).mgApi.goTo(0));
    await page.waitForTimeout(ARRIVE_DUR + 300);
    const gap = await page.evaluate(() => {
      const line = document.querySelector(".mquote__l1")!.getBoundingClientRect();
      const badge = document.querySelector(".mquote__badge")!.getBoundingClientRect();
      return badge.left - line.right;
    });
    expect(gap).toBeGreaterThan(5);
    expect(gap).toBeLessThan(40);
  });

  test("desktop gets a real WebGL canvas; mobile never creates one", async ({ page }) => {
    // Calling canvas.getContext() at all — even just to check — creates
    // one as a side effect if nothing has yet, which would give mobile a
    // false-positive. Read the canvas's own dimensions instead:
    // Three.js's renderer.setSize() writes real ones; the untouched
    // HTML default (300x150) means it was never initialized at all.
    const canvasSize = await page.evaluate(() => {
      const c = document.getElementById("mgCanvas") as HTMLCanvasElement;
      return { width: c.width, height: c.height };
    });
    const isDesktopWidth = (page.viewportSize()?.width ?? 0) >= 1000;
    if (isDesktopWidth) {
      expect(canvasSize.width, "desktop-width viewports should have initialized the WebGL renderer").not.toBe(300);
    } else {
      expect(canvasSize).toEqual({ width: 300, height: 150 });
    }
  });

  test.describe("overview and replay", () => {
    test("once the movie finishes, the overview shows automatically with every slide's content", async ({ page }) => {
      await page.evaluate(() => (document.getElementById("momentum") as any).mgApi.playMovie());
      await pollUntil(page, (s) => s.everPlayed === true, 15000);
      await expect(page.locator("#mgOverview")).toBeVisible();
      await expect(page.locator(".mg__ov-item")).toHaveCount(N);
      const firstCardText = await page.locator('.mg__ov-item[data-mg-index="0"]').innerText();
      expect(firstCardText).toContain("They move");
      const secondCardText = await page.locator('.mg__ov-item[data-mg-index="1"]').innerText();
      expect(secondCardText).toContain("100");
    });

    test("desktop's overview arranges items in the Figma-matched scattered layout, not a uniform grid", async ({ page }) => {
      test.skip((page.viewportSize()?.width ?? 0) < 1000, "desktop-only collage layout — mobile keeps the plain grid");
      await page.evaluate(() => (document.getElementById("momentum") as any).mgApi.playMovie());
      await pollUntil(page, (s) => s.everPlayed === true, 15000);
      await expect(page.locator("#mgOvGrid")).toHaveClass(/mg__ov-grid--collage/);

      const box = (i: number) => page.locator(`.mg__ov-item[data-mg-index="${i}"]`).boundingBox();
      const [q0, stat100, stat4M, stat150, kaylen] = await Promise.all([0, 1, 2, 3, 4].map(box));

      // slide 4 (Kaylen quote) sits in the design's smaller "Quote1"
      // slot — above and narrower than slide 0's "They move..." quote,
      // which sits in the larger "Quote2" slot, per the user's explicit
      // instruction to reuse that slot's position (never its own
      // placeholder copy).
      expect(kaylen!.y).toBeLessThan(q0!.y);
      expect(kaylen!.width).toBeLessThan(q0!.width);

      // roughly matches the Figma composition's quadrants: 150+ and the
      // Kaylen quote sit in the upper half, 100% and the "They move..."
      // quote sit in the lower half.
      expect(stat150!.y).toBeLessThan(stat100!.y);
      expect(stat4M!.y).toBeLessThan(q0!.y);
    });

    test("scrolling away mid-movie settles on the overview", async ({ page }) => {
      await scrollIntoGallery(page);
      await pollUntil(page, (s) => s.playing === true);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(300);
      await pollUntil(page, (s) => s.everPlayed === true && s.playing === false);
      await expect(page.locator("#mgOverview")).toBeVisible();
    });

    test("scrolling away and back into view restarts the movie from slide 0", async ({ page }) => {
      await scrollIntoGallery(page);
      await pollUntil(page, (s) => s.playing === true);
      await pollUntil(page, (s) => s.idx >= 2); // let it get partway through first
      await page.evaluate(() => window.scrollTo(0, 0));
      await pollUntil(page, (s) => s.everPlayed === true && s.playing === false);
      await expect(page.locator("#mgOverview")).toBeVisible();

      await scrollIntoGallery(page);
      await pollUntil(page, (s) => s.playing === true);
      await expect(page.locator("#mgOverview")).toBeHidden();
      expect(await activeIndex(page)).toBe("0");
    });

    test("clicking a card previews that one slide directly", async ({ page }) => {
      await page.evaluate(() => (document.getElementById("momentum") as any).mgApi.playMovie());
      await pollUntil(page, (s) => s.everPlayed === true, 15000);

      await page.locator('.mg__ov-item[data-mg-index="3"]').click();
      await page.waitForTimeout(300);
      await expect(page.locator("#mgOverview")).toBeHidden();
      expect(await activeIndex(page)).toBe("3");
    });

    test("the Replay button restarts the movie from slide 0", async ({ page }) => {
      await page.evaluate(() => (document.getElementById("momentum") as any).mgApi.playMovie());
      await pollUntil(page, (s) => s.everPlayed === true, 15000);

      await page.locator("#mgOvToggle").click();
      await page.waitForTimeout(300);
      await expect(page.locator("#mgOverview")).toBeHidden();
      expect((await getState(page)).playing).toBe(true);
      expect(await activeIndex(page)).toBe("0");
    });
  });

  test("reduced motion: all slides visible statically, no movie, no replay button", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/", { waitUntil: "networkidle" });
    await skipHeroMovie(page);

    const hasApi = await page.evaluate(() => !!(document.getElementById("momentum") as any).mgApi);
    expect(hasApi, "setup should have returned early under reduced motion").toBe(false);

    const state = await page.evaluate(() => {
      const stage = document.getElementById("mgStage")!;
      return {
        stagePosition: getComputedStyle(stage).position,
        slideOpacities: Array.from(document.querySelectorAll<HTMLElement>("#mgScene > .mg__slide")).map((s) => parseFloat(getComputedStyle(s).opacity)),
        toggleDisplay: getComputedStyle(document.getElementById("mgOvToggle")!).display,
      };
    });
    expect(state.stagePosition).not.toBe("sticky");
    expect(state.slideOpacities.every((o) => o > 0.9)).toBe(true);
    expect(state.toggleDisplay).toBe("none");
  });
});
