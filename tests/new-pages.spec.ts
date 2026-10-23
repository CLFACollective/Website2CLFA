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

  test("every row's big outlined label (e.g. '02 GO-TO-MARKET') fits on screen without overflowing", async ({ page }) => {
    // overflowing pulls the outline and its cream mask copy apart into garbled double lettering
    await page.goto("/what-we-do");
    const fits = await page.$$eval("#services .svc__display", (els) =>
      els.map((el) => {
        const r = document.createRange();
        r.selectNodeContents(el);
        const ink = r.getBoundingClientRect();
        const box = el.getBoundingClientRect();
        return { text: (el as HTMLElement).dataset.text, fits: el.scrollWidth <= el.clientWidth + 1 && ink.right <= innerWidth };
      }),
    );
    for (const f of fits) expect(f.fits, f.text).toBe(true);
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
  test("'What's your situation?' shows its whole placeholder and grows instead of scrolling", async ({ page }) => {
    await page.goto("/contact");
    const box = page.locator("#ctc-situation");
    const fits = () => box.evaluate((el: HTMLTextAreaElement) => el.scrollHeight <= el.clientHeight + 1);
    expect(await fits(), "placeholder isn't cut off").toBe(true);

    const before = (await box.boundingBox())!.height;
    await box.fill(Array.from({ length: 8 }, (_, i) => `Line ${i + 1} about our brand and timeline.`).join("\n"));
    await page.waitForTimeout(100);
    expect(await fits(), "no scrolling inside the box").toBe(true);
    expect((await box.boundingBox())!.height).toBeGreaterThan(before);
  });

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

  test("About: WhyCollective holds 'Why a collective?' for a beat, then the arch rises and 'The result' shows", async ({ page }) => {
    // Landscape-ish frame: the run is the tall --track wrapper ("top
    // top" → "bottom bottom"). Portrait/phone: a short pin — the frame
    // sticks vertically centred for --run of scroll (mirrored from
    // whyCollective.ts's shortPin()).
    await page.goto("/about");
    const { start, end } = await page.evaluate(() => {
      const el = document.querySelector("[data-page-why]")!;
      const r = el.getBoundingClientRect();
      const vh = innerHeight;
      const top = r.top + scrollY;
      if (matchMedia("(min-width: 641px) and (min-aspect-ratio: 7/5)").matches)
        return { start: top, end: top + r.height - vh };
      const cs = getComputedStyle(el);
      const pin = el.querySelector<HTMLElement>("[data-why-pin]")!;
      const padTop = parseFloat(cs.paddingTop);
      const s = top - ((vh - pin.offsetHeight) / 2 - padTop);
      return { start: s, end: s + el.clientHeight - padTop - pin.offsetHeight };
    });
    const at = async (p: number) => {
      await page.evaluate((y) => window.scrollTo(0, y), start + (end - start) * p);
      await page.waitForTimeout(500);
    };

    // arrived, and a little past: the arch hasn't moved, the heading is in full view
    await at(0.2);
    expect(Number(await readVar(page, "[data-page-why]", "--in"))).toBe(0);
    const h = await page.locator(".abt__why-h").boundingBox();
    const vh = page.viewportSize()!.height;
    expect(h!.y).toBeGreaterThanOrEqual(0);
    expect(h!.y + h!.height).toBeLessThanOrEqual(vh);

    // through the run: risen, and the result copy showing
    await at(1);
    expect(Number(await readVar(page, "[data-page-why]", "--in"))).toBeGreaterThan(0.99);
    expect(Number(await readVar(page, "[data-page-why]", "--res"))).toBeGreaterThan(0.99);
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
