import { test, expect, type Page } from "@playwright/test";
import { skipHeroMovie } from "./helpers";

/**
 * MomentumGallery — a "back to front" depth-of-field carousel replacing
 * the old horizontally-panning Momentum track. Locks scroll (Hero's own
 * overflow:hidden + snapback mechanism, reused) the moment it fills the
 * viewport; wheel, arrow keys, or touch each advance/retreat exactly one
 * slide; auto-play cycles on its own, pausing on interaction and resuming
 * 3s later; advancing past the last slide (or retreating before the
 * first) releases the lock and hands scroll to the next/previous section.
 *
 * Mirrors momentumGallery.ts's constants (kept in sync manually, same
 * reasoning as hero-movie.spec.ts). Every test waits out GUARD_DUR before
 * dispatching a follow-up gesture — GSAP's Observer/this component's own
 * `transitioning` guard otherwise silently swallows a gesture that
 * arrives mid-transition, which isn't a bug, just something a test has to
 * pace around the same way a real user's gestures would naturally be
 * paced. Note GUARD_DUR only covers the lateral settle — a promoted
 * slide's depth keeps slowly breathing forever (see DEPTH_APPROACH_DUR/
 * HOLD_BREATHE_DUR in momentumGallery.ts), deliberately: that's the
 * "pause never actually stops" feel, not something tests wait out.
 */
const GUARD_DUR = 3000; // ms
const SETTLE = GUARD_DUR + 150; // margin past the transition guard
const AUTOPLAY_DELAY = 4000; // ms

async function scrollIntoGallery(page: Page) {
  await page.evaluate(() => document.getElementById("momentum")?.scrollIntoView({ block: "start" }));
  await page.waitForTimeout(400); // let the IntersectionObserver engage
}

function activeIndex(page: Page): Promise<string | undefined> {
  return page.evaluate(() => document.querySelector<HTMLElement>('.mg__slide[data-active="true"]')?.dataset.mgIndex);
}

function isLocked(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.style.overflow === "hidden");
}

