import { useGsap, prefersReducedMotion } from "./gsapSetup";

const CREAM = "#FFFCF5";
const PINK = "#F06496";

/**
 * The nav adapts to whatever's scrolled beneath it — it's fixed, so
 * unlike everything else on the page it can't just pick a colour once.
 *
 * - The wordmark's dot is pink on every ground except the hero's own
 *   pink bloom, where a pink dot disappears into a pink screen — GSAP
 *   tweens its fill directly (see ClfaWordmark/clfaLogo.ts for why this
 *   is a plain inline path now rather than a <use> reference).
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
  if (!nav || !logo) return;

  const { gsap, ScrollTrigger } = useGsap();
  const dots = Array.from(logo.querySelectorAll<SVGPathElement>(".dot"));
  const reduce = prefersReducedMotion();

  let onPinkGround = false;
  const applyDot = () => {
    const color = onPinkGround ? CREAM : PINK;
    if (reduce) gsap.set(dots, { fill: color });
    else gsap.to(dots, { fill: color, duration: 0.35, ease: "power2.out" });
  };
  document.addEventListener("clfa:hero-ground", (e) => {
    onPinkGround = (e as CustomEvent<{ pink: boolean }>).detail.pink;
    applyDot();
  });

  let inWindowA = false;
  let inKeep = false;
  const updateTint = () => nav.classList.toggle("nav--tinted", inWindowA || inKeep);

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
}
