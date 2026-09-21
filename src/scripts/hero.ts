import { useGsap, prefersReducedMotion } from "./gsapSetup";

type Beat = {
  swap?: boolean;
  ring: boolean;
  motion: "iris" | "swipe";
  /** Whether this beat's own text fade can bleed across its start/end
   *  boundary into the neighbouring stage — only safe where the clip
   *  geometry on both sides is actually the same shape at that instant
   *  (both "iris", both settled on the same circle radius). Where the
   *  shape changes at the boundary (iris <-> swipe), bleeding the fade
   *  across it would show the *next* beat's text still confined to the
   *  *current* beat's clip-path — e.g. beat 1's text, meant to reveal
   *  via a rectangular swipe, briefly visible squeezed inside beat 0's
   *  closing iris circle instead. Confirmed live: exactly this glitch.
   *  Where it's false, that fade is confined entirely within the
   *  beat's own slice instead — no crossfade overlap with the
   *  neighbour, just a smooth ramp to/from transparent that never
   *  shows through the wrong shape. */
  bleedInBefore?: boolean;
  bleedOutAfter?: boolean;
};

// Mirrors the copy already in Hero.astro's markup — only the timing/motion
// metadata lives here.
const BEATS: Beat[] = [
  { ring: true, motion: "iris", bleedInBefore: true },
  { ring: false, motion: "swipe" },
  { swap: true, ring: false, motion: "iris", bleedOutAfter: true },
];

/**
 * Real seconds, not scroll-progress fractions. This used to be a
 * 620vh ScrollTrigger-scrubbed timeline — the dot/beats/bloom pacing
 * was however fast a given visitor happened to scroll, and a fast
 * scroll made the beats unreadable. It's a plain GSAP timeline now: it
 * plays once, at a fixed pace chosen so each beat actually holds long
 * enough to read, and it owns the page (scroll is locked) until it's
 * done — see setupHero's onMovieComplete for what "done" hands back.
 */
const PRE_DUR = 1.3; // dot contracts, ring opens
const BEAT_DUR = 2.3; // each beat's own total on-screen time
const OPEN_T = PRE_DUR + BEATS.length * BEAT_DUR; // movie time the bloom starts at
const BLOOM_DUR = 1.2; // frame floods pink, headline fades up
const BEAT_FADE_FRAC = 0.3; // fraction of a beat's own on-screen time spent fading in/out

/** Ramps 0->1 over `dur`, ending exactly at `at` (or starting exactly
 *  at `at` if `bleedBefore` is false — i.e. confined to *after* `at`
 *  instead of straddling it). */
function rampIn(t: number, at: number, dur: number, bleedBefore: boolean): number {
  const lo = bleedBefore ? at - dur : at;
  const hi = bleedBefore ? at : at + dur;
  if (t <= lo) return 0;
  if (t >= hi) return 1;
  return (t - lo) / (hi - lo);
}

/** Ramps 1->0 over `dur`, starting exactly at `at` (or ending exactly
 *  at `at` if `bleedAfter` is false — confined to *before* `at`). */
function rampOut(t: number, at: number, dur: number, bleedAfter: boolean): number {
  const lo = bleedAfter ? at : at - dur;
  const hi = bleedAfter ? at + dur : at;
  if (t <= lo) return 1;
  if (t >= hi) return 0;
  return 1 - (t - lo) / (hi - lo);
}

