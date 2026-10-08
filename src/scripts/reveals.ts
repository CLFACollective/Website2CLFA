import { useGsap, prefersReducedMotion } from "./gsapSetup";
import { escapeHtml } from "../lib/inlineMarkdown";

/**
 * Fade/rise-up reveals (.reveal, .archB) and the count-up figures
 * (data-count) used across every section below the hero.
 *
 * Triggered by a plain IntersectionObserver rather than ScrollTrigger:
 * several of these elements (the Momentum stat panels) sit inside a
 * horizontally-scrolling track clipped by a sticky, overflow:hidden
 * stage — their visibility changes from a CSS transform, not the
 * page's own scroll position, which is exactly what IntersectionObserver
 * is built to detect regardless of *why* something scrolled into view.
 * GSAP still owns the actual animation once triggered.
 */
export function setupReveals() {
  const { gsap } = useGsap();
  const all = Array.from(document.querySelectorAll<HTMLElement>(".reveal, .archB, [data-count]"));
  if (!all.length) return;

  if (prefersReducedMotion()) {
    all.forEach((el) => {
      el.classList.add("is-in");
      if (el.dataset.count) setCountText(el, Number(el.dataset.count));
    });
    return;
  }

  const reveal = (el: HTMLElement) => {
    el.classList.add("is-in");
    // .archB only: WindowB's closing pink circle, made to rise in
    // ~0.3s slower than every other reveal on the page per direct
    // request — it's the last thing before the footer, and the extra
    // beat reads as a deliberate close rather than just another
    // section arriving at the standard pace.
    const isArch = el.classList.contains("archB");
    gsap.to(el, { opacity: 1, y: 0, duration: isArch ? 1.35 : 0.9, ease: "power3.out" });
    if (el.dataset.count) countUp(el);
  };

  const observe = (items: HTMLElement[], options: IntersectionObserverInit) => {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        reveal(entry.target as HTMLElement);
        io.unobserve(entry.target);
      });
    }, options);
    items.forEach((el) => io.observe(el));
  };

  /* Most reveals share one threshold; a heading centred inside a tall,
     overflow-hidden window frame (see WindowA.astro) needs a lower one
     to reliably fire at all — split into two observer groups. */
  const eager = all.filter((el) => el.hasAttribute("data-reveal-eager"));
  const normal = all.filter((el) => !el.hasAttribute("data-reveal-eager"));
  observe(normal, { threshold: 0.25, rootMargin: "0px 0px -8% 0px" });
  observe(eager, { threshold: 0, rootMargin: "0px 0px -12% 0px" });

  function countUp(el: HTMLElement) {
    const target = parseFloat(el.dataset.count!);
    const obj = { v: 0 };
    gsap.to(obj, {
      v: target,
      duration: 1.1,
      ease: "power3.out",
      onUpdate: () => setCountText(el, obj.v),
    });
  }

  function setCountText(el: HTMLElement, value: number) {
    const suffix = escapeHtml(el.dataset.suffix || "");
    const prefix = escapeHtml(el.dataset.prefix || "");
    el.innerHTML = `${prefix}${Math.round(value)}<span class="unit">${suffix}</span>`;
  }
}
