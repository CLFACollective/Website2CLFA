import { useGsap, prefersReducedMotion } from "./gsapSetup";

/**
 * ShineField — canvas-drawn dust field behind Day One / Momentum's
 * headings. See ShineField.astro for the full story on why this isn't
 * SVG + CSS mask-image anymore (both were real, independent, confirmed
 * sources of sustained memory growth on iPad — a mask-image whose
 * calc()-driven value changes every frame, and ~30 infinitely-animating
 * squares living inside an SVG <pattern>, which forces continuous
 * re-rasterization of the whole tiled fill). Everything here is plain
 * per-square arithmetic at draw time — no mask, no SVG, nothing for
 * the browser to invalidate or re-tile.
 *
 * Squares are generated once per instance, client-side (mirrors what
 * used to be build-time random generation in the .astro frontmatter —
 * doesn't need to be server-rendered now that nothing needs to exist
 * in the initial HTML for a canvas). The height-fade and both sweep
 * bands are baked directly into each square's drawn alpha instead of
 * a mask; the sweep bands' *position* is GSAP-tweened (xPercent-style
 * plain numbers, not a CSS property), and their onUpdate is what
 * drives the redraw — same "GSAP owns the animated value, a callback
 * just reads it" shape as GridField's cursor-follow fade.
 */

const PINK = "#F06996";
const ACCENT_CHANCE = 0.04;
// Scaled to 60% of the originally-measured 0.4–6.5px range — the full
// size read as too prominent/heavy once seen on the page.
const SIZE_SCALE = 0.6;
const MIN_SIZE_SCALE = 0.85;
const MIN_SIZE = 0.4 * MIN_SIZE_SCALE;
const MAX_SIZE = 6.5 * SIZE_SCALE;
// Softened further (0.3–0.56 -> 0.16–0.4) — visible squares next to a
// heading's dark text read as a stark, high-contrast "wall" against the
// plain background beside it; feedback called this a "hard line."
// Lower opacity throughout takes the edge off that contrast without
// changing density/placement.
const MIN_ALPHA = 0.16;
const MAX_ALPHA = 0.4;
const ROW_GROWTH = 2.5;
const ROUNDED_CHANCE = 0.35;
const ROUNDED_RADIUS_FRAC = 0.3;

// The sweep bands' core/feather half-widths, as % of container — same
// numbers the old mask gradients used (X band twice as thick as Y).
const X_CORE = 3, X_FEATHER = 6;
const Y_CORE = 1.5, Y_FEATHER = 3;
const CORE_ALPHA = 0.35; // matches the old mask's rgba(0,0,0,.35) core stop
const SWEEP_DURATION = 24; // seconds per full loop, matches the old tweens

type Config = {
  tile: number;
  tileHeight: number;
  cell: number;
  bandEnd: number;
  fadeWidth: number;
  bg: string;
  mobileBandEnd: number;
  mobileFadeWidth: number;
  mobileBreakpoint: number;
};

type Square = {
  x: number; y: number; s: number; r: number; o: number;
  pink: boolean; sparkle: boolean; delay: number; dur: number;
};

function generateSquares(tile: number, tileHeight: number, cell: number): Square[] {
  const cols = Math.round(tile / cell);
  const rows = Math.round(tileHeight / cell);
  const squares: Square[] = [];
  for (let i = 0; i < cols * rows; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const rowFrac = rows > 1 ? row / (rows - 1) : 0;
    const rowMax = MIN_SIZE + ((MAX_SIZE - MIN_SIZE) * (1 + rowFrac * (ROW_GROWTH - 1))) / ROW_GROWTH;

    // Squaring a uniform random biases it toward 0 — the same "mostly
    // small, occasionally large" skew measured in the original
    // reference — applied within this row's own (growing) size ceiling.
    const sizeFrac = Math.random() ** 2;
    const size = MIN_SIZE + sizeFrac * (rowMax - MIN_SIZE);
    const alpha = MIN_ALPHA + sizeFrac * (MAX_ALPHA - MIN_ALPHA) + (Math.random() - 0.5) * 0.08;

    const jitterX = (Math.random() - 0.5) * cell * 0.5;
    const jitterY = (Math.random() - 0.5) * cell * 0.5;
    const cx = col * cell + cell / 2 + jitterX;
    const cy = row * cell + cell / 2 + jitterY;

    const pink = Math.random() < ACCENT_CHANCE;
    squares.push({
      x: cx - size / 2,
      y: cy - size / 2,
      s: size,
      r: Math.random() < ROUNDED_CHANCE ? size * ROUNDED_RADIUS_FRAC : 0,
      o: Math.max(0.15, Math.min(0.65, alpha)),
      pink,
      sparkle: pink, // only the pink accents twinkle
      delay: Math.random() * 6,
      dur: 2.6 + Math.random() * 2.4,
    });
  }
  return squares;
}

/** 1 at rest, dipping to CORE_ALPHA within `core`% of `center`, eased
 *  back to 1 by `feather`% — same shape the old mask gradients had. */
function bandDim(posPct: number, centerPct: number, core: number, feather: number): number {
  const d = Math.abs(posPct - centerPct);
  if (d <= core) return CORE_ALPHA;
  if (d >= feather) return 1;
  const t = (d - core) / (feather - core);
  return CORE_ALPHA + t * (1 - CORE_ALPHA);
}

