import { test, expect, type Page } from "@playwright/test";
import { skipHeroMovie } from "./helpers";

/**
 * MomentumGallery — plays like a short movie, not a scroll-scrubbed
 * carousel (see momentumGallery.ts's own top-of-file comment for the
 * full mechanic). Each slide: ARRIVE_DUR flying in from one of 4 sides,
 * HOLD_DUR holding readable at dead centre, SETTLE_DUR shrinking into
 * its own resting spot in the overview — 2.4 seconds total, the same
 * for every slide. Every slide does this, not just the last: the
 * resting composition visibly builds up one piece at a time as the
 * movie plays, rather than appearing all at once at the end. On
 * desktop that resting spot is the exact position/scale its item will
 * have in the Figma-matched collage (OVERVIEW_LAYOUT_DESKTOP in
 * momentumGallery.ts); on mobile, a small accumulating filmstrip slot
 * along the top of the scene (mobile's real overview is a plain
 * vertical list whose exact row position isn't computable ahead of the
 * browser laying it out — see settleMobile).
 *
 * The next slide doesn't wait for the current one's full cycle to
 * finish — it starts its own entrance once the current slide is
 * NEXT_START_PROGRESS (75%) through its own 2.4s, overlapping the tail
 * of one settle with the head of the next arrival in time. They never
 * visually clash: settling moves a slide *away* from centre toward its
 * own distinct resting spot while the next arrival moves *into* centre
 * from a different side — different screen space throughout, even
 * though both are fully visible (neither one fades).
 *
 * It plays automatically once the section scrolls into view; once it
 * finishes, or if the visitor scrolls away first, the section settles
 * on a static "overview" grid of every slide's content, with a
 * "Replay" button to watch it again from slide 0.
 *
 * Most tests drive the movie via the exposed mgApi (playMovie/goTo)
 * rather than real scroll, for determinism and speed — a couple of
 * tests specifically exercise the real scroll-triggered auto-play,
 * scroll-away, and scroll-back-restarts behavior.
 */
const ARRIVE_DUR = 600; // ms
const HOLD_DUR = 1100; // ms
const SETTLE_DUR = 700; // ms — how long a slide takes to shrink into its resting spot
const SLIDE_TOTAL = ARRIVE_DUR + HOLD_DUR + SETTLE_DUR; // 2400ms
const NEXT_START_PROGRESS = 0.75;
const ADVANCE_DELAY = SLIDE_TOTAL * NEXT_START_PROGRESS; // 1800ms — cadence between consecutive slides' own starts
const SETTLE = 300; // generic margin for a single phase to visibly complete — unrelated to SETTLE_DUR above, an unfortunate but pre-existing name
const N = 5;

