import { gsap } from "gsap";

/**
 * GridField — the graph ground used behind "Window A". Draws the grid
 * itself and lights one domino under the cursor (the cell you're over
 * plus one diagonal neighbour), which moves cell-to-cell rather than
 * leaving a trail. It's a per-pixel canvas job (there's no DOM/CSS
 * property to hand a mask/opacity to), so the actual redraw always has
 * to happen in a plain callback — but the fade itself (the lit domino's
 * alpha easing toward 0 or 1) is now a GSAP tween of a plain object
 * (`gsap.to(state, { alpha, onUpdate: draw })`), not a hand-rolled
 * requestAnimationFrame + manual lerp loop. GSAP's own ticker drives
 * the onUpdate calls, so this no longer runs its own frame loop at all.
 *
 * Ported from the React GridField component.
 */

export type GridFieldOptions = {
  cell?: number;
  fill?: string;
  fillOpacity?: number;
  line?: string;
  lineOpacity?: number;
  fade?: number;
  parallax?: number;
};

const DEFAULTS: Required<GridFieldOptions> = {
  cell: 32,
  fill: "",
  fillOpacity: 0.1,
  line: "",
  lineOpacity: 0.1,
  fade: 260,
  parallax: 160,
};

export function mountGridField(canvas: HTMLCanvasElement, options: GridFieldOptions = {}) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};
  const cfg = { ...DEFAULTS, ...options };

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const parentColor = (canvas.parentElement ? getComputedStyle(canvas.parentElement).color : "") || "#FFFCF5";
  const ink = cfg.line || parentColor;
  const litColor = cfg.fill || parentColor;
  const litAlpha = cfg.fill ? 1 : cfg.fillOpacity;

  type Pair = { x: number; y: number; dx: number; dy: number };
  let w = 0, h = 0, off = 0;
  let cur: Pair | null = null;
  let target = 0;
  const fade = { alpha: 0 };

  const diagFor = (x: number, y: number) => {
    const k = Math.abs(x * 7 + y * 13 + x * y * 3) % 4;
    return [[1, 1], [1, -1], [-1, 1], [-1, -1]][k];
  };

  const size = () => {
    const r = canvas.getBoundingClientRect();
    w = Math.max(1, r.width); h = Math.max(1, r.height);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  const measureParallax = () => {
    if (!cfg.parallax) { off = 0; return; }
    const r = canvas.getBoundingClientRect();
    const vh = window.innerHeight;
    const p = (vh / 2 - (r.top + r.height / 2)) / (vh / 2 + r.height / 2);
    off = Math.max(-1, Math.min(1, p)) * cfg.parallax;
  };

  const draw = () => {
    ctx.clearRect(0, 0, w, h);

    ctx.globalAlpha = cfg.lineOpacity;
    ctx.strokeStyle = ink;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0.5; x <= w; x += cfg.cell) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
    const startY = (((off % cfg.cell) + cfg.cell) % cfg.cell) + 0.5;
    for (let y = startY - cfg.cell; y <= h + cfg.cell; y += cfg.cell) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
    ctx.stroke();

    ctx.fillStyle = litColor;
    if (cur) {
      ctx.globalAlpha = Math.max(0, Math.min(1, fade.alpha)) * litAlpha;
      ctx.fillRect(cur.x * cfg.cell, cur.y * cfg.cell + off, cfg.cell, cfg.cell);
      ctx.fillRect((cur.x + cur.dx) * cfg.cell, (cur.y + cur.dy) * cfg.cell + off, cfg.cell, cfg.cell);
    }
    ctx.globalAlpha = 1;
  };

  /* Retargets (and redraws) only when the on/off target actually flips
     — moving within the same lit cell shouldn't restart the fade tween
     on every mousemove, just redraw at the current alpha with the new
     cell position (handled below, outside this function). */
  const fadeTo = (next: number) => {
    if (next === target) return;
    target = next;
    gsap.to(fade, { alpha: target, duration: cfg.fade / 1000, ease: "power2.out", overwrite: true, onUpdate: draw });
  };

  const onMove = (e: PointerEvent) => {
    // touch delivers pointermove too (e.g. while swipe-scrolling past
    // this canvas), which would flicker the lit cell under a finger —
    // this effect is a cursor-follow decoration, mouse only.
    if (reduce || e.pointerType !== "mouse") return;
    const r = canvas.getBoundingClientRect();
    const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    if (!inside) { fadeTo(0); return; }
    const cx = Math.floor((e.clientX - r.left) / cfg.cell);
    const cy = Math.floor((e.clientY - r.top - off) / cfg.cell);
    if (!cur || cur.x !== cx || cur.y !== cy) {
      const d = diagFor(cx, cy);
      cur = { x: cx, y: cy, dx: d[0], dy: d[1] };
      draw(); // new cell, current alpha — redraw even if the fade itself doesn't need to restart
    }
    fadeTo(1);
  };

  /* Native `scroll` events can fire far more often than the display can
     paint (especially momentum scrolling on iOS), and each one here was
     doing a layout read (measureParallax's getBoundingClientRect) plus
     a full canvas redraw — batch to at most one of those per frame. */
  let scrollRaf = 0;
  const onScroll = () => {
    if (scrollRaf) return;
    scrollRaf = requestAnimationFrame(() => {
      scrollRaf = 0;
      measureParallax();
      draw();
    });
  };

  let lastW = 0, lastH = 0;
  const onResize = () => {
    const r = canvas.getBoundingClientRect();
    if (Math.abs(r.width - lastW) < 1 && Math.abs(r.height - lastH) < 1) return;
    lastW = r.width; lastH = r.height;
    size(); measureParallax(); draw();
  };

  size(); measureParallax(); draw();
  window.addEventListener("pointermove", onMove, { passive: true });
  window.addEventListener("scroll", onScroll, { passive: true });
  const ro = new ResizeObserver(onResize);
  ro.observe(canvas);

  return () => {
    gsap.killTweensOf(fade);
    cancelAnimationFrame(scrollRaf);
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("scroll", onScroll);
    ro.disconnect();
  };
}
