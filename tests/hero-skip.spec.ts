import { test, expect, devices } from "@playwright/test";

/**
 * Phones can end the intro movie by scrolling down — and the swipe that
 * ends it carries on scrolling the page (no second swipe needed). This
 * uses real touch input (Chrome's own touch pipeline via CDP), not
 * synthetic events, so it's what a phone actually does. Runs once, in
 * the desktop project, as an Android phone on Chromium (the iPhone
 * projects run WebKit, which has no CDP).
 */
const { defaultBrowserType: _ignored, ...pixel } = devices["Pixel 7"];
const heroState = (page: import("@playwright/test").Page) =>
  page.evaluate(() => ({
    progress: (document.getElementById("hero") as any).heroTimeline.progress(),
    y: window.scrollY,
    overflow: document.documentElement.style.overflow,
  }));

test.describe("Hero intro: scroll down to end it", () => {
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== "desktop", "runs once, setting its own device");
  });

  test.describe("phone (real touch)", () => {
    test.use({ ...pixel }); // the desktop project is Chromium already

    test("one swipe up ends the intro and scrolls the page", async ({ page, context }) => {
      await page.goto("/", { waitUntil: "networkidle" });
      await page.waitForTimeout(800);
      expect((await heroState(page)).progress).toBeLessThan(0.5);
      const cdp = await context.newCDPSession(page);
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 200, y: 650 }] });
      for (let i = 1; i <= 10; i++) {
        await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 200, y: 650 - i * 40 }] });
        await page.waitForTimeout(16);
      }
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await page.waitForTimeout(300);
      const s = await heroState(page);
      expect(s.progress).toBe(1);
      expect(s.overflow).toBe("");
      expect(s.y, "the same swipe scrolled the page").toBeGreaterThan(100);
    });
  });

  test("narrow window: a wheel scroll ends it", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/", { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    await page.mouse.move(195, 400);
    await page.mouse.wheel(0, 200);
    await page.waitForTimeout(200);
    expect((await heroState(page)).progress).toBe(1);
  });

  test("full desktop: the intro plays out — a wheel scroll doesn't end it", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    await page.mouse.move(700, 450);
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(200);
    const s = await heroState(page);
    expect(s.progress).toBeLessThan(1);
    expect(s.y).toBe(0);
  });
});
