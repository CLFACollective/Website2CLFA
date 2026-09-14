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

  let menuOpen = false;
  document.addEventListener("clfa:menu", (e) => {
    menuOpen = (e as CustomEvent<{ open: boolean }>).detail.open;
    update();
  });

  let onMotion = false;
  if (motion) {
    ScrollTrigger.create({
      trigger: motion,
      start: "top center",
      end: "bottom center",
      onToggle: (self) => { onMotion = self.isActive; update(); },
    });
  }

  let onRibbons = false;
  if (ribbons) {
    ScrollTrigger.create({
      trigger: ribbons,
      start: "top center",
      end: "bottom center",
      onToggle: (self) => { onRibbons = self.isActive; update(); },
    });
  }

  let pastHero = false;
  ScrollTrigger.create({
    start: 0,
    end: "max",
    onUpdate: () => {
      pastHero = window.scrollY > window.innerHeight * 0.9;
      update();
    },
  });

  let nearFooter = false;
  if (footer) {
    ScrollTrigger.create({
      trigger: footer,
      start: "top bottom+=80",
      end: "bottom top",
      onToggle: (self) => { nearFooter = self.isActive; update(); },
    });
  }

  function update() {
    const on = menuOpen
      ? false
      : isMobile
        ? !onMotion && !onRibbons
        : pastHero && !nearFooter && !onMotion;
    gsap.to(cta, { autoAlpha: on ? 1 : 0, y: on ? 0 : 14, duration: 0.45, ease: "power2.out" });
  }

  /* Every input above only calls update() reactively (on scroll cross,
     on toggle, on resize) — nothing guarantees one of those fires
     before the user sees the page. The mobile case in particular
     starts "on" by default, which the resting CSS (opacity:0) doesn't
     reflect until something explicitly says so. */
  update();
}