test.describe("MomentumGallery: back-to-front carousel", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    await skipHeroMovie(page);
  });

  test("arrow keys advance and retreat exactly one slide at a time, locking scroll while active", async ({ page }) => {
    await scrollIntoGallery(page);
    expect(await isLocked(page)).toBe(true);
    expect(await activeIndex(page)).toBe("0");

    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(SETTLE);
    expect(await activeIndex(page)).toBe("1");

    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(SETTLE);
    expect(await activeIndex(page)).toBe("2");

    await page.keyboard.press("ArrowUp");
    await page.waitForTimeout(SETTLE);
    expect(await activeIndex(page)).toBe("1");
  });

  test("advancing past the last slide releases the lock and scrolls to the next section", async ({ page }) => {
    await scrollIntoGallery(page);
    const section = await page.evaluate(() => {
      const el = document.getElementById("momentum")!;
      return { top: el.getBoundingClientRect().top + window.scrollY, height: el.getBoundingClientRect().height };
    });

    await page.evaluate(() => (document.getElementById("momentum") as HTMLElement & { mgApi: { goTo: (i: number) => void } }).mgApi.goTo(3));
    await page.waitForTimeout(SETTLE);
    expect(await activeIndex(page)).toBe("3");

    const before = await page.evaluate(() => window.scrollY);
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(SETTLE);

    expect(await isLocked(page), "should release the lock once past the last slide").toBe(false);
    const after = await page.evaluate(() => window.scrollY);
    expect(after, "should scroll forward, roughly one section's worth").toBeGreaterThan(before + section.height * 0.5);

    // and the lock shouldn't fight a normal follow-up scroll anymore
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => window.scrollY)).toBeLessThan(50);
  });

  test("retreating before the first slide releases the lock and scrolls to the previous section", async ({ page }) => {
    await scrollIntoGallery(page);
    expect(await activeIndex(page)).toBe("0");

    const before = await page.evaluate(() => window.scrollY);
    await page.keyboard.press("ArrowUp");
    await page.waitForTimeout(SETTLE);

    expect(await isLocked(page)).toBe(false);
    const after = await page.evaluate(() => window.scrollY);
    expect(after, "should scroll backward").toBeLessThan(before);
  });

  test("wheel gestures also drive the carousel", async ({ page, browserName }) => {
    test.skip(browserName === "webkit", "page.mouse.wheel() isn't supported under Playwright's WebKit emulation");
    await scrollIntoGallery(page);
    expect(await activeIndex(page)).toBe("0");

    // a native wheel event targets whatever the mouse is actually
    // positioned over — GSAP's Observer is listening on the section
    // itself, so the cursor has to actually be there first.
    const box = await page.locator("#mgScene").boundingBox();
    if (!box) throw new Error("#mgScene not found");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

    await page.mouse.wheel(0, 150);
    await page.waitForTimeout(SETTLE);
    expect(await activeIndex(page)).toBe("1");

    await page.mouse.wheel(0, -150);
    await page.waitForTimeout(SETTLE);
    expect(await activeIndex(page)).toBe("0");
  });

  test("touch drag drives the carousel", async ({ page, isMobile, browserName }) => {
    test.skip(!isMobile, "touch is the mobile input path — desktop is covered by the wheel/keyboard tests");
    test.skip(browserName === "webkit", "no touch-swipe simulation available under Playwright's mobile WebKit emulation");
    await scrollIntoGallery(page);
    expect(await activeIndex(page)).toBe("0");

    const box = await page.locator("#mgScene").boundingBox();
    if (!box) throw new Error("#mgScene not found");
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.touchscreen.tap(cx, cy);
    // a swipe up (finger moves up the screen) reads the same as a wheel
    // scroll down — content moves forward, same as userAdvance's onDown.
    await page.evaluate(
      ([x, y]) => {
        const el = document.getElementById("mgScene")!;
        const opts = { bubbles: true, cancelable: true } as const;
        el.dispatchEvent(new TouchEvent("touchstart", { ...opts, touches: [new Touch({ identifier: 1, target: el, clientX: x, clientY: y })] }));
        el.dispatchEvent(new TouchEvent("touchmove", { ...opts, touches: [new Touch({ identifier: 1, target: el, clientX: x, clientY: y - 120 })] }));
        el.dispatchEvent(new TouchEvent("touchend", { ...opts, touches: [] }));
      },
      [cx, cy] as const,
    );
    await page.waitForTimeout(SETTLE);
    expect(await activeIndex(page)).toBe("1");
  });

  test("auto-play advances after inactivity and pauses on interaction", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "one project is enough for this real-time timing check");
    await scrollIntoGallery(page);
    expect(await activeIndex(page)).toBe("0");

    // wait past the autoplay delay *and* the transition it kicks off, so
    // the component's own transitioning guard isn't still swallowing the
    // ArrowDown press right below
    await page.waitForTimeout(AUTOPLAY_DELAY + SETTLE);
    expect(await activeIndex(page), "should have auto-advanced once on its own").toBe("1");

    // interacting resets the clock — a fresh wait shorter than the full
    // delay shouldn't show another advance yet
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(SETTLE);
    expect(await activeIndex(page)).toBe("2");
    await page.waitForTimeout(AUTOPLAY_DELAY - 1500);
    expect(await activeIndex(page), "shouldn't have auto-advanced yet, the interaction just reset the timer").toBe("2");
  });

  test("a stat's number counts up exactly once, never resetting on a later turn", async ({ page }) => {
    await scrollIntoGallery(page);
    const readFigure = () => page.locator('.mg__slide[data-mg-index="0"] .mfig').innerText();

    // countUp's own tween is 0.9s * 1.6 = 1.44s — wait comfortably past it.
    await page.waitForTimeout(1800);
    expect(await readFigure()).toContain("100");

    // navigate away, wait out its own transition, then back — each key
    // press needs to land after the *previous* transition has fully
    // cleared, or the component's own transitioning guard swallows it.
    // countedUp is now permanent (see momentumGallery.ts's shared-state
    // comment): once a slide has counted up, later turns just keep
    // showing its already-final number — never reset, never re-animated.
    await page.keyboard.press("ArrowDown"); // -> slide 1
    await page.waitForTimeout(SETTLE);
    await page.keyboard.press("ArrowUp"); // back to slide 0
    const samples: number[] = [];
    for (let i = 0; i < 14; i++) {
      await page.waitForTimeout(200);
      samples.push(parseInt(await readFigure(), 10));
    }
    expect(samples.every((v) => v === 100), "the number should stay at its already-counted value the whole time, never drop back down").toBe(true);
  });

  test("no number counts up before the section has actually been scrolled into view", async ({ page }) => {
    // No scrollIntoGallery here on purpose — the whole point is to check
    // state before the visitor ever reaches the section (e.g. while
    // they're still reading Hero or KeepUp). If a number counted up
    // eagerly at mount the way it used to, this would already read "100"
    // despite the section being nowhere near the viewport.
    //
    // Reads via page.evaluate(), not a Locator's .innerText() — a Locator
    // action auto-scrolls its target into view as part of its own
    // actionability check, which would itself cross the 20%/90%
    // thresholds and contaminate exactly the thing this test is trying to
    // observe.
    const readFigure = () =>
      page.evaluate(() => document.querySelector('.mg__slide[data-mg-index="0"] .mfig')?.textContent ?? "");
    await page.waitForTimeout(2000); // comfortably past countUp's own 1.44s tween, if it had wrongly started
    expect(await readFigure(), "should still show its unanimated placeholder, not have silently counted up off-screen").not.toContain("100");
  });

  test("only the active slide is exposed to assistive tech at a time", async ({ page }) => {
    await scrollIntoGallery(page);
    const hidden = await page.evaluate(() =>
      Array.from(document.querySelectorAll(".mg__slide")).map((s) => s.getAttribute("aria-hidden")),
    );
    expect(hidden.filter((v) => v !== "true")).toHaveLength(1);
  });

  test("non-active slides start invisible — nothing is ever visibly parked in the background", async ({ page }) => {
    await scrollIntoGallery(page);
    const opacities = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>(".mg__slide")).map((s) => parseFloat(getComputedStyle(s).opacity)),
    );
    // slide 0 is the initial active slide, painted straight to opacity 1
    // (no tween on load); the other three sit at the shared waiting lane,
    // which is opacity 0 by design — there's no more scattered,
    // semi-visible "shelf" of background items to reveal at any point.
    expect(opacities[0]).toBeCloseTo(1, 1);
    expect(opacities.slice(1).every((o) => o < 0.05), "waiting slides should be fully invisible, not dimly parked").toBe(true);
  });

  test("a departed slide fades to fully invisible rather than resting visibly in the background", async ({ page }) => {
    await scrollIntoGallery(page);
    const opacityOf = (i: number) =>
      page.evaluate((idx) => parseFloat(getComputedStyle(document.querySelector(`.mg__slide[data-mg-index="${idx}"]`)!).opacity), i);

    await page.keyboard.press("ArrowDown"); // slide 0 departs, slide 1 becomes active
    await page.waitForTimeout(SETTLE); // well past DEPART_DUR, the shorter of the two tween durations

    expect(
      await opacityOf(0),
      "the slide that just departed should have faded all the way to invisible, not settled at a dim resting value",
    ).toBeLessThan(0.05);
    expect(await opacityOf(1)).toBeCloseTo(1, 1);
  });

  test("a paused slide keeps almost imperceptibly growing while it waits, rather than freezing solid", async ({ page }) => {
    // Desktop-only: mobile's live scale isn't exposed via a regexable
    // style.transform string the way desktop's renderFrame produces one.
    test.skip((page.viewportSize()?.width ?? 0) < 1000, "desktop-only motion model");
    await scrollIntoGallery(page);
    // The very first slide shown on load is snapped straight to its
    // resting depth (see enterMode) rather than promoted through
    // desktopSwap — it never runs the approach/hold-breathe at all, so
    // it's not a fair subject for this check. Explicitly promote slide 1
    // instead, via a real gesture (not mgApi.goTo directly) — a real
    // gesture calls registerInteraction(), which resets the autoplay
    // clock (RESUME_DELAY + AUTOPLAY_DELAY out from now), giving this
    // test's sampling window real headroom instead of racing autoplay's
    // own 4s timer.
    await page.keyboard.press("ArrowDown");
    // past the lateral SETTLE_DUR, so x/y/rotation have stopped changing —
    // still within (or just past, into the infinite hold-breathe) the
    // depth tween's tail, which should still be creeping either way (see
    // momentumGallery.ts's DEPTH_APPROACH_DUR/HOLD_BREATHE_DUR comment:
    // the whole point is that "the pause" never actually stops).
    await page.waitForTimeout(SETTLE);
    const readScale = () =>
      page.evaluate(() => {
        const el = document.querySelector<HTMLElement>('.mg__slide[data-mg-index="1"]');
        const m = el?.style.transform.match(/scale\(([\d.]+)\)/);
        return m ? parseFloat(m[1]) : null;
      });
    const first = await readScale();
    // a wide-ish gap — under parallel test-worker load GSAP's rAF-driven
    // ticker can lag behind wall-clock waits by a couple hundred ms, so a
    // short gap risks two samples landing indistinguishably close
    // together despite real, continuing motion. Autoplay was just reset
    // by the keypress above, so there's no rush to keep this short.
    await page.waitForTimeout(1500);
    const second = await readScale();
    expect(second, "the paused slide should still be very slightly growing, not perfectly still").toBeGreaterThan(first!);
  });

  test("a waiting slide's opacity gently breathes instead of sitting pinned at flat zero", async ({ page }) => {
    await scrollIntoGallery(page);
    const opacityOf = (i: number) =>
      page.evaluate((idx) => parseFloat(getComputedStyle(document.querySelector(`.mg__slide[data-mg-index="${idx}"]`)!).opacity), i);
    // samples span roughly one full WAIT_BREATHE_DUR cycle (6s in
    // momentumGallery.ts) so the randomized per-slide start delay doesn't
    // make this flaky — over a full period there's always visible spread.
    const samples: number[] = [];
    for (let i = 0; i < 10; i++) {
      await page.waitForTimeout(600);
      samples.push(await opacityOf(1));
    }
    expect(
      samples.some((v) => v > 0.005),
      "a waiting slide should never be perfectly, permanently invisible — a faint ambient breathe should show through",
    ).toBe(true);
    expect(
      Math.max(...samples) - Math.min(...samples),
      "opacity should visibly vary over time (breathing), not sit pinned at one flat value",
    ).toBeGreaterThan(0.01);
  });

  test("a promoted slide's lateral position starts near screen centre and moves outward as it approaches", async ({ page }) => {
    // Desktop-only: mobile's transform comes from GSAP's own transform
    // serialization (no hand-written translate()px string to regex-match
    // the way desktop's renderFrame produces), and has no live projection
    // path to regress in the first place — this bug was specific to the
    // Three.js/desktop lane-swap logic.
    test.skip((page.viewportSize()?.width ?? 0) < 1000, "desktop-only motion model");
    // A real regression this had: the lateral (left/right) position used
    // to snap straight to its final resting lane immediately, and only
    // *depth* animated — so 2 of the 3 possible resting lanes never
    // visibly passed through centre at all, they just grew in place
    // already off to the side. Force deterministic lane picking (always
    // the last option in whatever pool is offered) so this lands
    // somewhere off-centre instead of flakily sometimes landing dead
    // centre, where "moved outward" would be vacuously true either way.
    await page.addInitScript(() => { Math.random = () => 0.99; });
    await page.goto("/", { waitUntil: "networkidle" });
    await skipHeroMovie(page);
    await scrollIntoGallery(page);

    const sceneBox = await page.locator("#mgScene").boundingBox();
    if (!sceneBox) throw new Error("#mgScene not found");
    const centerX = sceneBox.x + sceneBox.width / 2;
    const readX = () =>
      page.evaluate(() => {
        const el = document.querySelector<HTMLElement>('.mg__slide[data-mg-index="1"]');
        const m = el?.style.transform.match(/translate\(([-\d.]+)px/);
        return m ? parseFloat(m[1]) : null;
      });

    await page.evaluate(() => (document.getElementById("momentum") as HTMLElement & { mgApi: { goTo: (i: number) => void } }).mgApi.goTo(1));
    await page.waitForTimeout(150); // early in the approach
    const earlyX = await readX();
    await page.waitForTimeout(SETTLE);
    const finalX = await readX();

    const earlyOffset = Math.abs(earlyX! - centerX);
    const finalOffset = Math.abs(finalX! - centerX);
    expect(finalOffset, "deterministic random should have landed it off-centre").toBeGreaterThan(50);
    expect(earlyOffset, "should read much closer to centre early on than its eventual resting offset").toBeLessThan(finalOffset * 0.5);
  });

  test("the quote slide always rests in its own dedicated, right-shifted lane", async ({ page }) => {
    // Desktop-only: same transform-string-regex reasoning as the lateral
    // position test above.
    test.skip((page.viewportSize()?.width ?? 0) < 1000, "desktop-only motion model");
    await scrollIntoGallery(page);
    const sceneBox = await page.locator("#mgScene").boundingBox();
    if (!sceneBox) throw new Error("#mgScene not found");
    const centerX = sceneBox.x + sceneBox.width / 2;
    const readX = () =>
      page.evaluate(() => {
        const el = document.querySelector<HTMLElement>('.mg__slide[data-mg-index="3"]');
        const m = el?.style.transform.match(/translate\(([-\d.]+)px/);
        return m ? parseFloat(m[1]) : null;
      });

    await page.evaluate(() => (document.getElementById("momentum") as HTMLElement & { mgApi: { goTo: (i: number) => void } }).mgApi.goTo(3));
    await page.waitForTimeout(SETTLE);
    const offset = (await readX())! - centerX;
    // QUOTE_LANE.x is 220 world units (== css px at z:0) right of centre,
    // fixed — not drawn from the stat slides' shared random 3-lane pool —
    // tuned so the quote's own left-aligned text reads with its emphasis
    // (the word "move" in "They move") landing around 60% across the
    // frame.
    expect(offset, "the quote should always land well right of centre").toBeGreaterThan(150);
  });

  test("the quote badge sits a small, fixed gap past the edge of \"move\", not overlapping it", async ({ page }) => {
    // Runs on every project, not just desktop — this is plain box layout
    // (.mquote__l1's own width:fit-content plus the badge's left:calc(100%
    // + 20px)), unrelated to which render path (Three.js vs CSS 3D
    // transform) is positioning the slide as a whole.
    await scrollIntoGallery(page);
    await page.evaluate(() => (document.getElementById("momentum") as HTMLElement & { mgApi: { goTo: (i: number) => void } }).mgApi.goTo(3));
    await page.waitForTimeout(SETTLE);
    const gap = await page.evaluate(() => {
      const l1 = document.querySelector(".mquote__l1")!.getBoundingClientRect();
      const badge = document.querySelector(".mquote__badge")!.getBoundingClientRect();
      return badge.left - l1.right;
    });
    // A real regression this had: right:-20px on the badge (a responsive,
    // clamp()-sized element) anchors its *right* edge past the text, so
    // the badge's own width extends backward *over* the text instead of
    // clearing it — that read as a large negative/overlapping gap, not a
    // small positive one. left:calc(100% + 20px) fixed it. Generous
    // tolerance band, not an exact 20px match — the badge is on a slide
    // that's still gently growing (the hold-breathe, see
    // momentumGallery.ts) at the moment this samples.
    expect(gap, "should be a small positive gap, not overlapping the text").toBeGreaterThan(5);
    expect(gap, "should be a small gap, not drifted far away from the text").toBeLessThan(60);
  });

  test("desktop gets a real WebGL canvas; mobile never creates one", async ({ page }) => {
    await scrollIntoGallery(page);
    const canvasSize = await page.evaluate(() => {
      const c = document.getElementById("mgCanvas") as HTMLCanvasElement;
      return { width: c.width, height: c.height };
    });
    // matches momentumGallery.ts's own DESKTOP_QUERY breakpoint exactly,
    // rather than assuming per-project — the ipad project's own viewport
    // (834px) sits under it despite the name.
    const isDesktopWidth = (page.viewportSize()?.width ?? 0) >= 1000;
    if (isDesktopWidth) {
      // Three.js's renderer.setSize() writes real dimensions — the
      // untouched HTML default (300x150) means it was never called.
      expect(canvasSize.width, "desktop-width viewports should have initialized the WebGL renderer").not.toBe(300);
    } else {
      expect(canvasSize).toEqual({ width: 300, height: 150 });
    }
  });

  test("reduced motion: all slides visible statically, no scroll lock", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/", { waitUntil: "networkidle" });
    await skipHeroMovie(page);
    await scrollIntoGallery(page);

    expect(await isLocked(page)).toBe(false);
    const positions = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>(".mg__slide")).map((s) => getComputedStyle(s).position),
    );
    expect(positions.every((p) => p === "static")).toBe(true);

    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => window.scrollY)).toBeLessThan(50);
  });
});
