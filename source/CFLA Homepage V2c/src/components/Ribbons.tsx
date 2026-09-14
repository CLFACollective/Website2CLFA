"use client";

/* ============================================================
   Ribbons — the banner, rebuilt to RIBBONS_3Color.

   Three bands at DIFFERENT angles so they cross rather than sit
   parallel — that crossing is what makes the comp read. Measured
   off the artwork:

     copper #BE7837 and azure #527078 share ONE angle, −3.4°.
     sage   #BACDDC crosses them at +3.4° and sits ON TOP of both.

   The sage band is absolutely positioned over the stack, which is what
   makes it read as a ribbon laid across rather than a third stripe in
   the pile. Each scrolls at its own speed; the crossing one runs the
   other way. Bands are wider than the viewport so rotating them never
   exposes a corner.
   ============================================================ */

const PHRASES = [
  "Ready to launch?",
  "Mid-merger?",
  "Pivoting?",
  "Just acquired?",
  "Complex, inherited brand?",
];

type Band = { bg: string; fg: string; seconds: number; reverse?: boolean };

/* the two that lie parallel, in stacking order */
const STACK: Band[] = [
  { bg: "#BE7837", fg: "#FFFCF5", seconds: 34 },
  { bg: "#344338", fg: "#FFFCF5", seconds: 30 },
];
/* the one laid across the top */
const CROSS: Band = { bg: "#BACDDC", fg: "#252525", seconds: 26, reverse: true };

const ANGLE = -3.4;        // shared by the stacked pair
const CROSS_ANGLE = 3.4;   // the crossing band, opposite

export function Ribbons({ background = "#FFFCF5" }: { background?: string }) {
  return (
    <div className="rib" style={{ background }} aria-hidden="true">
      <style>{CSS}</style>

      {/* the parallel pair */}
      <div className="rib__stack" style={{ transform: `rotate(${ANGLE}deg)` }}>
        {STACK.map((b, i) => (
          /* a wide gap below the copper band so the crossing sage band has
             room to sit centred in the space between copper and teal */
          <Band key={i} band={b} style={i === 1 ? { marginTop: 120 } : undefined} />
        ))}
      </div>

      {/* laid across, over the top */}
      <div className="rib__cross" style={{ transform: `translateY(-50%) rotate(${CROSS_ANGLE}deg)` }}>
        <Band band={CROSS} />
      </div>
    </div>
  );
}

function Band({ band, style }: { band: Band; style?: React.CSSProperties }) {
  return (
    <div className="rib__band" style={{ background: band.bg, color: band.fg, ...style }}>
      <div
        className={`rib__track ${band.reverse ? "is-rev" : ""}`}
        style={{ animationDuration: `${band.seconds}s` }}
      >
        {/* doubled so the loop is seamless */}
        {[0, 1].map((half) => (
          <span className="rib__half" key={half}>
            {PHRASES.map((p, j) => (
              <span className="rib__item" key={j}>
                {p}
                <i className="rib__dot" />
              </span>
            ))}
          </span>
        ))}
      </div>
    </div>
  );
}

const CSS = `
.rib{ position:relative; overflow:hidden; padding:clamp(78px,11vw,165px) 0; }
.rib__stack{ transform-origin:50% 50%; }
.rib__cross{
  position:absolute; left:0; right:0; top:50%;
  transform-origin:50% 50%; z-index:3;   /* over both */
}
.rib__band{
  width:126%; margin-left:-13%;
  overflow:hidden;
  padding:clamp(9px,1.1vw,17px) 0;
}
.rib__stack .rib__band + .rib__band{ margin-top:clamp(10px,1.4vw,22px); }
.rib__track{
  display:flex; width:max-content;
  animation-name:ribL; animation-timing-function:linear; animation-iteration-count:infinite;
}
.rib__track.is-rev{ animation-name:ribR; }
.rib__half{ display:flex; }
.rib__item{
  display:inline-flex; align-items:center; white-space:nowrap;
  font-weight:800; letter-spacing:-.012em; line-height:1.15;
  font-size:clamp(19px,2.5vw,42px);
  padding:0 .34em;
}
.rib__dot{
  width:.19em; height:.19em; border-radius:50%;
  background:currentColor; display:inline-block; margin-left:.7em;
}
@keyframes ribL{ from{ transform:translateX(0); }    to{ transform:translateX(-50%); } }
@keyframes ribR{ from{ transform:translateX(-50%); } to{ transform:translateX(0); } }
@media (prefers-reduced-motion: reduce){ .rib__track{ animation:none; } }
`;
