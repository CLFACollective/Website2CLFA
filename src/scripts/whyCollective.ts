import { useGsap, prefersReducedMotion } from "./gsapSetup";

/**
 * The "Why a collective?" → "The result" swap closing About. The arch
 * is scroll-driven, not a one-shot: on a landscape-ish frame the pin
 * frame (.abt__why-pin, CSS position:sticky) holds while its parent
 * (.abt__why, --track tall) scrolls underneath it, and the whole rise
 * is spent over that run — you arrive, the copy sits still and
 * legible for a beat before anything moves. On a portrait/phone frame
 * a full-height pin would be mostly empty cream, so the arch-height
 * frame pins vertically centred instead, over a shorter run.
 *
 * scrub:true ties --in directly to scroll position with no JS-side
 * damping — the CSS transitions already on .abt__arch/.abt__result
 * (see WhyCollective.astro) are what take the notch out of a wheel
 * tick, same as the reference build.
 *
 * HOLD_IN/HOLD_OUT carve dead zones at each end of the run: the first
 * is the point (arrive, and the copy sits still before the arch
 * starts climbing); RES_START/RES_SPAN delay the cream "result" copy
 * until the rising edge has actually covered the heading behind it —
 * any earlier and the two headings are legible at once, which reads
 * as a crossfade instead of one thing replacing another.
 */
// a real beat: the copy sits still for 30% of the run before the arch
// starts climbing (feedback: it was covered before anyone could read it)
const HOLD_IN = 0.3;
const HOLD_OUT = 0.86;
const RES_START = 0.58;
const RES_SPAN = 0.34;
const PINNED_QUERY = "(min-width: 641px) and (min-aspect-ratio: 7/5)";

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smoothstep = (p: number) => {
  const c = clamp01(p);
  return c * c * (3 - 2 * c);
};

export function setupWhyCollective() {
  const section = document.querySelector<HTMLElement>("[data-page-why]");
  if (!section) return;

  if (prefersReducedMotion()) {
    section.style.setProperty("--in", "1");
    section.style.setProperty("--res", "1");
    return;
  }

  const { gsap, ScrollTrigger } = useGsap();
  const setIn = gsap.quickSetter(section, "--in") as (v: number) => void;
  const setRes = gsap.quickSetter(section, "--res") as (v: number) => void;
  const pinnedQuery = window.matchMedia(PINNED_QUERY);

  const onUpdate = (self: { progress: number }) => {
    const eased = smoothstep((self.progress - HOLD_IN) / (HOLD_OUT - HOLD_IN));
    setIn(eased);
    setRes(clamp01((eased - RES_START) / RES_SPAN));
  };

  /* Portrait/phone: a short pin — the frame sticks vertically centred
     (see the component's CSS) for --run of scroll, and the whole run is
     spent there. Measured off the section rather than the sticky
     frame, whose own position moves while it sticks. */
  const pinEl = section.querySelector<HTMLElement>("[data-why-pin]")!;
  const shortPin = () => {
    const padTop = parseFloat(getComputedStyle(section).paddingTop);
    const stickyTop = (window.innerHeight - pinEl.offsetHeight) / 2;
    return { top: stickyTop - padTop, run: section.clientHeight - padTop - pinEl.offsetHeight };
  };

  let trigger: ReturnType<typeof ScrollTrigger.create> | null = null;
  function build() {
    trigger?.kill();
    const pinned = pinnedQuery.matches;
    trigger = ScrollTrigger.create({
      trigger: section,
      start: pinned ? "top top" : () => `top ${shortPin().top}px`,
      end: pinned ? "bottom bottom" : () => `+=${shortPin().run}`,
      scrub: true,
      onUpdate,
    });
  }
  build();

  /* Crossing the pinned/flow breakpoint changes which scroll range
     the math is measured against entirely (a resize alone doesn't),
     so the trigger is rebuilt from scratch rather than just refreshed. */
  pinnedQuery.addEventListener("change", build);
  window.addEventListener("resize", () => ScrollTrigger.refresh());
}
