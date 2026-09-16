import { defineConfig, devices } from "@playwright/test";

/**
 * Runs against `astro dev` by default (fast boot, good for iterative
 * work). For a final check before shipping a large change, build +
 * preview first and point PW_BASE_URL at that instead — dev and the
 * production build have occasionally differed in this project (see
 * memory: stale-dev-server false alarms), so a prod-build pass is
 * worth doing before calling something done, not just relying on dev.
 */
const PORT = 4321;
const baseURL = process.env.PW_BASE_URL || `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "mobile-chromium",
      use: { ...devices["iPhone 15"] },
    },
    {
      // WebKit specifically — this codebase has repeatedly hit real,
      // Chromium-invisible bugs on the actual iOS Safari/WebKit engine
      // (mask-image compositing cost, will-change layer retention).
      // Don't drop this project down to Chromium-only for speed.
      name: "mobile-webkit",
      use: { ...devices["iPhone 15"], browserName: "webkit" },
    },
    {
      // iPad — the device the crash reports this codebase has chased
      // actually came from. No project covered tablet dimensions at
      // all before this; WebKit for the same reason as mobile-webkit.
      name: "ipad",
      use: { ...devices["iPad Pro 11"], browserName: "webkit" },
    },
  ],
  webServer: process.env.PW_BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 30_000,
      },
});
