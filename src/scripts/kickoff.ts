import { useGsap, prefersReducedMotion } from "./gsapSetup";

/**
 * The sticky "Is it go time?" pill.
 *
 * At 800px and up: visible once you're a beat past the hero, hidden
 * again near the footer (which carries its own CTA) and while the
 * brand-in-motion cards own the screen.
 *
 * Below 800px: it just stays put throughout the scroll — no "past the
 * hero" / "near the footer" gating — except while the cards or the
 * ribbons section own the screen, same as at every other width.
 *
 * The label never changes, but the pill itself swaps to a light
 * "on saturated ground" treatment (cream, drop-shadow, no fill) for any
 * stretch where the pink pill would sit on a background too close to
 * its own colour to read: the hero's pink bloom, the azure "partnering"
 * window, and the forest "don't let up" section.
 */
export function setupKickoffCta() {
  /* absent entirely on What We Do / About / FAQs / Contact — see
     Layout.astro's hideKickoff prop and the body.hide-kickoff CSS rule
     that hides it. Bail before setting up any ScrollTriggers rather
     than just relying on the CSS, since none of them have anything
     meaningful to track on these pages anyway. */
  if (document.body.classList.contains("hide-kickoff")) return;

  const { gsap, ScrollTrigger } = useGsap();
  const cta = document.getElementById("kickoff");
  const footer = document.querySelector<HTMLElement>("footer");
  const motion = document.getElementById("motion");
  const ribbons = document.querySelector<HTMLElement>(".rib");
  const keep = document.querySelector<HTMLElement>("[data-keep]");
  const windowA = document.querySelector<HTMLElement>("[data-win]");
  if (!cta) return;

  /* Below 800px the CTA just stays put — no "a beat past the hero" /
     "near the footer" gating — except while the cards or ribbons
     sections own the screen, same as at every other width. */
  const mobileQuery = window.matchMedia("(max-width: 799px)");
  let isMobile = mobileQuery.matches;
  mobileQuery.addEventListener("change", (e) => { isMobile = e.matches; update(); });

  let isAlt = false;
  const setAltMode = (on: boolean) => {
    if (on === isAlt) return;
    isAlt = on;
    if (prefersReducedMotion()) {
      cta.classList.toggle("kickoff--alt", on);
      return;
    }
    gsap.timeline()
      .to(cta, { scale: 0.92, duration: 0.16, ease: "power2.in" })
      .call(() => cta.classList.toggle("kickoff--alt", on))
      .to(cta, { scale: 1, duration: 0.32, ease: "back.out(2)" });
  };

  let inHeroPink = false;
  let inKeep = false;
  let inWindowA = false;
  const updateAlt = () => setAltMode(inHeroPink || inKeep || inWindowA);

  /* Every one of these needs to exist before ANY ScrollTrigger.create()
     call below, not just before update()'s own definition — a trigger
     whose "start" is already satisfied at creation time (pastHero's,
     start:0) can fire its onUpdate/onToggle synchronously, during
     create() itself, rather than waiting for a later real scroll tick.
     Confirmed live: that synchronous first call reached update() while
     these were still in their let-declaration temporal dead zone
     (declared further down, closer to the ScrollTrigger that uses
     each one), throwing "Cannot access 'nearFooter' before
     initialization" on page load. Same underlying GSAP behavior as
     navTint.ts's own opener trigger (see that file's comments). */
  let menuOpen = false;
  let onMotion = false;
  let onRibbons = false;
  let pastHero = false;
  let nearFooter = false;
  let onMomentum = false;
  let swapping = false; // mid side-swap: hidden until it has moved
  let swapCall: gsap.core.Tween | null = null;
  const SWAP_FADE = 0.2;

  document.addEventListener("clfa:hero-ground", (e) => {
    inHeroPink = (e as CustomEvent<{ pink: boolean }>).detail.pink;
    updateAlt();
  });

  if (keep) {
    ScrollTrigger.create({
      trigger: keep,
      start: "top center",
      end: "bottom center",
      onToggle: (self) => { inKeep = self.isActive; updateAlt(); },
    });
  }

  if (windowA) {
    ScrollTrigger.create({
      trigger: windowA,
      start: "top center",
      end: "bottom center",
      onToggle: (self) => { inWindowA = self.isActive; updateAlt(); },
    });
  }

  document.addEventListener("clfa:menu", (e) => {
    menuOpen = (e as CustomEvent<{ open: boolean }>).detail.open;
    update();
  });

  if (motion) {
    ScrollTrigger.create({
      trigger: motion,
      start: "top center",
      end: "bottom center",
      onToggle: (self) => { onMotion = self.isActive; update(); },
    });
  }

  /* Momentum's Replay sits bottom-right (matching the hero's), so the
     pill moves to the bottom-left while that section is on screen, at
     every width — the two swap corners.
     It doesn't travel across: it fades out, jumps, and update() fades
     it back in. x is measured live: the distance from its usual
     right-hand spot to the same gutter on the left. */
  const momentum = document.getElementById("momentum");
  const placeSide = (animate: boolean) => {
    const gut = parseFloat(getComputedStyle(cta).right) || 0;
    const x = onMomentum ? -(document.documentElement.clientWidth - 2 * gut - cta.offsetWidth) : 0;
    if (Math.abs(Number(gsap.getProperty(cta, "x")) - x) < 1 && !swapCall) return;
    swapCall?.kill();
    swapCall = null;
    if (!animate || prefersReducedMotion()) { swapping = false; gsap.set(cta, { x }); update(); return; }
    // update() keeps it hidden while swapping (the scroll triggers call
    // it every tick, so a plain fade tween would be overridden)
    swapping = true;
    update();
    swapCall = gsap.delayedCall(SWAP_FADE + 0.02, () => {
      swapCall = null;
      gsap.set(cta, { x });
      swapping = false;
      update();
    });
  };
  if (momentum) {
    ScrollTrigger.create({
      trigger: momentum,
      start: "top center",
      end: "bottom center",
      onToggle: (self) => { onMomentum = self.isActive; placeSide(true); },
    });
    window.addEventListener("resize", () => placeSide(false));
  }

  if (ribbons) {
    ScrollTrigger.create({
      trigger: ribbons,
      start: "top center",
      end: "bottom center",
      onToggle: (self) => { onRibbons = self.isActive; update(); },
    });
  }

  ScrollTrigger.create({
    start: 0,
    end: "max",
    onUpdate: () => {
      pastHero = window.scrollY > window.innerHeight * 0.9;
      update();
    },
  });

  if (footer) {
    ScrollTrigger.create({
      trigger: footer,
      start: "top bottom+=80",
      end: "bottom top",
      onToggle: (self) => { nearFooter = self.isActive; update(); },
    });
  }

  function update() {
    const on = swapping ? false : menuOpen
      ? false
      : isMobile
        ? !onMotion && !onRibbons
        : pastHero && !nearFooter && !onMotion;
    gsap.to(cta, { autoAlpha: on ? 1 : 0, y: on ? 0 : 14, duration: swapping ? SWAP_FADE : 0.45, ease: "power2.out", overwrite: "auto" });
  }

  /* Every input above only calls update() reactively (on scroll cross,
     on toggle, on resize) — nothing guarantees one of those fires
     before the user sees the page. The mobile case in particular
     starts "on" by default, which the resting CSS (opacity:0) doesn't
     reflect until something explicitly says so. */
  update();
}
