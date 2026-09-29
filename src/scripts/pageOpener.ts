import { useGsap, prefersReducedMotion } from "./gsapSetup";

/**
 * The dark teal opener shared by What We Do / About / FAQs / Contact:
 * a dotted ground that drifts slowly against the scroll as the opener
 * passes, and its headline lines rising in, staggered, on arrival.
 *
 * Ported from the Figma source's per-page rAF scroll handler + a
 * setTimeout-flipped data-in flag — this is the GSAP equivalent: a
 * scrubbed ScrollTrigger for the ground, a plain load-time timeline
 * for the reveal (the opener is always above the fold when its page
 * loads, so there's no need for IntersectionObserver here).
 */
export function setupPageOpener(section: HTMLElement) {
  const unit = () => section.style.setProperty("--u", `${section.clientWidth / 1920}px`);
  const ro = new ResizeObserver(unit);
  ro.observe(section);
  unit();

  const ground = section.querySelector<HTMLElement>(".opener__ground");
  const lines = Array.from(section.querySelectorAll<HTMLElement>(".opener__line"));
  const { gsap, ScrollTrigger } = useGsap();

  if (prefersReducedMotion()) {
    gsap.set(lines, { opacity: 1, y: 0 });
    return;
  }

  /* one frame's grace so the pre-state (opacity:0, baked into CSS)
     paints first — otherwise the lines can already be up before the
     browser has committed a frame for the transition to run from. */
  gsap.delayedCall(0.05, () => {
    gsap.timeline().to(lines, { opacity: 1, y: 0, duration: 0.9, ease: "power3.out", stagger: 0.13 });
  });

  if (ground) {
    const setOut = gsap.quickSetter(ground, "--out") as (v: number) => void;
    ScrollTrigger.create({
      trigger: section,
      start: "top top",
      end: "bottom top",
      scrub: true,
      onUpdate: (self) => setOut(self.progress),
    });
  }
}
