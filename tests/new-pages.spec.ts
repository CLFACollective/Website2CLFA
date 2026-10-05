import { test, expect, type Page } from "@playwright/test";
import { collectErrors } from "./helpers";

/**
 * What We Do / About / FAQs / Contact — the four pages ported from the
 * Figma Make source (source/CFLAMAKE_FROM_FIGMA/), reusing the home
 * page's Nav/Footer/Layout. See CLAUDE.md: GSAP-driven values (CSS
 * custom properties written via quickSetter) aren't visible to
 * element.getAnimations() — sampled directly instead, same technique
 * as animation-lifecycle.spec.ts.
 */

const PAGES = [
  { path: "/what-we-do", title: "What We Do", opener: "#what-we-do" },
  { path: "/about", title: "About", opener: "#about" },
  { path: "/faqs", title: "FAQs", opener: "#faqs" },
  { path: "/contact", title: "Contact", opener: "#contact-opener" },
];

async function readVar(page: Page, selector: string, name: string): Promise<string> {
  return page.evaluate(
    ([sel, prop]) => getComputedStyle(document.querySelector(sel)!).getPropertyValue(prop).trim(),
    [selector, name] as const,
  );
}

test.describe("smoke: every new page loads clean", () => {
  for (const p of PAGES) {
    test(`${p.path} — loads with no console/page errors, Nav + Footer + opener present`, async ({ page }) => {
      const errors = collectErrors(page);
      await page.goto(p.path, { waitUntil: "networkidle" });
      await expect(page).toHaveTitle(new RegExp(p.title));
      await expect(page.locator("#nav")).toHaveCount(1);
      await expect(page.locator(".foot")).toHaveCount(1);
      await expect(page.locator(p.opener)).toHaveCount(1);
      // scoped to <main> — the Astro dev toolbar (dev mode only) injects
      // its own shadow-DOM panels with h1s of their own (Audit, Settings),
      // and Playwright's locators pierce open shadow roots by default.
      await expect(page.locator("main h1")).toHaveCount(1);
      expect(errors).toEqual([]);
    });
  }
});

test.describe("nav and footer point at the real pages, not home-page anchors", () => {
  test("mega menu hrefs are real routes, from the home page", async ({ page }) => {
    await page.goto("/");
    const hrefs = await page.locator(".mega__link").evaluateAll((els) => els.map((e) => e.getAttribute("href")));
    expect(hrefs).toEqual(["/what-we-do", "/about", "/faqs", "/contact"]);
  });

  test("footer nav hrefs are real routes, from the home page", async ({ page }) => {
    await page.goto("/");
    const hrefs = await page.locator(".foot__nav a").evaluateAll((els) => els.map((e) => e.getAttribute("href")));
    expect(hrefs).toEqual(["/what-we-do", "/about", "/faqs", "/contact"]);
  });

  test("the sticky kickoff pill and the footer's own CTA both go to /contact, not a same-page anchor", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#kickoff")).toHaveAttribute("href", "/contact");
    await expect(page.locator(".foot .btn--fill")).toHaveAttribute("href", "/contact");
  });
});

test.describe("sticky kickoff pill only appears on the home page", () => {
  for (const p of PAGES) {
    test(`${p.path}: #kickoff is not visible`, async ({ page }) => {
      await page.goto(p.path);
      await expect(page.locator("#kickoff")).toBeHidden();
    });
  }

  test("/ (home): #kickoff is present in the DOM (visibility is scroll-driven)", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#kickoff")).toHaveCount(1);
    const display = await page.evaluate(() => getComputedStyle(document.getElementById("kickoff")!).display);
    expect(display).not.toBe("none");
  });
});

test.describe("nav tint over each page's dark opener", () => {
  for (const p of PAGES) {
    test(`${p.path}: nav--tinted while scrolled within the opener, clears after`, async ({ page }) => {
      await page.goto(p.path);
      await page.waitForTimeout(150);
      await expect(page.locator("#nav")).toHaveClass(/nav--tinted/);

      const openerBottom = await page.evaluate(
        (sel) => document.querySelector(sel)!.getBoundingClientRect().bottom + window.scrollY,
        p.opener,
      );
      await page.evaluate((y) => window.scrollTo(0, y), openerBottom + 400);
      await page.waitForTimeout(150);
      await expect(page.locator("#nav")).not.toHaveClass(/nav--tinted/);
    });
  }
});

test.describe("Services accordion (What We Do) — single-open", () => {
  test("opening a row closes whichever was open", async ({ page }) => {
    await page.goto("/what-we-do");
    const rows = page.locator("#services .svc__row");
    const [row1, row2] = [rows.nth(0), rows.nth(1)];

    await row1.locator(".svc__button").click();
    await expect(row1.locator(".svc__button")).toHaveAttribute("aria-expanded", "true");

    await row2.locator(".svc__button").click();
    await expect(row2.locator(".svc__button")).toHaveAttribute("aria-expanded", "true");
    await expect(row1.locator(".svc__button")).toHaveAttribute("aria-expanded", "false");
  });
});

