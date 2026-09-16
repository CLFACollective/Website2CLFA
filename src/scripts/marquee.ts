import { useGsap, prefersReducedMotion } from "./gsapSetup";

/**
 * Infinite horizontal marquees (the Ribbons band and the client
 * LogoScroller). Each track renders its content twice back-to-back, so
 * a linear tween from xPercent 0 to -50 loops seamlessly — the GSAP
 * equivalent of the original's `@keyframes` loop, but consistent with
 * the rest of the site's GSAP-driven motion and easy to pause on hover.
 *
 * repeat:-1 means every track (3 in Ribbons, 2 in LogoScroller — 5
 * sitewide) would otherwise keep animating for the rest of the page's
 * lifetime once mounted, regardless of whether it's anywhere near the
 * viewport — the same unbounded-background-work issue ShineField had.
 * An IntersectionObserver per track pauses it once scrolled out of
 * view and resumes it (from wherever it left off) once back near the
 * viewport, same pattern, same 200px rootMargin.
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

    let hovered = false;
    let visible = true;
    const sync = () => { if (visible && !hovered) tween.play(); else tween.pause(); };

    if (opts.pauseOnHover) {
      const host = track.closest<HTMLElement>(".lsc") ?? track;
      host.addEventListener("mouseenter", () => { hovered = true; sync(); });
      host.addEventListener("mouseleave", () => { hovered = false; sync(); });
    }

    const io = new IntersectionObserver(
      ([entry]) => { visible = entry.isIntersecting; sync(); },
      { rootMargin: "200px 0px" },
    );
    io.observe(track);
  });
}