async function scrollIntoGallery(page: Page) {
  // Momentum's own scroll-lock trigger fires off crossing its "top top"
  // boundary (see momentumGallery.ts) — a real scroll gesture always
  // passes through that pixel on the way, but an exact scrollIntoView()
  // jump can land precisely equal to it instead of crossing it, which
  // ScrollTrigger doesn't register as entering. Land just short of the
  // section, then a real incremental scroll the rest of the way, same
  // as an actual visitor would.
  await page.evaluate(() => {
    const el = document.getElementById("momentum");
    if (!el) return;
    const rect = el.getBoundingClientRect();
    window.scrollTo(0, window.scrollY + rect.top - 40);
  });
  await page.waitForTimeout(100);
  await page.evaluate(() => window.scrollBy(0, 80));
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

  test("scroll locks in place when the section is reached, releasing once the first slide plays", async ({ page }) => {
    await scrollIntoGallery(page);
    await pollUntil(page, (s) => s.playing === true);

    const lockedState = await page.evaluate(() => ({
      overflow: document.documentElement.style.overflow,
      scrollY: window.scrollY,
    }));
    expect(lockedState.overflow, "scroll should be locked as soon as the movie starts").toBe("hidden");

    // attempting to scroll further should be immediately undone
    await page.evaluate(() => window.scrollBy(0, 400));
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => window.scrollY), "scroll should snap back while locked").toBe(lockedState.scrollY);

    // the lock releases once the first slide has actually arrived — like
    // the other pinned "scroll areas", not indefinitely
    await page.waitForFunction(() => document.documentElement.style.overflow === "", { timeout: 3000 });
    await page.evaluate(() => window.scrollBy(0, 400));
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => window.scrollY), "scroll should move freely once released").toBeGreaterThan(lockedState.scrollY + 300);
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

  test("a slide reaches its resting (shrunk) size within ~2.4 seconds of becoming active", async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) < 1000, "desktop-only motion model — mobile's live scale isn't exposed via a regexable style.transform string");
    const start = Date.now();
    await page.evaluate(() => (document.getElementById("momentum") as any).mgApi.playMovie());
    await pollUntil(page, (s) => s.idx === 0);
    await page.waitForTimeout(ARRIVE_DUR + 100); // now actually arrived and holding, not still flying in
    const holdScale = await readScale(page, 0);
    // a tight manual poll, not expect().toPass — toPass's own backoff
    // (100ms, 250ms, 500ms...) can itself add most of a second of slack
    // before it happens to re-check, which would make this measurement
    // about the polling strategy rather than the actual animation.
    let elapsed = -1;
    for (let i = 0; i < 70; i++) {
      const scale = await readScale(page, 0);
      if (scale !== null && scale < holdScale! * 0.7) { elapsed = Date.now() - start; break; }
      await page.waitForTimeout(50);
    }
    expect(elapsed, "slide 0 should have shrunk well below its hold size by now").toBeGreaterThan(0);
    // generous margin over the nominal 2400ms — this is a wall-clock
    // measurement across a real browser, not a precision check.
    expect(elapsed).toBeLessThan(2900);
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

  test("a slide shrinks toward its own resting spot after holding, not growing/fading in place", async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) < 1000, "desktop-only motion model");
    await page.evaluate(() => (document.getElementById("momentum") as any).mgApi.playMovie());
    await pollUntil(page, (s) => s.idx === 0);
    await page.waitForTimeout(ARRIVE_DUR + HOLD_DUR + 50); // just past arrival+hold — settling should have just begun
    const settledScale = await readScale(page, 0);

    await page.waitForTimeout(SETTLE_DUR * 0.7); // well into settling
    const shrinkingScale = await readScale(page, 0);
    expect(shrinkingScale!, "should be shrinking toward its resting spot, not growing toward the camera").toBeLessThan(settledScale!);

    await page.waitForTimeout(SETTLE_DUR * 0.4);
    expect(await readOpacity(page, 0), "should still be fully visible once settled — this slide never fades").toBeGreaterThan(0.9);
  });

  test("every slide stays visible once settled — a settled slide doesn't disappear while later slides play", async ({ page }) => {
    // per direct feedback: each slide should visibly build up its own
    // resting spot and stay there, not just the last one — sample every
    // slide's own opacity continuously across the whole movie and
    // confirm none of them ever drop back down once they've reached
    // full opacity for the first time.
    const result = await page.evaluate(async () => {
      const mg = document.getElementById("momentum") as any;
      const els = Array.from({ length: 5 }, (_, i) => document.querySelector(`.mg__slide[data-mg-index="${i}"]`) as HTMLElement);
      const minOpacity = [1, 1, 1, 1, 1];
      const hasFullyArrived = [false, false, false, false, false];
      mg.mgApi.playMovie();
      while (!mg.mgApi.getState().everPlayed) {
        for (let i = 0; i < 5; i++) {
          const op = parseFloat(getComputedStyle(els[i]).opacity);
          if (op >= 0.98) hasFullyArrived[i] = true;
          if (hasFullyArrived[i] && op < minOpacity[i]) minOpacity[i] = op;
        }
        await new Promise((r) => requestAnimationFrame(r));
      }
      return { minOpacity, hasFullyArrived };
    });
    for (let i = 0; i < N; i++) {
      expect(result.hasFullyArrived[i], `slide ${i} should have fully arrived at some point`).toBe(true);
      expect(result.minOpacity[i], `slide ${i}'s opacity should never have dropped once fully arrived`).toBeGreaterThan(0.9);
    }
  });

  test("consecutive slides genuinely overlap in time — both visible together at once, since neither fades", async ({ page }) => {
    await page.evaluate(() => (document.getElementById("momentum") as any).mgApi.playMovie());
    await pollUntil(page, (s) => s.idx === 0);
    // sample repeatedly through a full transition (slide 0 settling ->
    // slide 1 arriving, which now starts partway through slide 0's own
    // settle — see NEXT_START_PROGRESS) and confirm they're both clearly
    // visible at the same time at some point — the overlap is real, not
    // just in the schedule.
    let sawBothVisible = false;
    const deadline = Date.now() + SLIDE_TOTAL + 500;
    while (Date.now() < deadline && !sawBothVisible) {
      const opacities = await page.evaluate(() =>
        Array.from(document.querySelectorAll<HTMLElement>("#mgScene > .mg__slide")).map((el) => parseFloat(getComputedStyle(el).opacity)),
      );
      if (opacities.filter((o) => o > 0.5).length >= 2) sawBothVisible = true;
      await page.waitForTimeout(80);
    }
    expect(sawBothVisible, "the settling slide and the next arrival should read visible together at some point").toBe(true);
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

    // (every slide staying visible once settled — not just the last —
    // is covered by its own top-level test above, "every slide stays
    // visible once settled".)

    test("desktop: every slide settles exactly where its own overview item renders — no cross-fade needed", async ({ page }) => {
      test.skip((page.viewportSize()?.width ?? 0) < 1000, "desktop-only settle-to-exact-position — mobile's settle is only approximate, see settleMobile");
      // idx moves on to the next slide before the current one's own
      // settle tween actually finishes (that's the overlap — see
      // NEXT_START_PROGRESS), so "while idx===i" isn't a safe window to
      // capture slide i's *final* position for anything but the last
      // slide. Every slide's settle tween is long done by the time the
      // whole movie ends, though (nothing left to move it after that),
      // so just read every slide's live position once, right then.
      const liveRects = await page.evaluate(async () => {
        const mg = document.getElementById("momentum") as any;
        const els = Array.from({ length: 5 }, (_, i) => document.querySelector(`.mg__slide[data-mg-index="${i}"]`) as HTMLElement);
        mg.mgApi.playMovie();
        while (!mg.mgApi.getState().everPlayed) {
          await new Promise((r) => requestAnimationFrame(r));
        }
        return els.map((el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y }; });
      });
      for (let i = 0; i < N; i++) {
        const overviewRect = await page.locator(`.mg__ov-item[data-mg-index="${i}"]`).boundingBox();
        // a couple px of tolerance for floating-point rounding
        expect(Math.abs(liveRects[i].x - overviewRect!.x), `slide ${i} x`).toBeLessThan(5);
        expect(Math.abs(liveRects[i].y - overviewRect!.y), `slide ${i} y`).toBeLessThan(5);
      }
    });

    test("mobile: a settled slide's filmstrip thumbnail doesn't overlap the Replay button or the sticky CTA", async ({ page }) => {
      test.skip((page.viewportSize()?.width ?? 0) >= 1000, "mobile-only filmstrip — desktop settles into the real Figma collage spot instead");
      await page.evaluate(() => (document.getElementById("momentum") as any).mgApi.playMovie());
      await pollUntil(page, (s) => s.idx >= 1, 8000); // slide 0 has settled into the filmstrip by now
      const overlaps = await page.evaluate(() => {
        const intersects = (a: DOMRect, b: DOMRect) =>
          !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
        const thumb = document.querySelector('.mg__slide[data-mg-index="0"]')!.getBoundingClientRect();
        const replay = document.getElementById("mgOvToggle")!.getBoundingClientRect();
        const kickoff = document.getElementById("kickoff")?.getBoundingClientRect();
        return {
          overlapsReplay: intersects(thumb, replay),
          overlapsKickoff: kickoff ? intersects(thumb, kickoff) : false,
        };
      });
      expect(overlaps.overlapsReplay, "settled thumbnail should not sit behind the Replay button").toBe(false);
      expect(overlaps.overlapsKickoff, "settled thumbnail should not sit behind the sticky CTA").toBe(false);
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
