"use client";

/* ============================================================
   BrandInMotion — Section 2, rebuilt to the new comps.

   Pinned. A fixed heading top-left, a timeline index down the left
   that fills in as you go, and the active trigger shown large at the
   bottom right with a line icon above it. The whole ground changes
   colour per card.

   Sampled straight from the comps:
     grounds   #465F63 · #334338 · #FFFCF5 · #252525 · #FFFCF5
     accent    #FF981E on dark grounds, #BE7837 on light
     the accent phrase is a SERIF ITALIC — Loretta in the comps
   ============================================================ */

import { useEffect, useRef, useState } from "react";
import { CardIcon, IconName } from "./CardIcons";

const INTRO = 0.14;

const CARDS = [
  { lead: "Your equity-backed", rest: "company needs ASAP marketing services",
    idxLead: "Your equity-backed", idxRest: "company needs ASAP marketing services.",
    bg: "#465F63", fg: "#FFFCF5", icon: "speed" as IconName },
  { lead: "Just been acquired", rest: "and need to reintroduce yourself",
    idxLead: "Just been acquired", idxRest: "and need to reintroduce yourself",
    bg: "#334338", fg: "#FFFCF5", icon: "acquired" as IconName },
  { lead: "Ready to launch", rest: "(or should be ready to launch)",
    idxLead: "Ready to launch", idxRest: "(or should be ready to launch)",
    bg: "#FFFCF5", fg: "#252525", icon: "launch" as IconName },
  { lead: "Mid-merger", rest: "and the brand story hasn't caught up yet",
    idxLead: "Mid-merger", idxRest: "and the brand story hasn't caught up yet",
    bg: "#252525", fg: "#FFFCF5", icon: "merge" as IconName },
  { lead: "Pivoting", rest: "because the tech stack changed",
    idxLead: "Pivoting", idxRest: "because the tech stack changed",
    bg: "#FFFCF5", fg: "#252525", icon: "pivot" as IconName },
];

/* accent follows the ground: bright orange on dark, copper on light */
const accentFor = (bg: string) => (bg === "#FFFCF5" ? "#BE7837" : "#FF981E");
const PINK = "#F06496";   /* the progress dots stay pink, per brand */

export function BrandInMotion({ id = "motion" }: { id?: string }) {
  const pin = useRef<HTMLElement>(null);
  const [active, setActive] = useState(-1);   // -1 = heading only, before the cards
  const [live, setLive] = useState(false);   // section reached — heading animates in

  useEffect(() => {
    const el = pin.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const r = el.getBoundingClientRect();
        setLive(r.top < window.innerHeight * 0.75 && r.bottom > 0);
        const span = r.height - window.innerHeight;
        if (span <= 0) return;
        const p = Math.min(1, Math.max(0, -r.top / span));
        /* A beat where the heading is alone on screen, then the cards run. */
        if (p < INTRO) { setActive(-1); return; }
        const i = Math.min(CARDS.length - 1, Math.floor((p - INTRO) / ((1 - INTRO) / CARDS.length)));
        setActive(i);
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
  }, []);

  const intro = active < 0;
  const card = CARDS[Math.max(0, active)];
  /* before the first card the ground is already card one's — only the
     index and the feature are still held back */
  const accent = accentFor(card.bg);

  return (
    <section className="bim" id={id} ref={pin}>
      <style>{CSS}</style>
      <div className={`bim__stage ${intro ? "is-intro" : ""} ${live ? "is-live" : ""}`} style={{ background: card.bg, color: card.fg }}>
        <h2 className="bim__q">
          So&hellip; what&rsquo;s a<br />
          <em style={{ color: accent }}>brand in motion?</em>
        </h2>

        <ol className="bim__index">
          {CARDS.map((c, i) => (
            <li key={i} className={i <= active ? "is-in" : ""} style={{ transitionDelay: `${Math.max(0, i - active) * 0}s` }}>
              <span className="bim__node" style={{
                borderColor: PINK,
                background: i <= active ? PINK : "transparent",
              }} />
              <span className="bim__row">
                <em style={{ color: accent }}>{c.idxLead}</em> {c.idxRest}
              </span>
            </li>
          ))}
        </ol>

        <div className="bim__feature" key={active} hidden={intro}>
          <span className="bim__iconwrap"><CardIcon name={card.icon} /></span>
          <p className="bim__big">
            <em style={{ color: accent }}>{card.lead}</em>{" "}
            <span>{card.rest}</span>
          </p>
        </div>

      </div>
    </section>
  );
}

