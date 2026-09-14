import { useGsap, prefersReducedMotion } from "./gsapSetup";

/**
 * Infinite horizontal marquees (the Ribbons band and the client
 * LogoScroller). Each track renders its content twice back-to-back, so
 * a linear tween from xPercent 0 to -50 loops seamlessly — the GSAP
 * equivalent of the original's `@keyframes` loop, but consistent with
 * the rest of the site's GSAP-driven motion and easy to pause on hover.
 */
export function setupMarquees(selector: string, opts: { pauseOnHover?: boolean } = {}) {
  if (prefersReducedMotion()) return;
  const { gsap } = useGsap();

  document.querySelectorAll<HTMLElement>(`${selector}:not([data-marquee-mounted])`).forEach((track) => {
    track.dataset.marqueeMounted = "true";
    const seconds = Number(track.dataset.seconds) || 30;
    const reverse = track.dataset.reverse === "true";

    const tween = gsap.fromTo(
      track,
      { xPercent: reverse ? -50 : 0 },
      { xPercent: reverse ? 0 : -50, duration: seconds, ease: "none", repeat: -1 },
    );

    if (opts.pauseOnHover) {
      const host = track.closest<HTMLElement>(".lsc") ?? track;
      host.addEventListener("mouseenter", () => tween.pause());
      host.addEventListener("mouseleave", () => tween.resume());
    }
  });
}
