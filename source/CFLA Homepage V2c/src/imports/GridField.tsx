"use client";

/* ============================================================
   GridField — the graph ground, interactive, and still drifting.

   Draws the grid itself (so it replaces the CSS `gridfix` layer) and
   lights ONE domino under the cursor: the cell you're over plus one
   diagonal neighbour, connected at the corner — the arrangement in
   the comp. It moves with you cell to cell rather than leaving a
   trail. `trail` adds fading pairs behind if you want them back.

   The section's parallax survives: the grid, and the lit pair with
   it, drift vertically against the scroll exactly as the old CSS
   layer did. Pointer maths subtracts that offset, so the lit cells
   stay locked to the lines wherever the grid has drifted to.

   Measured from Section - WINDOW A:
     grid pitch  40px
     ground      #465F63
     lit cell    #527078  — a lift of about 30 (RGB distance) off the ground

   COLOUR: the lit cell defaults to the section's own text colour at 10%,
   which reproduces that lift on ANY ground rather than hard-coding one
   hex. Checked across all four:
       azure  #465F63 -> #586F72  delta 28
       forest #334338 -> #47564B  delta 33
       cream  #FFFCF5 -> #E9E6E0  delta 37
       charcoal #252525 -> #3B3B3A  delta 37
   Hard-coding azure would have read as delta 84 on the forest ground —
   blue blocks on green rather than a subtle lift.
   ============================================================ */

import { useEffect, useRef } from "react";

type Props = {
  className?: string;
  /** Grid pitch in px. The comp measures 40. */
  cell?: number;
  /** Fill for a lit cell. Leave unset to lift the ground with the
      section's own text colour — works on every background. */
  fill?: string;
  /** Strength of that lift when `fill` is unset. */
  fillOpacity?: number;
  /** Grid line colour. Defaults to the section's text colour, faint. */
  line?: string;
  lineOpacity?: number;
  /** Extra fading pairs behind the cursor. 0 = just the one. */
  trail?: number;
  /** Lifetime of a trailing pair, ms. */
  trailLife?: number;
  /** Fade in/out of the cursor pair, ms. */
  fade?: number;
  /** Vertical drift against the scroll, px. 0 disables. */
  parallax?: number;
};

export function GridField({
  className,
  cell = 40,
  fill,
  fillOpacity = 0.1,
  line,
  lineOpacity = 0.14,
  trail = 0,
  trailLife = 900,
  fade = 260,
  parallax = 40,
}: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const parentColor =
      (canvas.parentElement ? getComputedStyle(canvas.parentElement).color : "") || "#FFFCF5";
    const ink = line || parentColor;
    /* no explicit fill -> lift the ground with the section's text colour */
    const litColor = fill || parentColor;
    const litAlpha = fill ? 1 : fillOpacity;

    type Pair = { x: number; y: number; dx: number; dy: number; t: number };
    let w = 0, h = 0, off = 0;
    let cur: Pair | null = null;          // the pair under the cursor
    let ghosts: Pair[] = [];              // optional trail
    let alpha = 0, target = 0;            // cursor pair fade
    let raf = 0, last = 0;

    /* deterministic diagonal, so a wobble across a boundary and back
       doesn't reshuffle which neighbour lights */
    const diagFor = (x: number, y: number) => {
      const k = (Math.abs(x * 73856093 ^ y * 19349663) >>> 0) % 4;
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
      if (!parallax) { off = 0; return; }
      const r = canvas.getBoundingClientRect();
      const vh = window.innerHeight;
      const p = (vh / 2 - (r.top + r.height / 2)) / (vh / 2 + r.height / 2);
      off = Math.max(-1, Math.min(1, p)) * parallax;
    };

    const draw = (now: number) => {
      ctx.clearRect(0, 0, w, h);

      /* grid lines, shifted by the drift. Verticals don't move; the
         horizontals slide and wrap so the grid never runs out. */
      ctx.globalAlpha = lineOpacity;
      ctx.strokeStyle = ink;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0.5; x <= w; x += cell) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
      const startY = (((off % cell) + cell) % cell) + 0.5;
      for (let y = startY - cell; y <= h + cell; y += cell) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
      ctx.stroke();

      ctx.fillStyle = litColor;
      const cellAt = (p: Pair, a: number) => {
        ctx.globalAlpha = Math.max(0, Math.min(1, a)) * litAlpha;
        ctx.fillRect(p.x * cell, p.y * cell + off, cell, cell);
        ctx.fillRect((p.x + p.dx) * cell, (p.y + p.dy) * cell + off, cell, cell);
      };
      for (const g of ghosts) cellAt(g, 1 - (now - g.t) / trailLife);
      if (cur) cellAt(cur, alpha);
      ctx.globalAlpha = 1;
    };

    const loop = (now: number) => {
      raf = 0;
      const dt = last ? now - last : 16;
      last = now;
      alpha += (target - alpha) * Math.min(1, dt / fade);
      if (trail) ghosts = ghosts.filter((g) => now - g.t < trailLife);
      draw(now);
      if (Math.abs(target - alpha) > 0.01 || ghosts.length) raf = requestAnimationFrame(loop);
      else last = 0;
    };
    const go = () => { if (!raf) { last = 0; raf = requestAnimationFrame(loop); } };

    const onMove = (e: PointerEvent) => {
      if (reduce) return;
      const r = canvas.getBoundingClientRect();
      const inside =
        e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (!inside) { target = 0; go(); return; }
      const cx = Math.floor((e.clientX - r.left) / cell);
      const cy = Math.floor((e.clientY - r.top - off) / cell);   // undo the drift
      target = 1;
      if (!cur || cur.x !== cx || cur.y !== cy) {
        if (trail && cur) {
          ghosts.push({ ...cur, t: performance.now() });
          if (ghosts.length > trail) ghosts.shift();
        }
        const d = diagFor(cx, cy);
        cur = { x: cx, y: cy, dx: d[0], dy: d[1], t: performance.now() };
      }
      go();
    };

    const onScroll = () => { measureParallax(); draw(performance.now()); };

    let lastW = 0, lastH = 0;
    const onResize = () => {
      const r = canvas.getBoundingClientRect();
      if (Math.abs(r.width - lastW) < 1 && Math.abs(r.height - lastH) < 1) return;
      lastW = r.width; lastH = r.height;
      size(); measureParallax(); draw(performance.now());
    };

    size(); measureParallax(); draw(performance.now());
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
  }, [cell, fill, fillOpacity, line, lineOpacity, trail, trailLife, fade, parallax]);

  return (
    <canvas
      ref={ref}
      className={className}
      aria-hidden="true"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 0 }}
    />
  );
}
