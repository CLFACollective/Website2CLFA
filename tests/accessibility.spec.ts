import { test, expect } from "@playwright/test";

/**
 * The mega menu is a real, managed dialog (see src/scripts/nav.ts):
 * background content is marked inert while it's open so Tab can't
 * escape into content hidden behind the overlay, focus moves into the
 * menu once its open animation finishes, and Escape restores focus to
 * the trigger button. These were genuine, verified bugs before the fix
 * (focus could land on invisible content behind the overlay) — this
 * suite exists so that regressions there fail loudly instead of
 * silently, the way the original bug did.
 */
test.describe("accessibility", () => {
  // Playwright's mobile device emulation (isMobile/hasTouch) doesn't
  // reliably drive sequential Tab focus navigation the way a real
  // external keyboard does — confirmed here (activeElement never
  // leaves <body> on Tab in the mobile projects) even though the
  // underlying mechanism is unchanged and passes on desktop. Tab/
  // Escape-key navigation is inherently an external-keyboard concern,
  // which Playwright's mobile projects intentionally don't emulate;
  // the desktop project is this suite's real coverage for it.
  test.skip(({ isMobile }) => isMobile, "keyboard Tab navigation isn't reliably emulated on mobile projects");

  test("skip link is the first tab stop and focuses main", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");
    const active = await page.evaluate(() => ({
      tag: document.activeElement?.tagName,
      cls: document.activeElement?.className,
    }));
    expect(active.tag).toBe("A");
    expect(active.cls).toContain("skip-link");
  });

  test("mega menu: opens as a dialog, traps focus, background is inert", async ({ page }) => {
    await page.goto("/");
    const menuBtn = page.locator("#menuBtn");
    await menuBtn.click();

    const mega = page.locator("#mega");
    await expect(mega).toHaveAttribute("role", "dialog");
    await expect(mega).toHaveAttribute("aria-modal", "true");

    // main is inert while the menu is open
    const mainInert = await page.evaluate(() => (document.getElementById("main") as any)?.inert);
    expect(mainInert).toBe(true);

    // focus should land inside the menu once its open tween settles
    await page.waitForTimeout(1200);
    const focusedInMega = await page.evaluate(() => !!document.activeElement?.closest("#mega"));
    expect(focusedInMega).toBe(true);

    // Tab should never escape into main while open — loop through more
    // presses than there are focusable items in the menu and confirm
    // every stop stays inside #mega or #nav (the burger button).
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press("Tab");
      const inScope = await page.evaluate(() => {
        const el = document.activeElement;
        return !!(el?.closest("#mega") || el?.closest("#nav"));
      });
      expect(inScope).toBe(true);
    }
  });

  test("Escape closes the menu, un-inerts main, and restores focus to the trigger", async ({ page }) => {
    await page.goto("/");
    await page.locator("#menuBtn").click();
    await page.waitForTimeout(1200);

    await page.keyboard.press("Escape");
    await page.waitForTimeout(900);

    await expect(page.locator("#menuBtn")).toHaveAttribute("aria-expanded", "false");
    const mainInert = await page.evaluate(() => (document.getElementById("main") as any)?.inert);
    expect(mainInert).toBe(false);
    const activeId = await page.evaluate(() => document.activeElement?.id);
    expect(activeId).toBe("menuBtn");
  });
});

/**
 * The mega menu's closed state used to exist only as a gsap.set() call
 * in nav.ts — fine once that script has loaded and run, but until then
 * the plain CSS left it fully opaque, full-viewport, and on top of
 * everything (position: fixed; inset: 0), so anyone landing on the
 * page saw the expanded menu flash before JS caught up and hid it.
 * global.css now carries the closed values (opacity, visibility,
 * clip-path) itself, so the render-blocking stylesheet — not a script
 * — is what keeps it hidden. Runs with JS turned off entirely, the
 * strongest way to prove this doesn't depend on any script executing.
 */
test.describe("mega menu hides without relying on JS", () => {
  test("mega menu is hidden by CSS alone, before any script runs", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto("/");
    const mega = page.locator("#mega");
    await expect(mega).toHaveCSS("opacity", "0");
    await expect(mega).toHaveCSS("visibility", "hidden");
    await context.close();
  });
});
