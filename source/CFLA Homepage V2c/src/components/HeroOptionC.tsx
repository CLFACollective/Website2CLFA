"use client";

/* ============================================================
   HeroOptionC — HeroOptionB with a fourth act.

   The subcopy is no longer a caption sitting under the lockup on the
   rose. A cream circle rises from the bottom of the frame, floods the
   screen back to ground, and the copy arrives centred in it — set as
   hero copy, at the same size as the lead lines, with the phrase that
   carries the offer in copper. Same read as the beats, so the whole
   sequence lands as one piece rather than a title card plus a caption.

   Each beat is a light lead line with the emphasis stacked beneath
   it on its own line(s), centred. Emphasis is heavy sans in copper,
   not Lora italic — the only italic left is "for brands in motion"
   on the final frame, which is how the comps have it.

   prelude  a solid rose circle, 400px across, carrying the charcoal
            CLFA mark with a cream knockout in the A. It contracts to
            nothing, taking the mark with it, then the outlined iris
            opens back out of that same point
   beat 1   iris, ring visible          (comp 2a)
   beat 2   swipe, no ring              (comp 2b)
   beat 3   iris, no ring               (comps 2c + 2d) — the aperture
            opens once and stays open while "smarter" swaps to
            "faster" in place; the lead and "solve" never move
   lockup   blooms into rose. "solve" set lowercase and huge in cream,
            with "We are the" on its top-left shoulder and a charcoal
            rule running out to the italic tail beneath. No ring.
   closing  a cream circle climbs from below the frame and takes the
            screen back to ground. The subcopy rises into it, centred.

   COLOUR sampled off the comps, all palette:
     ground  #FFFAF5   emphasis #BE7837   "faster" #527078
     flood   #F06496   SOLVE    #FFFCF5   lead/tail #252525
   ============================================================ */

import { useEffect, useRef, useState } from "react";
import { ClfaMark } from "./ClfaMark";

const CREAM = "#FFFCF5";
const CHARCOAL = "#252525";
const COPPER = "#BE7837";
const AZURE = "#527078";
const ROSE = "#F06496";

type Word = { t: string; c?: string };
type Beat = { lead: string; swap?: Word[]; emph: Word[]; ring?: boolean };

const BEATS: Beat[] = [
  /* each emph entry is its own line, so this breaks exactly where the comp does */
  { lead: "Where healthcare meets tech,", emph: [{ t: "the ground" }, { t: "keeps shifting" }], ring: true },
  { lead: "When your organization is", emph: [{ t: "changing rapidly" }] },
  /* one beat, not two: only the middle word changes */
  { lead: "We are the", swap: [{ t: "smarter" }, { t: "faster", c: AZURE }], emph: [{ t: "solve" }] },
];

/* four acts now, so the section is longer and each fraction is smaller.
   Roughly: 52vh of dot, 224vh of beats, 130vh of rose lockup, 114vh of
   cream close. */
const PRE = 0.10;           // the rose dot
const OPEN = 0.53;          // beats run to here, then the rose takes over
const RISE = 0.78;          // and here the cream circle starts climbing

