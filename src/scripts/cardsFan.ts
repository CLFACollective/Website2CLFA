import { useGsap, prefersReducedMotion } from "./gsapSetup";

const DEAL_DUR = 1.1; // s — the deck dealing into the fan, once in view
const HOVER_DUR = 0.5; // s — easing toward / away from a hovered card
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

/** Home page "So… what's a brand in motion?" cards. */
export function setupBrandInMotionCards() {
  const section = document.getElementById("motion");
  if (!section) return;
  setupCardFan({
    pin: document.getElementById("bmcPin"),
    stage: document.getElementById("bmcStage"),
    fan: document.getElementById("bmcFan"),
    introEls: Array.from(section.querySelectorAll<HTMLElement>(".bmc__q, .bmc__aside")),
  });
}

interface CardFanOptions {
  pin: HTMLElement | null;
  stage: HTMLElement | null;
  fan: HTMLElement | null;
  /** faded up when the stage first comes into view */
  introEls?: HTMLElement[];
  /** an element inside each card held upright while the card tilts */
  uprightSelector?: string;
  /** card spacing as a share of card width (<1 overlaps); squarer cards need more */
  spread?: number;
}

/**
 * Up to five cards fanned on an arc (home's brand-in-motion cards, What
 * We Do's equity cards). On desktop the deck deals into the fan once it
 * comes into view, then sits still; hovering a card makes it the lead —
 * it lifts and grows, its neighbours part, the fan tilts toward it — and
 * leaving the cards eases back to the plain arc. Nothing is tied to
 * scroll. The geometry (place()) is the same closed-form math as the
 * original component; GSAP tweens its inputs (deal, lead position,
 * focus). Below 1000px it's a pinned deck instead (setupCardStack).
 */
