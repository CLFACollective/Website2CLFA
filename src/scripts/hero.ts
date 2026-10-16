import { useGsap, prefersReducedMotion } from "./gsapSetup";

type Beat = {
  swap?: boolean;
  ring: boolean;
  motion: "iris" | "swipe";
  /** This beat's own total on-screen time, start to finish — each beat
   *  can have a different one (beat 0's opening needs much more room
   *  than beats 1/2: a grow-in, two explicit 2s pauses, and a slow
   *  reveal, versus the other two beats' plain hold-then-crossfade). */
  duration: number;
  /** How long this beat's text takes to fade fully in / fully out. Not
   *  a fraction of `duration` (unlike everything else here) — beat 0
   *  needs its fade-IN to take exactly as long as its own slow ring-
   *  reveal (so the text arrives in step with the shape revealing it),
   *  which isn't expressible as "some fraction of this beat's total
   *  time" without the two pause phases leaking into it. */
  fadeIn: number;
  fadeOut: number;
  /** Absolute movie-time this beat's fade-IN ramp is anchored to, if not
   *  its own start (BEAT_STARTS[i]). Only beat 0 needs this: its text
   *  doesn't start revealing at the movie's very first frame — it waits
   *  out the grow-in and first hold, then reveals in step with the ring
   *  opening partway through its own slice. */
  revealAt?: number;
  /** Whether this beat's own text fade can bleed across its end
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
  bleedOutAfter?: boolean;
};

/**
 * Real seconds, not scroll-progress fractions. This used to be a
 * 620vh ScrollTrigger-scrubbed timeline — the dot/beats/bloom pacing
 * was however fast a given visitor happened to scroll, and a fast
 * scroll made the beats unreadable. It's a plain GSAP timeline now: it
 * plays once, at a fixed pace chosen so each beat actually holds long
 * enough to read, and it owns the page (scroll is locked) until it's
 * done — see setupHero's onMovieComplete for what "done" hands back.
 */
const BEAT_DUR = 2.3; // beats 1 and 2's own total on-screen time
const BEAT_FADE = BEAT_DUR * 0.3; // their fade in/out window (beat 0 gets its own, below)

// Beat 0's opening gets its own explicit shape rather than the generic
// grow-then-crossfade every other beat uses: the branded circle grows
// in, *holds* for a full 2s so it actually registers, then slowly
// opens into "Where healthcare meets tech" (the ring-open IS the
// fade-in — see how GROW/REVEAL feed the tween construction below),
// which then *also* holds for 2s once fully readable, before fading
// out into beat 1 same as everything else.
// Tightened by 1.4s overall (feedback: the pink CLFA opening and the
// "Where healthcare meets tech" frame read a little slow) — still long
// enough for the mark to register and the line to be read.
const GROW_DUR = 0.9; // branded circle grows from nothing to full size
const HOLD1_DUR = 1.4; // pause — held at full size, mark showing
const REVEAL_DUR = 1.2; // ring-open, revealing beat 0's text in step
const HOLD2_DUR = 1.4; // pause — beat 0 fully visible and readable
const BEAT0_DUR = GROW_DUR + HOLD1_DUR + REVEAL_DUR + HOLD2_DUR + BEAT_FADE;
const B0_REVEAL_AT = GROW_DUR + HOLD1_DUR; // movie time the ring-open (and text fade-in) begins

// Beat 2's word cycles smarter -> faster -> better, each getting its
// own on-screen slice rather than a plain three-way split of BEAT_DUR
// — "faster" and "better" each hold .3s longer than "smarter" does, so
// the cycle doesn't rush through the back half. SWAP_PACE slows every
// word's own change down by a further .3s on top of that (feedback:
// the changes felt too quick even with the above) — applied uniformly
// to all three, not just B/C.
const SWAP_SLOW = 0.3;
const SWAP_PACE = 0.3;
const SWAP_A_DUR = BEAT_DUR / 3 + SWAP_PACE; // "smarter"
const SWAP_B_DUR = BEAT_DUR / 3 + SWAP_SLOW + SWAP_PACE; // "faster"
const SWAP_C_DUR = BEAT_DUR / 3 + SWAP_SLOW + SWAP_PACE; // "better"
const SWAP_DUR = SWAP_A_DUR + SWAP_B_DUR + SWAP_C_DUR;

// Mirrors the copy already in Hero.astro's markup — only the timing/motion
// metadata lives here.
const BEATS: Beat[] = [
  { ring: true, motion: "iris", duration: BEAT0_DUR, fadeIn: REVEAL_DUR, fadeOut: BEAT_FADE, revealAt: B0_REVEAL_AT },
  { ring: false, motion: "swipe", duration: BEAT_DUR, fadeIn: BEAT_FADE, fadeOut: BEAT_FADE },
  { swap: true, ring: false, motion: "iris", duration: SWAP_DUR, fadeIn: BEAT_FADE, fadeOut: BEAT_FADE, bleedOutAfter: true },
];

// Cumulative start time for each beat, computed once from their own
// durations above instead of assuming they're all the same length.
const BEAT_STARTS = (() => {
  let t = 0;
  return BEATS.map((b) => { const s = t; t += b.duration; return s; });
})();
const OPEN_T = BEAT_STARTS[BEATS.length - 1] + BEATS[BEATS.length - 1].duration; // movie time the bloom starts at
const BLOOM_DUR = 1.2; // frame floods pink, headline fades up

function beatIndexAt(t: number): number {
  for (let i = 0; i < BEATS.length; i++) {
    if (t >= BEAT_STARTS[i] && t < BEAT_STARTS[i] + BEATS[i].duration) return i;
  }
  return -1;
}

/** Ramps 0->1 over `dur`, starting exactly at `at` — confined to
 *  *after* `at`, never straddling it. */
function rampIn(t: number, at: number, dur: number): number {
  if (t <= at) return 0;
  if (t >= at + dur) return 1;
  return (t - at) / dur;
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

  /* --solve-fit: the font size at which "solve" exactly fills its column
     (times SOLVE_FIT_BOOST, a few percent over "exactly" per feedback
     that mobile's "We are the solve" read a couple px too small even
     filling the column edge to edge), measured off the live text rather
     than guessed, so it survives the webfont landing and a change of
     face. A layout concern, independent of the movie below. */
  const SOLVE_FIT_BOOST = 1.03;
  const syncSolveFit = () => {
    const lockup = section.querySelector<HTMLElement>(".hcb__lockup");
    if (!lockup) return;
    const cs = getComputedStyle(lockup);
    const avail = section.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const size = parseFloat(getComputedStyle(solve).fontSize);
    const width = solve.getBoundingClientRect().width;
    if (!size || !width || avail <= 0) return;
    section.style.setProperty("--solve-fit", `${Math.floor((avail / (width / size)) * SOLVE_FIT_BOOST)}px`);
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
  // Guards against arming a second observer on the same section — the
  // movie's onComplete (which calls this) fires again on every replay,
  // not just the first time.
  let groundArmed = false;
  const armGroundTrigger = () => {
    if (groundArmed) return;
    groundArmed = true;
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
    "--dot-k": 1, "--dot-op": 1, "--mark-op": 1, "--ring": 0,
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
       t is in below, since beat 0's fade-in is anchored to its own
       revealAt rather than its (much earlier) movie start, and beat 2's
       fade-out bleeds *after* OPEN_T (dissolving straight into the
       bloom) — see BEATS[0]'s revealAt and BEATS[2]'s bleedOutAfter.
       Visual opacity is independent from what's exposed to assistive
       tech, though: mid-fade, two beats can both be partially visible
       on screen, but only one of them should ever be the "current" one
       a screen reader announces. */
    const idx = beatIndexAt(t);
    beats.forEach((b, i) => {
      const revealAt = BEATS[i].revealAt ?? BEAT_STARTS[i];
      const end = BEAT_STARTS[i] + BEATS[i].duration;
      const opacity = Math.min(
        rampIn(t, revealAt, BEATS[i].fadeIn),
        rampOut(t, end, BEATS[i].fadeOut, !!BEATS[i].bleedOutAfter),
      );
      b.style.opacity = opacity.toFixed(3);
      if (i !== idx) b.setAttribute("aria-hidden", "true");
      else b.removeAttribute("aria-hidden");
    });

    if (t < OPEN_T) {
      const beat = BEATS[idx];
      stage.dataset.ring = beat.ring ? "on" : "off";
      stage.dataset.motion = beat.motion;
      if (beat.swap) {
        // Cycles "smarter" (0) -> "faster" (1) -> "better" (2) — each
        // word gets its own explicit slice (SWAP_A/B/C_DUR above)
        // rather than a plain three-way split, since "faster" and
        // "better" each hold .3s longer than "smarter" does.
        const elapsed = t - BEAT_STARTS[idx];
        const step = elapsed < SWAP_A_DUR ? 0 : elapsed < SWAP_A_DUR + SWAP_B_DUR ? 1 : 2;
        beats[idx].setAttribute("data-swap-step", String(step));
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
    navLogo?.classList.remove("is-gone");
    section.dataset.heroDone = "true";
    armGroundTrigger();
  };

  const tl = gsap.timeline({ defaults: { ease: "none" }, onUpdate: handleUpdate, onComplete: onMovieComplete });

  /* BEAT 0 — the branded dot grows from nothing to full size, holds long
     enough to actually register, then the outlined iris slowly opens
     (the ring-open motion IS beat 0's own text fade-in — see BEATS[0]'s
     revealAt above — so the copy arrives exactly in step with the shape
     revealing it), then holds again once fully readable before fading
     into beat 1 same as every other beat boundary (handleUpdate's
     rampOut, anchored at this beat's own end). No explicit ring-close
     tween is needed at that handoff: beat 0's text is already back to 0
     opacity by then, so nothing visible sits inside the iris regardless
     of --ring's value, and .hcb__ring's own stroke hides instantly the
     moment data-ring flips to "off" for beat 1. */
  tl.fromTo(stage, { "--dot-k": 1 }, { "--dot-k": 0, duration: GROW_DUR, ease: "sine.inOut" }, 0)
    .to(stage, { "--ring": 1, duration: REVEAL_DUR, ease: "sine.inOut" }, B0_REVEAL_AT)
    /* Mark and dot both dissolve together, fast, right as the reveal
       starts — confirmed live that leaving the dot's own fade stretched
       across most of REVEAL_DUR (as a slower, later tween) left it
       still mostly opaque through the ring's whole opening, visually
       colliding with the text emerging behind/within it instead of
       clearing the way for it. This way the dot is gone within the
       first ~40% of the reveal, so the ring spends the rest of it
       opening onto a clean cream backdrop as the text fades in. */
    .to(stage, { "--mark-op": 0, "--dot-op": 0, duration: REVEAL_DUR * 0.4, ease: "sine.in" }, B0_REVEAL_AT);

  /* BEATS 1/2 — swipe / iris(+word swap), each its own slot. Beat 0's
     tweens are built separately above (its shape isn't the generic
     hold-then-crossfade the other two share). Discrete state (which
     beat, which clip mechanic, the ring) is derived from the timeline's
     own elapsed time in handleUpdate above; these tweens only own the
     continuous numbers. */
  BEATS.forEach((beat, i) => {
    if (i === 0) return;
    const start = BEAT_STARTS[i];
    if (beat.motion === "swipe") {
      tl.fromTo(stage, { "--wipe-r": 1 }, { "--wipe-r": 0, duration: beat.duration * 0.5, ease: "power2.out" }, start)
        .fromTo(stage, { "--wipe-l": 0 }, { "--wipe-l": 1, duration: beat.duration * 0.5, ease: "power2.in" }, start + beat.duration * 0.5);
    } else if (beat.swap) {
      tl.fromTo(stage, { "--ring": 0 }, { "--ring": 1, duration: beat.duration * 0.25, ease: "power2.out" }, start)
        .to(stage, { "--ring": 0, duration: beat.duration * 0.25, ease: "power2.in" }, start + beat.duration * 0.75);
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

  /* Phones: scrolling down ends the movie. A swipe up (or, on a narrow
     or touch screen, a wheel scroll) jumps straight to the finished
     frame and unlocks scrolling in the same moment — so the swipe that
     ended it carries on scrolling the page (checked with real touch
     input: the first swipe moves the page). Desktop keeps the full
     movie, scroll-locked. */
  const SKIP_SWIPE = 40; // px of upward finger travel that counts as a scroll down
  const skippable = window.matchMedia("(max-width: 999px), (pointer: coarse)");
  const skip = () => {
    if (!tl.isActive() || tl.progress() >= 1) return;
    tl.progress(1);
  };
  let touchY: number | null = null;
  const onTouchStart = (e: TouchEvent) => { touchY = e.touches[0]?.clientY ?? null; };
  const onTouchMove = (e: TouchEvent) => {
    if (touchY === null) return;
    if (touchY - (e.touches[0]?.clientY ?? touchY) > SKIP_SWIPE) { touchY = null; skip(); }
  };
  const onWheel = (e: WheelEvent) => { if (skippable.matches && e.deltaY > 0) skip(); };
  window.addEventListener("touchstart", onTouchStart, { passive: true });
  window.addEventListener("touchmove", onTouchMove, { passive: true });
  window.addEventListener("wheel", onWheel, { passive: true });

  // Exposed for automated tests, which otherwise have to burn this
  // movie's real ~9.5s runtime on every single test that just needs
  // Hero out of the way first (most of them don't care about Hero
  // itself) — a test can fast-forward via
  // `document.getElementById("hero").heroTimeline.progress(1)`, which
  // synchronously fires the remaining tweens' end state and onComplete,
  // same as if it had actually played out. Harmless in production: one
  // extra object reference, nothing reads it outside tests.
  (section as HTMLElement & { heroTimeline?: gsap.core.Timeline }).heroTimeline = tl;

  /* Replay — re-locks scroll and restarts the whole movie from the top.
     Only reachable once the movie's actually done (see .hcb__replay's
     visibility/pointer-events rules in Hero.astro, gated on the same
     data-hero-done this clears). */
  const replayBtn = section.querySelector<HTMLButtonElement>(".hcb__replay");
  replayBtn?.addEventListener("click", () => {
    section.dataset.heroDone = "false";
    cueTl?.pause();
    navLogo?.classList.add("is-gone");
    window.scrollTo(0, 0);
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    window.addEventListener("scroll", snapBackToTop);
    tl.restart();
  });

  tl.play();
}
