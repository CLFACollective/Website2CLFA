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

  test("every major section is present, in order", async ({ page }) => {
    await page.goto("/");
    const order = [
      "#hero",
      ".hcb__after", // intro paragraph band
      "#motion", // BrandInMotionCards
      ".rib", // Ribbons
      "[data-win]", // WindowA
      "#partnering", // DayOne
      "[data-keep]", // KeepUp
      "#who", // "Who tags us in" — above Momentum
      "#momentum",
      ".wev", // WindowB
      ".foot",
    ];
    for (const selector of order) await expect(page.locator(selector)).toHaveCount(1);
    const tops = await page.evaluate((sels) => sels.map((q) => document.querySelector(q)!.getBoundingClientRect().top + scrollY), order);
    for (let i = 1; i < tops.length; i++) expect(tops[i], `${order[i]} comes after ${order[i - 1]}`).toBeGreaterThan(tops[i - 1]);
  });

  test("touch screens get a slim always-on scroll bar that follows the page; desktop doesn't", async ({ page, hasTouch }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    await skipHeroMovie(page);
    const bar = page.locator(".scrollhint");
    if (!hasTouch) {
      await expect(bar).toBeHidden();
      return;
    }
    await expect(bar).toBeVisible();
    const thumbY = () => bar.locator("i").evaluate((el) => el.getBoundingClientRect().top);
    const atTop = await thumbY();
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight / 2));
    await page.waitForTimeout(200);
    const mid = await thumbY();
    expect(mid).toBeGreaterThan(atTop + 20);
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