export function setupHero() {
  const section = document.getElementById("hero");
  const stage = section?.querySelector<HTMLElement>(".hcb__stage");
  const solve = document.getElementById("hcbSolve");
  if (!section || !stage || !solve) return;

  /* --solve-fit: the font size at which "solve" exactly fills its column,
     measured off the live text rather than guessed, so it survives the
     webfont landing and a change of face. A layout concern, independent
     of the movie below. */
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

  const { gsap } = useGsap();
  const beats = Array.from(section.querySelectorAll<HTMLElement>(".hcb__beat"));
  const navLogo = document.querySelector<HTMLElement>(".nav__logo");
  const reduce = prefersReducedMotion();

  /* .hcb__iris/.hcb__flood are will-change'd for the clip-path/transform
     work below — necessary while the movie is actually playing, but
     each one is a large layer (a full-viewport clip-path, a ~150vmax
     circle) that a browser will otherwise keep composited/promoted for
     the rest of the page's lifetime once set, since nothing ever tells
     it the movie is done. Dropped once hero's scrolled past (restored
     scrolling back up, in case it needs to look right again — the
     resting bloom frame still uses these elements, just statically). */
  const heavyLayers = [
    document.querySelector<HTMLElement>(".hcb__iris"),
    document.querySelector<HTMLElement>(".hcb__flood"),
  ].filter((el): el is HTMLElement => !!el);
  const setLayers = (on: boolean) => {
    heavyLayers.forEach((el) => { el.style.willChange = on ? "" : "auto"; });
  };

  const dispatchGround = (pink: boolean) =>
    document.dispatchEvent(new CustomEvent("clfa:hero-ground", { detail: { pink } }));

  /* Once the movie's done (or immediately, for reduced motion — there's
     no movie to wait for), the resting pink-bloom frame behaves like
     any other static section: a plain IntersectionObserver just reports
     whether it's still visible at all (a ScrollTrigger created this
     late — after the movie's own onComplete — never actually fired its
     onToggle in testing, on any scroll direction, for reasons that
     didn't resolve with a refresh or a deferred creation; this is the
     same "is this section still around" check every other pause/resume
     spot on the page already uses successfully). Drives three things
     at once from that one signal: the nav logo dot / sticky CTA's "on
     pink ground" treatment, the heavy layers' will-change, and the
     cue's pulse (no reason to keep animating it once it's fully
     scrolled out of view). */
  const armGroundTrigger = () => {
    const io = new IntersectionObserver(
      ([entry]) => {
        dispatchGround(entry.isIntersecting);
        setLayers(entry.isIntersecting);
        if (entry.isIntersecting) cueTl?.play(); else cueTl?.pause();
      },
      { threshold: 0 },
    );
    io.observe(section);
  };

  /* The "SCROLL" cue's tick mark: grows down from the top, then shrinks
     away from the bottom — see Hero.astro's .hcb__cue for the opacity
     side (tracks --flood, so it arrives exactly as the bleed lands and
     stays for the rest of the resting frame). Skipped entirely under
     reduced motion, same as every other infinite animation on the page. */
  const cueLine = section.querySelector<HTMLElement>(".hcb__cue i");
  let cueTl: gsap.core.Timeline | null = null;
  if (cueLine && !reduce) {
    const DUR = 1.9;
    cueTl = gsap.timeline({ repeat: -1, paused: true })
      .fromTo(cueLine, { scaleY: 0 }, { scaleY: 1, duration: DUR * 0.45, ease: "power3.out" }, 0)
      .to(cueLine, { scaleY: 0, duration: DUR * 0.55, ease: "power3.out" }, DUR * 0.45)
      .fromTo(cueLine, { transformOrigin: "50% 0%" }, { transformOrigin: "50% 100%", duration: DUR, ease: "power3.out" }, 0);
  }

  if (reduce) {
    // Straight to the resting frame — dot gone, ring gone, beats never
    // shown, frame fully bloomed, headline up. No movie, no lock.
    gsap.set(stage, {
      "--dot-k": 1, "--dot-op": 0, "--mark-op": 0, "--ring": 0,
      "--wipe-l": 0, "--wipe-r": 0, "--flood": 1, "--head": 1,
    });
    stage.dataset.motion = "bloom";
    stage.dataset.ring = "off";
    beats.forEach((b) => b.setAttribute("aria-hidden", "true"));
    navLogo?.classList.remove("is-gone");
    section.dataset.heroDone = "true";
    armGroundTrigger();
    return;
  }

  gsap.set(stage, {
    "--dot-k": 0, "--dot-op": 1, "--mark-op": 1, "--ring": 0,
    "--wipe-l": 0, "--wipe-r": 1, "--flood": 0, "--head": 0,
  });
  navLogo?.classList.add("is-gone");

  const handleUpdate = () => {
    const t = tl.time();

    /* Smooth fade for all three beat texts, independent of the discrete
       iris/swipe/ring state below — this (plus the dot and ring already
       being smooth GSAP tweens) is what makes the whole dot->beats->bloom
       stretch read as one flowing reveal instead of three separate
       pop-in/pop-out stages. Runs every tick regardless of which "stage"
       t is in below, since beat 0's fade-in bleeds slightly *before*
       PRE_DUR (text emerging as the ring finishes opening) and beat 2's
       fade-out bleeds *after* OPEN_T (dissolving straight into the
       bloom) — see each Beat's bleedInBefore/bleedOutAfter above.
       Visual opacity is independent from what's exposed to assistive
       tech, though: mid-fade, two beats can both be partially visible
       on screen, but only one of them should ever be the "current" one
       a screen reader announces. */
    const idx = t < PRE_DUR || t >= OPEN_T ? -1 : Math.min(BEATS.length - 1, Math.floor((t - PRE_DUR) / BEAT_DUR));
    const beatFade = BEAT_DUR * BEAT_FADE_FRAC;
    beats.forEach((b, i) => {
      const start = PRE_DUR + i * BEAT_DUR;
      const end = start + BEAT_DUR;
      const opacity = Math.min(
        rampIn(t, start, beatFade, !!BEATS[i].bleedInBefore),
        rampOut(t, end, beatFade, !!BEATS[i].bleedOutAfter),
      );
      b.style.opacity = opacity.toFixed(3);
      if (i !== idx) b.setAttribute("aria-hidden", "true");
      else b.removeAttribute("aria-hidden");
    });

    if (t < PRE_DUR) { stage.dataset.motion = "iris"; return; }

    if (t < OPEN_T) {
      const beat = BEATS[idx];
      stage.dataset.ring = beat.ring ? "on" : "off";
      stage.dataset.motion = beat.motion;
      if (beat.swap) {
        const bt = (t - PRE_DUR - idx * BEAT_DUR) / BEAT_DUR;
        beats[idx].toggleAttribute("data-swap-b", bt >= 0.5);
      }
    } else {
      stage.dataset.motion = "bloom";
      stage.dataset.ring = "off";
    }
  };

  const onMovieComplete = () => {
    document.documentElement.style.overflow = "";
    document.body.style.overflow = "";
    window.removeEventListener("scroll", snapBackToTop);
    section.dataset.heroDone = "true";
    armGroundTrigger();
  };

  const tl = gsap.timeline({ defaults: { ease: "none" }, onUpdate: handleUpdate, onComplete: onMovieComplete });

  /* PRELUDE — the dot contracts (and takes the mark with it), then the
     outlined iris opens back out of that same point. Used to be two
     sequential tweens meeting at a hard seam: the contraction
     accelerating (power2.in) right into a dead stop, opacity snapping
     off instantly at that exact instant, then the ring starting from a
     standstill (power2.out) — two separate motions relay-racing rather
     than one continuous gesture. Now: both use a symmetric ease (slow
     in, slow out, no velocity spike at either end), the ring starts
     opening slightly *before* the contraction fully finishes (a short
     overlap instead of a handoff), and the dot's opacity fades over a
     brief window instead of popping off in a single frame. */
  const PRE_OVERLAP = PRE_DUR * 0.12;
  const preSplit = PRE_DUR * 0.58;
  tl.to(stage, { "--dot-k": 1, duration: preSplit, ease: "sine.inOut" }, 0)
    .to(stage, { "--mark-op": 0, duration: preSplit * 0.85, ease: "sine.in" }, 0)
    .to(stage, { "--dot-op": 0, duration: PRE_DUR - preSplit, ease: "sine.in" }, preSplit - PRE_OVERLAP * 0.6)
    .to(stage, { "--ring": 1, duration: PRE_DUR - preSplit + PRE_OVERLAP, ease: "sine.inOut" }, preSplit - PRE_OVERLAP);

  /* BEATS — iris / swipe / iris(+word swap), each its own slot. Discrete
     state (which beat, which clip mechanic, the ring) is derived from
     the timeline's own elapsed time in handleUpdate above; these tweens
     only own the continuous numbers. */
  BEATS.forEach((beat, i) => {
    const start = PRE_DUR + i * BEAT_DUR;
    if (beat.motion === "swipe") {
      tl.fromTo(stage, { "--wipe-r": 1 }, { "--wipe-r": 0, duration: BEAT_DUR * 0.5, ease: "power2.out" }, start)
        .fromTo(stage, { "--wipe-l": 0 }, { "--wipe-l": 1, duration: BEAT_DUR * 0.5, ease: "power2.in" }, start + BEAT_DUR * 0.5);
    } else if (beat.swap) {
      tl.fromTo(stage, { "--ring": 0 }, { "--ring": 1, duration: BEAT_DUR * 0.25, ease: "power2.out" }, start)
        .to(stage, { "--ring": 0, duration: BEAT_DUR * 0.25, ease: "power2.in" }, start + BEAT_DUR * 0.75);
    } else {
      tl.fromTo(stage, { "--ring": 1 }, { "--ring": 0, duration: BEAT_DUR, ease: "sine.in" }, start);
    }
  });

  /* BLOOM — the frame floods rose, the lockup fades up into it. Movie
     ends here; the cream-rise + closing copy that used to follow are
     ordinary scroll content below now (see Hero.astro's .hcb__after).
     The cue's pulse starts the moment the flood tween itself finishes
     (--flood hits 1, so .hcb__cue's opacity:var(--flood) is fully
     visible) rather than waiting for the *whole* timeline's onComplete
     — that's ~0.3s later (the --head fade-up still has to run), and a
     cueTl.fromTo() sits at its "from" value (scaleY:0, i.e. an
     invisible flat line) until it's actually played, so the cue's text
     was appearing with a dead, pulse-less line for that whole gap. */
  tl.to(stage, { "--ring": 0, "--dot-op": 0, duration: 0.0001 }, OPEN_T)
    .to(stage, { "--flood": 1, duration: BLOOM_DUR * 0.75, ease: "power1.out", onComplete: () => cueTl?.play() }, OPEN_T)
    .to(stage, { "--head": 1, duration: BLOOM_DUR * 0.55, ease: "power2.out" }, OPEN_T + BLOOM_DUR * 0.4);

  /* The movie owns the page until it's done — "resume the site's
     functionality" means scrolling stays locked for its ~10s runtime.
     overflow:hidden on the root (and body, for Safari) disables wheel/
     touch/keyboard scroll input, but doesn't reliably stop a
     *programmatic* window.scrollTo() in every engine (confirmed: it
     doesn't in Chromium) — a scroll listener that snaps straight back
     to 0 is what actually makes the lock airtight, belt-and-suspenders
     over the CSS. Always starts from the very top, regardless of where
     a reload/deep-link landed — this is meant to read as a splash
     intro seen from the top once per load, not something that can be
     scrolled mid-way into first. */
  window.scrollTo(0, 0);
  document.documentElement.style.overflow = "hidden";
  document.body.style.overflow = "hidden";
  const snapBackToTop = () => window.scrollTo(0, 0);
  window.addEventListener("scroll", snapBackToTop);

  // Exposed for automated tests, which otherwise have to burn this
  // movie's real ~9.5s runtime on every single test that just needs
  // Hero out of the way first (most of them don't care about Hero
  // itself) — a test can fast-forward via
  // `document.getElementById("hero").heroTimeline.progress(1)`, which
  // synchronously fires the remaining tweens' end state and onComplete,
  // same as if it had actually played out. Harmless in production: one
  // extra object reference, nothing reads it outside tests.
  (section as HTMLElement & { heroTimeline?: gsap.core.Timeline }).heroTimeline = tl;

  tl.play();
}
