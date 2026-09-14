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

   Ground: slate #506E78. Card grounds, copy, emphasis colours and both
   icon states are sampled from the comps.

   Tuning is at the top of the effect — DEAL/START/END for timing,
   SPREAD for overlap, DEPTH for how deep the arc bows, TILT for how
   far the cards lean, PART for how wide the deck opens.
   ============================================================ */

import { useEffect, useRef, useState } from "react";
import { CardIcon, IconName } from "./CardIcons";

const CREAM = "#FEFCF4";
const SLATE = "#506E78";
const ORANGE = "#FF981E";

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
    bg: "#FEFCF4", fg: "#252525", hot: "#BE7A3A", icon: "launch", idle: "#E4C7A8", hover: "#BE7A3A" },
  { emph: "Mid-merger", rest: " and the brand story hasn’t caught up yet.",
    bg: "#252525", fg: "#FEFCF4", hot: "#FF981E", icon: "merge", idle: "#7C7B78", hover: "#FF981E" },
  { emph: "Pivoting", rest: " because the tech stack changed.",
    bg: "#FEFCF4", fg: "#252525", hot: "#BE7A3A", icon: "pivot", idle: "#E4C7A8", hover: "#BE7837" },
];

export function BrandInMotionCards({ id = "motion" }: { id?: string }) {
  const pin = useRef<HTMLDivElement>(null);
  const fanRef = useRef<HTMLDivElement>(null);
  const outro = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState(false);
  const [outroIn, setOutroIn] = useState(false);

  useEffect(() => {
    const el = pin.current;
    const fan = fanRef.current;
    if (!el || !fan) return;

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
    };

    /* Scroll position is chunky — a wheel notch is a jump, not a slide. So
       scroll sets a TARGET and the arc eases toward it every frame. The pin
       itself still tracks scroll exactly; only the card arrangement lags,
       which is what turns notches into motion. DAMP is the dial. */
    let target = 0;
    let cur = 0;
    let raf = 0;

    const tick = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      setLive(r.top < window.innerHeight * 0.75 && r.bottom > 0);
      if (outro.current)
        setOutroIn(outro.current.getBoundingClientRect().top < window.innerHeight * 0.86);
      const len = r.height - window.innerHeight;
      if (len <= 0 || reduce) return;
      target = clamp(-r.top / len);
      const gap = target - cur;
      cur = Math.abs(gap) < 0.0004 ? target : cur + gap * DAMP;
      place(cur);
      if (cur !== target) raf = requestAnimationFrame(tick);
    };
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };

    window.addEventListener("scroll", kick, { passive: true });
    window.addEventListener("resize", kick);
    window.addEventListener("load", kick);
    kick();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", kick);
      window.removeEventListener("resize", kick);
      window.removeEventListener("load", kick);
    };
  }, []);

  return (
    <section className="bmc" id={id}>
      <style>{CSS}</style>
      <div className="bmc__pin" ref={pin}>
      <div className={`bmc__stage ${live ? "is-live" : ""}`}>
        <h2 className="bmc__q">
          So&hellip; what&rsquo;s a <b>brand in motion?</b>
        </h2>

        <div className="bmc__fan" ref={fanRef}>
          {CARDS.map((c, i) => (
            <article
              className="bmc__card"
              key={i}
              style={{
                background: c.bg,
                color: c.fg,
                ["--hot" as string]: c.hot,
                ["--idle" as string]: c.idle,
                ["--hover" as string]: c.hover,
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
          ))}
        </div>
      </div>
      </div>

      <div className={`bmc__outro ${outroIn ? "is-in" : ""}`} ref={outro}>
        <h3 className="bmc__payoff">Sound familiar?</h3>
        <a className="bmc__cta" href="#contact">
          Let&rsquo;s Talk
        </a>
      </div>
    </section>
  );
}

const CSS = `
.bmc{ position:relative; background:#506E78; color:#FEFCF4; }
.bmc__pin{ position:relative; height:300vh; }
.bmc__stage{
  position:sticky; top:0; height:100svh; overflow:hidden;
  display:flex; flex-direction:column; align-items:center;
  padding:clamp(34px,6vh,76px) clamp(20px,3vw,56px) clamp(20px,4vh,48px);
}

/* Figtree 300 / 98 / 97.7 / -3.71px / #FFFAF5, straight off the Figma
   panel. Sizes are relative so it scales: -3.71/98 = -.038em, 97.7/98 =
   .997. 300 is Figtree's lightest cut — there is nothing below it. */
.bmc__q{
  margin:0 0 clamp(14px,2.4vh,34px); flex:0 0 auto;
  font-weight:300; letter-spacing:-.038em; line-height:.997; text-align:center;
  font-size:clamp(34px,5.4vw,98px);
  color:#FFFAF5;
  opacity:0; transform:translateY(18px);
  transition:opacity .7s cubic-bezier(.22,.61,.36,1), transform .7s cubic-bezier(.22,.61,.36,1);
}
.bmc__stage.is-live .bmc__q{ opacity:1; transform:none; }
/* the break after "what's a" is this display:block, not a <br> */
.bmc__q b{ display:block; font-weight:800; color:#FF981E; }

/* the arc. Cards are placed absolutely from this centre; JS writes the
   transforms so the tilt can follow the real tangent of the curve. */
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
  box-shadow:0 14px 34px rgba(16,26,30,.20);
  transition:box-shadow .45s cubic-bezier(.22,.61,.36,1);
}
.bmc__card[data-active="true"]{ box-shadow:0 26px 60px rgba(12,20,24,.34); }
.bmc__card:hover{ box-shadow:0 26px 60px rgba(12,20,24,.34); }

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

/* the payoff and the CTA, after the pin releases — same ground, so it
   reads as one section, but with room of its own rather than crammed
   under the arc */
.bmc__outro{
  display:flex; flex-direction:column; align-items:center;
  gap:clamp(22px,3.6vh,42px);
  padding:clamp(70px,14vh,150px) clamp(20px,3vw,56px) clamp(90px,18vh,190px);
  text-align:center;
  opacity:0; transform:translateY(22px);
  transition:opacity .8s cubic-bezier(.22,.61,.36,1), transform .8s cubic-bezier(.22,.61,.36,1);
}
.bmc__outro.is-in{ opacity:1; transform:none; }
.bmc__payoff{
  margin:0; font-weight:800; color:#FF981E;
  letter-spacing:-.038em; line-height:.997;
  font-size:clamp(28px,4vw,72px);
}
.bmc__cta{
  display:inline-block; font:inherit; cursor:pointer;
  font-size:clamp(14px,1.05vw,18px); font-weight:500; letter-spacing:.005em;
  color:#FEFCF4; background:none; text-decoration:none;
  border:1.5px solid #FEFCF4; border-radius:999px;
  padding:clamp(12px,1.05vw,17px) clamp(26px,2.6vw,44px);
  transition:background .3s cubic-bezier(.22,.61,.36,1), color .3s cubic-bezier(.22,.61,.36,1);
}
.bmc__cta:hover{ background:#FEFCF4; color:#506E78; }

/* narrow screens: the arc has nowhere to go, so it becomes a read */
@media(max-width:1000px){
  .bmc__pin{ height:auto; }
  .bmc__stage{ position:static; height:auto; padding:12vh clamp(22px,6vw,48px) 0; }
  .bmc__fan{ display:grid; gap:20px; justify-items:center; transform:none !important; }
  .bmc__card{
    position:static; width:min(320px,84vw);
    transform:none !important;
    padding:clamp(18px,7.2vw,29px);
  }
  /* type is sized off the card here, not the viewport, so it keeps the
     comps' proportions once the card stops scaling with the screen */
  .bmc__copy{ font-size:clamp(20px,8vw,30px); }
  .bmc__icon{ width:clamp(56px,21vw,86px); right:clamp(16px,6.4vw,26px); bottom:clamp(16px,6.4vw,26px); }
}

@media (prefers-reduced-motion: reduce){
  .bmc__pin{ height:auto; }
  .bmc__stage{ position:static; height:auto; padding:12vh clamp(22px,6vw,48px) 0; }
  .bmc__outro{ opacity:1; transform:none; }
  .bmc__fan{ display:grid; gap:20px; justify-items:center; transform:none !important; }
  .bmc__card{ position:static; transform:none !important; }
  .bmc__q{ opacity:1; transform:none; }
  .bmc__fan{ transition:none; }
}
`;
