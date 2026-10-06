import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

const data = (name: string) => JSON.parse(readFileSync(new URL(`../src/data/${name}.json`, import.meta.url), "utf8"));
const home: { intro: string; vendors: string[] } = data("home");
const momentum: {
  cards: { type: string; value?: number; caption?: string; attribution?: string; lines?: unknown[] }[];
} = data("momentum");
const services: { services: { title: string; word: string }[] } = data("services");
const faqs: { groups: { title: string; items: { question: string; answer: string; tail?: string }[] }[] } = data("faqs");

/**
 * The CMS-editable areas (Sveltia, /admin) are JSON files under
 * src/data/. These check each page actually renders from its file —
 * so an item added, removed, or moved in the CMS shows up — rather than
 * from copy left hard-coded in a component.
 */
test.describe("CMS content drives the pages", () => {
  test("home: the intro paragraph and both client marquees", async ({ page }) => {
    await page.goto("/");
    const intro = page.locator(".hcb__closing");
    const bold = home.intro.match(/\*\*(.+?)\*\*/)?.[1];
    await expect(intro).toContainText(home.intro.replace(/\*\*/g, "").slice(0, 30));
    if (bold) await expect(intro.locator("strong")).toHaveText(bold);
    // two marquee rows, each rendering the set twice
    const names = await page.locator(".lsc__set").first().locator(".lsc__name").allInnerTexts();
    expect(names.map((n) => n.toLowerCase())).toEqual(home.vendors.map((n) => n.toLowerCase()));
    await expect(page.locator(".lsc__name")).toHaveCount(home.vendors.length * 4);
  });

  test("home: one Momentum slide per card, in order", async ({ page }) => {
    await page.goto("/");
    const slides = page.locator("#mgScene > .mg__slide");
    await expect(slides).toHaveCount(momentum.cards.length);
    for (const [i, card] of momentum.cards.entries()) {
      const slide = slides.nth(i);
      await expect(slide).toHaveAttribute("data-mg-index", String(i));
      if (card.type === "stat") {
        await expect(slide.locator(".mfig")).toHaveAttribute("data-mg-count", String(card.value));
        await expect(slide.locator(".mcap")).toHaveText(card.caption!);
      } else {
        await expect(slide.locator(".mquote__by")).toHaveText(card.attribution!);
        await expect(slide.locator(".mquote > span")).toHaveCount(card.lines!.length);
      }
    }
  });

  test("what we do: one accordion row per service, numbered by position", async ({ page }) => {
    await page.goto("/what-we-do");
    const rows = page.locator(".svc__row");
    await expect(rows).toHaveCount(services.services.length);
    for (const [i, s] of services.services.entries()) {
      await expect(rows.nth(i).locator(".svc__button > span").first()).toHaveText(s.title);
      await expect(rows.nth(i).locator(".svc__display")).toHaveAttribute("data-text", `${String(i + 1).padStart(2, "0")} ${s.word}`);
    }
  });

  test("faqs: every group and question, answers split into paragraphs", async ({ page }) => {
    await page.goto("/faqs");
    const groups = page.locator(".qa__group");
    await expect(groups).toHaveCount(faqs.groups.length);
    for (const [g, group] of faqs.groups.entries()) {
      await expect(groups.nth(g).locator("h2")).toHaveText(group.title);
      const rows = groups.nth(g).locator(".qa__row");
      await expect(rows).toHaveCount(group.items.length);
      for (const [i, item] of group.items.entries()) {
        await expect(rows.nth(i).locator(".qa__q > span").first()).toHaveText(item.question);
        const paras = item.answer.split(/\n\s*\n/).filter((p) => p.trim()).length + (item.tail ? 1 : 0);
        await expect(rows.nth(i).locator(".qa__answer p")).toHaveCount(paras);
      }
    }
  });

  test("the CMS admin page and its config are published", async ({ request }) => {
    const admin = await request.get("/admin/index.html");
    expect(admin.ok()).toBe(true);
    expect(await admin.text()).toContain("@sveltia/cms");
    const config = await request.get("/admin/config.yml");
    expect(config.ok()).toBe(true);
    const text = await config.text();
    for (const file of ["src/data/home.json", "src/data/momentum.json", "src/data/services.json", "src/data/faqs.json"]) {
      expect(text).toContain(file);
    }
  });
});
