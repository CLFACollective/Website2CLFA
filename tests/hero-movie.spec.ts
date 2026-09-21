import { test, expect, type Page } from "@playwright/test";

/**
 * Hero used to be a 620vh section scrubbed 1:1 against scroll — the
 * dot/beats/bloom pacing was however fast a given visitor happened to
 * scroll, which made the beats unreadable at a normal scroll speed.
 * It's a plain GSAP timeline now: plays once on load, at a fixed pace,
 * with scroll locked for its ~9.5s runtime so it's actually watched.
 * Once it completes, the pink bloom becomes Hero's resting frame (no
 * longer sticky/pinned), the "Scroll" cue arrives, and scroll unlocks.
 *
 * Mirrors PRE_DUR/BEAT_DUR from hero.ts (kept in sync manually —
 * there's no shared module to import them from without turning that
 * file's internals into a public export surface for a test).
 */
const PRE_DUR = 1.3;
const BEAT_DUR = 2.3;
const BEAT_COUNT = 3;

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

test.describe("Hero movie: plays once, locks scroll, hands off cleanly", () => {
  test("scroll is locked while the movie plays, and releases once it completes", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "one project is enough for this real-time timing check — every other Hero test here fast-forwards instead");
    await page.goto("/", { waitUntil: "networkidle" });

    await page.evaluate(() => window.scrollTo(0, 500));
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.scrollY), "scroll should be locked mid-movie").toBe(0);

    await page.waitForFunction(() => document.getElementById("hero")?.dataset.heroDone === "true", { timeout: 15000 });

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

  test("the SCROLL cue is hidden during the movie and arrives once it completes", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    const readCueOpacity = () =>
      page.evaluate(() => parseFloat(getComputedStyle(document.querySelector(".hcb__cue")!).opacity));

    await seekHero(page, PRE_DUR + BEAT_DUR * 1.5); // mid-movie
    expect(await readCueOpacity()).toBeLessThan(0.05);

    await seekHero(page, 999); // movie complete
    expect(await readCueOpacity()).toBeGreaterThan(0.9);
  });

  test("adjacent beats never hard-cut — both sit at 0 exactly on the boundary, not a snap from 1 to the next", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });

    const boundary = PRE_DUR + BEAT_DUR;
    await seekHero(page, boundary);
    const [b0, b1] = await beatOpacities(page);
    expect(b0).toBeLessThan(0.05);
    expect(b1).toBeLessThan(0.05);

    // just inside beat 1's own confined fade-in window, opacity should
    // have climbed off zero — a smooth ramp, not still pinned at 0
    await seekHero(page, boundary + (BEAT_DUR * 0.15) / 2);
    const [, b1Rising] = await beatOpacities(page);
    expect(b1Rising).toBeGreaterThan(0.05);
    expect(b1Rising).toBeLessThan(0.95);
  });

  test("beat 1 (the middle beat) never bleeds into its neighbours' clip shape", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    const start = PRE_DUR + BEAT_DUR;
    const end = start + BEAT_DUR;

    await seekHero(page, start - BEAT_DUR * 0.4); // well before its own start
    expect((await beatOpacities(page))[1]).toBe(0);

    await seekHero(page, end + BEAT_DUR * 0.4); // well after its own end
    expect((await beatOpacities(page))[1]).toBe(0);

    await seekHero(page, start + BEAT_DUR * 0.5); // solid in the middle
    expect((await beatOpacities(page))[1]).toBeGreaterThan(0.9);
  });

  test("only one beat is ever exposed to assistive tech at a time", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    await seekHero(page, PRE_DUR + BEAT_DUR * 1.5); // deep in beat 1

    const hidden = await page.evaluate(() =>
      Array.from(document.querySelectorAll(".hcb__beat")).map((b) => b.getAttribute("aria-hidden")),
    );
    expect(hidden.filter((v) => v !== "true")).toHaveLength(1);
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
