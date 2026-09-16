import { useGsap, prefersReducedMotion } from "./gsapSetup";

/**
 * The divider line before each panel (see .hs__panel + .hs__panel::before
 * in global.css) needs to span exactly from the panel's own first bit of
 * content (the little rule above the stat, or the quote block's own top)
 * down to its last (the description line, or the attribution) — not the
 * panel's full height, which is taller than its content since the panel
 * itself is vertically centred within the track. That content height is
 * fluid (clamp()-based type, wrapping that varies with width), so it's
 * measured off the live layout rather than hard-coded, and re-measured
 * on resize/font-load the same way hero.ts's --solve-fit is.
 */
function setupMomentumDividers() {
  const panels = Array.from(document.querySelectorAll<HTMLElement>(".hs__panel"));
  if (!panels.length) return;

  const measure = () => {
    panels.forEach((panel) => {
      const first = panel.firstElementChild as HTMLElement | null;
      const last = panel.lastElementChild as HTMLElement | null;
      if (!first || !last) return;
      const panelRect = panel.getBoundingClientRect();
      const topRect = first.getBoundingClientRect();
      const bottomRect = last.getBoundingClientRect();
      panel.style.setProperty("--divider-top", `${(topRect.top - panelRect.top).toFixed(1)}px`);
      panel.style.setProperty("--divider-bottom", `${(panelRect.bottom - bottomRect.bottom).toFixed(1)}px`);
    });
  };

  measure();
  document.fonts?.ready.then(measure).catch(() => {});
  const ro = new ResizeObserver(measure);
  panels.forEach((p) => ro.observe(p));
}

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
  setupMomentumDividers();

  const section = document.getElementById("momentum");
  const track = document.getElementById("hsTrack");
  if (!section || !track || prefersReducedMotion()) return;

  const { gsap, ScrollTrigger } = useGsap();
  const setX = gsap.quickSetter(track, "x", "px") as (v: number) => void;

  /* .hs__track's will-change:transform (see global.css) is necessary
     while it's actually panning, but once this section is scrolled
     past, a browser will otherwise keep it composited/promoted — a
     genuinely large layer (the full 4-panel track width x the pinned
     stage height) — for the rest of the page's lifetime, since
     nothing ever tells it the pan is done. Dropped on leaving,
     restored on scrolling back up. */
  const setLayer = (on: boolean) => { track.style.willChange = on ? "" : "auto"; };

  ScrollTrigger.create({
    trigger: section,
    start: "top top",
    end: "bottom bottom",
    scrub: true,
    onLeave: () => setLayer(false),
    onEnterBack: () => setLayer(true),
    onUpdate: (self) => {
      const pp = Math.min(1, Math.max(0, (self.progress - 0.1) / 0.9));
      const dist = track.scrollWidth - window.innerWidth;
      setX(dist > 0 ? -dist * pp : 0);
    },
  });
}
