import type { Page } from "@playwright/test";

/**
 * Browser-console noise that isn't a real bug — filtered out rather
 * than silencing all console errors, so a genuine new error still
 * fails the suite. "ResizeObserver loop completed with undelivered
 * notifications" is a well-documented Chromium quirk: logged as a
 * console error even though it's purely informational, and shows up
 * on nearly any page using ResizeObserver (this one has three: hero.ts,
 * gridField.ts, momentum.ts).
 */
const BENIGN_ERROR_PATTERNS = [/ResizeObserver loop completed with undelivered notifications/];

function isBenign(text: string): boolean {
  return BENIGN_ERROR_PATTERNS.some((re) => re.test(text));
}

/** Starts collecting real (non-benign) page/console errors on `page`. */
export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => {
    if (!isBenign(e.message)) errors.push(e.message);
  });
  page.on("console", (m) => {
    if (m.type() === "error" && !isBenign(m.text())) errors.push(m.text());
  });
  return errors;
}

/**
 * Hero plays a locked ~9.5s intro movie on load (see hero.ts) — scroll
 * doesn't work at all until it completes. Fast-forwards it via the
 * timeline hero.ts exposes for exactly this, for any test that isn't
 * actually about the movie itself (see hero-movie.spec.ts for tests
 * that are, which need the real thing). No-ops harmlessly under
 * reduced motion, where the movie never runs in the first place.
 */
export async function skipHeroMovie(page: Page): Promise<void> {
  await page.evaluate(() => {
    const hero = document.getElementById("hero") as (HTMLElement & { heroTimeline?: { progress: (p: number) => void } }) | null;
    hero?.heroTimeline?.progress(1);
  });
}

/**
 * Momentum's gallery (see momentum-gallery.spec.ts) locks scroll the same
 * way Hero does the moment it's scrolled into view — a blind scroll-through
 * loop elsewhere (smoke.spec.ts) would otherwise get stuck fighting its
 * snapback listener. No-ops if the gallery isn't currently locked.
 */
export async function releaseMomentumGallery(page: Page): Promise<void> {
  await page.evaluate(() => {
    const section = document.getElementById("momentum") as (HTMLElement & { mgApi?: { forceUnlock: () => void } }) | null;
    section?.mgApi?.forceUnlock();
  });
}
