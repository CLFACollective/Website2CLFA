import { test, expect, type Page } from "@playwright/test";
import { collectErrors, skipHeroMovie } from "./helpers";

/**
 * The card fans (cardsFan.ts's setupCardFan): home's "So… what's a
 * brand in motion?" cards and What We Do's equity cards. On desktop
 * (1000px+) the deck deals into the fan once in view and then ignores
 * scroll; hovering a card makes it the lead (lifts, neighbours part);
 * moving the pointer away settles the fan back. The motion is GSAP-
 * driven, so it's checked by sampling transforms/rects before and
 * after, not getAnimations(). Below 1000px both pin as a deck (home's
 * deck is covered in scrolling.spec.ts; the equity deck below).
 */
const FANS = [
  { name: "home brand-in-motion cards", path: "/", stage: "#motion .bmc__stage", pin: "#bmcPin", card: "#bmcFan > *" },
  { name: "What We Do equity cards", path: "/what-we-do", stage: "#mfeStage", pin: "#mfePin", card: "#mfeFan > *" },
];

for (const fan of FANS) {
  test.describe(`${fan.name} (desktop)`, () => {
    test.skip(({ isMobile }) => isMobile, "hover fan is desktop-only; phones use the pinned deck");

    const transforms = (page: Page) =>
      page.$$eval(fan.card, (els) => els.map((e) => (e as HTMLElement).style.transform));
    const rects = (page: Page) =>
      page.$$eval(fan.card, (els) =>
        els.map((e) => {
          const r = e.getBoundingClientRect();
          return { x: r.left + r.width / 2, y: r.top + r.height / 2, top: r.top, active: (e as HTMLElement).dataset.active };
        }),
      );

    test.beforeEach(async ({ page }) => {
      await page.goto(fan.path, { waitUntil: "networkidle" });
      await skipHeroMovie(page);
      await page.locator(fan.stage).scrollIntoViewIfNeeded();
      await page.waitForTimeout(1500); // the deal-in
    });

    test("the section doesn't pin", async ({ page }) => {
      const { pin, stage } = await page.evaluate(
        ([p, s]) => ({
          pin: document.querySelector(p)!.getBoundingClientRect().height,
          stage: document.querySelector(s)!.getBoundingClientRect().height,
        }),
        [fan.pin, fan.stage],
      );
      expect(pin, "no extra scroll track under the stage").toBeLessThanOrEqual(stage + 1);
    });

    test("scrolling doesn't move the cards", async ({ page }) => {
      const errors = collectErrors(page);
      const before = await transforms(page);
      await page.mouse.move(5, 5); // keep the pointer off the cards
      await page.mouse.wheel(0, 150);
      await page.waitForTimeout(700);
      expect(await transforms(page)).toEqual(before);
      expect(errors).toEqual([]);
    });

    test("hovering a card lifts it and parts its neighbours; leaving settles them back", async ({ page }) => {
      const rest = await rects(page);
      const restTransforms = await transforms(page);
      test.skip(rest.length < 3, "needs a card with a neighbour on each side");
      const i = 1; // has a neighbour on each side, and is off-centre with 4+ cards so the fan tilts too

      await page.mouse.move(rest[i].x, rest[i].y);
      await page.waitForTimeout(700);
      const hover = await rects(page);
      expect(hover[i].active).toBe("true");
      expect(hover.filter((r) => r.active === "true")).toHaveLength(1);
      expect(hover[i].top, "hovered card lifts").toBeLessThan(rest[i].top - 10);
      expect(hover[i - 1].x, "left neighbour parts left").toBeLessThan(rest[i - 1].x - 10);
      expect(hover[i + 1].x, "right neighbour parts right").toBeGreaterThan(rest[i + 1].x + 10);

      // a small move inside the card (e.g. near the edge it lifted off) keeps it
      await page.mouse.move(rest[i].x, rest[i].y + 20);
      await page.waitForTimeout(300);
      expect((await rects(page))[i].active).toBe("true");

      await page.mouse.move(5, 5);
      await page.waitForTimeout(800);
      const after = await rects(page);
      expect(after.every((r) => r.active === "false")).toBe(true);
      expect(await transforms(page)).toEqual(restTransforms);
    });

    test("moving straight from one card to the next hands over the lead", async ({ page }) => {
      const rest = await rects(page);
      test.skip(rest.length < 2, "needs two cards");
      await page.mouse.move(rest[0].x, rest[0].y);
      await page.waitForTimeout(600);
      expect((await rects(page))[0].active).toBe("true");
      await page.mouse.move(rest[1].x, rest[1].y, { steps: 8 });
      await page.waitForTimeout(600);
      const r = await rects(page);
      expect(r[1].active).toBe("true");
      expect(r[0].active).toBe("false");
    });
  });
}

