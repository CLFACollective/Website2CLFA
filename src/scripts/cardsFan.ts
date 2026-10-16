import { useGsap, prefersReducedMotion } from "./gsapSetup";

const DEAL = 0.09; // deal-in is over by here
const START = 0.2; // lead card starts moving here
const END = 0.94; // and lands on the last card here
const SPREAD = 0.97; // spacing as a share of card width (<1 = overlap)
const DEPTH = 0.105; // arc depth per step, as a share of card width
const TILT = 0.82; // fraction of the true tangent each card rotates
const PART = 70; // deck-parting strength (peaks ~42px at the neighbour)

// sub-1000px deck (setupCardStack)
const DECK_PER_CARD_SVH = 75; // scroll per card change
const DECK_DEPTH_Y = 14; // px each card beneath sits higher
const DECK_DEPTH_SCALE = 0.05; // and smaller

const ease = (v: number) => v * v * (3 - 2 * v);
const clamp = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * BrandInMotionCards — up to five cards fanned on an arc. The section pins;
 * scroll deals the deck out and walks a lead card along the curve. The
 * geometry itself (place()) is the same closed-form math as the
 * original component; GSAP's job is turning the raw scroll fraction
 * into an eased "catch up" value each tick (a `gsap.to` retargeted on
 * every ScrollTrigger update — the standard GSAP smooth-scrub recipe)
 * rather than a hand-rolled per-frame lerp.
 */
