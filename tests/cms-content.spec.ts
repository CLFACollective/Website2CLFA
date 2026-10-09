import { test, expect } from "@playwright/test";
import { readFileSync, readdirSync } from "node:fs";

const data = (name: string) => JSON.parse(readFileSync(new URL(`../src/data/${name}.json`, import.meta.url), "utf8"));
const home: { intro: string; vendors: string[] } = data("home");
const momentum: {
  cards: { type: string; value?: number; caption?: string; attribution?: string; lines?: unknown[] }[];
} = data("momentum");
const services: { services: { title: string; word: string }[] } = data("services");
const ribbon: { phrases: string } = data("ribbon");
const cards: { cards: { text: string; icon: string; color: string }[] } = data("cards");
const nav: {
  links: { href: string; menuLabel: string; footerLabel?: string; inMenu?: boolean; inFooter?: boolean }[];
  linkedin: string;
} = data("navigation");
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
    // punctuation right after the bold run is kept on its line (Hero.astro)
    if (bold) await expect(intro.locator("strong")).toContainText(bold);
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

  test("home: every Momentum text with a \"Copper italic\" toggle follows it", async ({ page }) => {
    await page.goto("/");
    const COPPER = "rgb(190, 120, 55)";
    const look = (el: Element) => {
      const cs = getComputedStyle(el);
      return { italic: cs.fontStyle === "italic", color: cs.color };
    };
    const slides = page.locator("#mgScene > .mg__slide");
    for (const [i, card] of momentum.cards.entries()) {
      const slide = slides.nth(i);
      if (card.type === "stat") {
        const c = card as { captionEmphasis?: boolean; sublineEmphasis?: boolean };
        const cap = await slide.locator(".mcap").evaluate(look);
        expect(cap.italic, `slide ${i} caption`).toBe(c.captionEmphasis !== false);
        const sub = await slide.locator("h3").evaluate(look);
        expect(sub.italic, `slide ${i} line below`).toBe(c.sublineEmphasis === true);
        if (c.sublineEmphasis) expect(sub.color).toBe(COPPER);
      } else {
        const lines = (card.lines ?? []) as { emphasis?: boolean }[];
        const spans = slide.locator(".mquote > span");
        for (const [n, line] of lines.entries()) {
          const l = await spans.nth(n).evaluate(look);
          expect(l.italic, `slide ${i} line ${n}`).toBe(!!line.emphasis);
          if (line.emphasis) expect(l.color).toBe(COPPER);
        }
      }
    }
    // and the stat toggles in the positions the data above doesn't use
    const flipped = await page.evaluate(() => {
      const s = document.querySelector<HTMLElement>("#mgScene > .mg__slide--stat")!;
      s.querySelector(".mcap")!.classList.add("mcap--plain");
      s.querySelector("h3")!.classList.add("mg__sub--hot");
      const cap = getComputedStyle(s.querySelector(".mcap")!);
      const sub = getComputedStyle(s.querySelector("h3")!);
      return { capItalic: cap.fontStyle, subItalic: sub.fontStyle, subColor: sub.color };
    });
    expect(flipped).toEqual({ capItalic: "normal", subItalic: "italic", subColor: COPPER });
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

  test("home: the ribbons show the Ribbon Section phrases, split on semicolons", async ({ page }) => {
    await page.goto("/");
    const phrases = ribbon.phrases.split(";").map((p) => p.trim()).filter(Boolean);
    const firstRun = await page.locator(".rib__half").first().locator(".rib__item").allInnerTexts();
    expect(firstRun.slice(0, phrases.length).map((t) => t.trim())).toEqual(phrases);
    // screen readers get the list once (the bands themselves are aria-hidden)
    await expect(page.locator("ul.sr-only li")).toHaveText(phrases);
  });

  test("home: the brand-in-motion cards, in order, with their italics", async ({ page }) => {
    await page.goto("/");
    const els = page.locator("#bmcFan .bmc__card");
    await expect(els).toHaveCount(cards.cards.length);
    await expect(page.locator("#bmcDots .bmc__dot")).toHaveCount(cards.cards.length);
    for (const [i, c] of cards.cards.entries()) {
      const copy = els.nth(i).locator(".bmc__copy");
      await expect(copy).toHaveText(c.text.replace(/\*/g, "").replace(/\s*\n\s*/g, " "));
      const em = c.text.match(/\*(.+?)\*/)?.[1];
      if (em) await expect(copy.locator("em")).toHaveText(em);
      await expect(els.nth(i).locator(`svg.ci--${c.icon}`)).toHaveCount(1);
    }
  });

  test("menu and footer links both come from the navigation list", async ({ page }) => {
    await page.goto("/");
    const menu = nav.links.filter((l) => l.inMenu !== false);
    const links = page.locator(".mega__link");
    await expect(links).toHaveCount(menu.length);
    for (const [i, l] of menu.entries()) {
      await expect(links.nth(i)).toHaveAttribute("href", l.href);
      await expect(links.nth(i).locator(".no")).toHaveText(String(i + 1).padStart(2, "0"));
      await expect(links.nth(i)).toContainText(l.menuLabel);
    }
    const footer = nav.links.filter((l) => l.inFooter !== false);
    const footLinks = page.locator(".foot__nav a");
    await expect(footLinks).toHaveCount(footer.length);
    for (const [i, l] of footer.entries()) {
      await expect(footLinks.nth(i)).toHaveAttribute("href", l.href);
      await expect(footLinks.nth(i)).toHaveText(l.footerLabel?.trim() || l.menuLabel);
    }
    // no LinkedIn link points nowhere
    for (const a of await page.locator("a", { hasText: /^LinkedIn$/i }).all()) {
      await expect(a).toHaveAttribute("href", nav.linkedin);
    }
  });

  test("every page in src/pages is linked from the menu or footer", () => {
    // A new page is built in code; this fails until its link is added
    // to src/data/navigation.json (CMS: Site-wide → Menu & footer links).
    const pages = readdirSync(new URL("../src/pages/", import.meta.url))
      .filter((f) => f.endsWith(".astro") && f !== "index.astro" && f !== "404.astro")
      .map((f) => `/${f.replace(/\.astro$/, "")}`);
    const linked = nav.links.filter((l) => l.inMenu !== false || l.inFooter !== false).map((l) => l.href);
    for (const p of pages) expect(linked, `${p} needs a link in navigation.json`).toContain(p);
  });

  test("the CMS admin page and its config are published", async ({ request }) => {
    const admin = await request.get("/admin/index.html");
    expect(admin.ok()).toBe(true);
    expect(await admin.text()).toContain("@sveltia/cms");
    const config = await request.get("/admin/config.yml");
    expect(config.ok()).toBe(true);
    const text = await config.text();
    for (const file of ["src/data/cards.json", "src/data/navigation.json", "src/data/ribbon.json", "src/data/home.json", "src/data/momentum.json", "src/data/services.json", "src/data/faqs.json"]) {
      expect(text).toContain(file);
    }
  });
});