test.describe("FAQ accordion — independent, any number open at once", () => {
  test("opening a second row doesn't close the first", async ({ page }) => {
    await page.goto("/faqs");
    const rows = page.locator("#faq-list .qa__row");
    const [row1, row2] = [rows.nth(0), rows.nth(1)];

    await row1.locator(".qa__q").click();
    await row2.locator(".qa__q").click();
    await expect(row1.locator(".qa__q")).toHaveAttribute("aria-expanded", "true");
    await expect(row2.locator(".qa__q")).toHaveAttribute("aria-expanded", "true");
  });
});

test.describe("Contact form submits to Netlify Forms", () => {
  test("form carries Netlify's detection attributes", async ({ page }) => {
    await page.goto("/contact");
    const form = page.locator("#ctcForm");
    await expect(form).toHaveAttribute("name", "contact");
    await expect(form).toHaveAttribute("data-netlify", "true");
    await expect(form.locator('input[name="form-name"]')).toHaveValue("contact");
  });

  test("submitting POSTs the fields without navigating, then shows a thank-you", async ({ page }) => {
    await page.goto("/contact");
    let body = "";
    // no Netlify backend under astro dev/preview — stub the POST
    await page.route("**/", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      body = route.request().postData() ?? "";
      await route.fulfill({ status: 200, body: "" });
    });

    await page.fill("#ctc-name", "Cathy Miller");
    await page.fill("#ctc-email", "cathy@example.com");
    await page.fill("#ctc-subject", "Testing");
    await page.fill("#ctc-situation", "Hello");

    const urlBefore = page.url();
    await page.click(".ctc__submit");
    await expect(page.locator("#ctcStatus")).toContainText("Thanks");

    expect(page.url()).toBe(urlBefore);
    const params = new URLSearchParams(body);
    expect(params.get("form-name")).toBe("contact");
    expect(params.get("email")).toBe("cathy@example.com");
  });
});

test.describe("contact details", () => {
  test("the phone number is gone", async ({ page }) => {
    await page.goto("/contact");
    await expect(page.locator(".ctc__direct a[href^='mailto:']")).toHaveAttribute("href", "mailto:hello@clfacollective.com");
    await expect(page.locator(".ctc__direct")).not.toContainText(/call us/i);
  });

  test("FAQ past-work answer has the deck copy, not the placeholder", async ({ page }) => {
    await page.goto("/faqs");
    await expect(page.locator("#faq-list")).not.toContainText("LINK TO CAPES DECK");
    await expect(page.locator("#faq-list")).toContainText("Spoiler alert: we keep good stuff in a deck. All you have to do is ask!");
  });
});

test.describe("reduced motion: every new animation resolves to its resting state immediately", () => {
  test.use({ reducedMotion: "reduce" });

  test("opener lines are visible immediately, no stagger-in wait", async ({ page }) => {
    await page.goto("/what-we-do");
    const opacity = await page.evaluate(() => getComputedStyle(document.querySelector(".opener__line")!).opacity);
    expect(opacity).toBe("1");
  });

  test("MarketingForEquity cards render at rest (opacity 1)", async ({ page }) => {
    await page.goto("/what-we-do");
    const opacity = await page.evaluate(() => getComputedStyle(document.querySelector(".mfe__card")!).opacity);
    expect(opacity).toBe("1");
  });

  test("WhyCollective pink circle sits at rest (no transform offset)", async ({ page }) => {
    await page.goto("/about");
    const val = await readVar(page, "[data-page-why]", "--in");
    expect(val).toBe("1");
  });
});

test.describe("What We Do: conveyor card placement", () => {
  test("at the belt's midpoint the Brand infrastructure card overlaps the orange headline line by ~105 design px, and every card fits on screen", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "the conveyor layout only applies above 900px");
    await page.goto("/what-we-do");
    await page.evaluate(() => {
      const s = document.getElementById("equity")!;
      window.scrollTo(0, s.offsetTop + (s.offsetHeight - innerHeight) / 2);
    });
    await page.waitForTimeout(800);
    const g = await page.evaluate(() => {
      const s = document.getElementById("equity")!;
      // the designed arrangement: zero belt displacement
      s.style.setProperty("--d", "0");
      s.style.setProperty("--dabs", "0");
      const u = s.querySelector<HTMLElement>(".mfe__frame")!.clientWidth / 1920;
      const lines = s.querySelector(".mfe__head strong")!.getClientRects();
      const cards = Array.from(s.querySelectorAll(".mfe__card")).map((c) => c.getBoundingClientRect());
      return {
        u,
        orangeBottom: lines[lines.length - 1].bottom,
        brandTop: cards[2].top,
        topMost: Math.min(...cards.map((c) => c.top)),
        maxBottom: Math.max(...cards.map((c) => c.bottom)),
        vh: innerHeight,
      };
    });
    expect(g.topMost, "Brand infrastructure is the top-most card").toBeCloseTo(g.brandTop, 0);
    const overlap = (g.orangeBottom - g.brandTop) / g.u; // design px
    expect(overlap, "Brand's top edge reaches into the orange line's box").toBeGreaterThan(85);
    expect(overlap, "...by about 105 design px, not more").toBeLessThan(125);
    expect(g.maxBottom, "the lowest card isn't cut off by the stage").toBeLessThanOrEqual(g.vh);
  });
});