export function HeroOptionC({ id = "hero" }: { id?: string }) {
  const pin = useRef<HTMLElement>(null);
  const solveRef = useRef<HTMLElement>(null);
  const [i, setI] = useState(0);
  const [sw, setSw] = useState(0);   // which word is showing in a swap beat

  /* Taken from the live text rather than guessed, so it survives the
     webfont landing and a change of face:

     --solve-fit the font size at which "solve" exactly fills the column.
                Phones use it outright, so the display always spans the
                full measure and the rule + italic beneath it — which
                stretch to the same column — line up with its edges no
                matter which face is loaded. Wider screens use it only as
                a ceiling, since there "solve" is meant to sit at about
                half the viewport rather than fill it. */
  useEffect(() => {
    const host = pin.current;
    const solve = solveRef.current;
    if (!host || !solve) return;

    const sync = () => {
      const stage = host.querySelector(".hcb__stage") as HTMLElement | null;
      const lockup = host.querySelector(".hcb__lockup") as HTMLElement | null;
      if (!stage || !lockup) return;
      const cs = getComputedStyle(lockup);
      const avail =
        stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const size = parseFloat(getComputedStyle(solve).fontSize);
      const width = solve.getBoundingClientRect().width;
      if (!size || !width || avail <= 0) return;
      /* width scales linearly with size, so this ratio is a constant of the
         face — recomputing it every time lands on the same answer instead
         of chasing itself */
      host.style.setProperty("--solve-fit", `${Math.floor(avail / (width / size))}px`);
    };

    const ro = new ResizeObserver(sync);
    ro.observe(solve);
    sync();
    document.fonts?.ready.then(sync).catch(() => {});
    window.addEventListener("resize", sync);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", sync);
    };
  }, []);

  useEffect(() => {
    const el = pin.current;
    if (!el) return;
    const stage = el.querySelector(".hcb__stage") as HTMLElement;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      stage.style.setProperty("--flood", "1");
      stage.style.setProperty("--head", "1");
      stage.style.setProperty("--rise", "1");
      stage.style.setProperty("--copy", "1");
      return;
    }

    const clamp = (x: number) => Math.min(1, Math.max(0, x));
    const ease = (x: number) => 1 - Math.pow(1 - x, 2.6);
    /* the rise wants a climb, not a snap — eased at both ends */
    const easeIO = (x: number) =>
      x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;

    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const r = el.getBoundingClientRect();
        const span = r.height - window.innerHeight;
        if (span <= 0) return;
        const p = clamp(-r.top / span);

        /* the aperture is sized off vmin so it matches the comps on any
           viewport — the ring in 2a is about 98% of the frame height */
        const vmin = Math.min(window.innerWidth, window.innerHeight);
        const PEAK = vmin * 0.49;
        const DOT_R = 200;                 // 400 x 400px to begin with

        if (p < PRE) {
          setI(0);
          stage.dataset.motion = "iris";
          stage.dataset.ring = "on";
          stage.style.setProperty("--flood", "0");
          stage.style.setProperty("--head", "0");
          stage.style.setProperty("--rise", "0");
          stage.style.setProperty("--copy", "0");
          const t = p / PRE;
          if (t < 0.5) {
            const k = ease(clamp(t / 0.5));
            stage.style.setProperty("--pr", `${(DOT_R * (1 - k)).toFixed(1)}px`);
            stage.style.setProperty("--pa", "1");
            /* the mark rides the circle down, then lets go just before
               the end so it never reduces to a smear of cream */
            stage.style.setProperty("--la", Math.min(1, (1 - k) / 0.35).toFixed(3));
            stage.style.setProperty("--r", "0px");
          } else {
            const k = ease(clamp((t - 0.5) / 0.5));
            stage.style.setProperty("--pa", "0");
            stage.style.setProperty("--la", "0");
            stage.style.setProperty("--r", `${(PEAK * k).toFixed(1)}px`);
          }
        } else if (p < OPEN) {
          stage.style.setProperty("--pa", "0");
          stage.style.setProperty("--la", "0");
          const slice = (OPEN - PRE) / BEATS.length;
          const idx = Math.min(BEATS.length - 1, Math.floor((p - PRE) / slice));
          const t = clamp((p - PRE - idx * slice) / slice);
          setI(idx);
          /* the swap lands at the midpoint, which is where the aperture is
             widest — so the word changes while nothing else is moving */
          setSw(BEATS[idx].swap && t >= 0.5 ? 1 : 0);
          stage.style.setProperty("--flood", "0");
          stage.style.setProperty("--head", "0");
          stage.style.setProperty("--rise", "0");
          stage.style.setProperty("--copy", "0");
          stage.dataset.ring = BEATS[idx].ring ? "on" : "off";

          const swipes = idx % 2 === 1;
          stage.dataset.motion = swipes ? "swipe" : "iris";
          if (swipes) {
            // in from the left through the first half, out to the right after
            stage.style.setProperty("--inL", t < 0.5 ? "0%" : `${((t - 0.5) / 0.5) * 100}%`);
            stage.style.setProperty("--inR", t < 0.5 ? `${(1 - t / 0.5) * 100}%` : "0%");
          } else if (idx === 0) {
            /* already open from the prelude, so this only holds and closes */
            stage.style.setProperty("--r", `${(Math.sin(Math.PI * (0.5 + t * 0.5)) * PEAK).toFixed(1)}px`);
          } else if (BEATS[idx].swap) {
            /* flat-topped: open, then HOLD wide while the word swaps at
               t = 0.5, then close. A plain sine would peak and start
               shutting at exactly the moment the swap lands. */
            const k = t < 0.25 ? ease(t / 0.25) : t > 0.75 ? ease((1 - t) / 0.25) : 1;
            stage.style.setProperty("--r", `${(k * PEAK).toFixed(1)}px`);
          } else {
            stage.style.setProperty("--r", `${(Math.sin(Math.PI * t) * PEAK).toFixed(1)}px`);
          }
        } else if (p < RISE) {
          const t = (p - OPEN) / (RISE - OPEN);
          stage.dataset.motion = "bloom";
          stage.dataset.ring = "off";
          stage.style.setProperty("--pa", "0");
          stage.style.setProperty("--la", "0");
          stage.style.setProperty("--r", "0px");
          stage.style.setProperty("--flood", String(Math.min(1, t / 0.55)));
          stage.style.setProperty("--head", String(clamp((t - 0.35) / 0.35)));
          stage.style.setProperty("--rise", "0");
          stage.style.setProperty("--copy", "0");
        } else {
          const t = (p - RISE) / (1 - RISE);
          stage.dataset.motion = "bloom";
          stage.dataset.ring = "off";
          stage.style.setProperty("--pa", "0");
          stage.style.setProperty("--la", "0");
          stage.style.setProperty("--r", "0px");
          stage.style.setProperty("--flood", "1");
          stage.style.setProperty("--head", "1");
          /* the circle is most of the way up before the copy starts, so the
             words land on cream rather than riding in on the arc */
          stage.style.setProperty("--rise", String(ease(clamp(t / 0.6))));
          stage.style.setProperty("--copy", String(clamp((t - 0.45) / 0.4)));
        }
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

  const beat = BEATS[i];

  return (
    <section className="hcb" id={id} ref={pin}>
      <style>{CSS}</style>
      <div className="hcb__stage" data-motion="iris" data-ring="on">
        <div className="hcb__iris">
          <p className="hcb__beat" data-swap={beat.swap ? "" : undefined} key={i}>
            <span className="hcb__lead">{beat.lead}</span>
            {beat.swap && (
              <span
                className="hcb__emph hcb__emph--swap"
                key={`sw-${sw}`}
                style={beat.swap[sw].c ? { color: beat.swap[sw].c } : undefined}
              >
                {beat.swap[sw].t}
              </span>
            )}
            {beat.emph.map((e, n) => (
              <span className="hcb__emph" key={n} style={e.c ? { color: e.c } : undefined}>
                {e.t}
              </span>
            ))}
          </p>
        </div>

        <span className="hcb__dot" aria-hidden="true">
          <ClfaMark className="hcb__dotmark" />
        </span>
        <span className="hcb__ring" aria-hidden="true" />
        <span className="hcb__flood" aria-hidden="true" />

        <div className="hcb__lockup">
          <h1 className="hcb__head">
            <span className="hcb__lead">We are the</span>
            <span className="hcb__solve" ref={solveRef}>solve</span>
            <span className="hcb__tail">
              <i className="hcb__arrow" aria-hidden="true" />
              <em>for brands in motion</em>
            </span>
          </h1>

        </div>

        <span className="hcb__rise" aria-hidden="true" />

        <p className="hcb__closing">
          We’re an adaptable healthcare B2B agency network of highly experienced
          thinkers who connect <strong>strategy, creative, and execution</strong> to
          tackle it head-on.
        </p>

        <span className="hcb__cue" aria-hidden="true">Scroll<i /></span>
      </div>
    </section>
  );
}

