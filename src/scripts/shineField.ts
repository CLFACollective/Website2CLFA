import { useGsap, prefersReducedMotion } from "./gsapSetup";

/**
 * Drives the two "hide" bands for every ShineField instance on the page
 * — one sweeping left-to-right (--band), one sweeping top-to-bottom
 * (--band-y). Both live on .shine-wrap itself and feed a single
 * multi-layer mask-image there (see ShineField.astro — this used to be
 * two nested masked elements, replaced after one of them was confirmed
 * as a real iPad crash source). Both are plain CSS custom properties;
 * this just tweens the numbers, slow and linear, looping forever,
 * independently per instance (not synced to each other or to the other
 * instance).
 *
 * Every instance also carries ~30 sparkling squares (see ShineField.astro's
 * .shine-sparkle), each its own infinite CSS animation.
 *
 * None of that is cheap to keep animating — a multi-stop calc()
 * gradient mask recalculated every tick, on top of ~60 infinite CSS
 * animations sitewide (two instances) — and none of it was ever
 * pausing once mounted, running the full lifetime of the page
 * regardless of scroll position (confirmed live: still ticking with
 * both sections scrolled completely out of view). On lower-end mobile
 * hardware that's sustained, unnecessary GPU/CPU work for however long
 * the tab stays open. An IntersectionObserver pauses both the GSAP
 * tweens and the CSS animations (via a class toggle, cheaper than
 * pausing 30 Animation objects individually) whenever a field's
 * section scrolls out of view, and resumes them (from wherever they
 * left off — GSAP tweens and CSS animations both preserve position
 * across pause/resume) once it's back near the viewport.
 */
export function setupShineField() {
  const wraps = document.querySelectorAll<HTMLElement>(".shine-wrap:not([data-mounted])");
  if (!wraps.length) return;

  const reduce = prefersReducedMotion();
  const { gsap } = useGsap();

  wraps.forEach((wrap) => {
    wrap.dataset.mounted = "true";
    if (reduce) return; // resting state (bands off-screen, nothing hidden) is already the CSS default

    const bandTween = gsap.fromTo(
      wrap,
      { "--band": "-20%" },
      { "--band": "120%", duration: 24, ease: "none", repeat: -1 },
    );

    // Travels only through the field's own visible top-30% band (see
    // .shine-wrap's height-fade mask layer) rather than the full 0-100%
    // range — -20% to 40% clears the top edge and reaches just past
    // 30% with room for its own feather.
    const bandYTween = gsap.fromTo(
      wrap,
      { "--band-y": "-20%" },
      { "--band-y": "40%", duration: 24, ease: "none", repeat: -1 },
    );

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          bandTween.play();
          bandYTween.play();
          wrap.classList.remove("is-offscreen");
        } else {
          bandTween.pause();
          bandYTween.pause();
          wrap.classList.add("is-offscreen");
        }
      },
      { rootMargin: "200px 0px" },
    );
    io.observe(wrap);
  });
}
