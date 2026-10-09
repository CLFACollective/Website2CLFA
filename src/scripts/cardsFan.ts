import { useGsap, prefersReducedMotion } from "./gsapSetup";

const DEAL = 0.09; // deal-in is over by here
const START = 0.2; // lead card starts moving here
const END = 0.94; // and lands on the last card here
const SPREAD = 0.97; // spacing as a share of card width (<1 = overlap)
const DEPTH = 0.105; // arc depth per step, as a share of card width
const TILT = 0.82; // fraction of the true tangent each card rotates
const PART = 70; // deck-parting strength (peaks ~42px at the neighbour)

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

  /* Two layout modes, narrowest wins: below 1000px cards are dealt out
     of a tight pile one at a time (setupCardStack); 1000px+ is the
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

  /* Below 1000px: card 1 starts fully dealt; cards 2–N sit behind it as
     a tight pile, each showing only PEEK (~20%) of the one behind it —
     the sliver where its icon sits. As you scroll, the pile deals out
     one card at a time: card j's resting spot is
       y(j) = min(j, k)·H + max(0, j − k)·PEEK·H
     where k is "how many cards have been fully dealt" (0..N, driven
     continuously by scroll progress) and H is the live card height.
     For an already-dealt card (j < k) this reduces to y = j·H — it's
     found its final slot and stays there, full stop. For a still-piled
     card (j ≥ k) it reduces to y = k·H + (j−k)·PEEK·H — stacked tight
     behind whatever's been dealt so far, trailing by PEEK·H per card.
     At j = k the two halves agree (y = k·H), so there's no seam: the
     "next up" card is already sitting exactly where it'll stay, it's
     the cards *behind* it that are doing the visible work of spreading
     out as k climbs past them. */
  function setupCardStack(reducedMotion: boolean): () => void {
    const PEEK = 0.25;
    let cardH = 0;

    const layout = () => {
      cardH = cards[0].getBoundingClientRect().height;
      fan!.style.height = `${cardH * N}px`;
    };

    const place = (k: number) => {
      cards.forEach((c, j) => {
        const y = Math.min(j, k) * cardH + Math.max(0, j - k) * PEEK * cardH;
        c.style.transform = `translate(-50%, ${y.toFixed(1)}px)`;
        // The fan (desktop) mode lights an icon up via :hover or the
        // scroll-driven lead card, neither of which exists here — a
        // touch device has no :hover, and the stack has no single
        // "current" card (every dealt card stays visible at once). So
        // instead: a card's icon lights up the moment it's finished
        // sliding into its own resting spot (k >= j, same condition
        // that pins its y above), and stays lit — this was previously
        // never set at all in this mode, so no card's icon ever lit up
        // here regardless of scroll position.
        c.dataset.active = k >= j ? "true" : "false";
      });
    };

    layout();

    if (reducedMotion) {
      place(N);
      return () => {};
    }

    place(0);
    const state = { k: 0 };
    const trigger = ScrollTrigger.create({
      trigger: fan,
      start: "top top",
      end: "bottom bottom",
      onUpdate: (self) => {
        gsap.to(state, { k: self.progress * N, duration: 0.35, ease: "power2.out", overwrite: true, onUpdate: () => place(state.k) });
      },
    });

    const onResize = () => {
      layout();
      trigger.refresh();
      place(state.k);
    };
    window.addEventListener("resize", onResize);

    return () => {
      trigger.kill();
      window.removeEventListener("resize", onResize);
      gsap.killTweensOf(state);
      fan!.style.height = "";
      cards.forEach((c) => { c.style.transform = ""; c.dataset.active = "false"; });
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