const CSS = `
.hcb{ position:relative; height:620vh; }
.hcb__stage{
  position:sticky; top:0; height:100svh; overflow:hidden;
  background:${CREAM}; color:${CHARCOAL};
  display:grid; place-items:center;
  --r:0px; --flood:0; --head:0; --inL:0%; --inR:100%; --pr:0px; --pa:0; --la:0;
  --rise:0; --copy:0;
  /* one size for "We are the" wherever it appears — 64 at 1920 */
  --hc-lead:clamp(20px,calc(9.25px + 2.85vw),64px);
}

.hcb__iris{
  position:absolute; inset:0; display:grid; place-items:center;
  padding:0 clamp(24px,6vw,120px);
  will-change:clip-path;
}
.hcb__stage[data-motion="iris"] .hcb__iris{ clip-path:circle(var(--r) at 50% 50%); }
.hcb__stage[data-motion="swipe"] .hcb__iris{ clip-path:inset(0 var(--inR) 0 var(--inL)); }
.hcb__stage[data-motion="bloom"] .hcb__iris{ clip-path:circle(0 at 50% 50%); }

/* lead light on top, emphasis stacked beneath — one line each */
.hcb__beat{
  margin:0; display:grid; justify-items:center; text-align:center; gap:.06em;
}
.hcb__lead{
  font-weight:300; letter-spacing:-.02em; line-height:1.1;
  font-size:var(--hc-lead);
}
.hcb__emph{
  font-weight:800; letter-spacing:-.035em; line-height:1.0;
  font-size:clamp(34px,5.4vw,100px);
  color:${COPPER};
  max-width:14ch;
}
/* the swap beat runs a third larger across the whole stack — the
   swapped word and "solve" under it are one size, as in the comps.
   The other two beats keep the common emphasis size. */
.hcb__beat[data-swap] .hcb__emph{ font-size:clamp(44px,7vw,134px); }

/* only the swapped word animates; the lines around it hold still */
.hcb__emph--swap{ animation:hcbSwap .42s cubic-bezier(.22,.61,.36,1) both; }
@keyframes hcbSwap{
  from{ opacity:0; transform:translateY(.14em); }
  to{ opacity:1; transform:none; }
}

/* the opening circle, with the mark inside it. Both are sized off --pr,
   so the lockup shrinks with the circle instead of sitting on top of it. */
.hcb__dot{
  position:absolute; left:50%; top:50%;
  width:calc(var(--pr) * 2); height:calc(var(--pr) * 2);
  margin:calc(var(--pr) * -1) 0 0 calc(var(--pr) * -1);
  border-radius:50%; background:${ROSE};
  opacity:var(--pa); pointer-events:none; z-index:2;
  display:grid; place-items:center; overflow:hidden;
}
/* charcoal glyphs, cream knockout in the A — the circle behind stays rose */
.hcb__dotmark{
  width:54%; height:auto; display:block;
  color:${CHARCOAL}; --clfa-dot:${CREAM};
  opacity:var(--la);
}

.hcb__ring{
  position:absolute; left:50%; top:50%;
  width:calc(var(--r) * 2); height:calc(var(--r) * 2);
  margin:calc(var(--r) * -1) 0 0 calc(var(--r) * -1);
  border:1px solid ${ROSE}; border-radius:50%;
  opacity:.55; pointer-events:none;
}
/* only comp 2a carries a ring; the rest are clean */
.hcb__stage[data-ring="off"] .hcb__ring{ opacity:0; }

.hcb__flood{
  position:absolute; left:50%; top:50%;
  width:152vmax; height:152vmax; margin:-76vmax 0 0 -76vmax;
  border-radius:50%; background:${ROSE};
  transform:scale(var(--flood));
  will-change:transform;
}

/* headline and intro share one column so the paragraph can hang off the
   right edge of the lockup, which is where the italic ends */
.hcb__lockup, .hcb__closing{ grid-area:1/1; }

.hcb__lockup{
  position:relative; z-index:3;
  display:inline-grid; justify-items:stretch;
  padding:0 clamp(24px,5vw,78px);
}

/* The three parts overlap rather than stack: "We are the" sits on
   solve's top-left shoulder, flush with its left edge, and the rule +
   tail run along its baseline. Offsets are in vw so the lockup holds
   its shape at any width. */
.hcb__head{
  margin:0; text-align:left;
  color:${CHARCOAL}; opacity:var(--head);
  transform:translateY(calc((1 - var(--head)) * 22px));
  display:grid; justify-items:start;
}
.hcb__head .hcb__lead{
  /* indented off solve's left edge. A percentage resolves against the
     headline's width, which is solve's width, so the indent stays
     proportional to the display size at every breakpoint. */
  margin-left:7.4%;
  margin-bottom:-3.4vw;      /* pulls solve up under it */
  position:relative; z-index:2;
}
.hcb__solve{
  font-weight:800; letter-spacing:-.035em; line-height:.86;
  font-size:min(clamp(120px,calc(71px + 15.04vw),360px), var(--solve-fit,9999px));
  color:${CREAM};
}
.hcb__tail{
  display:flex; align-items:center; width:100%;
  gap:clamp(10px,1.6vw,30px);
  margin-top:-.6vw;
}
/* a rule that stretches to fill, with the head drawn on its end */
.hcb__arrow{
  flex:1 1 auto; min-width:40px; height:1.5px;
  background:${CHARCOAL}; color:${CHARCOAL};   /* charcoal in both comps */
  position:relative;
}
.hcb__arrow::after{
  content:""; position:absolute; right:0; top:50%;
  width:clamp(8px,.85vw,17px); height:clamp(8px,.85vw,17px);
  border-top:1.5px solid currentColor; border-right:1.5px solid currentColor;
  transform:translateY(-50%) rotate(45deg);
}
.hcb__tail em{
  flex:0 0 auto;
  font-family:var(--hc-serif,"Lora","Newsreader",Georgia,serif);
  font-style:italic; font-weight:500; letter-spacing:-.01em;
  font-size:clamp(22px,2.9vw,54px);
  color:${CHARCOAL};
}

/* The cream circle. Big enough that its centre landing on the stage
   centre covers the frame, and parked below the fold until --rise moves
   it: at 0 its top edge sits exactly on the bottom of the viewport, so
   it reads as coming up from under the frame rather than growing. */
.hcb__rise{
  position:absolute; left:50%; top:50%;
  width:144vmax; height:144vmax; margin:-72vmax 0 0 -72vmax;
  border-radius:50%; background:${CREAM};
  transform:translateY(calc((1 - var(--rise)) * (72vmax + 50svh)));
  will-change:transform; z-index:4; pointer-events:none;
}

/* the subcopy, set as hero copy rather than a caption — same lead size
   and centring as the beats, with the offer picked out in copper */
.hcb__closing{
  position:relative; z-index:5; margin:0;
  max-width:min(24ch,84vw); text-align:center;
  color:${CHARCOAL};
  font-weight:300; letter-spacing:-.02em; line-height:1.26;
  font-size:var(--hc-lead);
  opacity:var(--copy);
  transform:translateY(calc((1 - var(--copy)) * 30px));
}
.hcb__closing strong{
  font-weight:800; letter-spacing:-.03em; color:${COPPER};
}

.hcb__cue{
  position:absolute; left:50%; bottom:26px; transform:translateX(-50%);
  font-size:10px; letter-spacing:.3em; text-transform:uppercase;
  color:${ROSE}; opacity:calc(1 - var(--flood));
  display:flex; flex-direction:column; align-items:center; gap:8px;
}
.hcb__cue i{
  width:1px; height:32px; background:${ROSE}; display:block;
  animation:hcbCue 1.9s cubic-bezier(.22,.61,.36,1) infinite; transform-origin:top;
}
@keyframes hcbCue{
  0%{ transform:scaleY(0); } 45%{ transform:scaleY(1); }
  100%{ transform:scaleY(0); transform-origin:bottom; }
}

/* the tail runs short of a readable measure on phones, so the paragraph
   drops the alignment and takes the full column instead */
@media (max-width:760px){
  .hcb__lockup{ padding:0 32px; }
  /* fill the column outright — the tail spans the same column, so this is
     what keeps the rule and the italic flush with solve's edges */
  .hcb__solve{ font-size:var(--solve-fit,34vw); }
  .hcb__closing{ max-width:min(20ch,86vw); }
}

@media (prefers-reduced-motion: reduce){
  .hcb{ height:auto; }
  .hcb__stage{ position:static; height:auto; padding:18vh 0; background:${ROSE}; }
  .hcb__iris{ position:static; clip-path:none !important; margin-bottom:8vh; }
  .hcb__dot,.hcb__ring,.hcb__flood,.hcb__cue{ display:none; }
  .hcb__head{ opacity:1; transform:none; }
  .hcb__rise{ display:none; }
  .hcb__closing{ opacity:1; transform:none; margin:8vh auto 0; }
}
`;
