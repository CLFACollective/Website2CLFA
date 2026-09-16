/**
 * The faint twinkling dust that drifts over a pinned section — Day One
 * and Momentum each get their own instance, contained the same way
 * ShineField is (position:absolute inside that section's own sticky
 * stage), not one global overlay spanning the whole page. A one-time
 * DOM seed of ~22 dots per instance; the twinkle itself is a CSS
 * @keyframes loop (see .shimmer i in global.css) — cheap enough at this
 * count that spinning up individual GSAP tweens would only add
 * overhead for no visible benefit.
 *
 * Same unbounded-background-work issue ShineField's sweep bands and
 * sparkle squares had, fixed the same way: each instance's 22 CSS
 * `infinite` animations would otherwise keep running for the rest of
 * the page's lifetime regardless of whether that section is anywhere
 * near the viewport. An IntersectionObserver per instance pauses them
 * (via a class toggling animation-play-state, cheaper than pausing 22
 * Animation objects individually) once scrolled out of view.
 */
export function setupShimmer() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  document.querySelectorAll<HTMLElement>(".shimmer:not([data-mounted])").forEach((host) => {
    host.dataset.mounted = "true";
    for (let i = 0; i < 22; i++) {
      const dot = document.createElement("i");
      dot.style.left = `${(Math.random() * 100).toFixed(2)}%`;
      dot.style.top = `${(Math.random() * 100).toFixed(2)}%`;
      dot.style.animationDelay = `${(Math.random() * 5.5).toFixed(2)}s`;
      dot.style.color = Math.random() > 0.8 ? "var(--pink)" : "var(--fg)";
      host.appendChild(dot);
    }

    const io = new IntersectionObserver(
      ([entry]) => host.classList.toggle("is-offscreen", !entry.isIntersecting),
      { rootMargin: "200px 0px" },
    );
    io.observe(host);
  });
}
