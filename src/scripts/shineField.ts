import { useGsap, prefersReducedMotion } from "./gsapSetup";

/**
 * Drives the two "hide" bands for every ShineField instance on the page
 * — one sweeping left-to-right (--band, read by .shine-field's mask),
 * one sweeping top-to-bottom (--band-y, read by .shine-band-y's mask,
 * a separate nested element so the two bands' dimming intersects rather
 * than cancelling — see the comment above .shine-band-y in
 * ShineField.astro). Both are plain CSS custom properties; this just
 * tweens the numbers, slow and linear, looping forever, independently
 * per instance (not synced to each other or to the other instance).
 *
 * Every instance also carries ~30 sparkling squares (see ShineField.astro's
 * .shine-sparkle), each its own infinite CSS animation.
 *
 * None of that is cheap to keep animating — two elements masked with
 * multi-stop calc() gradients recalculated every tick, on top of ~60
 * infinite CSS animations sitewide (two instances) — and none of it was
 * ever pausing once mounted, running the full lifetime of the page
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

    const bandY = wrap.querySelector<HTMLElement>(".shine-band-y");
    const bandYTween = bandY
      ? gsap.fromTo(
          bandY,
          // Travels only through the field's own visible top-30% band
          // (see .shine-wrap's height-fade mask) rather than the full
          // .shine-band-y[--band] range — -20% to 40% clears the top
          // edge and reaches just past 30% with room for its own
          // feather.
          { "--band-y": "-20%" },
          { "--band-y": "40%", duration: 24, ease: "none", repeat: -1 },
        )
      : null;

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          bandTween.play();
          bandYTween?.play();
          wrap.classList.remove("is-offscreen");
        } else {
          bandTween.pause();
          bandYTween?.pause();
          wrap.classList.add("is-offscreen");
        }
      },
      { rootMargin: "200px 0px" },
    );
    io.observe(wrap);
  });
}
