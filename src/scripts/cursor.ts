import { gsap } from "gsap";

/** True if (x, y) falls within el's current on-screen circle — its
 *  rendered box (post-transform, via getBoundingClientRect) treated as
 *  a circle centred in that box. Used instead of a scroll-progress
 *  threshold so the swap tracks the actual growing/shrinking shape,
 *  not just "roughly when it's big." */
function withinCircle(el: Element, x: number, y: number): boolean {
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return false;
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  const radius = Math.min(r.width, r.height) / 2;
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= radius * radius;
}

/** What counts as "a link" for the cursor's hover ring. */
const RING_TARGETS = 'a[href], button, [role="button"], summary, label[for], [data-cursor="ring"]';

/**
 * PinkCursor — the fine-pointer replacement for the system cursor.
 *
 * The dot's position is smoothed with gsap.quickTo (a lightweight tween
 * bound directly to the transform, cheaper per-frame than a fresh
 * gsap.to() call on every mousemove). Colour still flips instantly
 * between pink and white depending on what's underneath, since that
 * should read as a hard swap, not a fade.
 */
export function mountPinkCursor() {
  if (typeof window === "undefined") return;
  if (!window.matchMedia("(pointer: fine)").matches) return;

  const dot = document.getElementById("pink-cursor");
  if (!dot) return;

  const setX = gsap.quickTo(dot, "x", { duration: 0.12, ease: "power3" });
  const setY = gsap.quickTo(dot, "y", { duration: 0.12, ease: "power3" });

  /* Hero only: the cursor stays pink by default and only inverts to
     white while it's actually over the pink flood circle (or the
     small prelude dot) — a geometric hit-test against those elements'
     live (scaled) circles, not the coarser "whole screen has gone
     pink" flag other fixed UI (the nav logo dot, the kickoff CTA)
     uses, since those don't move around the way a cursor does. */
  const heroFlood = document.querySelector<HTMLElement>("#hero .hcb__flood");
  const heroDot = document.querySelector<HTMLElement>("#hero .hcb__dot");

  const onMove = (e: MouseEvent) => {
    setX(e.clientX);
    setY(e.clientY);
    const under = document.elementFromPoint(e.clientX, e.clientY);

    let onInvert: boolean;
    if (under?.closest("#hero")) {
      const overFlood = !!heroFlood && withinCircle(heroFlood, e.clientX, e.clientY);
      const overDot =
        !!heroDot &&
        parseFloat(getComputedStyle(heroDot).opacity) > 0.01 &&
        withinCircle(heroDot, e.clientX, e.clientY);
      onInvert = overFlood || overDot;
    } else {
      onInvert = !!under?.closest('[data-cursor="invert"]');
    }
    dot.style.background = onInvert ? "#FFFCF5" : "#F06996";
    dot.style.setProperty("--ring", onInvert ? "rgba(254, 252, 244, .55)" : "rgba(240, 105, 150, .55)");

    // the hover affordance the system pointer would otherwise give: a ring
    // in the dot's own colour over any link or button (plus anything
    // opted in with data-cursor="ring") — see #pink-cursor.pink-cursor--ring
    // in PinkCursor.astro.
    dot.classList.toggle("pink-cursor--ring", !!under?.closest(RING_TARGETS));
  };

  window.addEventListener("mousemove", onMove);
}
