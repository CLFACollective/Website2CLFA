import { useGsap, prefersReducedMotion } from "./gsapSetup";

/**
 * Momentum — the pinned section that holds full-screen while its track
 * of stat/quote panels pans horizontally. The pin itself is exactly
 * pinProgress() from the original build (a ratio of the section's own
 * height to the viewport), so ScrollTrigger's own 0..1 progress against
 * this section IS that value — no separate rAF scroll listener needed.
 *
 * Below 800px there's no pin at all — the section is a normal in-flow
 * block and the track is a plain horizontally-swipeable strip (native
 * overflow-x, see the CSS). Crossing the breakpoint just kills/creates
 * the ScrollTrigger in place rather than reloading the page — a resized
 * window or a rotated tablet shouldn't lose scroll position.
 */
export function setupMomentum() {
  const section = document.getElementById("momentum");
  const track = document.getElementById("hsTrack");
  if (!section || !track || prefersReducedMotion()) return;

  const { gsap, ScrollTrigger } = useGsap();
  const mobileQuery = window.matchMedia("(max-width: 799px)");
  let trigger: ReturnType<typeof ScrollTrigger.create> | null = null;

  const enablePin = () => {
    const setX = gsap.quickSetter(track, "x", "px") as (v: number) => void;
    trigger = ScrollTrigger.create({
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
  };

  const disablePin = () => {
    trigger?.kill();
    trigger = null;
    gsap.set(track, { clearProps: "transform" }); // drop the inline x so native overflow-x scroll starts clean
  };

  if (!mobileQuery.matches) enablePin();

  mobileQuery.addEventListener("change", (e) => { if (e.matches) disablePin(); else enablePin(); });
}
