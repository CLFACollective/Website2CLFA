"use client";

/* ============================================================
   BrandInMotionCards — the five cards fanned on one screen.

   This is the reference component’s idea (21st.dev carousel-07: an
   overlapping deck with falloff) with two things changed:

     1. It is an ARC, not a stack and not a line. Cards are placed on
        a curve and all five stay on screen at once — nothing scrolls
        off, nothing has to be dragged into view to be read.

     2. It runs on SCROLL, not drag. The section pins; scroll deals the
        deck into the arc, then walks a lead card along it. Works on a
        wheel, a trackpad and a phone without any of them being a
        special case. No npm packages — the reference needs `motion`
        and `class-variance-authority`; this needs neither.

   GEOMETRY. Cards sit at x = step * i on a parabola, and each one
   rotates to that curve’s own tangent, damped by TILT. A true
   half-circle would stand the outer cards on their ends and make the
   copy unreadable, so the arc is wide and shallow and the tilt is
   pulled back to about 80% of true — it reads as a curve, the type
   stays level enough to read. The deck also PARTS around the lead
   card so the lead never sits on a neighbour’s first line, and every
   card’s rotated box is clamped inside the frame, so nothing clips at
   any width.

   Ground: cream #FEFCF4, charcoal type, orange accents. Card grounds, copy, emphasis colours and both
   icon states are sampled from the comps.

   Tuning is at the top of the effect — DEAL/START/END for timing,
   SPREAD for overlap, DEPTH for how deep the arc bows, TILT for how
   far the cards lean, PART for how wide the deck opens.
   ============================================================ */

import { useEffect, useRef, useState } from "react";
import { CardIcon, IconName } from "./CardIcons";

/* Palette, for reference — the values live inline in CARDS and CSS below.
   cream #FEFCF4 (ground) · charcoal #252525 · mist #DDE6ED
   forest #344338 · slate #506E78 · orange #FF981E · copper #BE7A3A */

type Card = {
  pre?: string;
  emph: string;
  rest: string;
  bg: string;
  fg: string;
  hot: string;
  icon: IconName;
  idle: string;
  hover: string;
};

const CARDS: Card[] = [
  { pre: "Your ", emph: "equity-backed", rest: " company needs ASAP marketing services?",
    bg: "#DDE6ED", fg: "#252525", hot: "#BE7A3A", icon: "speed", idle: "#A5B7BE", hover: "#BE7A3A" },
  { emph: "Just been acquired", rest: " and need to reintroduce yourself.",
    bg: "#344338", fg: "#FEFCF4", hot: "#FF981E", icon: "acquired", idle: "#858D83", hover: "#FF981E" },
  { emph: "Ready to launch", rest: " (or should be ready to launch).",
    bg: "#506E78", fg: "#FEFCF4", hot: "#FF981E", icon: "launch", idle: "#9EBBC4", hover: "#FF981E" },
  { emph: "Mid-merger", rest: " and the brand story hasn’t caught up yet.",
    bg: "#252525", fg: "#FEFCF4", hot: "#FF981E", icon: "merge", idle: "#7C7B78", hover: "#FF981E" },
  { emph: "Pivoting", rest: " because the tech stack changed.",
    bg: "#DDE6ED", fg: "#252525", hot: "#BE7A3A", icon: "pivot", idle: "#A5B7BE", hover: "#BE7837" },
];

