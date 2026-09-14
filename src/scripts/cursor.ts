import { gsap } from "gsap";

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

  /* the hero's own pink bloom is the other case a pink dot disappears
     into its ground — same "clfa:hero-ground" signal the nav's logo
     dot and the sticky CTA both key off. */
  let onPinkGround = false;
  document.addEventListener("clfa:hero-ground", (e) => {
    onPinkGround = (e as CustomEvent<{ pink: boolean }>).detail.pink;
  });

  const onMove = (e: MouseEvent) => {
    setX(e.clientX);
    setY(e.clientY);
    const under = document.elementFromPoint(e.clientX, e.clientY);
    const onInvert = onPinkGround || !!under?.closest('[data-cursor="invert"]');
    dot.style.background = onInvert ? "#FFFCF5" : "#F06496";
  };

  window.addEventListener("mousemove", onMove);
}
