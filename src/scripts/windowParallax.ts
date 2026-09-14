import { useGsap, prefersReducedMotion } from "./gsapSetup";

/**
 * A gentle parallax (-1..1) on any [data-win] frame as it crosses the
 * viewport, written to --pv and consumed by .win__copy's transform in
 * global.css.
 */
export function setupWindowParallax() {
  if (prefersReducedMotion()) return;
  const { gsap, ScrollTrigger } = useGsap();

  document.querySelectorAll<HTMLElement>("[data-win]").forEach((win) => {
    const setPv = gsap.quickSetter(win, "--pv") as (v: number) => void;
    ScrollTrigger.create({
      trigger: win,
      start: "top bottom",
      end: "bottom top",
      scrub: true,
      onUpdate: (self) => setPv((self.progress - 0.5) * 2),
    });
  });
}