export function BrandInMotionCards({ id = "motion" }: { id?: string }) {
  const rootRef = useRef<HTMLElement>(null);
  const pin = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const fanRef = useRef<HTMLDivElement>(null);
  const dotsRef = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState(false);
  const [flat, setFlat] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [reduce, setReduce] = useState(false);
  const [order, setOrder] = useState<number[]>(() => CARDS.map((_, i) => i));

  /* Detect the phone layout and reduced-motion once, and keep them current.
     On phones the arc has nowhere to spread, so the deck stacks and shuffles
     instead — a different beat entirely from the desktop scroll-fan. */
  useEffect(() => {
    const mq = window.matchMedia("(max-width:1000px)");
    const rq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const upd = () => { setMobile(mq.matches); setReduce(rq.matches); };
    upd();
    mq.addEventListener("change", upd);
    rq.addEventListener("change", upd);
    return () => { mq.removeEventListener("change", upd); rq.removeEventListener("change", upd); };
  }, []);

  /* The mobile shuffle: the section PINS and the deck restacks AS YOU SCROLL.
     The stage sticks for the length of the pin, and that internal scroll
     progress maps to a front-card index — so you have to scroll through the
     whole deck before the section lets go. Pure order + CSS transition, so it
     reads as a shuffle without any animation library. */
  const deck = mobile && !reduce;
  const frontRef = useRef(-1);
  useEffect(() => {
    if (!deck) return;
    const pinEl = pin.current;
    if (!pinEl) return;
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const r = pinEl.getBoundingClientRect();
        const span = r.height - (window.innerHeight || 1);   // sticky travel
        if (span <= 0) return;
        const p = Math.min(0.9999, Math.max(0, -r.top / span));
        /* one card per equal slice of the pinned scroll — the last card holds
           on top through the tail, so nothing is skipped before release */
        const front = Math.min(CARDS.length - 1, Math.floor(p * CARDS.length));
        if (front === frontRef.current) return;
        frontRef.current = front;
        setOrder(CARDS.map((_, k) => (front + k) % CARDS.length));
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    onScroll();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [deck]);

  useEffect(() => {
    const pinEl = pin.current;
    const stage = stageRef.current;
    const fan = fanRef.current;
    const root = rootRef.current;
    if (!pinEl || !stage || !fan || !root) return;

    /* The <section> carries id="motion", so an id rule anywhere in the
       project beats every class rule in this file — including a leftover
       "#motion { height: 470vh }" from a previous version of this section,
       which pins the section far taller than its content and leaves a huge
       empty tail. An inline style outranks an id selector, so take the
       height back, and name the culprit rather than silently papering over it. */
    const forced = parseFloat(getComputedStyle(root).height) || 0;
    const natural = pinEl.offsetHeight;
    root.style.height = "auto";
    if (forced > natural + 50)
      console.warn(
        "[BrandInMotionCards] something outside this component was forcing the " +
          `section to ${Math.round(forced)}px (content is ${Math.round(natural)}px). ` +
          `Most likely a leftover "#${root.id} { height: ... }" rule in your global ` +
          "CSS. Overridden inline, but the rule is worth deleting.",
      );

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const cards = Array.from(fan.children) as HTMLElement[];

    const N = CARDS.length;
    const MID = (N - 1) / 2;
    const DEAL = 0.09;   // deal-in is over by here
    const START = 0.2;   // lead card starts moving here
    const END = 0.94;    // and lands on the last card here
    const SPREAD = 0.97; // spacing as a share of card width (<1 = overlap)
    const DEPTH = 0.105; // arc depth per step, as a share of card width
    const TILT = 0.82;   // fraction of the true tangent each card rotates
    const PART = 70;     // deck-parting strength (peaks ~42px at the neighbour)
    const DAMP = 0.14;   // how hard the arc eases toward the scroll position
    const BOW = (N * N - 1) / 12; // mean of o^2 — lifts the arc back to centre

    const ease = (v: number) => v * v * (3 - 2 * v);
    const clamp = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

    /* Progress = how far the sticky stage has SLID inside the pin. 0 at
       the top, 1 when it lets go. It is a ratio of two element rects, so
       it does not care whether the window scrolls, a div scrolls, or the
       app sits in an iframe — and it never reads window.innerHeight,
       which is the wrong number the moment the page is not the scroller. */
    const progress = () => {
      const len = pinEl.offsetHeight - stage.offsetHeight;
      if (len <= 0) return -1;
      const slid =
        stage.getBoundingClientRect().top - pinEl.getBoundingClientRect().top;
      return clamp(slid / len);
    };

    /* position:sticky silently stops working if ANY ancestor has overflow
       hidden or clip: the stage scrolls away and leaves the pin’s whole
       height behind as empty space. That is the classic "why is this
       section so long". Find the culprit so we can fall back instead. */
    const stickyBlocker = () => {
      let n = stage.parentElement;
      while (n && n !== document.body && n !== document.documentElement) {
        const v = getComputedStyle(n);
        if (
          v.overflowX === "hidden" || v.overflowX === "clip" ||
          v.overflowY === "hidden" || v.overflowY === "clip"
        )
          return n;
        n = n.parentElement;
      }
      return null;
    };

    const place = (p: number) => {
      const w = cards[0].offsetWidth;
      const h = (w * 540) / 441;
      const avail = fan.clientWidth - 16;
      const span = Math.min(w * SPREAD, (avail - w) / (N - 1));
      const depth = w * DEPTH;

      const d = ease(clamp(p / DEAL));            // 0 stacked, 1 fanned
      const t = clamp((p - START) / (END - START));
      const pos = t * (N - 1);                    // which card leads

      fan.style.transform = `rotate(${((MID - pos) * 0.7).toFixed(2)}deg)`;

      cards.forEach((c, i) => {
        const o = i - MID;

        /* fanned position, then the same thing collapsed to a tidy deck.
           d crossfades between them, so it is never a pile of glass. */
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

        /* raised cosine, not a triangle: flat at the peak and flat where
           it lands, so the lead eases in and out instead of cornering */
        const k = near < 1 ? 0.5 * (1 + Math.cos(Math.PI * near)) : 0;
        const scale = (0.96 + k * 0.1) * (0.9 + d * 0.1);
        const lift = -k * 30 * d;

        /* The deck parts around the lead card so the lead never sits on a
           neighbour’s copy. This has to be an ODD, CONTINUOUS function of
           s. Anything built on Math.sign(s) flips the full parting width
           the instant the lead crosses a card — 84px in one frame, which
           is what made this feel like it snapped sideways. s*exp(-s^2/2)
           is zero at the lead, peaks at its neighbours, decays away. */
        x += PART * s * Math.exp((-s * s) / 2) * d;

        /* then every card is clamped inside the frame, measured on the
           ROTATED box, which is what actually overflows */
        const rad = (Math.abs(rot) * Math.PI) / 180;
        const half = ((w * Math.cos(rad) + h * Math.sin(rad)) / 2) * scale;
        const edge = Math.max(0, avail / 2 - half);
        x = Math.max(-edge, Math.min(edge, x));

        c.style.transform =
          `translate(-50%,-50%) translate(${x.toFixed(1)}px,${(y + lift).toFixed(1)}px) ` +
          `rotate(${rot.toFixed(2)}deg) scale(${scale.toFixed(3)})`;
        c.style.zIndex = String(50 - i);   // card 1 in front, then 2, 3, 4, 5
        c.dataset.active = d > 0.9 && near < 0.5 ? "true" : "false";
      });

      /* the progress dots underneath fill pink as the lead walks the arc:
         dot i lights the moment the lead reaches card i */
      const dots = dotsRef.current;
      if (dots)
        Array.from(dots.children).forEach((dot, i) => {
          (dot as HTMLElement).dataset.on = pos + 0.5 >= i ? "true" : "false";
        });
    };

    /* is-live / is-in through IntersectionObserver, which resolves against
       whatever is actually scrolling rather than assuming it is the window */
    const io = new IntersectionObserver(
      (es) => es.forEach((e) => setLive(e.isIntersecting)),
      { rootMargin: "0px 0px -14% 0px" },
    );
    io.observe(stage);

    /* Phone deck (or reduced motion): the observer above still drives is-live
       and the shuffle, but the scroll-fan below has nothing to do. */
    if (deck || reduce) return () => io.disconnect();

    const blocker = stickyBlocker();
    if (blocker) {
      setFlat(true);
      console.warn(
        "[BrandInMotionCards] position:sticky is blocked by an ancestor with " +
          "overflow hidden/clip, so this section cannot pin. Falling back to " +
          "a static arc. Offending element:",
        blocker,
      );
      requestAnimationFrame(() => place(0.6));
      return () => io.disconnect();
    }

    /* Scroll position is chunky — a wheel notch is a jump, not a slide. So
       scroll sets a TARGET and the arc eases toward it every frame. The pin
       itself still tracks scroll exactly; only the card arrangement lags,
       which is what turns notches into motion. DAMP is the dial. */
    let target = 0;
    let cur = 0;
    let raf = 0;

    const tick = () => {
      raf = 0;
      if (reduce) return;
      const p = progress();
      if (p < 0) return;
      target = p;
      const gap = target - cur;
      cur = Math.abs(gap) < 0.0004 ? target : cur + gap * DAMP;
      place(cur);
      if (cur !== target) raf = requestAnimationFrame(tick);
    };
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };

    /* Capture phase: scroll events do not bubble, so a listener on window
       never hears a scrolling DIV. This hears every scroller on the page. */
    document.addEventListener("scroll", kick, { passive: true, capture: true });
    window.addEventListener("resize", kick);
    window.addEventListener("load", kick);
    const ro =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(kick) : null;
    ro?.observe(pinEl);
    kick();

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro?.disconnect();
      document.removeEventListener("scroll", kick, { capture: true } as any);
      window.removeEventListener("resize", kick);
      window.removeEventListener("load", kick);
    };
  }, [deck, reduce]);

  return (
    <section className={`bmc ${flat ? "bmc--flat" : ""} ${deck ? "bmc--deck" : ""}`} id={id} ref={rootRef}>
      <style>{CSS}</style>
      <div className="bmc__pin" ref={pin}>
      <div className={`bmc__stage ${live ? "is-live" : ""}`} ref={stageRef}>
        <div className="bmc__top">
          <h2 className="bmc__q">
            So&hellip; what&rsquo;s a <b>brand in motion?</b>
          </h2>
        </div>

        <div className="bmc__fan" ref={fanRef}>
          {CARDS.map((c, i) => {
            const pos = order.indexOf(i);
            const deckStyle = deck
              ? {
                  transform:
                    `translateX(-50%) translateY(${pos * 18}px) ` +
                    `scale(${(1 - pos * 0.05).toFixed(3)}) rotate(${(pos * -2.2).toFixed(1)}deg)`,
                  opacity: pos === 0 ? 1 : Math.max(0.55, 1 - pos * 0.12),
                  zIndex: 50 - pos,
                }
              : null;
            return (
            <article
              className="bmc__card"
              key={i}
              style={{
                background: c.bg,
                color: c.fg,
                ["--hot" as string]: c.hot,
                ["--idle" as string]: c.idle,
                ["--hover" as string]: c.hover,
                ...(deckStyle || {}),
              }}
            >
              <p className="bmc__copy">
                {c.pre}
                <em>{c.emph}</em>
                {c.rest}
              </p>
              <span className="bmc__icon">
                <CardIcon name={c.icon} plain />
              </span>
            </article>
            );
          })}
        </div>

        <div className="bmc__dots" ref={dotsRef} aria-hidden="true">
          {CARDS.map((_, i) => (
            <span className="bmc__dot" key={i} data-on={deck && order[0] === i ? "true" : "false"} />
          ))}
        </div>

        {/* the payoff + CTA lockup, centred below the deck */}
        <div className="bmc__aside">
          <h3 className="bmc__payoff">Sound familiar?</h3>
          <a className="bmc__cta" href="#contact">
            Let&rsquo;s Talk
          </a>
        </div>
      </div>
      </div>
    </section>
  );
}

