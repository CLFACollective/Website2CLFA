import { useGsap, prefersReducedMotion } from "./gsapSetup";

/**
 * Same-page anchor links (nav, mega menu, footer, every CTA) used to
 * get their glide from `html { scroll-behavior: smooth }` — but that's
 * a documented bad combination with ScrollTrigger's own scrub math:
 * the browser's native smooth-scroll easing and ScrollTrigger both try
 * to own the relationship between scroll position and animation
 * progress, and fighting over it is a real source of stutter, worse on
 * WebKit (i.e. every iOS browser, "Chrome" included) than on Blink.
 * This replaces it with GSAP's own ScrollToPlugin, driven by the same
 * ticker ScrollTrigger already uses, so a link click can't fight a
 * pinned section's scrub the way native smooth-scroll could.
 */
export function setupSmoothAnchors() {
  const { gsap } = useGsap();

  document.addEventListener("click", (e) => {
    const link = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="#"]');
    if (!link) return;
    const id = link.getAttribute("href")!.slice(1);
    if (!id) return;
    const target = document.getElementById(id);
    if (!target) return;

    e.preventDefault();

    if (prefersReducedMotion()) {
      target.scrollIntoView({ block: "start" });
      return;
    }

    gsap.to(window, {
      duration: 1,
      ease: "power2.inOut",
      scrollTo: { y: target, autoKill: true },
      overwrite: true,
    });
  });
}
