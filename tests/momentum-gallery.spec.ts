import { test, expect, type Page } from "@playwright/test";
import { skipHeroMovie } from "./helpers";

/**
 * MomentumGallery — a "back to front" depth-of-field carousel replacing
 * the old horizontally-panning Momentum track. Purely autoplay-driven —
 * there is no gesture navigation at all (no scroll-lock, no wheel/arrow-
 * key/touch capture), and no native `scroll` listener either: a
 * ScrollTrigger tracks the section's own overlap with the viewport's
 * *top* edge (the same "is this the section now under the fixed nav"
 * idiom navTint.ts uses elsewhere) — play() once its top reaches the
 * nav, pause() once its bottom passes it (never traps scroll). A small
 * in-place scroll doesn't cross either edge, so it doesn't pause;
 * actually scrolling away does. Scrolling back resumes — on the same
 * slide it was on (idx isn't reset), but replaying that slide's own
 * arrival from scratch rather than resuming wherever its tweens silently
 * ended up while off-screen and unrendered. After a few full autoplay
 * loops with nobody interrupting, it stops on its own.
 *
 * Mirrors momentumGallery.ts's constants (kept in sync manually, same
 * reasoning as hero-movie.spec.ts). Every test waits out GUARD_DUR
 * (== ARRIVE_DUR — there's no separate lateral-settle duration any more,
 * one coordinated tween drives lateral/depth/rotation together) before
 * checking a follow-up `goTo()`'s effect — the component's own
 * `transitioning` guard otherwise silently swallows a call that arrives
 * mid-transition. A promoted slide's depth keeps creeping forever past
 * that (see HOLD_CREEP_SPEED in momentumGallery.ts), deliberately: that's
 * the "never actually stops" feel, not something tests wait out.
 *
 * Every slide's arrival — including the very first one ever shown — now
 * takes the full ARRIVE_DUR to fade in and reach its resting lane; tests
 * that used to assert "slide 0 is already at opacity 1 immediately after
 * scrolling in" have to wait out an arrival first, same as any other
 * promotion.
 *
 * Most tests call mgApi.disableAutoplay() right after scrolling in — this
 * stops the live autoplay timer from racing a test's own goTo() calls
 * while leaving the ticker/rendering fully live, so DOM transforms are
 * still real and readable (unlike mgApi.pause(), which also stops the
 * ticker — correct real-world "scrolled away" behavior, but wrong for a
 * test that still wants to read live transforms after driving state
 * directly).
 */
const GUARD_DUR = 2500; // ms
const SETTLE = GUARD_DUR + 150; // margin past the transition guard
const AUTOPLAY_DELAY = 4000; // ms
const N = 5;
const MAX_AUTO_LOOPS = 3;

async function scrollIntoGallery(page: Page) {
  await page.evaluate(() => document.getElementById("momentum")?.scrollIntoView({ block: "start" }));
  // ScrollTrigger's onUpdate only fires on an actual detected
  // scroll-position change during its own update cycle — an instant JS
  // jump (scrollIntoView, or window.scrollTo/scrollBy landing exactly
  // on the target in one step) doesn't reliably trigger that recheck in
  // a headless browser the way real input-driven scrolling does, and
  // there's no single simulated-input nudge (wheel, key, touch) that
  // reliably works across every engine this project tests against —
  // confirmed directly against several. A real visitor always arrives
  // via continuous scroll input, so this is a test-methodology gap, not
  // a product bug — checkScrollState runs the exact same
  // getBoundingClientRect() decision the ScrollTrigger's own onUpdate
  // does, just callable directly instead of waiting on a live scroll
  // event to fire it.
  // optional chaining — under reduced motion, setupMomentumGallery
  // returns early and mgApi never gets wired up at all (see the
  // reduced-motion test's own assertion of exactly that).
  await page.evaluate(() => (document.getElementById("momentum") as any).mgApi?.checkScrollState());
  await page.waitForTimeout(400); // let the settle-check engage
}

