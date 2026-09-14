import { useGsap, prefersReducedMotion } from "./gsapSetup";

/**
 * Day One — the pinned section holds full-screen while a ball travels
 * along a rail, parking on three stops with a plateau at each (not a
 * plain linear glide), lighting up a column of copy as it arrives.
 *
 * The plateau shape is a piecewise remap (KX -> KY below); GSAP drives
 * it as a scrub tied to the section's own scroll distance via
 * ScrollTrigger, with a quickSetter writing the rail's --rp custom
 * property each tick.
 */
export function setupDayOne() {
  const section = document.getElementById("partnering");
  const rail = document.getElementById("rail");
  if (!section || !rail || prefersReducedMotion()) return;

  const { gsap, ScrollTrigger } = useGsap();
  const railStops = Array.from(rail.querySelectorAll<HTMLElement>(".rail__stop"));
  const cols = Array.from(document.querySelectorAll<HTMLElement>("#dayone .col"));

  const DOT_POS = [1 / 6, 3 / 6, 5 / 6];
  const KX = [0, 0.12, 0.3, 0.42, 0.6, 0.72, 0.9, 1];
  /* the ball/fill never travels past the third stop — it holds there
     for the rest of the section's scroll rather than continuing on to
     the rail's own right edge, which sits well past that last circle. */
  const KY = [0, 1 / 6, 1 / 6, 3 / 6, 3 / 6, 5 / 6, 5 / 6, 5 / 6];

  const remap = (u: number) => {
    for (let k = 1; k < KX.length; k++) {
      if (u <= KX[k]) {
        const t = (u - KX[k - 1]) / (KX[k] - KX[k - 1]);
        return KY[k - 1] + t * (KY[k] - KY[k - 1]);
      }
    }
    return 1;
  };

  const setRp = gsap.quickSetter(rail, "--rp") as (v: number) => void;

  /* The pulsing halo: a ring that expands and fades to nothing while
     the solid dark-pink core underneath holds still. Each indicator
     gets its own randomized duration/offset so the three stops (and
     the travelling ball) never fall into lockstep — reads as organic
     rather than a synchronised blink. */
  const pulseHalo = (el: HTMLElement, delay = 0) => {
    gsap.set(el, { "--halo-s": 1, "--halo-o": 0.5 });
    gsap.to(el, {
      "--halo-s": 2.6,
      "--halo-o": 0,
      duration: 1.6 + Math.random() * 0.6,
      ease: "power1.out",
      repeat: -1,
      delay,
    });
  };

  const ball = rail.querySelector<HTMLElement>(".rail__ball");
  if (ball) pulseHalo(ball);

  const pulsing = new Set<HTMLElement>();

  ScrollTrigger.create({
    trigger: section,
    start: "top top",
    end: "bottom bottom",
    scrub: true,
    onUpdate: (self) => {
      const u = Math.min(1, Math.max(0, (self.progress - 0.12) / 0.62));
      const rp = remap(u);
      setRp(rp);

      let active = -1;
      for (let k = 0; k < 3; k++) if (rp >= DOT_POS[k] - 0.002) active = k;
      cols.forEach((c, i) => {
        c.classList.toggle("on", i === active);
        if (i <= active) {
          c.classList.add("is-rev");
          c.querySelector("p")?.classList.add("revealed");
        }
      });
      railStops.forEach((s, i) => {
        const reached = rp >= DOT_POS[i] - 0.002;
        s.classList.toggle("is-past", reached);
        if (reached && !pulsing.has(s)) {
          pulsing.add(s);
          pulseHalo(s, Math.random() * 0.8);
        }
      });
    },
  });
}
