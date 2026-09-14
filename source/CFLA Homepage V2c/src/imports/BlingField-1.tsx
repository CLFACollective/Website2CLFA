"use client";

/* ============================================================
   BlingField — the shimmer layer.

   Bling.svg has opacity baked into each of its 5,655 paths, so as a
   CSS mask it can only sit there. This regenerates the field from its
   measured structure so a portion of the dots twinkle on their own
   clock, and adds the vertical falloff the SVG doesn't have.

   Measured from Bling.svg (1306 x 391):
     • dots sit on an ~8.5px LATTICE, not scattered at random
     • 5,655 dots, density flat top to bottom
     • size    0.05 – 4px, mean 1.1px
     • opacity 0.50 – 0.94, mean 0.72
     • they are SQUARES in the source — shape="circle" is a departure

   PERFORMANCE: static dots are painted once to an offscreen canvas and
   blitted each frame. Only the twinkling share is redrawn, which is what
   makes round dots affordable — arcs cost far more than fillRect.

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
  /** Round or square. The source art is square. */
  shape?: "circle" | "square";
  /** Falloff start / end as a fraction of height. fadeTo={2} disables. */
  fadeFrom?: number;
  fadeTo?: number;
  /** Seconds per twinkle cycle. Higher is slower and calmer. */
  cycle?: number;
  /** Fraction of dots that twinkle at all. The rest hold still. */
  twinkle?: number;
  /** A twinkling dot's floor, as a fraction of its own opacity. */
  dim?: number;
  /** How much a twinkling dot grows at peak. 1 = no growth. */
  pop?: number;
  /** Flash sharpness. Higher = briefer peak, longer rest between. */
  sharp?: number;
  /** Drift against the scroll in px. 0 disables. */
  parallax?: number;
  /** Defaults to the parent's computed text colour. */
  color?: string;
  /** Ceiling, so a tall section stays cheap. */
  maxDots?: number;
};

export function BlingField({
  className,
  spacing = 7.5,
  fill = 0.4,
  jitter = 0.7,
  size = 3,
  shape = "circle",
  fadeFrom = 0.02,
  fadeTo = 0.7,
  cycle = 5.5,
  twinkle = 0.22,
  dim = 0.45,
  pop = 1.6,
  sharp = 8,
  parallax = 75,
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
    const TAU = Math.PI * 2;

    const ink =
      color ||
      (canvas.parentElement ? getComputedStyle(canvas.parentElement).color : "") ||
      "#232323";

    type Dot = { x: number; y: number; s: number; a: number; phase: number; speed: number };
    let statics: Dot[] = [];
    let movers: Dot[] = [];
    let w = 0, h = 0, dpr = 1, raf = 0, off = 0;
    let inView = true, dead = false;
    let base: HTMLCanvasElement | null = null;   // pre-painted static layer
    const t0 = performance.now();

    const smoothstep = (a: number, b: number, x: number) => {
      if (b <= a) return x < a ? 0 : 1;
      const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
      return t * t * (3 - 2 * t);
    };

    const dab = (c: CanvasRenderingContext2D, x: number, y: number, s: number) => {
      if (shape === "square") { c.fillRect(x, y, s, s); return; }
      const r = s / 2;
      c.beginPath();
      c.arc(x + r, y + r, r, 0, TAU);
      c.fill();
    };

    const build = () => {
      const r = canvas.getBoundingClientRect();
      w = Math.max(1, r.width);
      h = Math.max(1, r.height);
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      statics = []; movers = [];
      const cols = Math.ceil(w / spacing) + 1;
      const rows = Math.ceil((h + parallax * 2) / spacing) + 1;
      let n = 0;
      for (let ry = 0; ry < rows; ry++) {
        for (let cx = 0; cx < cols; cx++) {
          if (n >= maxDots) break;
          const gy = ry * spacing - parallax;               // overscan for the drift
          const falloff = 1 - smoothstep(fadeFrom, fadeTo, gy / h);
          if (falloff <= 0.001) continue;
          if (Math.random() > fill * falloff) continue;
          n++;
          const d: Dot = {
            x: cx * spacing + (Math.random() - 0.5) * spacing * jitter,
            y: gy + (Math.random() - 0.5) * spacing * jitter,
            s: 0.5 + Math.random() * Math.random() * size,  // skewed small, like the source
            a: (0.5 + Math.random() * 0.44) * falloff,       // 0.50 – 0.94, faded
            phase: Math.random() * TAU,
            speed: 0.7 + Math.random() * 0.6,                // its own clock
          };
          (!reduce && Math.random() < twinkle ? movers : statics).push(d);
        }
      }

      /* paint the static dots once — they never change */
      base = document.createElement("canvas");
      base.width = Math.round(w * dpr);
      base.height = Math.round((h + parallax * 2) * dpr);
      const bc = base.getContext("2d")!;
      bc.setTransform(dpr, 0, 0, dpr, 0, 0);
      bc.fillStyle = ink;
      for (const d of statics) {
        bc.globalAlpha = d.a;
        dab(bc, d.x, d.y + parallax, d.s);
      }
      bc.globalAlpha = 1;
    };

    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      if (base) ctx.drawImage(base, 0, off - parallax, w, h + parallax * 2);
      if (!movers.length) return;

      ctx.fillStyle = ink;
      const time = (t - t0) / 1000;
      for (const d of movers) {
        /* pow(sin, sharp) gives a brief peak and a long rest, which reads as a
           blink rather than a hum. The size pop matters more than the opacity
           at this scale — a 1px alpha change is close to invisible. */
        const wave = Math.sin((time / cycle) * TAU * d.speed + d.phase);
        const flash = Math.pow(Math.max(0, wave), sharp);
        ctx.globalAlpha = Math.min(1, d.a * (dim + (1 - dim) * flash * 1.9));
        const sz = d.s * (1 + flash * (pop - 1));
        const c = (sz - d.s) / 2;
        dab(ctx, d.x - c, d.y + off - c, sz);
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
       canvas.width feeds back into layout and the observer loops. */
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
      base = null;
    };
  }, [spacing, fill, jitter, size, shape, fadeFrom, fadeTo, cycle, twinkle, dim, pop, sharp, parallax, color, maxDots]);

  return (
    <canvas
      ref={ref}
      className={className}
      aria-hidden="true"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 0 }}
    />
  );
}