export function mountShineField(canvas: HTMLCanvasElement, cfg: Config) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};

  const reduce = prefersReducedMotion();
  const ink = (canvas.parentElement ? getComputedStyle(canvas.parentElement).color : "") || "#232323";
  const squares = generateSquares(cfg.tile, cfg.tileHeight, cfg.cell);
  const mobileQuery = window.matchMedia(`(max-width: ${cfg.mobileBreakpoint}px)`);

  let w = 0, h = 0;
  let bandEndPct = 0, fadeWidthPct = 0;
  const resolveBand = () => {
    bandEndPct = mobileQuery.matches ? cfg.mobileBandEnd : cfg.bandEnd;
    fadeWidthPct = mobileQuery.matches ? cfg.mobileFadeWidth : cfg.fadeWidth;
  };
  resolveBand();

  const size = () => {
    const r = canvas.getBoundingClientRect();
    w = Math.max(1, r.width);
    h = Math.max(1, r.height);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  const state = { bandX: -20, bandY: -20 };

  const draw = () => {
    ctx.clearRect(0, 0, w, h);
    const bandEndPx = (bandEndPct / 100) * h;
    if (bandEndPx <= 0) return;
    const fadeStartPx = bandEndPx - (fadeWidthPct / 100) * h;
    const now = performance.now() / 1000;

    const tilesX = Math.ceil(w / cfg.tile) + 1;
    const tilesY = Math.ceil(h / cfg.tileHeight) + 1;

    for (let ty = 0; ty < tilesY; ty++) {
      const tileTop = ty * cfg.tileHeight;
      if (tileTop > bandEndPx) break; // this row and everything below it is fully faded out

      for (let tx = 0; tx < tilesX; tx++) {
        const tileLeft = tx * cfg.tile;

        for (const sq of squares) {
          const px = tileLeft + sq.x;
          const py = tileTop + sq.y;
          if (px > w || py > h) continue;

          const centerY = py + sq.s / 2;
          let fadeAlpha = 1;
          if (centerY >= bandEndPx) continue;
          else if (centerY > fadeStartPx) fadeAlpha = 1 - (centerY - fadeStartPx) / (bandEndPx - fadeStartPx);

          const xPct = ((px + sq.s / 2) / w) * 100;
          const yPct = ((py + sq.s / 2) / h) * 100;
          const dim = Math.min(
            bandDim(xPct, state.bandX, X_CORE, X_FEATHER),
            bandDim(yPct, state.bandY, Y_CORE, Y_FEATHER),
          );

          let alpha = sq.o * fadeAlpha * dim;
          let drawSize = sq.s;
          let ox = px, oy = py;

          if (sq.sparkle && !reduce) {
            // matches @keyframes shine-sparkle: 0%/100% base, 50% peak
            // (opacity 1, scale 1.6) — a triangle wave across each
            // square's own delay-offset cycle.
            const phase = (((now - sq.delay) % sq.dur) + sq.dur) % sq.dur / sq.dur;
            const pulse = phase <= 0.5 ? phase / 0.5 : (1 - phase) / 0.5;
            alpha = (sq.o + (1 - sq.o) * pulse) * fadeAlpha * dim;
            drawSize = sq.s * (1 + 0.6 * pulse);
            ox = px - (drawSize - sq.s) / 2;
            oy = py - (drawSize - sq.s) / 2;
          }

          if (alpha <= 0.01) continue;
          ctx.globalAlpha = Math.min(1, alpha);
          ctx.fillStyle = sq.pink ? PINK : ink;
          if (sq.r > 0) {
            ctx.beginPath();
            ctx.roundRect(ox, oy, drawSize, drawSize, sq.r);
            ctx.fill();
          } else {
            ctx.fillRect(ox, oy, drawSize, drawSize);
          }
        }
      }
    }
    ctx.globalAlpha = 1;
  };

  size();
  draw();

  if (reduce) {
    // resting state: bands off-screen (no dimming), sparkles static at
    // their base opacity — draw() already handles !reduce for the
    // pulse, so a single draw is the whole picture, nothing to animate.
    const ro = new ResizeObserver(() => { size(); draw(); });
    ro.observe(canvas);
    return () => ro.disconnect();
  }

  const { gsap } = useGsap();
  const xTween = gsap.fromTo(state, { bandX: -20 }, { bandX: 120, duration: SWEEP_DURATION, ease: "none", repeat: -1, onUpdate: draw });
  // Y only sweeps through the field's own visible top band (see
  // bandEndPct above) rather than the full 0-100% height.
  const yTween = gsap.fromTo(state, { bandY: -20 }, { bandY: 40, duration: SWEEP_DURATION, ease: "none", repeat: -1, onUpdate: draw });

  const io = new IntersectionObserver(
    ([entry]) => {
      if (entry.isIntersecting) { xTween.play(); yTween.play(); }
      else { xTween.pause(); yTween.pause(); }
    },
    { rootMargin: "200px 0px" },
  );
  io.observe(canvas);

  const onBreakpointChange = () => { resolveBand(); draw(); };
  mobileQuery.addEventListener("change", onBreakpointChange);

  const ro = new ResizeObserver(() => { size(); draw(); });
  ro.observe(canvas);

  return () => {
    xTween.kill();
    yTween.kill();
    io.disconnect();
    ro.disconnect();
    mobileQuery.removeEventListener("change", onBreakpointChange);
  };
}

export function setupShineField() {
  document.querySelectorAll<HTMLCanvasElement>(".shine-wrap:not([data-mounted])").forEach((canvas) => {
    canvas.dataset.mounted = "true";
    const cfg = JSON.parse(canvas.dataset.config || "{}") as Config;
    mountShineField(canvas, cfg);
  });
}
