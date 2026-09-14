"use client";

/* ============================================================
   HeroOptionB — three motions, nothing repeated.

   line 1   a clip-path circle iris, in and out
   line 2   a swipe that passes through: in from the left, then on
            out to the right rather than reversing
   finale   the circle blooms into rose, same as option A

   TYPE   emphasis is Lora italic, everything else Figtree. The
          headline's "solve" is the exception — it stays the big sans.
   COLOUR cream ground, charcoal copy, copper emphasis, rose flood.
          Every value is a palette token; nothing else appears.
   ============================================================ */

import { useEffect, useRef, useState } from "react";

const LINES = [
  { plain: "Where healthcare meets tech, ", hot: "the ground keeps shifting" },
  { plain: "When your organization is ", hot: "changing rapidly" },
];

const OPEN = 0.66;          // lines run to here, then the rose takes over

const CREAM = "#FFFCF5";
const CHARCOAL = "#252525";
const COPPER = "#BE7837";
const ROSE = "#F06496";

export function HeroOptionB({ id = "hero" }: { id?: string }) {
  const pin = useRef<HTMLElement>(null);
  const [i, setI] = useState(0);

  useEffect(() => {
    const el = pin.current;
    if (!el) return;
    const stage = el.querySelector(".hcb__stage") as HTMLElement;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      stage.style.setProperty("--flood", "1");
      stage.style.setProperty("--head", "1");
      return;
    }

    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const r = el.getBoundingClientRect();
        const span = r.height - window.innerHeight;
        if (span <= 0) return;
        const p = Math.min(1, Math.max(0, -r.top / span));
        const vmax = Math.max(window.innerWidth, window.innerHeight);

        if (p < OPEN) {
          const slice = OPEN / LINES.length;
          const idx = Math.min(LINES.length - 1, Math.floor(p / slice));
          const t = Math.min(1, Math.max(0, (p - idx * slice) / slice));
          setI(idx);
          stage.style.setProperty("--flood", "0");
          stage.style.setProperty("--head", "0");
          const swipes = idx === 1;
          stage.dataset.motion = swipes ? "swipe" : "iris";
          if (swipes) {
            // in from the left through the first half, out to the right after
            stage.style.setProperty("--inL", t < 0.5 ? "0%" : `${((t - 0.5) / 0.5) * 100}%`);
            stage.style.setProperty("--inR", t < 0.5 ? `${(1 - t / 0.5) * 100}%` : "0%");
          } else {
            stage.style.setProperty("--r", `${(Math.sin(Math.PI * t) * vmax * 0.42).toFixed(1)}px`);
          }
        } else {
          const t = (p - OPEN) / (1 - OPEN);
          stage.dataset.motion = "bloom";
          stage.style.setProperty("--r", "0px");
          stage.style.setProperty("--flood", String(Math.min(1, t / 0.62)));
          stage.style.setProperty("--head", String(Math.min(1, Math.max(0, (t - 0.42) / 0.34))));
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

  const line = LINES[i];

  return (
    <section className="hcb" id={id} ref={pin}>
      <style>{CSS}</style>
      <div className="hcb__stage" data-motion="iris">
        <div className="hcb__iris">
          <p className="hcb__line" key={i}>
            {line.plain}
            <span className="hcb__hot">{line.hot}</span>
          </p>
        </div>

        <span className="hcb__ring" aria-hidden="true" />
        <span className="hcb__flood" aria-hidden="true" />

        <h1 className="hcb__head">
          <span className="hcb__the">We’re the</span>
          <span className="hcb__solve">solve</span>
          <span className="hcb__tail">for brands in motion</span>
        </h1>

        <span className="hcb__cue" aria-hidden="true">Scroll<i /></span>
      </div>
    </section>
  );
}

const CSS = `
.hcb{ position:relative; height:420vh; }
.hcb__stage{
  position:sticky; top:0; height:100svh; overflow:hidden;
  background:${CREAM}; color:${CHARCOAL};
  display:grid; place-items:center;
  --r:0px; --flood:0; --head:0; --inL:0%; --inR:100%;
}

.hcb__iris{
  position:absolute; inset:0; display:grid; place-items:center;
  padding:0 clamp(24px,6vw,120px);
  will-change:clip-path;
}
.hcb__stage[data-motion="iris"] .hcb__iris{ clip-path:circle(var(--r) at 50% 50%); }
.hcb__stage[data-motion="swipe"] .hcb__iris{ clip-path:inset(0 var(--inR) 0 var(--inL)); }
.hcb__stage[data-motion="bloom"] .hcb__iris{ clip-path:circle(0 at 50% 50%); }

.hcb__line{
  margin:0; text-align:center; max-width:17ch;
  font-weight:300; letter-spacing:-.028em; line-height:1.06;
  font-size:clamp(30px,5.4vw,82px);
}
.hcb__hot{
  color:${COPPER};
  font-family:var(--hc-serif,"Lora","Newsreader",Georgia,serif);
  font-style:italic; font-weight:600;
}

.hcb__ring{
  position:absolute; left:50%; top:50%;
  width:calc(var(--r) * 2); height:calc(var(--r) * 2);
  margin:calc(var(--r) * -1) 0 0 calc(var(--r) * -1);
  border:1px solid ${ROSE}; border-radius:50%;
  opacity:.5; pointer-events:none;
}
/* a circle outline would fight a rectangular wipe */
.hcb__stage[data-motion="swipe"] .hcb__ring{ opacity:0; }
/* a disc that opens past the corners — 76vmax clears any viewport */
.hcb__flood{
  position:absolute; left:50%; top:50%;
  width:152vmax; height:152vmax; margin:-76vmax 0 0 -76vmax;
  border-radius:50%; background:${ROSE};
  transform:scale(var(--flood));
  will-change:transform;
}

.hcb__head{
  position:relative; z-index:2; margin:0; text-align:center;
  color:${CHARCOAL}; opacity:var(--head);
  transform:translateY(calc((1 - var(--head)) * 24px));
  display:grid; justify-items:center; gap:.02em;
  padding:0 clamp(24px,5vw,78px);
}
.hcb__the{ font-weight:300; letter-spacing:-.03em; font-size:clamp(24px,4.4vw,64px); }
.hcb__solve{
  font-weight:900; letter-spacing:-.05em; line-height:.86;
  font-size:clamp(64px,19vw,300px); color:${CREAM};
}
.hcb__tail{ font-weight:300; letter-spacing:-.02em; font-size:clamp(18px,3.2vw,50px); }

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

@media (prefers-reduced-motion: reduce){
  .hcb{ height:auto; }
  .hcb__stage{ position:static; height:auto; padding:18vh 0; background:${ROSE}; }
  .hcb__iris{ position:static; clip-path:none !important; margin-bottom:8vh; }
  .hcb__ring,.hcb__flood,.hcb__cue{ display:none; }
  .hcb__head{ opacity:1; transform:none; }
}
`;
