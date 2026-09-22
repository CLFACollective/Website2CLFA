import { test, expect } from "@playwright/test";
import { collectErrors, skipHeroMovie } from "./helpers";

/**
 * Baseline: the page loads clean, every major section is present, and
 * a full scroll-through never throws — on every project (desktop,
 * mobile Chromium, mobile WebKit). This is the first thing that should
 * fail if a change breaks something broadly rather than in one spot.
 */
test.describe("homepage smoke", () => {
  test("loads with no console or page errors", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto("/", { waitUntil: "networkidle" });
    expect(errors).toEqual([]);
  });

  test("every major section is present", async ({ page }) => {
    await page.goto("/");
    for (const selector of [
      "#hero",
      "#motion", // BrandInMotionCards
      ".rib", // Ribbons
      "[data-win]", // WindowA
      "#partnering", // DayOne
      "[data-keep]", // KeepUp
      "#momentum",
      "#who",
      ".wev", // WindowB
      ".foot",
    ]) {
      await expect(page.locator(selector)).toHaveCount(1);
    }
  });

  test("full scroll-through produces no console or page errors", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto("/", { waitUntil: "networkidle" });
    await skipHeroMovie(page);
    const viewportHeight = page.viewportSize()?.height ?? 900;
    const scrollHeight = await page.evaluate(() => document.body.scrollHeight);
    for (let y = 0; y <= scrollHeight; y += viewportHeight / 2) {
      await page.evaluate((yy) => window.scrollTo(0, yy), y);
      await page.waitForTimeout(60);
    }
    expect(errors).toEqual([]);
  });
});