const CSS = `
.bim{ position:relative; height:520vh; }
.bim__stage{
  position:sticky; top:0; height:100svh; overflow:hidden;
  padding:clamp(48px,6vw,86px) clamp(24px,5vw,78px);
  transition:background .55s cubic-bezier(.22,.61,.36,1), color .55s cubic-bezier(.22,.61,.36,1);
}
.bim em{ font-family:var(--bim-serif,"Loretta","Newsreader",Georgia,serif); font-style:italic; font-weight:600; }

.bim__q{
  margin:0; font-weight:300; letter-spacing:-.02em; line-height:1.06;
  font-size:clamp(28px,3.4vw,50px);
  /* Just an entrance where it sits — no scale-down from a hero state. */
  opacity:0; transform:translateY(20px);
  transition:opacity .7s cubic-bezier(.22,.61,.36,1),
             transform .7s cubic-bezier(.22,.61,.36,1);
}
.bim__stage.is-live .bim__q{ opacity:1; transform:none; }
.bim__q em{ font-size:1.06em; }

.bim__index{
  transition:opacity .5s;
  list-style:none; margin:clamp(30px,5vh,64px) 0 0; padding:0;
  max-width:min(34ch,32vw); position:relative;
}
.bim__index li{ position:relative; padding:0 0 clamp(14px,2.2vh,26px) 34px; }
/* The reveal sits on the CHILDREN, not the <li>. Putting opacity on the li
   would fade out ::before with it, and ::before is the rail — which has to
   stay visible the whole way down. */
.bim__index li > .bim__node,
.bim__index li > .bim__row{
  opacity:0; transform:translateY(14px);
  transition:opacity .55s cubic-bezier(.22,.61,.36,1),
             transform .55s cubic-bezier(.22,.61,.36,1),
             background .4s cubic-bezier(.22,.61,.36,1);
}
.bim__index li.is-in > .bim__node,
.bim__index li.is-in > .bim__row{ opacity:1; transform:none; }
.bim__index li::before{        /* the connecting rail — always on */
  content:""; position:absolute; left:10px; top:14px; bottom:-2px; width:1.5px;
  background:currentColor; opacity:.32;
}
.bim__index li:last-child::before{ display:none; }
.bim__stage.is-intro .bim__index{ opacity:0; }
.bim__node{
  position:absolute; left:3px; top:5px; width:15px; height:15px;
  border-radius:50%; border:2px solid; box-sizing:border-box;
}
.bim__row{ display:block; font-size:clamp(12px,.95vw,15px); line-height:1.45; font-weight:400; }

.bim__feature{
  position:absolute; right:clamp(24px,5vw,78px); bottom:clamp(48px,7vh,90px);
  left:clamp(24px,30vw,40%); text-align:right;
  animation:bimIn .55s cubic-bezier(.22,.61,.36,1) both;
}
@keyframes bimIn{ from{ opacity:0; transform:translateY(18px); } to{ opacity:1; transform:none; } }
.bim__iconwrap{
  display:block; width:clamp(92px,11vw,170px);
  margin:0 0 clamp(18px,3vh,40px) auto; opacity:.5;
}
.bim__big{
  margin:0; font-weight:300; letter-spacing:-.02em; line-height:1.08;
  font-size:clamp(30px,4.6vw,72px);
}
.bim__big em{ font-weight:600; }


@media(max-width:820px){
  .bim__index{ max-width:none; }
  .bim__feature{ left:clamp(24px,5vw,78px); text-align:left; }
  .bim__iconwrap{ margin-left:0; }
}
@media (prefers-reduced-motion: reduce){
  .bim{ height:auto; }
  .bim__stage{ position:static; height:auto; }
  .bim__feature{ position:static; animation:none; margin-top:40px; text-align:left; }
  .bim__iconwrap{ margin-left:0; }
}
`;
