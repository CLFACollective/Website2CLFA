import { useGsap, prefersReducedMotion } from "./gsapSetup";

type Beat = { swap?: boolean; ring: boolean; motion: "iris" | "swipe" };

// Mirrors the copy already in Hero.astro's markup — only the timing/motion
// metadata lives here.
const BEATS: Beat[] = [
  { ring: true, motion: "iris" },
  { ring: false, motion: "swipe" },
  { swap: true, ring: false, motion: "iris" },
];

const PRE = 0.1; // the rose dot
const OPEN = 0.53; // beats run to here
const RISE = 0.78; // the cream circle starts climbing here
const SLICE = (OPEN - PRE) / BEATS.length;

export function setupHero() {
  const section = document.getElementById("hero");
  const stage = section?.querySelector<HTMLElement>(".hcb__stage");
  const solve = document.getElementById("hcbSolve");
  if (!section || !stage || !solve) return;

  /* --solve-fit: the font size at which "solve" exactly fills its column,
     measured off the live text rather than guessed, so it survives the
     webfont landing and a change of face. A layout concern, independent
     of the scroll choreography below. */
  const syncSolveFit = () => {
    const lockup = section.querySelector<HTMLElement>(".hcb__lockup");
    if (!lockup) return;
    const cs = getComputedStyle(lockup);
    const avail = section.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const size = parseFloat(getComputedStyle(solve).fontSize);
    const width = solve.getBoundingClientRect().width;
    if (!size || !width || avail <= 0) return;
    section.style.setProperty("--solve-fit", `${Math.floor(avail / (width / size))}px`);
  };
  const ro = new ResizeObserver(syncSolveFit);
  ro.observe(solve);
  syncSolveFit();
  document.fonts?.ready.then(syncSolveFit).catch(() => {});
  window.addEventListener("resize", syncSolveFit);

  if (prefersReducedMotion()) return;

  const { gsap, ScrollTrigger } = useGsap();
  const beats = Array.from(section.querySelectorAll<HTMLElement>(".hcb__beat"));

  /* The "SCROLL" cue's tick mark: grows down from the top, then shrinks
     away from the bottom — a plain infinite CSS @keyframes animation
     before, converted to GSAP so it can pause/resume the same way every
     other infinite animation on the page does (see onLeave/onEnterBack
     below), which the CSS version never had. Two scaleY tweens (matching
     the original keyframe's 0%-45%-100% stops) plus a third, parallel
     tween sliding transformOrigin from top to bottom across the full
     duration — the original's timing function (a fast-rise, long-tail
     curve) only ever had transformOrigin set at 0%/100%, so CSS eased
     it across the *whole* duration while scaleY eased across each of
     its two sub-segments independently. "power3.out" is a built-in
     stand-in for that same fast-rise/long-tail shape — close enough for
     a 1px decorative tick that pulling in the CustomEase plugin (and
     its own several KB) just for exact bezier fidelity here isn't
     worth the extra payload. */
  const cueLine = section.querySelector<HTMLElement>(".hcb__cue i");
  let cueTl: gsap.core.Timeline | null = null;
  if (cueLine) {
    const DUR = 1.9;
    cueTl = gsap.timeline({ repeat: -1 })
      .fromTo(cueLine, { scaleY: 0 }, { scaleY: 1, duration: DUR * 0.45, ease: "power3.out" }, 0)
      .to(cueLine, { scaleY: 0, duration: DUR * 0.55, ease: "power3.out" }, DUR * 0.45)
      .fromTo(cueLine, { transformOrigin: "50% 0%" }, { transformOrigin: "50% 100%", duration: DUR, ease: "power3.out" }, 0);
  }

  gsap.set(stage, {
    "--dot-k": 0, "--dot-op": 1, "--mark-op": 1, "--ring": 0,
    "--wipe-l": 0, "--wipe-r": 1, "--flood": 0, "--head": 0, "--rise": 0, "--copy": 0,
  });

  const tl = gsap.timeline({ defaults: { ease: "none" } });

  /* PRELUDE — the dot contracts (and takes the mark with it), then the
     outlined iris opens back out of that same point. */
  tl.to(stage, { "--dot-k": 1, "--mark-op": 0, duration: PRE * 0.5, ease: "power2.in" }, 0)
    .set(stage, { "--dot-op": 0 }, PRE * 0.5)
    .to(stage, { "--ring": 1, duration: PRE * 0.5, ease: "power2.out" }, PRE * 0.5);

  /* BEATS — iris / swipe / iris(+word swap), each its own slice. Discrete
     state (which beat, which clip mechanic, the ring) is derived from
     scroll progress directly in the ScrollTrigger onUpdate below, so it
     stays correct even if the page loads already scrolled mid-hero;
     these tweens only own the continuous numbers. */
  BEATS.forEach((beat, i) => {
    const start = PRE + i * SLICE;
    if (beat.motion === "swipe") {
      tl.fromTo(stage, { "--wipe-r": 1 }, { "--wipe-r": 0, duration: SLICE * 0.5, ease: "power2.out" }, start)
        .fromTo(stage, { "--wipe-l": 0 }, { "--wipe-l": 1, duration: SLICE * 0.5, ease: "power2.in" }, start + SLICE * 0.5);
    } else if (beat.swap) {
      tl.fromTo(stage, { "--ring": 0 }, { "--ring": 1, duration: SLICE * 0.25, ease: "power2.out" }, start)
        .to(stage, { "--ring": 0, duration: SLICE * 0.25, ease: "power2.in" }, start + SLICE * 0.75);
    } else {
      tl.fromTo(stage, { "--ring": 1 }, { "--ring": 0, duration: SLICE, ease: "sine.in" }, start);
    }
  });

  /* BLOOM — the frame floods rose, the lockup fades up into it. */
  tl.to(stage, { "--ring": 0, "--dot-op": 0, duration: 0.0001 }, OPEN)
    .to(stage, { "--flood": 1, duration: (RISE - OPEN) * 0.55, ease: "power1.out" }, OPEN)
    .to(stage, { "--head": 1, duration: (RISE - OPEN) * 0.35, ease: "power2.out" }, OPEN + (RISE - OPEN) * 0.35);

  /* RISE — a cream circle climbs from below and takes the screen back to
     ground; the closing subcopy rises into it. */
  tl.to(stage, { "--rise": 1, duration: (1 - RISE) * 0.6, ease: "power2.out" }, RISE)
    .to(stage, { "--copy": 1, duration: (1 - RISE) * 0.4, ease: "power1.out" }, RISE + (1 - RISE) * 0.45);

  const navLogo = document.querySelector<HTMLElement>(".nav__logo");
  navLogo?.classList.add("is-gone");

  /* Once the bloom has flooded the frame rose and before the cream rise
     has covered much of it back up, the whole screen reads as pink —
     anything sitting on top (the nav logo dot, the cursor, the sticky
     kickoff CTA) needs the light "on dark/saturated ground" treatment
     for that stretch. Read the live --flood/--rise values GSAP is
     already writing rather than re-deriving the same easing here. */
  let wasPink = false;
  const checkPinkGround = () => {
    const flood = parseFloat(stage.style.getPropertyValue("--flood")) || 0;
    const rise = parseFloat(stage.style.getPropertyValue("--rise")) || 0;
    const isPink = flood > 0.85 && rise < 0.5;
    if (isPink !== wasPink) {
      wasPink = isPink;
      document.dispatchEvent(new CustomEvent("clfa:hero-ground", { detail: { pink: isPink } }));
    }
  };

  /* .hcb__iris/.hcb__flood/.hcb__rise are will-change'd for the
     transform/clip-path work below — necessary while the hero is
     actually animating, but each one is a huge layer (a full-viewport
     clip-path, two ~150vmax circles) that a browser will otherwise
     keep composited/promoted for the rest of the page's lifetime once
     set, since nothing ever tells it the hero is done. On a memory-
     constrained device that's tens of MB of GPU texture held for no
     reason for the remaining 5+ sections of scroll — dropped once
     scrolled past (restored on scrolling back up, in case the
     animation needs to run smoothly again). */
  const heavyLayers = [
    document.querySelector<HTMLElement>(".hcb__iris"),
    document.querySelector<HTMLElement>(".hcb__flood"),
    document.querySelector<HTMLElement>(".hcb__rise"),
  ].filter((el): el is HTMLElement => !!el);
  const setLayers = (on: boolean) => {
    heavyLayers.forEach((el) => { el.style.willChange = on ? "" : "auto"; });
  };

  ScrollTrigger.create({
    trigger: section,
    start: "top top",
    end: "bottom bottom",
    scrub: true,
    animation: tl,
    onLeave: () => { setLayers(false); cueTl?.pause(); },
    onEnterBack: () => { setLayers(true); cueTl?.play(); },
    onUpdate: (self) => {
      const p = self.progress;
      navLogo?.classList.toggle("is-gone", p < PRE);
      checkPinkGround();

      if (p < PRE) { stage.dataset.motion = "iris"; return; }

      if (p < OPEN) {
        const idx = Math.min(BEATS.length - 1, Math.floor((p - PRE) / SLICE));
        const beat = BEATS[idx];
        beats.forEach((b, n) => b.classList.toggle("is-on", n === idx));
        stage.dataset.ring = beat.ring ? "on" : "off";
        stage.dataset.motion = beat.motion;
        if (beat.swap) {
          const t = (p - PRE - idx * SLICE) / SLICE;
          beats[idx].toggleAttribute("data-swap-b", t >= 0.5);
        }
      } else {
        stage.dataset.motion = "bloom";
        stage.dataset.ring = "off";
        beats.forEach((b) => b.classList.remove("is-on"));
      }
    },
  });
}
