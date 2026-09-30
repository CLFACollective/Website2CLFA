import { useGsap, prefersReducedMotion } from "./gsapSetup";

/**
 * The "Why a collective?" → "The result" swap closing About. The arch
 * is scroll-driven, not a one-shot: on a landscape-ish frame the pin
 * frame (.abt__why-pin, CSS position:sticky) holds while its parent
 * (.abt__why, --track tall) scrolls underneath it, and the whole rise
 * is spent over that run — you arrive, the copy sits still and
 * legible for most of a screen before anything moves. On a portrait/
 * phone frame there's no tall track to pin against (see the
 * component's own media query), so the same math runs off the
 * section's own pass through the viewport instead.
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
const HOLD_IN = 0.16;
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

  let trigger: ReturnType<typeof ScrollTrigger.create> | null = null;
  function build() {
    trigger?.kill();
    const pinned = pinnedQuery.matches;
    trigger = ScrollTrigger.create({
      trigger: section,
      start: pinned ? "top top" : "top bottom",
      /* Flow mode (unpinned) finishes at "bottom center", not
         "bottom top" — a section near the foot of a short page can
         have too little scrollable room below it for its own bottom
         edge to ever reach the viewport's top, which left the arch
         stranded mid-rise and "The result" never fully revealed
         (confirmed live on a tablet-width, short-page layout: the
         page's real max scroll capped self.progress well short of
         1). "bottom center" mirrors the original source's own
         unpinned formula — (vh - r.top) / (vh*0.5 + r.height) reaches
         1 exactly when the section's bottom hits the viewport's
         vertical centre — a shorter, always-reachable run regardless
         of how little page remains below the section. */
      end: pinned ? "bottom bottom" : "bottom center",
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
