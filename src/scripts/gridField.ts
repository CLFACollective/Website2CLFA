/**
 * GridField — the graph ground used behind "Window A". Draws the grid
 * itself and lights one domino under the cursor (the cell you're over
 * plus one diagonal neighbour), which moves cell-to-cell rather than
 * leaving a trail. A per-pixel canvas job like BlingField, so it stays
 * a plain rAF loop rather than a GSAP tween.
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
  let alpha = 0, target = 0;
  let raf = 0, last = 0;

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
      ctx.globalAlpha = Math.max(0, Math.min(1, alpha)) * litAlpha;
      ctx.fillRect(cur.x * cfg.cell, cur.y * cfg.cell + off, cfg.cell, cfg.cell);
      ctx.fillRect((cur.x + cur.dx) * cfg.cell, (cur.y + cur.dy) * cfg.cell + off, cfg.cell, cfg.cell);
    }
    ctx.globalAlpha = 1;
  };

  const loop = (now: number) => {
    raf = 0;
    const dt = last ? now - last : 16;
    last = now;
    alpha += (target - alpha) * Math.min(1, dt / cfg.fade);
    draw();
    if (Math.abs(target - alpha) > 0.01) raf = requestAnimationFrame(loop);
    else last = 0;
  };
  const go = () => { if (!raf) { last = 0; raf = requestAnimationFrame(loop); } };

  const onMove = (e: PointerEvent) => {
    if (reduce) return;
    const r = canvas.getBoundingClientRect();
    const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    if (!inside) { target = 0; go(); return; }
    const cx = Math.floor((e.clientX - r.left) / cfg.cell);
    const cy = Math.floor((e.clientY - r.top - off) / cfg.cell);
    target = 1;
    if (!cur || cur.x !== cx || cur.y !== cy) {
      const d = diagFor(cx, cy);
      cur = { x: cx, y: cy, dx: d[0], dy: d[1] };
    }
    go();
  };

  const onScroll = () => { measureParallax(); draw(); };

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
    cancelAnimationFrame(raf);
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("scroll", onScroll);
    ro.disconnect();
  };
}