/**
 * Every other scroll a test does after the initial entrance — leaving,
 * coming back, jumping to the top/bottom — needs the same
 * checkScrollState() nudge scrollIntoGallery's own comment explains
 * (an instant programmatic jump doesn't reliably make ScrollTrigger's
 * own update cycle re-run in a headless browser).
 */
async function scrollAndCheck(page: Page, fn: () => void) {
  await page.evaluate(fn);
  await page.evaluate(() => (document.getElementById("momentum") as any).mgApi.checkScrollState());
}

/**
 * scrollIntoGallery + stop the live autoplay timer, for deterministic
 * goTo()-driven tests. Also waits out the *initial* activation's own
 * GUARD_DUR — activateCurrent() sets `transitioning` for that long (same
 * as any other transition, so a goTo() arriving mid-arrival can't start
 * departing a slide whose own arrival opacity tween is still fighting to
 * reach 1 — see momentumGallery.ts's activateCurrent comment). Without
 * this wait, a test's own goTo() call right after taking control would
 * be silently swallowed by that same guard.
 */
async function scrollInAndTakeManualControl(page: Page) {
  await scrollIntoGallery(page);
  await page.evaluate(() => (document.getElementById("momentum") as any).mgApi.disableAutoplay());
  await page.waitForTimeout(SETTLE);
}

function activeIndex(page: Page): Promise<string | undefined> {
  return page.evaluate(() => document.querySelector<HTMLElement>('.mg__slide[data-active="true"]')?.dataset.mgIndex);
}

function getState(page: Page) {
  return page.evaluate(() => (document.getElementById("momentum") as any).mgApi.getState());
}

