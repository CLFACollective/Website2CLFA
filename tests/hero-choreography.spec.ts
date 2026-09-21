import { test, expect, type Page } from "@playwright/test";

/**
 * Hero's dot->beats->bloom stretch used to jump between its three beat
 * texts with a hard opacity/display snap at each scroll-progress
 * boundary (and the "SCROLL" cue was visible during that stretch, then
 * faded out once the pink bleed hit). Reworked so the whole thing
 * reads as one continuous reveal — see hero.ts's rampIn/rampOut — and
 * so the cue only arrives once the bleed is reached, staying through
 * the rest of the section.
 *
 * Mirrors PRE/OPEN/RISE/SLICE from hero.ts (kept in sync manually —
 * there's no shared module to import them from without turning that
 * file's internals into a public export surface for a test).
 */
const PRE = 0.1;
const OPEN = 0.53;
const BEAT_COUNT = 3;
const SLICE = (OPEN - PRE) / BEAT_COUNT;

async function heroScrollRange(page: Page): Promise<{ top: number; distance: number }> {
  return page.evaluate(() => {
    const hero = document.getElementById("hero")!;
    const r = hero.getBoundingClientRect();
    const top = r.top + window.scrollY;
    // matches this project's established pattern for "top top"/"bottom
    // bottom" pinned/sticky triggers: scroll distance = trigger height
    // minus viewport height, not the trigger's raw height.
    return { top, distance: r.height - window.innerHeight };
  });
}

async function scrollToProgress(page: Page, p: number) {
  const { top, distance } = await heroScrollRange(page);
  await page.evaluate((y) => window.scrollTo(0, y), top + p * distance);
  // ScrollTrigger's onUpdate runs on the next tick, not synchronously
  // within the same call stack as window.scrollTo.
  await page.waitForTimeout(100);
}

async function beatOpacities(page: Page): Promise<number[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>(".hcb__beat")).map((b) => parseFloat(b.style.opacity || "0")),
  );
}

test.describe("Hero: dot->beats->bloom reads as one continuous reveal", () => {
  test("adjacent beats never hard-cut — both sit at 0 exactly on the slice boundary, not a snap from 1 to the next", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });

    // the boundary between beat 0 and beat 1
    const boundary = PRE + SLICE;
    await scrollToProgress(page, boundary);
    const [b0, b1] = await beatOpacities(page);
    expect(b0).toBeLessThan(0.05);
    expect(b1).toBeLessThan(0.05);

    // just inside beat 1's own confined fade-in window, opacity should
    // have climbed off zero — a smooth ramp, not still pinned at 0
    // (which would mean it's still hard-toggling) or already at 1
    // (which would mean no fade at all)
    await scrollToProgress(page, boundary + (SLICE * 0.15) / 2);
    const [, b1Rising] = await beatOpacities(page);
    expect(b1Rising).toBeGreaterThan(0.05);
    expect(b1Rising).toBeLessThan(0.95);
  });

  test("beat 1 (the middle beat) never bleeds into its neighbours' clip shape", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    const start = PRE + SLICE;
    const end = start + SLICE;

    // well before its own start (still inside beat 0's iris territory)
    await scrollToProgress(page, start - SLICE * 0.4);
    expect((await beatOpacities(page))[1]).toBe(0);

    // well after its own end (already inside beat 2's iris territory)
    await scrollToProgress(page, end + SLICE * 0.4);
    expect((await beatOpacities(page))[1]).toBe(0);

    // but solidly visible in the middle of its own window
    await scrollToProgress(page, start + SLICE * 0.5);
    expect((await beatOpacities(page))[1]).toBeGreaterThan(0.9);
  });

  test("only one beat is ever exposed to assistive tech at a time", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    await scrollToProgress(page, PRE + SLICE * 1.5); // deep in beat 1

    const hidden = await page.evaluate(() =>
      Array.from(document.querySelectorAll(".hcb__beat")).map((b) => b.getAttribute("aria-hidden")),
    );
    expect(hidden.filter((v) => v !== "true")).toHaveLength(1);
  });

  test("the SCROLL cue is hidden during the beats, arrives once the pink bleed lands, and stays through the rise", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    const readCueOpacity = () =>
      page.evaluate(() => parseFloat(getComputedStyle(document.querySelector(".hcb__cue")!).opacity));

    await scrollToProgress(page, PRE + SLICE * 1.5); // mid-beats
    expect(await readCueOpacity()).toBeLessThan(0.05);

    await scrollToProgress(page, 0.75); // bleed has landed, well past OPEN
    expect(await readCueOpacity()).toBeGreaterThan(0.9);

    await scrollToProgress(page, 0.95); // deep in the rise/closing-copy stage
    expect(await readCueOpacity()).toBeGreaterThan(0.9);
  });
});
