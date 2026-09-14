"use client";

/* ============================================================
   BlingField — the shimmer layer.

   Bling.svg has opacity baked into each of its 5,655 paths, so as a
   CSS mask it can only sit there. This regenerates the field from its
   measured structure so every dot twinkles on its own clock, and adds
   the vertical falloff the SVG doesn't have.

   Measured from Bling.svg (1306 x 391):
     • dots sit on an ~8.5px LATTICE, not scattered at random
     • 5,655 dots, density flat top to bottom
     • size    0.05 – 4px, mean 1.1px
     • opacity 0.50 – 0.94, mean 0.72

   Colour defaults to the section's own text colour, so it lands right
   on a cream ground and on a dark one without being told.
   ============================================================ */

import { useEffect, useRef } from "react";

type Props = {
  className?: string;
  /** Lattice pitch in px. Bling.svg measures ~8.5. */
  spacing?: number;
  /** Chance a lattice cell holds a dot, before falloff. */
  fill?: number;
  /** Position jitter as a fraction of spacing. 0 = rigid grid. */
  jitter?: number;
  /** Largest dot in px. */
  size?: number;
  /** Falloff start / end as a fraction of height. fadeTo={2} disables. */
  fadeFrom?: number;
  fadeTo?: number;
  /** Seconds per twinkle cycle. */
  cycle?: number;
  /** Drift against the scroll in px. 0 disables. */
  parallax?: number;
  /** Defaults to the parent's computed text colour. */
  color?: string;
  /** Ceiling, so a tall section stays cheap. */
  maxDots?: number;
};

export function BlingField({
  className,
  spacing = 8.5,
  fill = 0.85,
  jitter = 0.3,
  size = 3,
  fadeFrom = 0.02,
  fadeTo = 0.62,
  cycle = 5.5,
  parallax = 40,
  color,
  maxDots = 9000,
}: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // inherit the section's text colour unless told otherwise
    const ink =
      color ||
      (canvas.parentElement ? getComputedStyle(canvas.parentElement).color : "") ||
      "#232323";

    type Dot = { x: number; y: number; s: number; a: number; phase: number; speed: number };
    let dots: Dot[] = [];
    let w = 0, h = 0, raf = 0, off = 0;
    let inView = true, dead = false;
    const t0 = performance.now();

    const smoothstep = (a: number, b: number, x: number) => {
      if (b <= a) return x < a ? 0 : 1;
      const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
      return t * t * (3 - 2 * t);
    };

    const build = () => {
      const r = canvas.getBoundingClientRect();
      w = Math.max(1, r.width);
      h = Math.max(1, r.height);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      dots = [];
      const cols = Math.ceil(w / spacing) + 1;
      const rows = Math.ceil((h + parallax * 2) / spacing) + 1;
      for (let r_ = 0; r_ < rows; r_++) {
        for (let c = 0; c < cols; c++) {
          if (dots.length >= maxDots) break;
          const gy = r_ * spacing - parallax;          // overscan for the drift
          // vertical falloff: full at the top, gone by fadeTo
          const falloff = 1 - smoothstep(fadeFrom, fadeTo, gy / h);
          if (falloff <= 0.001) continue;
          if (Math.random() > fill * falloff) continue;
          dots.push({
            x: c * spacing + (Math.random() - 0.5) * spacing * jitter,
            y: gy + (Math.random() - 0.5) * spacing * jitter,
            s: 0.5 + Math.random() * Math.random() * size,   // skewed small, like the source
            a: (0.5 + Math.random() * 0.44) * falloff,        // 0.50 – 0.94, faded
            phase: Math.random() * Math.PI * 2,
            speed: 0.6 + Math.random() * 0.9,                 // its own clock
          });
        }
      }
    };

    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = ink;
      const time = (t - t0) / 1000;
      for (const d of dots) {
        const pulse = reduce
          ? 1
          : 0.65 + 0.35 * Math.sin((time / cycle) * Math.PI * 2 * d.speed + d.phase);
        ctx.globalAlpha = d.a * pulse;
        ctx.fillRect(d.x, d.y + off, d.s, d.s);
      }
      ctx.globalAlpha = 1;
    };

    const loop = (t: number) => {
      raf = 0;
      if (dead || !inView) return;
      draw(t);
      if (!reduce) raf = requestAnimationFrame(loop);
    };
    const go = () => { if (!raf && !dead && inView) raf = requestAnimationFrame(loop); };

    const onScroll = () => {
      if (!parallax) { off = 0; return; }
      const r = canvas.getBoundingClientRect();
      const vh = window.innerHeight;
      const p = (vh / 2 - (r.top + r.height / 2)) / (vh / 2 + r.height / 2);
      off = Math.max(-1, Math.min(1, p)) * parallax;
      if (reduce) draw(performance.now());
    };
    /* Only rebuild when the CSS box genuinely changed. Without this, setting
       canvas.width can feed back into layout and the observer loops. */
    let lastW = 0, lastH = 0;
    const onResize = () => {
      const r = canvas.getBoundingClientRect();
      if (Math.abs(r.width - lastW) < 1 && Math.abs(r.height - lastH) < 1) return;
      lastW = r.width; lastH = r.height;
      build(); onScroll(); draw(performance.now());
    };

    build(); onScroll(); draw(performance.now()); go();

    const io = new IntersectionObserver((e) => {
      inView = e[0]?.isIntersecting ?? true;
      if (inView) go();
      else if (raf) { cancelAnimationFrame(raf); raf = 0; }
    });
    io.observe(canvas);
    const ro = new ResizeObserver(onResize);
    ro.observe(canvas);
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      dead = true;
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  }, [spacing, fill, jitter, size, fadeFrom, fadeTo, cycle, parallax, color, maxDots]);

  return (
    <canvas
      ref={ref}
      className={className}
      aria-hidden="true"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 0 }}
    />
  );
}
