/**
 * BlingField — the drifting dust layer used behind the Day One and
 * Momentum pinned sections.
 *
 * A canvas particle field, not a GSAP timeline: a few thousand dots
 * redrawn every frame is a per-pixel job, which is what canvas is for —
 * GSAP tweens discrete DOM/CSS properties, not raw pixels, so it isn't
 * the right tool here.
 *
 * Most dots just sit still — that's the field's resting state. Each
 * one, independently and on its own long random timer, occasionally
 * breaks away: it drifts down a short distance while fading out, then
 * reappears somewhere else and fades back in to resume resting. Timers
 * are all staggered, so at any instant only a small, ever-changing
 * handful are actually in motion — never the whole field at once.
 */

export type BlingFieldOptions = {
  spacing?: number;
  fill?: number;
  size?: number;
  shape?: "circle" | "square";
  fadeFrom?: number;
  fadeTo?: number;
  parallax?: number;
  color?: string;
  maxDots?: number;
  /** How often a dot takes its turn to fall. 1 = standard (long rests,
      occasional falls); higher shortens the rest, so more of the field
      is in motion at any given moment. */
  chaos?: number;
  /** Colour for the accent share of dots (see accentChance). Defaults
      to the brand pink. */
  accentColor?: string;
  /** Fraction of dots painted accentColor instead of the base ink —
      0 disables the accent entirely (every dot is the same colour). */
  accentChance?: number;
};

const DEFAULTS: Required<BlingFieldOptions> = {
  spacing: 7.5,
  fill: 0.4,
  size: 3,
  shape: "circle",
  fadeFrom: 0.02,
  fadeTo: 0.7,
  parallax: 150,
  color: "",
  maxDots: 3000,
  chaos: 1,
  accentColor: "#F06496",
  accentChance: 0,
};

/* Resting is the default state, and it's long; falling is brief and
   rare by comparison — that ratio is what keeps the field reading as
   "mostly fixed, a few drifting" rather than "snow". `chaos` only
   shortens the rest, never the fall itself. */
const REST_MIN = 12; // seconds
const REST_MAX = 30;
const FALL_MIN = 3.5; // seconds — the actual drift-and-fade
const FALL_MAX = 6.5;
const FADE_IN_MIN = 0.3; // seconds — reappearing after a fall
const FADE_IN_MAX = 0.6;
const FALL_DIST_MIN = 30; // px covered over one fall
const FALL_DIST_MAX = 90;