const CSS = `
.bmc{ position:relative; background:#FEFCF4; color:#252525; }
/* NOTE: the <section> carries id="motion", so any rule elsewhere in the
   project that targets #motion by id will beat every class rule in this
   file. The component sets the section's height inline on mount for
   exactly that reason — see sizeGuard below. */

/* THE SECTION'S SCROLL LENGTH. This is the one number to change if the
   section feels too long or too short. 220vh = a bit over two screens of
   scroll for the whole beat. */
.bmc__pin{ position:relative; height:220vh; }
.bmc__stage{
  position:sticky; top:0; height:100svh; overflow:hidden;
  display:flex; flex-direction:column; align-items:stretch;
  padding:clamp(34px,6vh,76px) clamp(20px,3vw,56px) clamp(20px,4vh,48px);
}

/* Figtree 300 / 98 / 97.7 / -3.71px / #FFFAF5, straight off the Figma
   panel. Sizes are relative so it scales: -3.71/98 = -.038em, 97.7/98 =
   .997. 300 is Figtree's lightest cut — there is nothing below it. */
.bmc__q{
  margin:0; flex:0 1 auto;
  font-weight:300; letter-spacing:-.038em; line-height:.997; text-align:left;
  font-size:clamp(34px,5.4vw,98px);
  color:#252525;
  opacity:0; transform:translateY(18px);
  transition:opacity .7s cubic-bezier(.22,.61,.36,1), transform .7s cubic-bezier(.22,.61,.36,1);
}
.bmc__stage.is-live .bmc__q{ opacity:1; transform:none; }
/* the break after "what's a" is this display:block, not a <br> */
.bmc__q b{ display:block; font-weight:800; color:#BE7A3A; }

/* masthead: the question on the left, the payoff and CTA flush right.
   Bottoms are aligned, so the small block sits on the header's last line
   rather than floating somewhere beside it. */
.bmc__top{
  flex:0 0 auto;
  display:flex; align-items:flex-end; justify-content:space-between;
  gap:clamp(24px,4vw,90px);
  padding:60px 0 0;
  margin:0 0 clamp(14px,2.4vh,34px);
}
/* payoff + CTA, centred in a lockup directly beneath the deck */
.bmc__aside{
  flex:0 0 auto;
  display:flex; flex-direction:column; align-items:center; text-align:center;
  gap:clamp(12px,1.6vh,20px);
  margin:40px 0 0;
  opacity:0; transform:translateY(14px);
  transition:opacity .7s cubic-bezier(.22,.61,.36,1) .18s,
             transform .7s cubic-bezier(.22,.61,.36,1) .18s;
}
.bmc__stage.is-live .bmc__aside{ opacity:1; transform:none; }

/* the arc. Cards are placed absolutely from this centre; JS writes the
   transforms so the tilt can follow the real tangent of the curve. */
/* five outline dots under the deck, one per card; each fills solid pink
   the moment its card becomes the lead as you scroll */
.bmc__dots{
  flex:0 0 auto; display:flex; justify-content:center;
  gap:clamp(10px,1vw,16px);
  /* pulled up so the row sits tight under the deck rather than floating
     at the bottom of the stage */
  margin-top:clamp(-72px,-8vh,-36px); position:relative; z-index:60;
  opacity:0; transform:translateY(8px);
  transition:opacity .7s cubic-bezier(.22,.61,.36,1) .24s,
             transform .7s cubic-bezier(.22,.61,.36,1) .24s;
}
.bmc__stage.is-live .bmc__dots{ opacity:1; transform:none; }
.bmc__dot{
  width:12px; height:12px; border-radius:50%;
  border:1.5px solid rgba(37,37,37,.28); background:transparent;
  transition:background .35s cubic-bezier(.22,.61,.36,1),
             border-color .35s cubic-bezier(.22,.61,.36,1);
}
.bmc__dot[data-on="true"]{ background:#F06496; border-color:#F06496; }

.bmc__fan{
  position:relative; flex:1 1 auto; width:100%; min-height:0;
  transition:transform .5s cubic-bezier(.22,.61,.36,1);
}
.bmc__card{
  position:absolute; left:50%; top:50%;
  width:clamp(168px,17.5vw,300px);
  aspect-ratio:441 / 540;
  border-radius:clamp(12px,1.35vw,26px);
  padding:clamp(15px,1.6vw,28px);
  display:flex; flex-direction:column;
  transform-origin:50% 50%;
  transform:translate(-50%,-50%);
  will-change:transform;
  box-shadow:0 14px 34px rgba(37,37,37,.16);
  transition:box-shadow .45s cubic-bezier(.22,.61,.36,1);
}
.bmc__card[data-active="true"]{ box-shadow:0 24px 56px rgba(37,37,37,.26); }
.bmc__card:hover{ box-shadow:0 24px 56px rgba(37,37,37,.26); }

.bmc__copy{
  margin:0; font-weight:300; letter-spacing:-.02em; line-height:1.14;
  font-size:clamp(14px,1.72vw,29px);
}
.bmc__copy em{
  font-family:var(--hc-serif,"Lora","Newsreader",Georgia,serif);
  font-style:italic; font-weight:600; color:var(--hot);
}

.bmc__icon{
  position:absolute; right:clamp(13px,1.5vw,28px); bottom:clamp(13px,1.5vw,28px);
  width:clamp(48px,4.8vw,88px); line-height:0;
  color:var(--idle);
  transition:color .45s cubic-bezier(.22,.61,.36,1);
}
.bmc__icon svg{ width:100%; height:auto; display:block; }
/* a -> b. The lead card gets there on its own, so the state is visible
   on touch, where there is no hover. */
.bmc__card:hover .bmc__icon,
.bmc__card[data-active="true"] .bmc__icon{ color:var(--hover); }

/* Fallback when position:sticky can't work (see stickyBlocker below).
   Without this the pin stays 220vh tall with nothing pinned in it, which
   reads as one enormously long empty section. */
.bmc--flat .bmc__pin{ height:auto; }
.bmc--flat .bmc__stage{ position:static; }

.bmc__payoff{
  margin:0; font-weight:600; color:#BE7A3A;
  letter-spacing:-.03em; line-height:1.02;
  font-size:clamp(24px,2.7vw,48px);
}
.bmc__cta{
  display:inline-block; font:inherit; cursor:pointer;
  font-size:clamp(14px,1.05vw,18px); font-weight:500; letter-spacing:.005em;
  color:#252525; background:none; text-decoration:none;
  border:1.5px solid #252525; border-radius:999px;
  padding:clamp(12px,1.05vw,17px) clamp(26px,2.6vw,44px);
  transition:background .3s cubic-bezier(.22,.61,.36,1), color .3s cubic-bezier(.22,.61,.36,1);
}
.bmc__cta:hover{ background:#252525; color:#FEFCF4; }

/* narrow screens: the arc has nowhere to spread, so the deck stacks and
   shuffles (JS adds .bmc--deck; transforms are written inline per card) */
@media(max-width:1000px){
  .bmc__pin{ height:auto; }
  .bmc__stage{ position:static; height:auto; padding:11vh clamp(22px,6vw,48px) 9vh; }
  .bmc__top{ padding-left:0; padding-right:0; padding-top:30px; }
  /* type is sized off the card here, not the viewport, so it keeps the
     comps' proportions once the card stops scaling with the screen */
  .bmc__copy{ font-size:clamp(20px,8vw,30px); }
  .bmc__icon{ width:clamp(56px,21vw,86px); right:clamp(16px,6.4vw,26px); bottom:clamp(16px,6.4vw,26px); }
}

/* the shuffling deck PINS on phones: the pin is a tall scroll track and the
   stage sticks full-height, so scrolling walks the deck and only releases
   after the last card. JS restacks the cards from the pin's scroll progress. */
.bmc--deck .bmc__pin{ height:calc(100svh * 3.6); }
/* top-align so the heading rides high on the screen (annotation 2); the top
   padding only clears the fixed nav rather than centring the stack. */
.bmc--deck .bmc__stage{
  position:sticky; top:0; height:100svh;
  justify-content:flex-start; gap:clamp(8px,1.4vh,16px);
  padding:clamp(60px,8vh,84px) clamp(22px,6vw,48px) clamp(14px,2.5vh,28px);
}
/* matched to the mobile "Day one." headline size (annotation 1). */
.bmc--deck .bmc__q{ font-size:clamp(40px,11vw,64px); }
/* margins zeroed on the sides/bottom per the edit; the fan stays centred in
   the flex column via align-self so the deck reads centred without margin auto. */
.bmc--deck .bmc__fan{
  display:block; position:relative; flex:0 0 auto; align-self:center; margin:14px 0 0;
  width:min(260px,68vw); height:calc(min(260px,68vw) * 1.5);
}
.bmc--deck .bmc__card{
  position:absolute; left:50%; top:0; margin:0;
  width:min(260px,68vw); transform-origin:50% 92%;
  padding:clamp(18px,7.2vw,29px);
  transition:transform .62s cubic-bezier(.22,.61,.36,1),
             opacity .5s cubic-bezier(.22,.61,.36,1),
             box-shadow .45s cubic-bezier(.22,.61,.36,1);
}
/* the fan now reserves the full card height, so the dot counter sits well
   below the card stack instead of overlaying it. */
.bmc--deck .bmc__dots{ margin-top:24px; }
/* the "Sound familiar?" + CTA lockup is dropped on the mobile deck so the
   card stack and dot counter own the pinned screen. */
.bmc--deck .bmc__aside{ display:none; }

@media (prefers-reduced-motion: reduce){
  .bmc__pin{ height:auto; }
  .bmc__stage{ position:static; height:auto; padding:12vh clamp(22px,6vw,48px); }
  .bmc__aside{ opacity:1; transform:none; }
  .bmc__fan{ display:grid; gap:20px; justify-items:center; transform:none !important; }
  .bmc__card{ position:static; transform:none !important; }
  .bmc__q{ opacity:1; transform:none; }
  .bmc__fan{ transition:none; }
}
`;