test.describe("home brand-in-motion cards", () => {
  test("no progress dots", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#motion .bmc__dot, #bmcDots")).toHaveCount(0);
  });
});

/** net on-screen rotation of each equity icon: fan + card + its own counter-rotation */
const iconAngles = (page: Page) =>
  page.evaluate(() => {
    const deg = (el: Element) => {
      const t = getComputedStyle(el).transform;
      if (!t || t === "none") return 0;
      const m = new DOMMatrix(t);
      return (Math.atan2(m.b, m.a) * 180) / Math.PI;
    };
    const fan = document.getElementById("mfeFan")!;
    return Array.from(fan.querySelectorAll(".mfe__card")).map(
      (c) => deg(fan) + deg(c) + deg(c.querySelector(".mfe__icon")!),
    );
  });

test.describe("What We Do equity cards: icons never tilt", () => {
  test("upright at rest and while a card is hovered", async ({ page, isMobile }) => {
    await page.goto("/what-we-do", { waitUntil: "networkidle" });
    await page.locator("#mfeStage").scrollIntoViewIfNeeded();
    await page.waitForTimeout(1500);
    for (const a of await iconAngles(page)) expect(Math.abs(a)).toBeLessThan(0.5);

    test.skip(isMobile, "hover is desktop-only");
    const r = await page.locator(".mfe__card").first().boundingBox();
    await page.mouse.move(r!.x + r!.width / 2, r!.y + r!.height / 2);
    await page.waitForTimeout(700);
    for (const a of await iconAngles(page)) expect(Math.abs(a)).toBeLessThan(0.5);
  });
});

test.describe("What We Do equity cards (phone deck)", () => {
  test.skip(({ isMobile }) => !isMobile, "the deck is the sub-1000px layout");

  test("pins, and each card comes to the front in turn, centred and fully on screen", async ({ page }) => {
    await page.goto("/what-we-do", { waitUntil: "networkidle" });
    const position = await page.evaluate(() => getComputedStyle(document.getElementById("mfeStage")!).position);
    expect(position).toBe("sticky");

    const { top, height } = await page.evaluate(() => {
      const r = document.getElementById("mfePin")!.getBoundingClientRect();
      return { top: r.top + scrollY, height: r.height };
    });
    const vh = await page.evaluate(() => innerHeight);
    const n = await page.locator(".mfe__card").count();
    for (let card = 0; card < n; card++) {
      const p = n > 1 ? card / (n - 1) : 0;
      await page.evaluate((y) => window.scrollTo(0, y), top + (height - vh) * p);
      await page.waitForTimeout(500);
      const f = await page.evaluate(() => {
        const cards = Array.from(document.querySelectorAll<HTMLElement>(".mfe__card"));
        const i = cards.findIndex((c) => c.dataset.active === "true");
        const r = cards[i]?.getBoundingClientRect();
        return { i, active: cards.filter((c) => c.dataset.active === "true").length, r: r && { left: r.left, right: r.right, top: r.top, bottom: r.bottom }, vw: innerWidth };
      });
      expect(f.i, `card ${card} in front`).toBe(card);
      expect(f.active).toBe(1);
      expect(Math.abs((f.r!.left + f.r!.right) / 2 - f.vw / 2)).toBeLessThan(2);
      expect(f.r!.top).toBeGreaterThan(0);
      expect(f.r!.bottom).toBeLessThan(vh);
    }
  });
});
