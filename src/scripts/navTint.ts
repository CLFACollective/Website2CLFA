import { useGsap, prefersReducedMotion } from "./gsapSetup";

const WHITE = "#FFFFFF";
const PINK = "#F06996";

/**
 * The nav adapts to whatever's scrolled beneath it — it's fixed, so
 * unlike everything else on the page it can't just pick a colour once.
 *
 * - The wordmark's dot is pink on every ground except the hero's own
 *   pink bloom, where a pink dot disappears into a pink screen — GSAP
 *   tweens its fill directly (see ClfaWordmark/clfaLogo.ts for why this
 *   is a plain inline path now rather than a <use> reference). Pure
 *   white there, deliberately not the site's off-white cream — the dot
 *   sits mostly *behind* the wordmark's own big C/L/F/A strokes in
 *   paint order (see clfaLogo.ts — those letters are the last paths in
 *   the source, so they draw on top of the dot), so it only ever reads
 *   as fragments peeking between the letters rather than a full shape;
 *   full white against pink keeps those fragments crisp rather than
 *   fading toward invisible the way the softer cream did.
 * - The wordmark's letterforms (currentColor, via nav's own `color`)
 *   go cream over the azure "partnering" window and the forest "don't
 *   let up" section, where charcoal reads too dark against too-dark
 *   grounds. That's a class toggle rather than a GSAP tween: `.nav`
 *   already has a plain CSS `transition: color` for the identical
 *   cream swap while the mega menu is open, and letting GSAP write an
 *   inline `color` here would permanently outrank that rule (inline
 *   always beats a class selector) the first time either fires.
 */
export function setupNavTint() {
  const nav = document.getElementById("nav");
  const logo = document.querySelector<HTMLElement>(".nav__logo");
  const windowA = document.querySelector<HTMLElement>("[data-win]");
  const keep = document.querySelector<HTMLElement>("[data-keep]");
  const opener = document.querySelector<HTMLElement>("[data-page-opener]");
  if (!nav || !logo) return;

  const { gsap, ScrollTrigger } = useGsap();
  const dots = Array.from(logo.querySelectorAll<SVGPathElement>(".dot"));
  const reduce = prefersReducedMotion();

  let onPinkGround = false;
  const applyDot = () => {
    const color = onPinkGround ? WHITE : PINK;
    if (reduce) gsap.set(dots, { fill: color });
    else gsap.to(dots, { fill: color, duration: 0.35, ease: "power2.out" });
  };
  document.addEventListener("clfa:hero-ground", (e) => {
    onPinkGround = (e as CustomEvent<{ pink: boolean }>).detail.pink;
    applyDot();
  });

  let inWindowA = false;
  let inKeep = false;
  let inOpener = false;
  const updateTint = () => nav.classList.toggle("nav--tinted", inWindowA || inKeep || inOpener);

  /* The nav is pinned to the very top of the viewport, so what matters
     is whether THIS section currently occupies that top strip — not
     whether its centre has passed the viewport's centre (a shorter
     section can pass that test while the previous/next section is
     still what's actually behind the nav). "top top" / "bottom top"
     tracks the section's own overlap with the viewport's top edge. */
  if (windowA) {
    ScrollTrigger.create({
      trigger: windowA,
      start: "top top",
      end: "bottom top",
      onToggle: (self) => { inWindowA = self.isActive; updateTint(); },
    });
  }
  if (keep) {
    ScrollTrigger.create({
      trigger: keep,
      start: "top top",
      end: "bottom top",
      onToggle: (self) => { inKeep = self.isActive; updateTint(); },
    });
  }
  /* the What We Do / About / FAQs / Contact openers — same dark-ground
     tinting need as Window A / KeepUp, tracked generically by the
     [data-page-opener] attribute every PageOpener instance carries.
     Deliberately onUpdate + self.isActive, not onToggle: unlike
     Window A/KeepUp (never active at scrollY 0 on the home page), the
     opener IS active from the very first frame on these pages, and an
     onToggle-based "current vs. previous state" comparison went stuck
     permanently tinted in practice — confirmed live, an instant
     window.scrollTo() jump past the trigger's whole range never fired
     a toggle back to inactive, the same "instant jump doesn't
     register as a crossing" ScrollTrigger gotcha already hit
     elsewhere in this codebase. onUpdate fires on every real scroll
     tick regardless of jump size, so there's no crossing to miss. */
  if (opener) {
    ScrollTrigger.create({
      trigger: opener,
      start: "top top",
      end: "bottom top",
      onUpdate: (self) => { inOpener = self.isActive; updateTint(); },
    });

    /* This script runs (and the trigger above gets created) before
       the page's web fonts have necessarily finished loading — a
       pre-font-swap layout read here can be badly wrong (confirmed
       live on mobile viewports: the opener's measured rect.top was
       540px, not 0, at this exact point in a fresh load), which both
       this synchronous check AND GSAP's own initial trigger
       calculation would otherwise silently bake in as "correct" and
       never revisit, since nothing else prompts a recheck until the
       user's first scroll. Same fix as momentumGallery.ts's own
       document.fonts.ready + ScrollTrigger.refresh() pattern: a
       reasonable synchronous first guess now, corrected for real
       once fonts (and therefore final layout) are actually ready. */
    const evalOpener = () => {
      const r = opener.getBoundingClientRect();
      inOpener = r.top <= 0 && r.bottom > 0;
      updateTint();
    };
    evalOpener();
    document.fonts?.ready
      .then(() => {
        /* Tried reading openerTrigger.isActive here instead of a
           second getBoundingClientRect(), to avoid the extra reflow
           on top of the one refresh() itself already forces — measured
           as a real (if small, ~40ms, one-time-at-load) cost via a
           performance trace. Reverted: isActive wasn't reliably
           updated by refresh() for an onUpdate-driven trigger like
           this one, confirmed live (nav stopped tinting on load).
           Correctness over a one-time micro-optimization. */
        ScrollTrigger.refresh();
        evalOpener();
      })
      .catch(() => {});
  }
  updateTint();
}
