import { useGsap, prefersReducedMotion } from "./gsapSetup";

const DOT_DUR = 0.6; // s — the ball's travel to each stop

/**
 * Day One — once the section comes into view, a ball travels along a
 * rail to each of three stops in turn (DOT_DUR per stop), lighting up a
 * column of copy as it arrives. Plays once per page load: not tied to
 * scroll, and scrolling back up doesn't replay it. Phones hide the rail
 * and light their vertical timeline's dots on the same beat.
 */
export function setupDayOne() {
  const section = document.getElementById("partnering");
  const rail = document.getElementById("rail");
  if (!section || !rail || prefersReducedMotion()) return;

  const { gsap } = useGsap();
  const railStops = Array.from(rail.querySelectorAll<HTMLElement>(".rail__stop"));
  const cols = Array.from(document.querySelectorAll<HTMLElement>("#dayone .col"));

  // matches .rail__stop's left positions; the ball stops at the third
  const DOT_POS = [1 / 6, 3 / 6, 5 / 6];

  const setRp = gsap.quickSetter(rail, "--rp") as (v: number) => void;

  /* The pulsing halo: a ring that expands and fades to nothing while
     the solid dark-pink core underneath holds still. Each indicator
     gets its own randomized duration/offset so the three stops (and
     the travelling ball) never fall into lockstep — reads as organic
     rather than a synchronised blink.
     Up to 4 of these (the ball + 3 stops) each repeat:-1 forever once
     started, with nothing to stop them once scrolled past — same
     unbounded-background-work issue as ShineField/marquee/shimmer had.
     Tracked in haloTweens so one IntersectionObserver on the whole
     section can pause/resume all of them together, including ones
     created later (a stop only starts pulsing once scrolled to). */
  const haloTweens: gsap.core.Tween[] = [];
  let sectionVisible = true;
  const pulseHalo = (el: HTMLElement, delay = 0) => {
    gsap.set(el, { "--halo-s": 1, "--halo-o": 0.5 });
    const tween = gsap.to(el, {
      "--halo-s": 2.6,
      "--halo-o": 0,
      duration: 1.6 + Math.random() * 0.6,
      ease: "power1.out",
      repeat: -1,
      delay,
      paused: !sectionVisible,
    });
    haloTweens.push(tween);
  };

  new IntersectionObserver(
    ([entry]) => {
      sectionVisible = entry.isIntersecting;
      haloTweens.forEach((t) => (sectionVisible ? t.play() : t.pause()));
    },
    { rootMargin: "200px 0px" },
  ).observe(section);

  const ball = rail.querySelector<HTMLElement>(".rail__ball");
  if (ball) pulseHalo(ball);

  const reach = (k: number) => {
    cols.forEach((c, i) => c.classList.toggle("on", i === k));
    cols[k]?.classList.add("is-rev");
    cols[k]?.querySelector("p")?.classList.add("revealed");
    const stop = railStops[k];
    if (stop) {
      stop.classList.add("is-past");
      pulseHalo(stop, Math.random() * 0.8);
    }
  };

  const state = { rp: 0 };
  const tl = gsap.timeline({ paused: true });
  DOT_POS.forEach((pos, k) => {
    tl.to(state, { rp: pos, duration: DOT_DUR, ease: "power1.inOut", onUpdate: () => setRp(state.rp) })
      .call(reach, [k]);
  });

  // #dayone (the copy) rather than the rail, which phones hide; most of
  // it in view, so on a phone's stacked timeline the later steps don't
  // reveal below the fold
  const startIO = new IntersectionObserver(
    (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      startIO.disconnect();
      tl.play();
    },
    { threshold: 0.6 },
  );
  const copy = document.getElementById("dayone");
  if (copy) startIO.observe(copy);
}
