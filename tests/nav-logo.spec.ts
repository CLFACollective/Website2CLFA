import { test, expect } from "@playwright/test";

/**
 * Mobile-only behavior (src/scripts/navLogoMobile.ts, <599px): the nav
 * wordmark stays visible everywhere except while the footer is in
 * view (the footer carries its own big wordmark already). Desktop's
 * logo visibility is a completely different mechanism (hero.ts's
 * `.is-gone`, tied to hero scroll progress) and isn't covered here.
 */
test.describe("mobile nav logo", () => {
  test.skip(({ isMobile }) => !isMobile, "mobile-only behavior");

  test("visible at top, visible mid-page, hidden only at the footer", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator(".nav__logo")).toBeVisible();

    const scrollHeight = await page.evaluate(() => document.body.scrollHeight);
    await page.evaluate((y) => window.scrollTo(0, y * 0.5), scrollHeight);
    await page.waitForTimeout(200);
    await expect(page.locator(".nav__logo")).toBeVisible();

    await page.evaluate(() => {
      const footer = document.querySelector(".foot");
      const top = footer!.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({ top: top - 300, behavior: "instant" as ScrollBehavior });
    });
    await page.waitForTimeout(400);
    await expect(page.locator(".nav__logo")).toBeHidden();
  });
});
