import { test, expect, type Page } from "@playwright/test";
import { skipHeroMovie } from "./helpers";

/**
 * MomentumGallery — plays like a short movie, not a scroll-scrubbed
 * carousel (see momentumGallery.ts's own top-of-file comment for the
 * full mechanic). Each slide: ARRIVE_DUR flying in from one of 4 sides,
 * holding readable at centre (HOLD_DUR, +LATER_SLIDE_EXTRA for slides
 * 2-5), then fading out in place (FADE_DUR) — no shrinking, no moving
 * aside, no blur. The next slide starts once that fade is
 * NEXT_AFTER_FADE done.
 *
 * Once the last slide has faded, the section rests on every slide at
 * once, uncovered by a growing circle (the hero's own iris reveal). On
 * desktop those are the live slides themselves, placed by Three.js at
 * the Figma composition's positions/type sizes (node 3612:8790); mobile
 * (no WebGL) shows a stacked list of cloned slides (#mgOverview).
 * "Replay" watches it again from slide 0.
 *
 * Most tests drive the movie via the exposed mgApi (playMovie/goTo)
 * rather than real scroll, for determinism and speed — a couple of
 * tests specifically exercise the real scroll-triggered auto-play,
 * scroll-away, and scroll-back-stays-resting behavior.
 */
const ARRIVE_DUR = 600; // ms
const HOLD_DUR = 1100; // ms — slide 1's hold
const LATER_SLIDE_EXTRA = 300; // ms — added to slides 2-5's hold
const FADE_DUR = 700; // ms
const NEXT_AFTER_FADE = 0.6;
const FIRST_ADVANCE = ARRIVE_DUR + HOLD_DUR + FADE_DUR * NEXT_AFTER_FADE; // 2120ms — slide 1 -> slide 2
const REVEAL_DUR = 1500; // ms
const MOVIE_END_TIMEOUT = 20000;
const SETTLE = 300; // generic margin for a single phase to visibly complete
const N = 5;
const isDesktop = (page: Page) => (page.viewportSize()?.width ?? 0) >= 1000;

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

const readFilter = (page: Page, i: number) =>
  page.evaluate((n) => document.querySelector<HTMLElement>(`.mg__slide[data-mg-index="${n}"]`)?.style.filter, i);

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

