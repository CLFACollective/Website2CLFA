import { useGsap, prefersReducedMotion } from "./gsapSetup";

/**
 * Momentum — the pinned section that holds full-screen while its track
 * of stat/quote panels pans horizontally, on every viewport width
 * including mobile. The pin itself is exactly pinProgress() from the
 * original build (a ratio of the section's own height to the
 * viewport), so ScrollTrigger's own 0..1 progress against this section
 * IS that value — no separate rAF scroll listener needed. The pin
 * "sticks" via plain CSS (`.pin__stage { position: sticky }`); this
 * just tracks scroll progress through the section to drive the track's
 * horizontal x.
 */
export function setupMomentum() {
  const section = document.getElementById("momentum");
  const track = document.getElementById("hsTrack");
  if (!section || !track || prefersReducedMotion()) return;

  const { gsap, ScrollTrigger } = useGsap();
  const setX = gsap.quickSetter(track, "x", "px") as (v: number) => void;

  ScrollTrigger.create({
    trigger: section,
    start: "top top",
    end: "bottom bottom",
    scrub: true,
    onUpdate: (self) => {
      const pp = Math.min(1, Math.max(0, (self.progress - 0.1) / 0.9));
      const dist = track.scrollWidth - window.innerWidth;
      setX(dist > 0 ? -dist * pp : 0);
    },
  });
}