test.describe("MomentumGallery: back-to-front carousel", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    await skipHeroMovie(page);
  });

  test("plays automatically once fully scrolled into view, with no gesture required", async ({ page }) => {
    await scrollIntoGallery(page);
    expect(await activeIndex(page)).toBe("0");
    expect((await getState(page)).playing, "should start playing on its own once fully in view").toBe(true);

    await page.waitForTimeout(AUTOPLAY_DELAY + SETTLE);
    expect(await activeIndex(page), "should have auto-advanced on its own, unprompted").toBe("1");
  });

  test("there is no wheel/arrow-key/touch navigation hint, and scroll is never trapped", async ({ page }) => {
    await scrollIntoGallery(page);
    await expect(page.locator(".mg__hint")).toHaveCount(0);
    // never locked — overflow is never touched by this component at all
    expect(await page.evaluate(() => document.documentElement.style.overflow)).not.toBe("hidden");
    expect(await page.evaluate(() => document.body.style.overflow)).not.toBe("hidden");
  });

  test("a small in-place scroll doesn't pause it, but scrolling out of (and back into) view does — resuming on the same slide", async ({ page }) => {
    // Driven by a ScrollTrigger tracking the section's own overlap with
    // the viewport's top edge (see momentumGallery.ts's own comment)
    // rather than a native `scroll` listener paired with a separate
    // IntersectionObserver — GSAP owns scroll-driven state everywhere
    // else in this codebase now. play()/pause() fire only at those two
    // edge crossings, not "any scroll happened at all" — a trackpad's
    // momentum settling or a visitor nudging the page slightly while
    // still reading shouldn't read as "leaving".
    await scrollInAndTakeManualControl(page);
    await page.evaluate(() => (document.getElementById("momentum") as any).mgApi.goTo(2));
    await page.waitForTimeout(SETTLE);
    expect(await activeIndex(page)).toBe("2");
    expect((await getState(page)).playing).toBe(true);

    // a tiny scroll, nowhere near either edge
    await scrollAndCheck(page, () => window.scrollBy(0, 5));
    await page.waitForTimeout(100);
    expect((await getState(page)).playing, "a small in-place scroll shouldn't pause it").toBe(true);
    expect(await activeIndex(page)).toBe("2");

    // scroll far enough to actually leave the section
    await scrollAndCheck(page, () => window.scrollBy(0, window.innerHeight));
    await page.waitForTimeout(100);
    expect((await getState(page)).playing, "should pause once actually scrolled away").toBe(false);
    expect(await activeIndex(page), "pausing should not change which slide is active").toBe("2");

    // scroll back — should resume on its own, from slide 2, not reset to 0
    await scrollAndCheck(page, () => window.scrollBy(0, -window.innerHeight));
    await page.waitForTimeout(100);
    expect((await getState(page)).playing, "should resume once back in view").toBe(true);
    expect(await activeIndex(page), "should pick back up from the same slide, not restart").toBe("2");
  });

  test("resuming after a scroll-away replays the current slide's arrival from small again, rather than sitting stuck", async ({ page }) => {
    // A real regression: pause() used to only stop the render loop and
    // the autoplay timer — the arrival/hold-creep tweens driving the
    // active slide's own mesh kept running for real, silently, the whole
    // time the section was scrolled away and unrendered. By the time the
    // visitor scrolled back, those tweens had usually already finished
    // (hold-creep has a fixed CREEP_TAIL_DUR), so resuming just resumed
    // rendering wherever they'd already settled — no visible motion at
    // all, reading as "stuck". Fixed by having both pause() and every
    // resume go through activateCurrent(), which resets every slide to
    // its invisible waiting state and replays the active one's arrival
    // from scratch — see momentumGallery.ts's activateCurrent comment.
    test.skip((page.viewportSize()?.width ?? 0) < 1000, "desktop-only motion model — mobile's live scale isn't exposed via a regexable style.transform string");
    await scrollInAndTakeManualControl(page);
    await page.evaluate(() => (document.getElementById("momentum") as any).mgApi.goTo(2));
    await page.waitForTimeout(SETTLE);
    expect(await activeIndex(page)).toBe("2");

    const readScale = () =>
      page.evaluate(() => {
        const el = document.querySelector<HTMLElement>('.mg__slide[data-mg-index="2"]');
        const m = el?.style.transform.match(/scale\(([\d.]+)\)/);
        return m ? parseFloat(m[1]) : null;
      });
    const arrivedScale = await readScale();
    expect(arrivedScale, "fully arrived and prominent before scrolling away").toBeGreaterThan(0.9);

    // scroll away, then back — the ScrollTrigger crossing back into its
    // "fully in view" band is what triggers the replay.
    await scrollAndCheck(page, () => window.scrollBy(0, window.innerHeight));
    await page.waitForTimeout(100);
    await scrollAndCheck(page, () => window.scrollBy(0, -window.innerHeight));
    await page.waitForTimeout(300); // partway into the replayed arrival

    expect((await getState(page)).playing, "should have resumed by now").toBe(true);
    expect(await activeIndex(page), "resuming should pick back up on the same slide, not a different one").toBe("2");
    expect(
      await readScale(),
      "resuming should be replaying the arrival from small again, not sitting at (or jumping straight back to) the fully-arrived scale",
    ).toBeLessThan(arrivedScale! * 0.8);

    // and it does fully re-arrive again, same as any other arrival.
    await page.waitForTimeout(SETTLE);
    expect(await readScale(), "should finish re-arriving at full prominence").toBeGreaterThan(0.9);
    expect(await activeIndex(page)).toBe("2");
  });

  test("scrolling away from the section pauses it and never blocks the scroll itself", async ({ page }) => {
    await scrollIntoGallery(page);
    expect((await getState(page)).playing).toBe(true);

    await scrollAndCheck(page, () => window.scrollTo(0, 0));
    await page.waitForTimeout(700); // past the settle-debounce
    expect((await getState(page)).playing, "should stay paused — the section is no longer fully in view").toBe(false);
    // and the scroll itself was never fought
    expect(await page.evaluate(() => window.scrollY)).toBeLessThan(50);
  });

  test("stops on its own after a few full loops and auto-scrolls to the next section", async ({ page }) => {
    // N * MAX_AUTO_LOOPS advances, each needing a real GUARD_DUR-plus
    // wait (~47s total), comfortably exceeds Playwright's default 30s
    // per-test timeout — this isn't a hang, just a genuinely longer test.
    test.setTimeout(75_000);
    await scrollInAndTakeManualControl(page);
    const before = await page.evaluate(() => window.scrollY);
    // advanceAuto() directly — simulating MAX_AUTO_LOOPS full loops in
    // real time would be MAX_AUTO_LOOPS * N * AUTOPLAY_DELAY, over a
    // minute. Exactly N * MAX_AUTO_LOOPS advances reaches the 3rd wrap
    // back to slide 0, which is what actually triggers stoppedForever —
    // goTo() silently no-ops while `transitioning` is still true, so
    // calling advanceAuto() faster than GUARD_DUR apart would under-count
    // real advances against this loop's own index.
    for (let i = 0; i < N * MAX_AUTO_LOOPS; i++) {
      await page.evaluate(() => (document.getElementById("momentum") as any).mgApi.advanceAuto());
      await page.waitForTimeout(SETTLE);
    }
    await page.waitForTimeout(1200); // the auto-scroll's own 0.9s tween, plus margin
    const state = await getState(page);
    expect(state.stoppedForever, "should have stopped after MAX_AUTO_LOOPS full loops").toBe(true);
    expect(
      await page.evaluate(() => window.scrollY),
      "should have automatically scrolled on to the next section — the visitor never touched scroll themselves",
    ).toBeGreaterThan(before + 100);
    // the auto-scroll's own real `scroll` event is what pauses it here —
    // "stopped" (no more slide-to-slide transitions) and "paused" (the
    // ticker) are two different things everywhere else in this
    // component, but they coincide in this one specific case because the
    // thing that stopped it also scrolled the section out of view.
    expect(state.playing, "the auto-scroll's own scroll event should have paused it, same as any other scroll away").toBe(false);

    const idxAfterStop = state.idx;
    await page.evaluate(() => (document.getElementById("momentum") as any).mgApi.advanceAuto());
    await page.waitForTimeout(SETTLE);
    expect((await getState(page)).idx, "no further advance should happen once stopped, even if asked to").toBe(idxAfterStop);

    // and scrolling further is still never blocked
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(1000);
  });

  test("shows a 'Scroll' cue once the first full loop finishes, not before", async ({ page }) => {
    await scrollInAndTakeManualControl(page);
    const cueOpacity = () => page.evaluate(() => parseFloat(getComputedStyle(document.getElementById("mgCue")!).opacity));
    expect(await cueOpacity(), "nothing to invite scrolling toward yet — the visitor hasn't seen everything once").toBeLessThan(0.05);

    for (let i = 0; i < N; i++) {
      await page.evaluate(() => (document.getElementById("momentum") as any).mgApi.advanceAuto());
      await page.waitForTimeout(SETTLE);
    }
    expect(await cueOpacity(), "the cue should be visible once every slide has shown once").toBeGreaterThan(0.9);
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
    // actionability check, which would itself cross the fully-in-view
    // threshold and contaminate exactly the thing this test is trying to
    // observe.
    const readFigure = () =>
      page.evaluate(() => document.querySelector('.mg__slide[data-mg-index="0"] .mfig')?.textContent ?? "");
    await page.waitForTimeout(2000); // comfortably past countUp's own 1.44s tween, if it had wrongly started
    expect(await readFigure(), "should still show its unanimated placeholder, not have silently counted up off-screen").not.toContain("100");
  });

  test("a stat's number counts up exactly once, never resetting on a later turn", async ({ page }) => {
    await scrollInAndTakeManualControl(page);
    const readFigure = () => page.evaluate(() => document.querySelector('.mg__slide[data-mg-index="0"] .mfig')?.textContent ?? "");

    // scrollInAndTakeManualControl already waited out the initial
    // arrival's own GUARD_DUR, but count-up itself fires later than that
    // (75% through the arrival) and then needs its own 0.9s * 1.6 = 1.44s
    // tween on top — wait comfortably past the rest of that chain.
    await page.waitForTimeout(1500);
    expect(await readFigure()).toContain("100");

    // navigate away, wait out its own transition, then back — countedUp
    // is now permanent (see momentumGallery.ts's shared-state comment):
    // once a slide has counted up, later turns just keep showing its
    // already-final number — never reset, never re-animated.
    await page.evaluate(() => (document.getElementById("momentum") as any).mgApi.goTo(1));
    await page.waitForTimeout(SETTLE);
    await page.evaluate(() => (document.getElementById("momentum") as any).mgApi.goTo(0));
    const samples: string[] = [];
    for (let i = 0; i < 14; i++) {
      await page.waitForTimeout(200);
      samples.push(await readFigure());
    }
    expect(samples.every((v) => v.includes("100")), "the number should stay at its already-counted value the whole time, never drop back down").toBe(true);
  });

  test("only the active slide is exposed to assistive tech at a time", async ({ page }) => {
    await scrollIntoGallery(page);
    const hidden = await page.evaluate(() =>
      Array.from(document.querySelectorAll(".mg__slide")).map((s) => s.getAttribute("aria-hidden")),
    );
    expect(hidden.filter((v) => v !== "true")).toHaveLength(1);
  });

  test("even the very first slide starts invisible/small and arrives gradually — nothing is pre-placed at full size", async ({ page }) => {
    // A real regression this had: slide 0 used to be seeded directly at
    // full prominent scale/opacity, so the very first thing a visitor saw
    // was already "done" — no entrance at all, unlike every later
    // promotion. It should go through the exact same arrival as anything
    // else, starting from the shared waiting lane.
    const opacityOf = (i: number) =>
      page.evaluate((idx) => parseFloat(getComputedStyle(document.querySelector(`.mg__slide[data-mg-index="${idx}"]`)!).opacity), i);
    await scrollIntoGallery(page);
    // sampled quickly, well before ARRIVE_DUR (2.5s) could have finished
    const earlyOpacity = await opacityOf(0);
    expect(earlyOpacity, "slide 0 should still be early in its own fade-in, not already fully opaque").toBeLessThan(0.6);

    await page.waitForTimeout(SETTLE);
    expect(await opacityOf(0), "slide 0 should have finished arriving by now").toBeGreaterThan(0.9);
  });

  test("non-active slides start invisible and stay invisible — nothing is ever visibly parked in the background", async ({ page }) => {
    await scrollIntoGallery(page);
    await page.waitForTimeout(SETTLE); // let slide 0's own arrival settle
    const opacities = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>(".mg__slide")).map((s) => parseFloat(getComputedStyle(s).opacity)),
    );
    expect(opacities).toHaveLength(N);
    // slide 0 is the active slide, now fully arrived; the rest sit at the
    // shared waiting lane, opacity 0 by design — there's no scattered,
    // semi-visible "shelf" of background items to reveal at any point.
    expect(opacities[0]).toBeCloseTo(1, 1);
    expect(opacities.slice(1).every((o) => o < 0.05), "waiting slides should be fully invisible, not dimly parked").toBe(true);
  });

  test("a departed slide fades to fully invisible rather than resting visibly in the background", async ({ page }) => {
    await scrollInAndTakeManualControl(page);
    const opacityOf = (i: number) =>
      page.evaluate((idx) => parseFloat(getComputedStyle(document.querySelector(`.mg__slide[data-mg-index="${idx}"]`)!).opacity), i);

    await page.evaluate(() => (document.getElementById("momentum") as any).mgApi.goTo(1)); // slide 0 departs, slide 1 becomes active
    await page.waitForTimeout(SETTLE); // well past DEPART_DUR, the shorter of the two tween durations

    expect(
      await opacityOf(0),
      "the slide that just departed should have faded all the way to invisible, not settled at a dim resting value",
    ).toBeLessThan(0.05);
    expect(await opacityOf(1)).toBeCloseTo(1, 1);
  });

  test("a slide's later turns still arrive from small again — a repeat departure doesn't get stuck zoomed in", async ({ page }) => {
    // A real regression this had: promoteDesktop/promoteMobile always
    // killed prior tweens on their own target before starting (so a
    // fresh arrival is always clean), but departDesktop/departMobile
    // didn't — on a slide's *later* turns, its departure's own depth
    // tween could end up fighting a still-alive long-running hold creep
    // (up to CREEP_TAIL_DUR = 20s) or an even older, genuinely infinite
    // (repeat:-1) ambient wait-breathe, leaving the mesh's depth stuck at
    // whatever odd intermediate value they landed on instead of cleanly
    // resetting to the waiting depth. The next arrival then had nowhere
    // far to grow *from*, so it looked like it skipped the "small to
    // prominent" journey entirely — or, worse, stayed zoomed in close
    // indefinitely with nothing to interrupt it once autoplay itself
    // eventually stopped (see the MAX_AUTO_LOOPS test).
    test.skip((page.viewportSize()?.width ?? 0) < 1000, "desktop-only motion model");
    await scrollInAndTakeManualControl(page);
    const readScale = () =>
      page.evaluate(() => {
        const el = document.querySelector<HTMLElement>('.mg__slide[data-mg-index="0"]');
        const m = el?.style.transform.match(/scale\(([\d.]+)\)/);
        return m ? parseFloat(m[1]) : null;
      });

    // two full round trips away from and back to slide 0
    for (let i = 0; i < 2; i++) {
      await page.evaluate(() => (document.getElementById("momentum") as any).mgApi.goTo(1));
      await page.waitForTimeout(SETTLE);
      await page.evaluate(() => (document.getElementById("momentum") as any).mgApi.goTo(0));
      await page.waitForTimeout(SETTLE);
    }
    // one more departure, then check its *waiting* depth specifically —
    // this is exactly the state that used to get stuck large.
    await page.evaluate(() => (document.getElementById("momentum") as any).mgApi.goTo(1));
    await page.waitForTimeout(SETTLE);
    expect(await readScale(), "a departed, waiting slide should sit small again, not stuck zoomed in").toBeLessThan(0.5);
  });

  test("a paused slide keeps growing at a small constant speed — never slows to a stop", async ({ page }) => {
    // Desktop-only: mobile's live scale isn't exposed via a regexable
    // style.transform string the way desktop's renderFrame produces one.
    test.skip((page.viewportSize()?.width ?? 0) < 1000, "desktop-only motion model");
    await scrollInAndTakeManualControl(page);
    // The very first slide shown on load is snapped straight to its
    // resting depth (see enterMode) rather than promoted through
    // desktopSwap — it never runs the approach/hold-creep at all, so it's
    // not a fair subject for this check. Explicitly promote slide 1
    // instead, which goes through the real lifecycle this test exercises.
    await page.evaluate(() => (document.getElementById("momentum") as any).mgApi.goTo(1));
    // past the lateral SETTLE_DUR, so x/y/rotation have stopped changing —
    // now in the constant-speed depth creep, which should still be
    // growing (linear, never yoyo'd, never decelerating to a stop — see
    // momentumGallery.ts's DEPTH_APPROACH_DUR/HOLD_CREEP_SPEED comment).
    await page.waitForTimeout(SETTLE);
    const readScale = () =>
      page.evaluate(() => {
        const el = document.querySelector<HTMLElement>('.mg__slide[data-mg-index="1"]');
        const m = el?.style.transform.match(/scale\(([\d.]+)\)/);
        return m ? parseFloat(m[1]) : null;
      });
    const samples: number[] = [];
    for (let i = 0; i < 4; i++) {
      samples.push((await readScale())!);
      await page.waitForTimeout(800);
    }
    // strictly increasing across every consecutive pair — a constant
    // linear creep should never plateau or reverse, unlike the old
    // oscillating breathe this replaced (which had a near-zero-velocity
    // moment at every turnaround).
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i], `sample ${i} should be greater than sample ${i - 1} (still growing, never stalls)`).toBeGreaterThan(samples[i - 1]);
    }
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
    await scrollInAndTakeManualControl(page);

    const sceneBox = await page.locator("#mgScene").boundingBox();
    if (!sceneBox) throw new Error("#mgScene not found");
    const centerX = sceneBox.x + sceneBox.width / 2;
    const readX = () =>
      page.evaluate(() => {
        const el = document.querySelector<HTMLElement>('.mg__slide[data-mg-index="1"]');
        const m = el?.style.transform.match(/translate\(([-\d.]+)px/);
        return m ? parseFloat(m[1]) : null;
      });

    await page.evaluate(() => (document.getElementById("momentum") as any).mgApi.goTo(1));
    await page.waitForTimeout(150); // early in the approach
    const earlyX = await readX();
    await page.waitForTimeout(SETTLE);
    const finalX = await readX();

    const earlyOffset = Math.abs(earlyX! - centerX);
    const finalOffset = Math.abs(finalX! - centerX);
    expect(finalOffset, "deterministic random should have landed it off-centre").toBeGreaterThan(50);
    expect(earlyOffset, "should read much closer to centre early on than its eventual resting offset").toBeLessThan(finalOffset * 0.5);
  });

  test("lateral position and scale arrive together — never a sudden pop to one side", async ({ page }) => {
    // A real regression this had: lateral (x/y) and depth (scale) used to
    // animate as two independently-timed tweens — even with similar
    // durations, that let them drift out of sync, so an item could
    // arrive at its final lateral offset while still small/transparent,
    // or vice versa, reading as a sudden "pop" to one side rather than a
    // continuous, proportional emergence. They're one combined tween now
    // (see promoteDesktop) — this checks their progress stays
    // proportional to each other throughout, not just that both
    // eventually finish.
    test.skip((page.viewportSize()?.width ?? 0) < 1000, "desktop-only motion model");
    await page.addInitScript(() => { Math.random = () => 0.99; });
    await page.goto("/", { waitUntil: "networkidle" });
    await skipHeroMovie(page);
    await scrollInAndTakeManualControl(page);

    const sceneBox = await page.locator("#mgScene").boundingBox();
    if (!sceneBox) throw new Error("#mgScene not found");
    const centerX = sceneBox.x + sceneBox.width / 2;
    const readXAndScale = () =>
      page.evaluate(() => {
        const el = document.querySelector<HTMLElement>('.mg__slide[data-mg-index="1"]');
        const t = el?.style.transform ?? "";
        const xm = t.match(/translate\(([-\d.]+)px/);
        const sm = t.match(/scale\(([\d.]+)\)/);
        return { x: xm ? parseFloat(xm[1]) : null, scale: sm ? parseFloat(sm[1]) : null };
      });

    await page.evaluate(() => (document.getElementById("momentum") as any).mgApi.goTo(1));
    await page.waitForTimeout(900); // partway through the ARRIVE_DUR (2.5s) arrival
    const mid = await readXAndScale();
    await page.waitForTimeout(SETTLE);
    const final = await readXAndScale();

    const xProgress = Math.abs(mid.x! - centerX) / Math.abs(final.x! - centerX);
    // scale starts near ~0.37 (WAIT_Z's projected size) and finishes
    // near ~1.1 (HOLD_Z) — normalize against that range, not raw scale,
    // so it's comparable to xProgress (a 0-1 fraction of distance covered).
    const scaleProgress = (mid.scale! - 0.37) / (final.scale! - 0.37);

    expect(xProgress, "should be meaningfully underway, not still at zero").toBeGreaterThan(0.1);
    expect(xProgress, "should not have already finished at the midpoint sample").toBeLessThan(0.95);
    expect(
      Math.abs(xProgress - scaleProgress),
      "lateral and scale progress should track each other closely, not one racing ahead of the other",
    ).toBeLessThan(0.3);
  });

  for (const quoteIndex of [3, 4]) {
    test(`quote slide ${quoteIndex} always rests in the dedicated, right-shifted quote lane`, async ({ page }) => {
      test.skip((page.viewportSize()?.width ?? 0) < 1000, "desktop-only motion model");
      await scrollInAndTakeManualControl(page);
      const sceneBox = await page.locator("#mgScene").boundingBox();
      if (!sceneBox) throw new Error("#mgScene not found");
      const centerX = sceneBox.x + sceneBox.width / 2;
      const readX = () =>
        page.evaluate((idx) => {
          const el = document.querySelector<HTMLElement>(`.mg__slide[data-mg-index="${idx}"]`);
          const m = el?.style.transform.match(/translate\(([-\d.]+)px/);
          return m ? parseFloat(m[1]) : null;
        }, quoteIndex);

      await page.evaluate((idx) => (document.getElementById("momentum") as any).mgApi.goTo(idx), quoteIndex);
      await page.waitForTimeout(SETTLE);
      const offset = (await readX())! - centerX;
      // QUOTE_LANE.x is 220 world units (== css px at z:0) right of
      // centre, fixed — not drawn from the stat slides' shared random
      // 3-lane pool — both quote slides share it, tuned so the first
      // quote's own left-aligned text reads with its emphasis (the word
      // "move" in "They move") landing around 60% across the frame.
      expect(offset, "the quote should always land well right of centre").toBeGreaterThan(150);
    });
  }

  test("the quote badge sits a small, fixed gap past the edge of its emphasis line, not overlapping it", async ({ page }) => {
    // Runs on every project, not just desktop — this is plain box layout
    // (the emphasis line's own width:fit-content plus the badge's
    // left:calc(100% + 20px)), unrelated to which render path (Three.js
    // vs CSS 3D transform) is positioning the slide as a whole.
    await scrollInAndTakeManualControl(page);
    const checkGap = async (lineSelector: string, goToIndex: number) => {
      await page.evaluate((idx) => (document.getElementById("momentum") as any).mgApi.goTo(idx), goToIndex);
      await page.waitForTimeout(SETTLE);
      return page.evaluate((sel) => {
        const line = document.querySelector(sel)!;
        const badge = line.querySelector(".mquote__badge")!;
        const lineRect = line.getBoundingClientRect();
        const badgeRect = badge.getBoundingClientRect();
        return badgeRect.left - lineRect.right;
      }, lineSelector);
    };
    // A real regression this had: right:-20px on the badge (a responsive,
    // clamp()-sized element) anchors its *right* edge past the text, so
    // the badge's own width extends backward *over* the text instead of
    // clearing it — that read as a large negative/overlapping gap, not a
    // small positive one. left:calc(100% + 20px) fixed it. Generous
    // tolerance band, not an exact 20px match — the badge is on a slide
    // that's still gently growing (the constant-speed hold creep, see
    // momentumGallery.ts) at the moment this samples.
    const gap1 = await checkGap('.mg__slide[data-mg-index="3"] .mquote__l1', 3);
    expect(gap1, "quote 1's badge should be a small positive gap, not overlapping the text").toBeGreaterThan(5);
    expect(gap1, "quote 1's badge should be a small gap, not drifted far away from the text").toBeLessThan(60);

    const gap2 = await checkGap('.mg__slide[data-mg-index="4"] .mquote__k1', 4);
    expect(gap2, "quote 2's badge should be a small positive gap, not overlapping the text").toBeGreaterThan(5);
    expect(gap2, "quote 2's badge should be a small gap, not drifted far away from the text").toBeLessThan(60);
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

  test("reduced motion: all slides visible statically, no autoplay", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/", { waitUntil: "networkidle" });
    await skipHeroMovie(page);
    await scrollIntoGallery(page);

    // no mgApi at all under reduced motion — setupMomentumGallery returns
    // before ever wiring up autoplay/play-pause/the test hook.
    expect(await page.evaluate(() => (document.getElementById("momentum") as any).mgApi)).toBeUndefined();
    const positions = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>(".mg__slide")).map((s) => getComputedStyle(s).position),
    );
    expect(positions).toHaveLength(N);
    expect(positions.every((p) => p === "static")).toBe(true);

    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => window.scrollY)).toBeLessThan(50);
  });
});
