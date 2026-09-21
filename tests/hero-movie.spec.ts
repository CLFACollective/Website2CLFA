import { test, expect, type Page } from "@playwright/test";

/**
 * Hero used to be a 620vh section scrubbed 1:1 against scroll — the
 * dot/beats/bloom pacing was however fast a given visitor happened to
 * scroll, which made the beats unreadable at a normal scroll speed.
 * It's a plain GSAP timeline now: plays once on load, at a fixed pace,
 * with scroll locked for its ~13s runtime so it's actually watched.
 * Once it completes, the pink bloom becomes Hero's resting frame (no
 * longer sticky/pinned), the "Scroll" cue and "Replay" CTA arrive, and
 * scroll unlocks.
 *
 * Mirrors hero.ts's constants (kept in sync manually — there's no
 * shared module to import them from without turning that file's
 * internals into a public export surface for a test). Beat 0's opening
 * (grow -> hold -> reveal -> hold) has its own explicit shape; beats 1
 * and 2 share a plain hold-then-crossfade.
 */
const BEAT_DUR = 2.3;
const BEAT_FADE = BEAT_DUR * 0.3; // 0.69 — beats 1/2's fade in/out window
const GROW_DUR = 1.0;
const HOLD1_DUR = 2.0;
const REVEAL_DUR = 1.5;
const HOLD2_DUR = 2.0;
const BEAT0_DUR = GROW_DUR + HOLD1_DUR + REVEAL_DUR + HOLD2_DUR + BEAT_FADE; // 7.19
const B0_REVEAL_AT = GROW_DUR + HOLD1_DUR; // 3.0 — ring-open/text-reveal begins here
const BEAT1_START = BEAT0_DUR; // 7.19
const BEAT2_START = BEAT1_START + BEAT_DUR; // 9.49
// beat 2's word cycle: "smarter" holds BEAT_DUR/3, "faster"/"better"
// each hold .3s longer than that.
const SWAP_SLOW = 0.3;
const SWAP_A_DUR = BEAT_DUR / 3;
const SWAP_B_DUR = BEAT_DUR / 3 + SWAP_SLOW;
const SWAP_C_DUR = BEAT_DUR / 3 + SWAP_SLOW;
const SWAP_DUR = SWAP_A_DUR + SWAP_B_DUR + SWAP_C_DUR; // 2.9
const OPEN_T = BEAT2_START + SWAP_DUR; // 12.39 — bloom starts
const BLOOM_DUR = 1.2;
const MID_BEAT1 = BEAT1_START + BEAT_DUR * 0.5; // a safe "mid-movie" point, deep in beat 1

/** Jumps hero.ts's exposed timeline straight to `seconds` — fires
 *  onUpdate/onComplete synchronously, same as if it had actually
 *  played that far, without burning real wall-clock time. */
async function seekHero(page: Page, seconds: number) {
  await page.evaluate((t) => {
    const hero = document.getElementById("hero") as (HTMLElement & { heroTimeline?: { time: (s: number) => void } }) | null;
    hero?.heroTimeline?.time(t);
  }, seconds);
}

async function beatOpacities(page: Page): Promise<number[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>(".hcb__beat")).map((b) => parseFloat(b.style.opacity || "0")),
  );
}

async function stageVar(page: Page, name: string): Promise<number> {
  return page.evaluate(
    (n) => parseFloat(getComputedStyle(document.querySelector("#hero .hcb__stage")!).getPropertyValue(n)),
    name,
  );
}

