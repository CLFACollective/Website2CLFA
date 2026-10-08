import { test, expect } from "@playwright/test";

/**
 * Sharing and search: every page carries Open Graph / Twitter tags with
 * absolute URLs and the shared brand image, a canonical link, and
 * structured data; the sitemap lists every page automatically.
 */
const PAGES = ["/", "/what-we-do", "/about", "/faqs", "/contact"];
const meta = (page: import("@playwright/test").Page, attr: string, name: string) =>
  page.locator(`head meta[${attr}="${name}"]`).getAttribute("content");

test.describe("SEO and share meta", () => {
  test.skip(({ isMobile }) => isMobile, "server-rendered <head> — same on every device");

  for (const path of PAGES) {
    test(`${path}: Open Graph, Twitter card, canonical`, async ({ page }) => {
      await page.goto(path);
      const title = await page.title();
      const description = await meta(page, "name", "description");
      expect(description?.length).toBeGreaterThan(30);
      expect(await meta(page, "property", "og:title")).toBe(title);
      expect(await meta(page, "property", "og:description")).toBe(description);
      expect(await meta(page, "property", "og:image")).toBe("https://clfacollective.com/og-image.png");
      expect(await meta(page, "property", "og:url")).toBe(`https://clfacollective.com${path}`);
      expect(await meta(page, "name", "twitter:card")).toBe("summary_large_image");
      await expect(page.locator('head link[rel="canonical"]')).toHaveAttribute("href", `https://clfacollective.com${path}`);
      const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent())!);
      expect(ld["@graph"][0]).toMatchObject({ "@type": "Organization", name: "CLFA Collective" });
    });
  }

  test("the share image is a 1200×630 PNG", async ({ page, request }) => {
    const res = await request.get("/og-image.png");
    expect(res.headers()["content-type"]).toContain("image/png");
    await page.goto("/og-image.png");
    const size = await page.locator("img").evaluate((img: HTMLImageElement) => [img.naturalWidth, img.naturalHeight]);
    expect(size).toEqual([1200, 630]);
  });

  test("sitemap lists every page; robots.txt points to it and keeps /admin out", async ({ request }) => {
    const xml = await (await request.get("/sitemap.xml")).text();
    for (const p of PAGES) expect(xml).toContain(`<loc>https://clfacollective.com${p}</loc>`);
    const robots = await (await request.get("/robots.txt")).text();
    expect(robots).toContain("Sitemap: https://clfacollective.com/sitemap.xml");
    expect(robots).toContain("Disallow: /admin/");
  });
});
