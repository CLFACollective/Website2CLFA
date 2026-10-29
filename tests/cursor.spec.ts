import { test, expect, type Page } from "@playwright/test";
import { skipHeroMovie } from "./helpers";

// The custom dot only mounts on fine-pointer devices (see cursor.ts), so
// the mobile projects never have one to test.
test.skip(({ isMobile }) => isMobile, "custom cursor is fine-pointer only");

const PINK_RING = "rgba(240, 105, 150, 0.55) 0px 0px 0px 7px";
const CREAM_RING = "rgba(254, 252, 244, 0.55) 0px 0px 0px 7px";

async function hoverCentre(page: Page, selector: string) {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) throw new Error(`${selector} has no box`);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 });
  await page.waitForTimeout(400); // past the .18s box-shadow transition
}

const dotShadow = (page: Page) => page.locator("#pink-cursor").evaluate((el) => getComputedStyle(el).boxShadow);

test.describe("cursor dot: hover ring over links", () => {
  for (const path of ["/about", "/faqs", "/contact"]) {
    test(`${path}: a pink ring grows over a footer link and goes away off it`, async ({ page }) => {
      await page.goto(path);
      await page.locator("footer a[href]").first().scrollIntoViewIfNeeded();
      await hoverCentre(page, "footer a[href]");
      await expect(page.locator("#pink-cursor")).toHaveClass(/pink-cursor--ring/);
      expect(await dotShadow(page)).toBe(PINK_RING);

      await page.mouse.move(5, 300, { steps: 4 });
      await page.waitForTimeout(400);
      await expect(page.locator("#pink-cursor")).not.toHaveClass(/pink-cursor--ring/);
    });
  }

  test("the ring is cream when the dot has inverted to white (Hero's Replay)", async ({ page }) => {
    await page.goto("/");
    await skipHeroMovie(page);
    await page.waitForTimeout(300);
    await hoverCentre(page, ".hcb__replay");
    await expect(page.locator("#pink-cursor")).toHaveCSS("background-color", "rgb(255, 252, 245)");
    expect(await dotShadow(page)).toBe(CREAM_RING);
  });
});