test.describe("Hero movie: plays once, locks scroll, hands off cleanly", () => {
  test("scroll is locked while the movie plays, and releases once it completes", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "one project is enough for this real-time timing check — every other Hero test here fast-forwards instead");
    await page.goto("/", { waitUntil: "networkidle" });

    await page.evaluate(() => window.scrollTo(0, 500));
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.scrollY), "scroll should be locked mid-movie").toBe(0);

    await page.waitForFunction(() => document.getElementById("hero")?.dataset.heroDone === "true", { timeout: 18000 });

    await page.evaluate(() => window.scrollTo(0, 500));
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => window.scrollY), "scroll should work once the movie's done").toBeGreaterThan(400);
  });

  test("hero's stage is no longer sticky/pinned once the movie completes", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    await seekHero(page, 999);
    const position = await page.evaluate(() => getComputedStyle(document.querySelector("#hero .hcb__stage")!).position);
    expect(position).toBe("relative");
  });

  test("the SCROLL cue is hidden during the movie, arrives once it completes, and is visible against the pink bloom", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    const readCue = () =>
      page.evaluate(() => {
        const cs = getComputedStyle(document.querySelector(".hcb__cue")!);
        return { opacity: parseFloat(cs.opacity), color: cs.color };
      });

    await seekHero(page, MID_BEAT1);
    expect((await readCue()).opacity).toBeLessThan(0.05);

    await seekHero(page, 999); // movie complete
    const cue = await readCue();
    expect(cue.opacity).toBeGreaterThan(0.9);
    // ROSE (#F06496) on the fully-bloomed ROSE background was invisible —
    // the cue must render in a light colour (CREAM) once it arrives.
    expect(cue.color).toBe("rgb(254, 252, 244)");
  });

  test("the cue's pulse starts the moment the frame finishes flooding, not after the whole movie completes", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    // The flood tween (--flood: 0 -> 1) finishes noticeably before the
    // rest of the movie does (the headline still has to fade up after
    // it) — the pulse used to only start once the *whole* timeline's
    // onComplete fired, leaving the cue's line sitting at its
    // fromTo()'s "from" value (scaleY(0), i.e. flat/invisible) for that
    // whole gap even though .hcb__cue's opacity was already fully
    // visible by then. Confirmed live before fixing it.
    const floodCompleteAt = OPEN_T + BLOOM_DUR * 0.75;
    const movieCompleteAt = OPEN_T + BLOOM_DUR * 0.95; // ~tl.duration()
    expect(floodCompleteAt).toBeLessThan(movieCompleteAt); // sanity: there really is a gap to test within

    await seekHero(page, floodCompleteAt + 0.02);
    const readTransform = () =>
      page.evaluate(() => getComputedStyle(document.querySelector(".hcb__cue i")!).transform);
    const t1 = await readTransform();
    await page.waitForTimeout(200);
    const t2 = await readTransform();
    expect(t2, "cue line should already be animating before the whole movie has completed").not.toBe(t1);
  });

  test("beat 0: dot grows in, holds, then the reveal fades the text in as the ring opens, then holds again", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });

    await seekHero(page, GROW_DUR * 0.5); // mid-grow
    expect(await stageVar(page, "--dot-k"), "dot should be partway through growing").toBeGreaterThan(0.05);
    expect(await stageVar(page, "--dot-k")).toBeLessThan(0.95);
    expect((await beatOpacities(page))[0], "text shouldn't be showing yet").toBe(0);

    await seekHero(page, GROW_DUR + HOLD1_DUR * 0.5); // mid hold1
    expect(await stageVar(page, "--dot-k"), "dot should be fully grown (0 = full size)").toBeCloseTo(0, 1);
    expect((await beatOpacities(page))[0], "still holding on the mark, no text yet").toBe(0);

    await seekHero(page, B0_REVEAL_AT + REVEAL_DUR * 0.5); // mid-reveal
    const [b0Rising] = await beatOpacities(page);
    expect(b0Rising, "text should be partway through revealing").toBeGreaterThan(0.05);
    expect(b0Rising).toBeLessThan(0.95);
    const ring = await stageVar(page, "--ring");
    expect(ring, "ring should be partway open, in step with the text").toBeGreaterThan(0.05);
    expect(ring).toBeLessThan(0.95);

    await seekHero(page, B0_REVEAL_AT + REVEAL_DUR + HOLD2_DUR * 0.5); // mid hold2
    expect((await beatOpacities(page))[0], "fully revealed and holding, readable").toBeGreaterThan(0.95);
    expect(await stageVar(page, "--dot-op"), "dot should be long gone by now").toBeCloseTo(0, 1);
  });

  test("adjacent beats never hard-cut — both sit at 0 exactly on the boundary, not a snap from 1 to the next", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });

    const boundary = BEAT1_START;
    await seekHero(page, boundary);
    const [b0, b1] = await beatOpacities(page);
    expect(b0).toBeLessThan(0.05);
    expect(b1).toBeLessThan(0.05);

    // just inside beat 1's own fade-in window, opacity should have
    // climbed off zero — a smooth ramp, not still pinned at 0
    await seekHero(page, boundary + BEAT_FADE / 2);
    const [, b1Rising] = await beatOpacities(page);
    expect(b1Rising).toBeGreaterThan(0.05);
    expect(b1Rising).toBeLessThan(0.95);
  });

  test("beat 1 (the middle beat) never bleeds into its neighbours' clip shape", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    const start = BEAT1_START;
    const end = BEAT2_START;

    await seekHero(page, start - BEAT_DUR * 0.4); // well before its own start
    expect((await beatOpacities(page))[1]).toBe(0);

    await seekHero(page, end + BEAT_DUR * 0.4); // well after its own end
    expect((await beatOpacities(page))[1]).toBe(0);

    await seekHero(page, start + BEAT_DUR * 0.5); // solid in the middle
    expect((await beatOpacities(page))[1]).toBeGreaterThan(0.9);
  });

  test("beat 2's middle word cycles smarter -> faster -> better, faster/better holding .3s longer each", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    const readStep = () =>
      page.evaluate(() => document.querySelector<HTMLElement>('.hcb__beat[data-swap]')?.dataset.swapStep);

    await seekHero(page, BEAT2_START + SWAP_A_DUR * 0.5);
    expect(await readStep()).toBe("0"); // smarter

    await seekHero(page, BEAT2_START + SWAP_A_DUR + SWAP_B_DUR * 0.5);
    expect(await readStep()).toBe("1"); // faster

    await seekHero(page, BEAT2_START + SWAP_A_DUR + SWAP_B_DUR + SWAP_C_DUR * 0.5);
    expect(await readStep()).toBe("2"); // better

    // "faster" and "better" each hold .3s longer than "smarter" does
    expect(SWAP_B_DUR).toBeCloseTo(SWAP_A_DUR + SWAP_SLOW, 5);
    expect(SWAP_C_DUR).toBeCloseTo(SWAP_A_DUR + SWAP_SLOW, 5);
  });

  test("only one beat is ever exposed to assistive tech at a time", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    await seekHero(page, MID_BEAT1); // deep in beat 1

    const hidden = await page.evaluate(() =>
      Array.from(document.querySelectorAll(".hcb__beat")).map((b) => b.getAttribute("aria-hidden")),
    );
    expect(hidden.filter((v) => v !== "true")).toHaveLength(1);
  });

  test("Replay CTA: hidden/inert during the movie, restarts it once clicked", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    const replay = page.locator(".hcb__replay");

    // mid-movie: not interactive, not in the tab order
    await seekHero(page, MID_BEAT1);
    await expect(replay).toHaveCSS("visibility", "hidden");
    await expect(replay).toHaveCSS("pointer-events", "none");

    // movie complete: visible, interactive
    await seekHero(page, 999);
    await expect(replay).toHaveCSS("visibility", "visible");
    await expect(replay).toHaveCSS("pointer-events", "auto");
    await expect(replay).toBeVisible();

    await replay.click();
    expect(await page.evaluate(() => document.getElementById("hero")?.dataset.heroDone)).toBe("false");

    // clicking it re-locks scroll, same as the initial load
    await page.evaluate(() => window.scrollTo(0, 500));
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => window.scrollY), "scroll should lock again on replay").toBe(0);

    // fast-forward the replayed run and confirm it hands off cleanly a
    // second time (guards against a duplicate ground observer double-
    // firing once armed on the first completion)
    await seekHero(page, 999);
    expect(await page.evaluate(() => document.getElementById("hero")?.dataset.heroDone)).toBe("true");
    await page.evaluate(() => window.scrollTo(0, 500));
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => window.scrollY), "scroll should unlock again once the replay completes").toBeGreaterThan(400);
  });

  test("reduced motion skips the movie entirely — no scroll lock, resting frame immediately", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/", { waitUntil: "networkidle" });

    expect(await page.evaluate(() => document.getElementById("hero")?.dataset.heroDone)).toBe("true");

    await page.evaluate(() => window.scrollTo(0, 500));
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(400);

    const flood = await page.evaluate(() =>
      getComputedStyle(document.querySelector("#hero .hcb__stage")!).getPropertyValue("--flood"),
    );
    expect(parseFloat(flood)).toBeCloseTo(1, 1);
  });
});