test.describe("GSAP-driven scroll values genuinely change (value-sampling, not getAnimations())", () => {
  test("What We Do: opener's --out advances as the page scrolls past it", async ({ page }) => {
    await page.goto("/what-we-do");
    // --out is written on .opener__ground itself (a child of the
    // #what-we-do section) — a custom property set on a descendant
    // doesn't propagate back up to the ancestor's own computed style.
    const before = await readVar(page, ".opener__ground", "--out");
    await page.evaluate(() => window.scrollTo(0, window.innerHeight * 0.9));
    await page.waitForTimeout(400);
    const after = await readVar(page, ".opener__ground", "--out");
    expect(after).not.toBe(before);
  });

  test("What We Do: the conveyor's --d changes as the pinned section scrolls (desktop only)", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "the conveyor only pins above 900px");
    await page.goto("/what-we-do");
    const top = await page.evaluate(() => document.getElementById("equity")!.getBoundingClientRect().top + window.scrollY);
    await page.evaluate((y) => window.scrollTo(0, y), top + 50);
    await page.waitForTimeout(200);
    const before = await readVar(page, "#equity", "--d");
    await page.evaluate((y) => window.scrollTo(0, y), top + 2000);
    await page.waitForTimeout(700);
    const after = await readVar(page, "#equity", "--d");
    expect(after).not.toBe(before);
  });

  test("About: WhyCollective's --in and --res advance as the arch rises", async ({ page }) => {
    // the arch's rise is spent over a pinned scroll track on a
    // landscape-ish frame ("top top" → "bottom bottom" of the tall
    // --track wrapper), or the section's own pass through the
    // viewport on a portrait/phone one ("top bottom" → "bottom
    // center" — deliberately short of "bottom top", see
    // whyCollective.ts's own comment on why) — the two ranges sit at
    // completely different scrollY values, so the actual range is
    // computed per mode rather than assuming a fixed offset past
    // arrival works for both.
    await page.goto("/about");
    const vh = page.viewportSize()!.height;
    const { pinned, sectionTop, sectionHeight } = await page.evaluate(() => {
      const el = document.querySelector("[data-page-why]")!;
      const r = el.getBoundingClientRect();
      return {
        pinned: window.matchMedia("(min-width: 641px) and (min-aspect-ratio: 7/5)").matches,
        sectionTop: r.top + window.scrollY,
        sectionHeight: r.height,
      };
    });
    const rangeStart = pinned ? sectionTop : Math.max(0, sectionTop - vh);
    const rangeEnd = pinned ? sectionTop + sectionHeight - vh : sectionTop + sectionHeight - vh / 2;
    const range = rangeEnd - rangeStart;

    await page.evaluate((y) => window.scrollTo(0, y), rangeStart + range * 0.02);
    await page.waitForTimeout(250);
    const inBefore = await readVar(page, "[data-page-why]", "--in");

    await page.evaluate((y) => window.scrollTo(0, y), rangeStart + range * 0.75);
    await page.waitForTimeout(700);
    const inAfter = await readVar(page, "[data-page-why]", "--in");
    expect(inAfter).not.toBe(inBefore);
    // --res (the cream "result" copy) only turns on once --in has
    // climbed past RES_START — not asserting an exact value, just
    // that it's a real, non-zero number once deep into the range.
    const res = await readVar(page, "[data-page-why]", "--res");
    expect(Number(res)).toBeGreaterThan(0);
  });

  test("About: the 'READY TO MOVE' marquee is genuinely animating (GSAP xPercent)", async ({ page }) => {
    // runs at every width, including below 900px — an earlier pass had
    // it hidden there to match the Figma source, but per direct
    // instruction it should loop on every viewport like the site's
    // other marquees (Ribbons, LogoScroller) already do.
    await page.goto("/about");
    const track = page.locator(".abt__marquee-track");
    await track.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    const readTransform = () => page.evaluate(() => getComputedStyle(document.querySelector(".abt__marquee-track")!).transform);
    const before = await readTransform();
    await page.waitForTimeout(1000);
    const after = await readTransform();
    expect(after).not.toBe(before);
  });
});
