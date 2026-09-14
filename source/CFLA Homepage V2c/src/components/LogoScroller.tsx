"use client";

/* ============================================================
   LogoScroller — the client marquee.

   Set to the treatment in Clients__2_.jpg: uppercase, heavy, in the
   section's own text colour, with a rose dot between every name.

   Mechanic is the same as the reference component — the set is
   rendered twice and the track translates -50%, which is what makes
   the loop seamless. Ported off Tailwind, since this project styles
   components with their own <style> rather than utility classes; the
   reference also called for `scroller-mask`, `scroller-track` and
   `logo-item` classes its snippet never defined.

   Added: edge masks so names fade at the rails instead of clipping,
   pause on hover, and it holds still under prefers-reduced-motion.
   ============================================================ */

import type { ReactNode } from "react";

/* from the supplied artwork, in order */
export const CLFA_CLIENTS = [
  "Lux Infusion",
  "Rancho Biosciences",
  "Johnson & Johnson",
  "Endpoint",
  "Konovo",
  "Pfizer",
  "Insmed",
  "Novartis",
];

export function LogoScroller({
  logos = CLFA_CLIENTS,
  speed = "40s",
  reverse = false,
  className,
}: {
  /** Names, or inline <svg> marks once the real files exist. */
  logos?: ReactNode[];
  /** One full loop. Longer is slower. */
  speed?: string;
  reverse?: boolean;
  className?: string;
}) {
  if (!logos || logos.length === 0) return null;
  return (
    <div className={`lsc ${className || ""}`}>
      <style>{CSS}</style>
      <div
        className={`lsc__track ${reverse ? "is-rev" : ""}`}
        style={{ animationDuration: speed }}
      >
        {[0, 1].map((set) => (
          <div className="lsc__set" key={set} aria-hidden={set === 1}>
            {logos.map((logo, i) => (
              <span className="lsc__item" key={`${set}-${i}`}>
                <span className="lsc__name">{logo}</span>
                <i className="lsc__dot" aria-hidden="true" />
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

const CSS = `
.lsc{
  position:relative; overflow:hidden; width:100%;
  /* fade at both rails rather than a hard clip */
  -webkit-mask-image:linear-gradient(90deg,transparent,#000 7%,#000 93%,transparent);
  mask-image:linear-gradient(90deg,transparent,#000 7%,#000 93%,transparent);
}
.lsc__track{
  display:flex; width:max-content;
  animation-name:lscScroll;
  animation-timing-function:linear;
  animation-iteration-count:infinite;
}
.lsc__track.is-rev{ animation-direction:reverse; }
.lsc:hover .lsc__track{ animation-play-state:paused; }

.lsc__set{ display:flex; align-items:center; }
.lsc__item{ display:inline-flex; align-items:center; white-space:nowrap; }
.lsc__name{
  text-transform:uppercase;
  font-weight:800; letter-spacing:-.005em;
  font-size:clamp(17px,1.9vw,30px);
  transition:opacity .3s cubic-bezier(.22,.61,.36,1);
}
/* the separator from the artwork */
.lsc__dot{
  width:.42em; height:.42em; border-radius:50%;
  background:var(--pink,#F06496);
  display:inline-block; margin:0 clamp(20px,2.6vw,44px);
  flex:0 0 auto;
}
.lsc:hover .lsc__name{ opacity:.4; }
.lsc__item:hover .lsc__name{ opacity:1; }
.lsc__name svg,.lsc__name img{ display:block; height:clamp(20px,2.4vw,34px); width:auto; }

/* two identical sets, so -50% lands exactly on the seam */
@keyframes lscScroll{
  from{ transform:translateX(0); }
  to{ transform:translateX(-50%); }
}

@media (prefers-reduced-motion: reduce){
  .lsc__track{ animation:none; }
}
`;