export function setupCardFan({ pin, stage, fan, introEls = [], uprightSelector, spread = SPREAD }: CardFanOptions) {
  if (!pin || !stage || !fan) return;

  const { gsap, ScrollTrigger } = useGsap();
  const cards = Array.from(fan.children) as HTMLElement[];
  // however many cards src/data/cards.json holds (the CMS caps it at 5)
  const N = cards.length;
  if (N === 0) return;
  const STEPS = Math.max(N - 1, 1);
  const MID = (N - 1) / 2;
  const BOW = (N * N - 1) / 12; // mean of o^2 — lifts the arc back to centre
  const reduce = prefersReducedMotion();
  const upright = uprightSelector
    ? cards.map((c) => c.querySelector<HTMLElement>(uprightSelector))
    : [];

  let live = false;

  let drawn = false;
  const io = new IntersectionObserver(
    (entries) => entries.forEach((e) => {
      live = e.isIntersecting;
      stage.classList.toggle("is-live", live);
      if (live) {
        if (introEls.length) gsap.to(introEls, { opacity: 1, y: 0, duration: 0.7, ease: "power3.out", stagger: 0.08 });
        if (!drawn) { drawn = true; drawIcons(cards); }
      }
    }),
    { rootMargin: "0px 0px -14% 0px" },
  );
  io.observe(stage);

  /* Two layout modes, narrowest wins: below 1000px a pinned deck the
     cards slide onto one at a time (setupCardStack); 1000px+ is the
     hover fan. (A third "pinned shuffle-deck" tier used to sit
     between 800–1000px — removed per user feedback, it read as an
     unwanted carousel-style card switch; the stack pattern now simply
     covers the whole sub-1000px range instead.) */
  const stackQuery = window.matchMedia("(max-width:999px)");
  type Mode = "fan" | "stack";
  const getMode = (): Mode => (stackQuery.matches ? "stack" : "fan");
  let mode = getMode();

  if (reduce) {
    if (introEls.length) gsap.set(introEls, { opacity: 1, y: 0 });
    const applyReducedLayout = () => {
      if (getMode() === "stack") setupCardStack(true);
      else place(1, MID, 0);
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
  let dealt = false; // the deal-in plays once per page load, not per mode switch
  let teardown: () => void = mode === "fan" ? setupHoverFan() : setupCardStack(false);

  const onLayoutChange = () => {
    const next = getMode();
    if (next === mode) return;
    mode = next;
    teardown();
    teardown = mode === "fan" ? setupHoverFan() : setupCardStack(false);
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

  function setupHoverFan(): () => void {
    // d: dealt into the fan (0 = squared-up deck); pos: which card leads
    // (MID = the centre, no lean); focus: how far the lead is lifted out
    const state = { d: dealt ? 1 : 0, pos: MID, focus: 0 };
    const draw = () => place(state.d, state.pos, state.focus);
    draw();

    const dealIO = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        dealIO.disconnect();
        dealt = true;
        gsap.to(state, { d: 1, duration: DEAL_DUR, ease: "power3.out", onUpdate: draw });
      },
      { rootMargin: "0px 0px -14% 0px" },
    );
    if (!dealt) dealIO.observe(stage!);

    const lead = (i: number) =>
      gsap.to(state, { pos: i, focus: 1, duration: HOVER_DUR, ease: "power2.out", overwrite: "auto", onUpdate: draw });
    const release = () =>
      gsap.to(state, { focus: 0, duration: HOVER_DUR, ease: "power2.out", overwrite: "auto", onUpdate: draw });

    /* Entering a card hands it the lead straight away. Letting go is
       looser: the lead lifts ~30px, so releasing on plain mouseleave
       would drop it back under a pointer near its edge and loop. It
       releases only once the pointer is RELEASE_MARGIN clear of the
       card (re-checked on scroll, since the card moves then too). */
    const RELEASE_MARGIN = 40;
    let leadIdx = -1;
    let px = -1, py = -1;
    // desktop only: a tap on a big touch screen (iPad landscape) fires
    // mouseenter too, and would leave the card lifted with no way out
    const canHover = window.matchMedia("(hover: hover) and (pointer: fine)");
    const enters = cards.map((_, i) => () => {
      if (!canHover.matches) return;
      leadIdx = i;
      lead(i);
    });
    const check = () => {
      if (leadIdx < 0) return;
      const r = cards[leadIdx].getBoundingClientRect();
      const m = RELEASE_MARGIN;
      if (px < r.left - m || px > r.right + m || py < r.top - m || py > r.bottom + m) {
        leadIdx = -1;
        release();
      }
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      px = e.clientX; py = e.clientY;
      check();
    };
    cards.forEach((c, i) => c.addEventListener("mouseenter", enters[i]));
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", draw);

    return () => {
      dealIO.disconnect();
      gsap.killTweensOf(state);
      cards.forEach((c, i) => c.removeEventListener("mouseenter", enters[i]));
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("scroll", check);
      window.removeEventListener("resize", draw);
      fan!.style.transform = "";
      cards.forEach((c) => { c.style.transform = ""; c.style.zIndex = ""; c.dataset.active = "false"; });
      upright.forEach((el) => { if (el) el.style.transform = ""; });
    };
  }

  function place(deal: number, pos: number, focus: number) {
    const w = cards[0].offsetWidth;
    const h = cards[0].offsetHeight;
    const avail = fan!.clientWidth - 16;
    const span = Math.min(w * spread, (avail - w) / STEPS);
    const depth = w * DEPTH;

    const d = ease(clamp(deal));

    const fanRot = (MID - pos) * 0.7 * focus;
    fan!.style.transform = `rotate(${fanRot.toFixed(2)}deg)`;

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
      const k = (near < 1 ? 0.5 * (1 + Math.cos(Math.PI * near)) : 0) * focus;
      const scale = (0.96 + k * 0.1) * (0.9 + d * 0.1);
      const lift = -k * 30 * d;

      x += PART * s * Math.exp((-s * s) / 2) * d * focus;

      const rad = (Math.abs(rot) * Math.PI) / 180;
      const half = ((w * Math.cos(rad) + h * Math.sin(rad)) / 2) * scale;
      const edge = Math.max(0, avail / 2 - half);
      x = Math.max(-edge, Math.min(edge, x));

      c.style.transform =
        `translate(-50%,-50%) translate(${x.toFixed(1)}px,${(y + lift).toFixed(1)}px) ` +
        `rotate(${rot.toFixed(2)}deg) scale(${scale.toFixed(3)})`;
      c.style.zIndex = String(50 - i);
      c.dataset.active = d > 0.9 && focus > 0.5 && near < 0.5 ? "true" : "false";
      // undo both the card's tilt and the fan's lean
      const up = upright[i];
      if (up) up.style.transform = `rotate(${(-(rot + fanRot)).toFixed(2)}deg)`;
    });
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