export function mountBlingField(canvas: HTMLCanvasElement, options: BlingFieldOptions = {}) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};
  const cfg = { ...DEFAULTS, ...options };

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const TAU = Math.PI * 2;
  const restScale = 1 / cfg.chaos;

  const getInk = () =>
    cfg.color || (canvas.parentElement ? getComputedStyle(canvas.parentElement).color : "") || "#232323";
  let ink = getInk();

  type Phase = "in" | "rest" | "fall";
  type Dot = {
    x: number; baseY: number; s: number; a: number; color: string;
    phase: Phase; phaseStart: number; phaseDur: number; fallDist: number;
  };
  let dots: Dot[] = [];
  let w = 0, h = 0, dpr = 1, raf = 0, off = 0;
  let inView = true, dead = false;

  const smoothstep = (a: number, b: number, x: number) => {
    if (b <= a) return x < a ? 0 : 1;
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  /* density weighting: denser near the top, thinning toward the
     bottom (fadeFrom/fadeTo) — rejection sampling keeps that same
     silhouette even though dots roam over time rather than sitting at
     a fixed grid cell. */
  const densityAt = (yFrac: number) => 1 - smoothstep(cfg.fadeFrom, cfg.fadeTo, yFrac);
  const sampleY = () => {
    for (let i = 0; i < 8; i++) {
      const y = Math.random() * h;
      if (Math.random() < densityAt(y / h)) return y;
    }
    return Math.random() * h * cfg.fadeTo;
  };
  const restDur = () => (REST_MIN + Math.random() * (REST_MAX - REST_MIN)) * restScale;

  const dab = (c: CanvasRenderingContext2D, x: number, y: number, s: number) => {
    if (cfg.shape === "square") { c.fillRect(x, y, s, s); return; }
    const r = s / 2;
    c.beginPath();
    c.arc(x + r, y + r, r, 0, TAU);
    c.fill();
  };

  /* A dot "arriving" at a new spot: fresh position/size/colour, about
     to fade in. */
  const relocate = (d: Dot, now: number) => {
    d.x = Math.random() * w;
    d.baseY = sampleY();
    d.s = 0.5 + Math.random() * Math.random() * cfg.size;
    d.a = 0.5 + Math.random() * 0.44;
    d.color = Math.random() < cfg.accentChance ? cfg.accentColor : ink;
    d.phase = "in";
    d.phaseStart = now;
    d.phaseDur = FADE_IN_MIN + Math.random() * (FADE_IN_MAX - FADE_IN_MIN);
  };

  const build = () => {
    ink = getInk();
    const r = canvas.getBoundingClientRect();
    w = Math.max(1, r.width);
    h = Math.max(1, r.height);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const count = Math.min(cfg.maxDots, Math.round(((w * h) / (cfg.spacing * cfg.spacing)) * cfg.fill));
    const now = performance.now();
    dots = Array.from({ length: count }, () => {
      const d: Dot = { x: 0, baseY: 0, s: 0, a: 0, color: ink, phase: "rest", phaseStart: now, phaseDur: 1, fallDist: 0 };
      relocate(d, now);
      /* Land every dot straight into a rest phase already under way —
         at a random point in its own (randomized) rest span — so the
         field looks lived-in from the first frame instead of every
         dot fading in together. */
      d.phase = "rest";
      d.phaseDur = restDur();
      d.phaseStart = now - Math.random() * d.phaseDur * 1000;
      return d;
    });
  };

  const draw = (now: number) => {
    ctx.clearRect(0, 0, w, h);

    for (const d of dots) {
      if (!reduce) {
        let elapsed = (now - d.phaseStart) / 1000;
        while (elapsed >= d.phaseDur) {
          elapsed -= d.phaseDur;
          const backdate = now - elapsed * 1000;
          if (d.phase === "in") {
            d.phase = "rest";
            d.phaseDur = restDur();
          } else if (d.phase === "rest") {
            d.phase = "fall";
            d.phaseDur = FALL_MIN + Math.random() * (FALL_MAX - FALL_MIN);
            d.fallDist = FALL_DIST_MIN + Math.random() * (FALL_DIST_MAX - FALL_DIST_MIN);
          } else {
            relocate(d, backdate);
          }
          d.phaseStart = backdate;
        }
      }

      const t = reduce ? 0.5 : Math.min(1, (now - d.phaseStart) / (d.phaseDur * 1000));
      let alpha = d.a;
      let y = d.baseY;
      if (d.phase === "in") alpha = d.a * t;
      else if (d.phase === "fall") { alpha = d.a * (1 - t); y = d.baseY + t * d.fallDist; }

      ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
      ctx.fillStyle = d.color;
      dab(ctx, d.x - d.s / 2, y + off - d.s / 2, d.s);
    }
    ctx.globalAlpha = 1;
  };

  const loop = (t: number) => {
    raf = 0;
    if (dead || !inView) return;
    draw(t);
    raf = requestAnimationFrame(loop);
  };
  const go = () => { if (!raf && !dead && inView && !reduce) raf = requestAnimationFrame(loop); };

  const onScroll = () => {
    if (!cfg.parallax) { off = 0; return; }
    const r = canvas.getBoundingClientRect();
    const vh = window.innerHeight;
    const p = (vh / 2 - (r.top + r.height / 2)) / (vh / 2 + r.height / 2);
    off = Math.max(-1, Math.min(1, p)) * cfg.parallax;
    if (reduce) draw(performance.now());
  };

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
}