// ms from playMovie() until slides 2 and 3 become active, timed in-page
// per frame — no Playwright polling backoff in the measurement.
function advanceTimes(page: Page): Promise<number[]> {
  return page.evaluate(async () => {
    const mg = document.getElementById("momentum") as any;
    const times: number[] = [];
    const start = performance.now();
    mg.mgApi.playMovie();
    let last = 0;
    while (times.length < 2) {
      const { idx } = mg.mgApi.getState();
      if (idx !== last) { times.push(performance.now() - start); last = idx; }
      await new Promise((r) => requestAnimationFrame(r));
    }
    return times;
  });
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

  test("slides 2-5 hold 0.3s longer than slide 1", async ({ page }) => {
    const [t1, t2] = await advanceTimes(page);
    const extra = (t2 - t1) - t1;
    expect(extra).toBeGreaterThan(LATER_SLIDE_EXTRA - 120);
    expect(extra).toBeLessThan(LATER_SLIDE_EXTRA + 120);
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

  test("a finished slide fades out in place — no shrinking, no moving aside, no blur", async ({ page }) => {
    test.skip(!isDesktop(page), "desktop-only motion model (mobile's scale isn't exposed via a regexable style.transform string)");
    await page.evaluate(() => (document.getElementById("momentum") as any).mgApi.playMovie());
    await pollUntil(page, (s) => s.idx === 0);
    await page.waitForTimeout(ARRIVE_DUR + HOLD_DUR + 50); // the fade has just begun
    const holdScale = await readScale(page, 0);

    await page.waitForTimeout(FADE_DUR * 0.5);
    expect(await readOpacity(page, 0), "should be fading").toBeLessThan(0.8);
    expect(await readScale(page, 0), "should not be shrinking away").toBeGreaterThanOrEqual(holdScale!);
    const offset = await readOffsetFromCentre(page, 0);
    expect(Math.hypot(offset!.dx, offset!.dy), "should stay at centre, not move aside").toBeLessThan(20);
    expect(await readFilter(page, 0), "should not blur out").toBe("");

    await page.waitForTimeout(FADE_DUR * 0.5 + 150);
    expect(await readOpacity(page, 0), "should be fully gone once its fade is done").toBeLessThan(0.02);
  });

  test("two slides are never both prominent at once — the next only arrives once the last has mostly faded", async ({ page }) => {
    const maxVisibleTogether = await page.evaluate(async () => {
      const mg = document.getElementById("momentum") as any;
      const els = Array.from(document.querySelectorAll<HTMLElement>("#mgScene > .mg__slide"));
      let max = 0;
      mg.mgApi.playMovie();
      while (!mg.mgApi.getState().everPlayed) {
        const visible = els.filter((el) => parseFloat(getComputedStyle(el).opacity) > 0.5).length;
        max = Math.max(max, visible);
        await new Promise((r) => requestAnimationFrame(r));
      }
      return max;
    });
    expect(maxVisibleTogether).toBe(1);
  });

  test("the next slide starts once the current one's fade is mostly done", async ({ page }) => {
    const [t1] = await advanceTimes(page);
    expect(t1).toBeGreaterThan(FIRST_ADVANCE - 120);
    expect(t1).toBeLessThan(FIRST_ADVANCE + 150);
  });

  test("mobile: every slide comes straight down the middle — never off to a side", async ({ page }) => {
    test.skip(isDesktop(page), "mobile-only — desktop deliberately enters from 4 sides");
    // every visible sample of every slide, across the whole movie, stays
    // horizontally centred in the scene (and no slide lingers faintly
    // parked off to one side while another plays)
    const worstDx = await page.evaluate(async () => {
      const mg = document.getElementById("momentum") as any;
      const scene = document.getElementById("mgScene")!.getBoundingClientRect();
      const els = Array.from(document.querySelectorAll<HTMLElement>("#mgScene > .mg__slide"));
      let worst = 0;
      mg.mgApi.playMovie();
      while (!mg.mgApi.getState().everPlayed) {
        for (const el of els) {
          if (parseFloat(getComputedStyle(el).opacity) < 0.02) continue;
          const r = el.getBoundingClientRect();
          worst = Math.max(worst, Math.abs(r.left + r.width / 2 - (scene.left + scene.width / 2)));
        }
        await new Promise((r) => requestAnimationFrame(r));
      }
      return worst;
    });
    expect(worstDx).toBeLessThan(4);
  });

  test("stat spacing matches Figma: 17px number -> caption -> subline, in the movie and at rest", async ({ page }) => {
    // gaps converted back into Figma px (relative to each element's own
    // font size vs. Figma's 190px figure / 32px caption), so this holds
    // at any viewport and any live/rest scale
    const measure = (root: Element) => {
      const fig = root.querySelector<HTMLElement>(".mfig")!, cap = root.querySelector<HTMLElement>(".mcap")!, h3 = root.querySelector<HTMLElement>("h3")!;
      const f = fig.getBoundingClientRect(), c = cap.getBoundingClientRect(), h = h3.getBoundingClientRect();
      const scale = f.height / fig.offsetHeight;
      const figFont = parseFloat(getComputedStyle(fig).fontSize), capFont = parseFloat(getComputedStyle(cap).fontSize);
      return { numToCap: ((c.top - f.bottom) / scale / figFont) * 190, capToSub: ((h.top - c.bottom) / scale / capFont) * 32 };
    };
    const check = (g: { numToCap: number; capToSub: number }, label: string) => {
      expect(Math.abs(g.numToCap - 17), `${label}: number -> caption`).toBeLessThan(1.5);
      expect(Math.abs(g.capToSub - 17), `${label}: caption -> subline`).toBeLessThan(1.5);
    };
    for (const i of [1, 2, 3]) {
      await page.evaluate((n) => (document.getElementById("momentum") as any).mgApi.goTo(n), i);
      await page.waitForTimeout(ARRIVE_DUR + SETTLE);
      check(await page.evaluate(`(${measure})(document.querySelector('#mgScene > .mg__slide[data-mg-index="${i}"]'))`), `movie slide ${i}`);
    }
    await page.evaluate(() => (document.getElementById("momentum") as any).mgApi.playMovie());
    await pollUntil(page, (s) => s.everPlayed === true, MOVIE_END_TIMEOUT);
    for (const i of [1, 2, 3]) {
      const sel = isDesktop(page) ? `#mgScene > .mg__slide[data-mg-index="${i}"]` : `.mg__ov-item[data-mg-index="${i}"]`;
      check(await page.evaluate(`(${measure})(document.querySelector('${sel}'))`), `rest slide ${i}`);
    }
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

  test.describe("resting state and replay", () => {
    // desktop rests on the live, Three-placed slides; mobile on #mgOverview
    async function expectResting(page: Page) {
      if (isDesktop(page)) {
        await expect(page.locator("#momentum")).toHaveAttribute("data-mg-rest", "true");
        await expect(page.locator("#mgOverview")).toBeHidden();
        const opacities = await page.evaluate(() =>
          Array.from(document.querySelectorAll<HTMLElement>("#mgScene > .mg__slide")).map((el) => parseFloat(getComputedStyle(el).opacity)),
        );
        expect(opacities.every((o) => o > 0.98), "every slide shows at rest").toBe(true);
      } else {
        await expect(page.locator("#mgOverview")).toBeVisible();
        await expect(page.locator(".mg__ov-item")).toHaveCount(N);
      }
    }
    async function playToEnd(page: Page) {
      await page.evaluate(() => (document.getElementById("momentum") as any).mgApi.playMovie());
      await pollUntil(page, (s) => s.everPlayed === true, MOVIE_END_TIMEOUT);
    }

    test("once the movie finishes, every slide shows at rest", async ({ page }) => {
      await playToEnd(page);
      await expectResting(page);
    });

    test("the resting state is uncovered by a growing circle with a rose ring, like the hero's", async ({ page }) => {
      // sampled in-page, per frame, from the movie's end until the reveal
      // has fully opened
      const samples = await page.evaluate(async () => {
        const mg = document.getElementById("momentum") as any;
        const scene = document.getElementById("mgScene")!;
        const ring = document.getElementById("mgRing")!;
        const out: { r: number; ring: number }[] = [];
        mg.mgApi.playMovie();
        while (!mg.mgApi.getState().everPlayed) await new Promise((r) => requestAnimationFrame(r));
        for (;;) {
          const m = scene.style.clipPath.match(/circle\(([\d.]+)px/);
          if (!m) break;
          out.push({ r: parseFloat(m[1]), ring: parseFloat(getComputedStyle(ring).opacity) });
          await new Promise((r) => requestAnimationFrame(r));
        }
        return { out, clipAfter: scene.style.clipPath };
      });
      expect(samples.out.length, "the reveal should animate over many frames").toBeGreaterThan(20);
      const radii = samples.out.map((s) => s.r);
      expect(radii[0], "starts small").toBeLessThan(40);
      for (let k = 1; k < radii.length; k++) expect(radii[k]).toBeGreaterThanOrEqual(radii[k - 1]);
      expect(Math.max(...samples.out.map((s) => s.ring)), "the rose ring traces the circle").toBeGreaterThan(0.3);
      expect(samples.clipAfter, "fully open once done — no clip left behind").toBe("");
      await page.waitForTimeout(600);
      expect(await page.evaluate(() => parseFloat(getComputedStyle(document.getElementById("mgRing")!).opacity))).toBeLessThan(0.05);
    });

      test("desktop rest matches Figma 3612:8790 (Michelle: 3837:5995) — the live slides at their spots, sharp, no overlaps", async ({ page }) => {
      test.skip(!isDesktop(page), "desktop-only Three-placed composition");
      await playToEnd(page);
      await page.waitForTimeout(REVEAL_DUR + SETTLE);
      const { geo, heading } = await page.evaluate(() => {
        const scene = document.getElementById("mgScene")!.getBoundingClientRect();
        const h = document.querySelector(".hs__intro-head")!.getBoundingClientRect();
        const text = document.querySelector<HTMLElement>(".hs__intro-head .hot")!;
        const range = document.createRange();
        range.selectNodeContents(text);
        const ink = range.getBoundingClientRect();
        const geo = Array.from({ length: 5 }, (_, i) => {
          const el = document.querySelector<HTMLElement>(`#mgScene > .mg__slide[data-mg-index="${i}"]`)!;
          const r = el.getBoundingClientRect();
          const scale = parseFloat(el.style.transform.match(/scale\(([\d.]+)\)/)?.[1] ?? "1");
          const head = el.querySelector<HTMLElement>(".mfig, .mquote")!;
          return {
            left: r.left - scene.left, top: r.top - scene.top, right: r.right - scene.left, bottom: r.bottom - scene.top,
            sceneW: scene.width, sceneH: scene.height,
            font: parseFloat(getComputedStyle(head).fontSize) * scale,
            filter: el.style.filter,
            ariaHidden: el.getAttribute("aria-hidden"),
            badge: (() => {
              const b = el.querySelector(".mquote__badge")?.getBoundingClientRect();
              return b ? { left: b.left - scene.left, top: b.top - scene.top } : null;
            })(),
          };
        });
        return { geo, heading: { right: ink.right - scene.left, bottom: h.bottom - scene.top } };
      });
      const [quote, stat100, stat4M, stat150, michelle] = geo;

      // Figma: figures 150+ 154.06px, 4M 166.5px, 100% 151.6px; the
      // quotes' lines 69.9px and (Michelle, node 3837:5995) 45.285px
      expect(Math.abs(stat4M.font / stat150.font - 166.5 / 154.06)).toBeLessThan(0.02);
      expect(Math.abs(stat100.font / stat150.font - 151.6 / 154.06)).toBeLessThan(0.02);
      expect(Math.abs(quote.font / stat150.font - 69.9 / 154.06)).toBeLessThan(0.02);
      expect(Math.abs(michelle.font / stat150.font - 45.285 / 154.06)).toBeLessThan(0.01);

      // arrangement: 150+ and 4M share the top row (150+ left, 4M right);
      // 100% and the quote share the bottom row; the Michelle quote sits
      // between 150+ and 4M
      expect(Math.abs(stat150.top - stat4M.top)).toBeLessThan(10);
      expect(stat150.right).toBeLessThan(stat4M.left);
      expect(stat100.top).toBeGreaterThan(stat150.bottom);
      expect(quote.left).toBeGreaterThan(stat100.right - 40);
      expect(michelle.left).toBeGreaterThan(stat150.right);
      expect(michelle.right).toBeLessThan(stat4M.left + 40);
      // Figma starts the Michelle quote's text above the stats' top row,
      // up beside the heading: higher than 150+, clear of "momentum."
      expect(michelle.top).toBeLessThan(stat150.top);
      expect(michelle.left, "Michelle quote clear of the heading").toBeGreaterThan(heading.right);
      // its badge sits off the column's top-left corner (330.43, -34.2 Figma px)
      const k = michelle.font / 45.285;
      expect(Math.abs((michelle.badge!.left - michelle.left) / k - 330.43)).toBeLessThan(4);
      expect(Math.abs((michelle.badge!.top - michelle.top) / k + 34.2)).toBeLessThan(4);

      for (let i = 0; i < N; i++) {
        const g = geo[i];
        expect(g.filter, `slide ${i} sharp at rest`).toBe("");
        expect(g.ariaHidden, `slide ${i} exposed at rest`).toBeNull();
        expect(g.left, `slide ${i} inside the scene`).toBeGreaterThanOrEqual(0);
        expect(g.right).toBeLessThanOrEqual(g.sceneW);
        // (the Michelle quote rises above the scene, beside the heading — checked above)
        if (i !== 4) expect(g.top).toBeGreaterThanOrEqual(0);
        expect(g.bottom, `slide ${i} not clipped at the bottom`).toBeLessThanOrEqual(g.sceneH);
        for (let j = i + 1; j < N; j++) {
          const h = geo[j];
          const overlap = !(g.right <= h.left || h.right <= g.left || g.bottom <= h.top || h.bottom <= g.top);
          expect(overlap, `slides ${i} and ${j} overlap`).toBe(false);
        }
      }
    });

    test("desktop rest: the whole composition sits so the 1 of 150+ lines up under the m of momentum.", async ({ page }) => {
      test.skip(!isDesktop(page), "desktop-only Three-placed composition");
      await playToEnd(page);
      await page.waitForTimeout(REVEAL_DUR + SETTLE);
      const lefts = await page.evaluate(() => {
        const firstGlyphLeft = (el: Element) => {
          const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
          for (let n = w.nextNode(); n; n = w.nextNode()) {
            const at = (n.textContent ?? "").search(/\S/);
            if (at < 0) continue;
            const r = document.createRange();
            r.setStart(n, at); r.setEnd(n, at + 1);
            return r.getBoundingClientRect().left;
          }
          return NaN;
        };
        return {
          one: firstGlyphLeft(document.querySelector('#mgScene > .mg__slide[data-mg-index="3"] .mfig')!),
          m: firstGlyphLeft(document.querySelector(".hs__intro-head .hot")!),
        };
      });
      expect(Math.abs(lefts.one - lefts.m)).toBeLessThan(2);
    });

    test("mobile: a list item's font-family matches its live slide, not the button's UA default", async ({ page }) => {
      // .mg__ov-item is a real <button> — its UA default font-family
      // isn't inherited from the page the way every other element's is,
      // so without an inherit rule the clone falls back to the browser's
      // own UI font.
      test.skip(isDesktop(page), "the stacked list is mobile's resting state only");
      await playToEnd(page);
      for (let i = 0; i < N; i++) {
        const liveFamily = await page.evaluate(
          (n) => getComputedStyle(document.querySelector(`#mgScene > .mg__slide[data-mg-index="${n}"] .mfig, #mgScene > .mg__slide[data-mg-index="${n}"] .mquote`)!).fontFamily,
          i,
        );
        const cloneFamily = await page.evaluate(
          (n) => getComputedStyle(document.querySelector(`.mg__ov-item[data-mg-index="${n}"] .mfig, .mg__ov-item[data-mg-index="${n}"] .mquote`)!).fontFamily,
          i,
        );
        expect(cloneFamily, `slide ${i}'s list item should render in the same font as its live slide`).toBe(liveFamily);
      }
    });

    test("scrolling away mid-movie rests on every slide", async ({ page }) => {
      await scrollIntoGallery(page);
      await pollUntil(page, (s) => s.playing === true);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(300);
      await pollUntil(page, (s) => s.everPlayed === true && s.playing === false);
      await expectResting(page);
    });

    test("scrolling away and back into view shows only the final screen — no autoplay", async ({ page }) => {
      await scrollIntoGallery(page);
      await pollUntil(page, (s) => s.playing === true);
      await pollUntil(page, (s) => s.idx >= 2, 10000); // let it get partway through first
      await page.evaluate(() => window.scrollTo(0, 0));
      await pollUntil(page, (s) => s.everPlayed === true && s.playing === false);
      await expectResting(page);

      await scrollIntoGallery(page);
      await page.waitForTimeout(1000);
      expect((await getState(page)).playing).toBe(false);
      await expectResting(page);
    });

    test("once the movie has finished, scrolling away and back stays on the final screen", async ({ page }) => {
      await playToEnd(page);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(300);
      await scrollIntoGallery(page);
      await page.waitForTimeout(1000);
      expect((await getState(page)).playing).toBe(false);
      await expectResting(page);
    });

    test("a replay left mid-way goes back to the final screen, and doesn't restart on return", async ({ page }) => {
      await playToEnd(page);
      await page.waitForTimeout(REVEAL_DUR + SETTLE);
      await scrollIntoGallery(page);
      await page.locator("#mgOvToggle").click();
      await pollUntil(page, (s) => s.playing === true);
      await page.evaluate(() => window.scrollTo(0, 0));
      await pollUntil(page, (s) => s.playing === false);
      await scrollIntoGallery(page);
      await page.waitForTimeout(1000);
      expect((await getState(page)).playing).toBe(false);
      await expectResting(page);
    });

    test("mobile: tapping a list item previews that one slide directly", async ({ page }) => {
      test.skip(isDesktop(page), "the stacked list is mobile's resting state only");
      await playToEnd(page);
      await page.waitForTimeout(REVEAL_DUR + SETTLE);
      await page.locator('.mg__ov-item[data-mg-index="3"]').click();
      await page.waitForTimeout(300);
      await expect(page.locator("#mgOverview")).toBeHidden();
      expect(await activeIndex(page)).toBe("3");
    });

    test("the Replay button restarts the movie from slide 0", async ({ page }) => {
      await playToEnd(page);
      await page.waitForTimeout(REVEAL_DUR + SETTLE);
      await page.locator("#mgOvToggle").click();
      await page.waitForTimeout(300);
      await expect(page.locator("#mgOverview")).toBeHidden();
      await expect(page.locator("#momentum")).not.toHaveAttribute("data-mg-rest", "true");
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
