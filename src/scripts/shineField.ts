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
 */
export function setupShineField() {
  const wraps = document.querySelectorAll<HTMLElement>(".shine-wrap:not([data-mounted])");
  if (!wraps.length) return;

  const reduce = prefersReducedMotion();
  const { gsap } = useGsap();

  wraps.forEach((wrap) => {
    wrap.dataset.mounted = "true";
    if (reduce) return; // resting state (bands off-screen, nothing hidden) is already the CSS default

    gsap.fromTo(
      wrap,
      { "--band": "-20%" },
      { "--band": "120%", duration: 24, ease: "none", repeat: -1 },
    );

    const bandY = wrap.querySelector<HTMLElement>(".shine-band-y");
    if (bandY) {
      // Travels only through the field's own visible top-30% band
      // (see .shine-wrap's height-fade mask) rather than the full
      // .shine-band-y[--band] range — -20% to 40% clears the top edge
      // and reaches just past 30% with room for its own feather.
      gsap.fromTo(
        bandY,
        { "--band-y": "-20%" },
        { "--band-y": "40%", duration: 24, ease: "none", repeat: -1 },
      );
    }
  });
}