export function setupBrandInMotionCards() {
  const section = document.getElementById("motion");
  const pin = document.getElementById("bmcPin");
  const stage = document.getElementById("bmcStage");
  const fan = document.getElementById("bmcFan");
  const dotsHost = document.getElementById("bmcDots");
  if (!section || !pin || !stage || !fan || !dotsHost) return;

  const { gsap, ScrollTrigger } = useGsap();
  const cards = Array.from(fan.children) as HTMLElement[];
  // however many cards src/data/cards.json holds (the CMS caps it at 5)
  const N = cards.length;
  if (N === 0) return;
  const STEPS = Math.max(N - 1, 1);
  const MID = (N - 1) / 2;
  const BOW = (N * N - 1) / 12; // mean of o^2 — lifts the arc back to centre
  const dots = Array.from(dotsHost.children) as HTMLElement[];
  const reduce = prefersReducedMotion();

  let live = false;
  const introEls = [
    ...Array.from(section.querySelectorAll<HTMLElement>(".bmc__q, .bmc__aside")),
    dotsHost,
  ];

  let drawn = false;
  const io = new IntersectionObserver(
    (entries) => entries.forEach((e) => {
      live = e.isIntersecting;
      stage.classList.toggle("is-live", live);
      if (live) {
        gsap.to(introEls, { opacity: 1, y: 0, duration: 0.7, ease: "power3.out", stagger: 0.08 });
        if (!drawn) { drawn = true; drawIcons(cards); }
      }
    }),
    { rootMargin: "0px 0px -14% 0px" },
  );
  io.observe(stage);

  /* Two layout modes, narrowest wins: below 1000px a pinned deck the
     cards slide onto one at a time (setupCardStack); 1000px+ is the
     scroll-fan arc. (A third "pinned shuffle-deck" tier used to sit
     between 800–1000px — removed per user feedback, it read as an
     unwanted carousel-style card switch; the stack pattern now simply
     covers the whole sub-1000px range instead.) */
  const stackQuery = window.matchMedia("(max-width:999px)");
  type Mode = "fan" | "stack";
  const getMode = (): Mode => (stackQuery.matches ? "stack" : "fan");
  let mode = getMode();

  if (reduce) {
    gsap.set(introEls, { opacity: 1, y: 0 });
    const applyReducedLayout = () => {
      if (getMode() === "stack") setupCardStack(true);
      else place(0.6);
    };
    applyReducedLayout();
    stackQuery.addEventListener("change", applyReducedLayout);
    return;
  }

  /* Crossing the breakpoint (window resize, devtools panel, a tablet
     rotation) tears down whichever mode was active and spins up the
     other in place — no full-page reload, which would otherwise dump
     scroll position and re-run every other section's setup too. Each
     mode's own cleanup clears the inline styles it wrote directly
     (transform, z-index, the stack's own fan height) so the next mode
     starts from a blank slate instead of fighting leftover values —
     inline styles win over the CSS breakpoint rules that would
     otherwise reset them. */
  let teardown: () => void = mode === "fan" ? setupScrollFan() : setupCardStack(false);

  const onLayoutChange = () => {
    const next = getMode();
    if (next === mode) return;
    mode = next;
    teardown();
    teardown = mode === "fan" ? setupScrollFan() : setupCardStack(false);
  };
  stackQuery.addEventListener("change", onLayoutChange);

  /* Below 1000px: a pinned deck. The stage pins with the heading in
     view (feedback: on phones the heading scrolled away and the nav
     covered the cards, and the old scroll-past pile dealt the cards too
     fast to read). Card 1 sits centred; scrolling slides each next card
     up onto the deck, the ones beneath easing back a step. Each card
     holds before the next one moves — k (cards dealt, 0..N-1) only
     advances through the middle half of each card's stretch of scroll.
     The pin's height (set here, per card) is what sets the reading pace. */
  function setupCardStack(reducedMotion: boolean): () => void {
    const clear = () => {
      pin!.style.height = "";
      cards.forEach((c) => { c.style.transform = ""; c.style.zIndex = ""; c.style.opacity = ""; c.dataset.active = "false"; });
    };
    if (reducedMotion) {
      // the reduced-motion CSS lays the cards out as a plain list
      clear();
      cards.forEach((c) => { c.dataset.active = "true"; });
      return clear;
    }

    pin!.style.height = `calc(100svh + ${(N - 1) * DECK_PER_CARD_SVH + 40}svh)`;

    const place = (k: number) => {
      const travel = window.innerHeight * 0.8;
      cards.forEach((c, j) => {
        const d = k - j; // >= 0: on the deck (d = how far down); < 0: still to come
        let y: number, scale = 1, opacity = 1;
        if (d >= 0) {
          const depth = Math.min(d, 3);
          y = -depth * DECK_DEPTH_Y;
          scale = 1 - depth * DECK_DEPTH_SCALE;
          if (d > 3) opacity = Math.max(0, 4 - d);
        } else {
          y = Math.min(1, -d) * travel; // slides up from below
          if (d <= -1) opacity = 0;
        }
        c.style.transform = `translate(-50%, -50%) translateY(${y.toFixed(1)}px) scale(${scale.toFixed(3)})`;
        c.style.opacity = String(opacity);
        c.style.zIndex = String(10 + j);
        // the top card's icon lights up (touch has no :hover)
        c.dataset.active = d >= 0 && d < 0.5 ? "true" : "false";
      });
    };
    const smooth = (v: number) => v * v * (3 - 2 * v);
    const kAt = (p: number) => {
      const raw = p * (N - 1);
      const i = Math.min(Math.floor(raw), N - 1);
      const f = raw - i;
      return Math.min(N - 1, i + smooth(clamp((f - 0.25) / 0.5)));
    };

    place(0);
    const state = { k: 0 };
    const trigger = ScrollTrigger.create({
      trigger: pin,
      start: "top top",
      end: "bottom bottom",
      onUpdate: (self) => {
        gsap.to(state, { k: kAt(self.progress), duration: 0.35, ease: "power2.out", overwrite: true, onUpdate: () => place(state.k) });
      },
    });
    const onResize = () => { trigger.refresh(); place(state.k); };
    window.addEventListener("resize", onResize);

    return () => {
      trigger.kill();
      window.removeEventListener("resize", onResize);
      gsap.killTweensOf(state);
      clear();
    };
  }

  function setupScrollFan(): () => void {
    place(0);
    const state = { p: 0 };
    const trigger = ScrollTrigger.create({
      trigger: pin,
      start: "top top",
      end: "bottom bottom",
      onUpdate: (self) => {
        gsap.to(state, { p: self.progress, duration: 0.5, ease: "power2.out", overwrite: true, onUpdate: () => place(state.p) });
      },
    });

    return () => {
      trigger.kill();
      gsap.killTweensOf(state);
      fan!.style.transform = "";
      cards.forEach((c) => { c.style.transform = ""; c.style.zIndex = ""; c.dataset.active = "false"; });
    };
  }

  function place(p: number) {
    const w = cards[0].offsetWidth;
    const h = (w * 540) / 441;
    const avail = fan!.clientWidth - 16;
    const span = Math.min(w * SPREAD, (avail - w) / STEPS);
    const depth = w * DEPTH;

    const d = ease(clamp(p / DEAL));
    const t = clamp((p - START) / (END - START));
    const pos = t * (N - 1);

    fan!.style.transform = `rotate(${((MID - pos) * 0.7).toFixed(2)}deg)`;

    cards.forEach((c, i) => {
      const o = i - MID;
      const xF = o * span;
      const yF = (o * o - BOW) * depth;
      const rF = ((Math.atan2(2 * o * depth, span) * 180) / Math.PI) * TILT;
      const xD = o * 9;
      const yD = Math.abs(o) * 5;
      const rD = o * 1.6;

      let x = xD + (xF - xD) * d;
      const y = yD + (yF - yD) * d;
      const rot = rD + (rF - rD) * d;

      const s = i - pos;
      const near = Math.abs(s);
      const k = near < 1 ? 0.5 * (1 + Math.cos(Math.PI * near)) : 0;
      const scale = (0.96 + k * 0.1) * (0.9 + d * 0.1);
      const lift = -k * 30 * d;

      x += PART * s * Math.exp((-s * s) / 2) * d;

      const rad = (Math.abs(rot) * Math.PI) / 180;
      const half = ((w * Math.cos(rad) + h * Math.sin(rad)) / 2) * scale;
      const edge = Math.max(0, avail / 2 - half);
      x = Math.max(-edge, Math.min(edge, x));

      c.style.transform =
        `translate(-50%,-50%) translate(${x.toFixed(1)}px,${(y + lift).toFixed(1)}px) ` +
        `rotate(${rot.toFixed(2)}deg) scale(${scale.toFixed(3)})`;
      c.style.zIndex = String(50 - i);
      c.dataset.active = d > 0.9 && near < 0.5 ? "true" : "false";
    });

    dots.forEach((dot, i) => { dot.dataset.on = pos + 0.5 >= i ? "true" : "false"; });
  }

  function drawIcons(cardEls: HTMLElement[]) {
    cardEls.forEach((card, ci) => {
      const svg = card.querySelector<SVGSVGElement>(".ci");
      if (!svg) return;
      const stagger = Number(svg.dataset.stagger) || 0;
      const paths = Array.from(svg.querySelectorAll<SVGPathElement>("path"));
      gsap.to(paths, {
        strokeDashoffset: 0,
        duration: 1.15,
        ease: "power2.out",
        stagger,
        delay: ci * 0.05,
      });
      gsap.to(paths, {
        fillOpacity: (_idx, target) => target.getAttribute("fill-opacity") ? Number(target.getAttribute("fill-opacity")) : 1,
        duration: 0.9,
        ease: "power2.out",
        delay: ci * 0.05 + 0.55,
        stagger,
        onComplete: () => svg.classList.add("is-drawn"),
      });
    });
  }
}
