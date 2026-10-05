import * as THREE from "three";
import { useGsap, prefersReducedMotion } from "./gsapSetup";

const N = 5;
const DESKTOP_QUERY = "(min-width: 1000px)";
// world-space distance from the camera to the z=0 "front" plane — fov is
// recomputed off this each resize so 1 Three.js unit at z=0 == 1 css px,
// which means every lane below can be authored directly in px-equivalent
// units instead of hand-derived ones.
const CAMERA_Z = 1000;

/* Each slide flies in (ARRIVE_DUR), holds readable at centre (holdFor:
   HOLD_DUR, plus LATER_SLIDE_EXTRA for slides 2-5), then simply fades
   out where it is (FADE_DUR) — no blur, no shrinking off to a side.
   The next slide starts its own entrance once the current one's fade
   is NEXT_AFTER_FADE of the way done — it's nearly gone by then, so the
   incoming slide never flies in over a ghost of the outgoing one. Once the last slide has faded, every slide is placed at its
   resting spot in the Figma composition (node 3612:8790 — see
   REST_LAYOUT) and uncovered by a growing circle, the same reveal the
   hero's opening beat uses (see revealRest). */
const ARRIVE_DUR = 0.6;
const ARRIVE_EASE = "power2.out";
const HOLD_DUR = 1.1;
const LATER_SLIDE_EXTRA = 0.3;
const FADE_DUR = 0.7;
const FADE_EASE = "power1.inOut";
const NEXT_AFTER_FADE = 0.6;
// mirrors hero.ts's REVEAL_DUR/ease for its own iris-open beat
const REVEAL_DUR = 1.5;
const REVEAL_EASE = "sine.inOut";
// how far into its own arrival (0-1) a slide has to be before its number
// starts counting up.
const COUNT_START_PROGRESS = 0.75;
// how deep a waiting slide sits — invisible (opacity 0), so its exact
// depth barely matters visually.
const WAIT_Z = -1700;
// where the arrival lands and the hold-creep then continues from — a bit
// past centre's z:0, so the slide still reads as very slightly larger
// than "arrived".
const HOLD_Z = 90;
// constant world-units/second the depth keeps creeping forward at while
// holding, so the pause never reads as a dead stop.
const HOLD_CREEP_SPEED = 90;
// a waiting slide isn't perfectly frozen either — a slow, barely-visible
// ambient drift keeps it faintly alive in the background, so the next
// slide promoted doesn't have to cold-start from a dead stop.
const WAIT_BREATHE_DUR = 6;
const WAIT_BREATHE_OPACITY = 0.06;
const WAIT_BREATHE_Z_RANGE = 180;

type Lane = { x: number; y: number; z: number };

// Every slide's one arrival target: dead centre.
const CENTER_LANE: Lane = { x: 0, y: 0, z: 0 };

// Where a slide sits between turns: off to one of 4 sides, deep in the
// background. Picked fresh every time a slide is parked back to waiting
// (never the same side twice running) so the entrance direction varies
// turn to turn.
type Side = "left" | "right" | "top" | "bottom";
const SIDES: Side[] = ["left", "right", "top", "bottom"];
const WAIT_OFFSET_X = 640;
const WAIT_OFFSET_Y = 380;
function waitLaneFor(side: Side): Lane {
  switch (side) {
    case "left": return { x: -WAIT_OFFSET_X, y: 0, z: WAIT_Z };
    case "right": return { x: WAIT_OFFSET_X, y: 0, z: WAIT_Z };
    case "top": return { x: 0, y: -WAIT_OFFSET_Y, z: WAIT_Z };
    case "bottom": return { x: 0, y: WAIT_OFFSET_Y, z: WAIT_Z };
  }
}

// mobile has no per-frame projection loop to derive scale/opacity/blur
// from depth the way desktop does, so lanes carry those values
// explicitly, authored directly instead of falling out of real
// perspective.
type MobileLane = { x: string; y: string; z: number; scale: number; blur: number; opacity: number };
const MOBILE_CENTER_LANE: MobileLane = { x: "0px", y: "0px", z: 0, scale: 1, blur: 0, opacity: 1 };
const MOBILE_WAIT_Z = -480;
const MOBILE_WAIT_SCALE = 0.22;
const MOBILE_WAIT_BLUR = 14;
// Unlike desktop's 4 sides, a phone is too narrow for a sideways entrance
// to read as anything but a slide drifting off-centre — every slide waits
// small and blurred straight behind centre and comes right down the
// middle toward the viewer.
const MOBILE_WAIT_LANE: MobileLane = {
  x: "0px", y: "0px", z: MOBILE_WAIT_Z, scale: MOBILE_WAIT_SCALE, blur: MOBILE_WAIT_BLUR, opacity: 0,
};
const MOBILE_HOLD_SCALE = 1.1;
const MOBILE_HOLD_Z = 40;
const MOBILE_HOLD_CREEP_SCALE_SPEED = 0.135;
const MOBILE_HOLD_CREEP_Z_SPEED = 90;

/**
 * MomentumGallery — a "back to front" depth-of-field carousel that plays
 * like a short movie, not a scroll-scrubbed one. A slide starts small
 * and invisible off to one of 4 sides — left, right, top, or bottom (see
 * waitLaneFor) — deep in the background, flies into dead centre
 * (ARRIVE_DUR), holds there readable (holdFor), then fades out in
 * place (FADE_DUR). Nothing lingers on screen once its turn is over;
 * the next slide's arrival begins just as the current one starts
 * fading (see runSlide). After the last one, all five reappear at
 * their Figma resting spots behind a growing circle (see revealRest).
 *
 * It plays automatically the first time the section scrolls into view —
 * the same idiom Hero's own intro movie uses (hero.ts), just without
 * locking scroll: this never traps the visitor, it just plays in the
 * background while they keep scrolling if they want to. If they scroll
 * away before it finishes, or once it finishes on its own, the section
 * rests on all 5 slides at once (see "resting state" below) and stays
 * there — scrolling back doesn't autoplay it again. Only the "Replay"
 * button plays it again.
 *
 * Desktop renders the depth with a real Three.js scene (a camera + one
 * invisible mesh per slide — see renderFrame) and syncs the real DOM
 * text's position/scale to each mesh every frame; the actual stat/quote
 * copy never lives inside the canvas, and the canvas itself paints
 * nothing visible. Below 1000px, no WebGL context is ever created at all
 * — a plain CSS 3D transform stack approximates the same look.
 */
export function setupMomentumGallery() {
  const section = document.getElementById("momentum");
  const sceneEl = document.getElementById("mgScene");
  const canvas = document.getElementById("mgCanvas") as HTMLCanvasElement | null;
  if (!section || !sceneEl || !canvas) return;

  // scoped to sceneEl, not the whole section — the overview grid (built
  // later, see buildOverviewCards) clones each slide's classes wholesale
  // (including .mg__slide itself, needed for the clone's own styling),
  // and its clones live outside sceneEl as siblings, not inside it.
  const slides = Array.from(sceneEl.querySelectorAll<HTMLElement>(".mg__slide")).sort(
    (a, b) => Number(a.dataset.mgIndex) - Number(b.dataset.mgIndex),
  );
  if (slides.length !== N) return;

  const setCountText = (el: HTMLElement, value: number) => {
    const prefix = el.dataset.mgPrefix || "";
    const suffix = el.dataset.mgSuffix || "";
    el.innerHTML = `<span class="mfig__prefix">${prefix}</span>${Math.round(value)}<span class="unit">${suffix}</span>`;
  };

  /* Pins each stat figure to its own final rendered width up front,
     once, rather than letting it live-resize during count-up (see
     countUp below). .mg__slide--stat is width:fit-content (see that
     rule's own comment); count-up briefly displays every intermediate digit count
     (0, 22, 38, ... 150) on the way to its target, and without this,
     each of those ~50 intermediate values forced a real layout
     reflow on an element that's ALSO being transformed every frame
     by Three.js — confirmed live as a genuine frame-drop/stall right
     as a slide's count-up finishes, which read as the number
     "changing weight" or being swapped for a different one. Reserving
     the final width up front means the box never needs to resize
     mid-animation — only the digits themselves change. */
  slides.forEach((slide) => {
    const fig = slide.querySelector<HTMLElement>("[data-mg-count]");
    if (!fig) return;
    setCountText(fig, Number(fig.dataset.mgCount));
    fig.style.minWidth = `${fig.getBoundingClientRect().width}px`;
  });

  if (prefersReducedMotion()) {
    // static stacked layout (CSS handles the geometry) — every number just
    // shows its final value, no tween, no movie, no canvas ever created.
    // The replay button is hidden too — see the reduced-motion CSS.
    slides.forEach((slide) => {
      const fig = slide.querySelector<HTMLElement>("[data-mg-count]");
      if (fig) setCountText(fig, Number(fig.dataset.mgCount));
    });
    return;
  }

  const { gsap, ScrollTrigger } = useGsap();

  const countUp = (slide: HTMLElement) => {
    const fig = slide.querySelector<HTMLElement>("[data-mg-count]");
    if (!fig) return;
    const target = Number(fig.dataset.mgCount);
    const obj = { v: 0 };
    setCountText(fig, 0);
    gsap.to(obj, { v: target, duration: 0.9, ease: "power2.out", onUpdate: () => setCountText(fig, obj.v) });
  };

  /* ---------- shared state ---------- */
  let idx = 0;
  let playing = false; // is the movie actively running right now
  let everActivated = false; // has slide 0's very first arrival ever started
  let everPlayed = false; // has the movie finished, or been left, at least once — once true, the overview is the resting state
  // declared up here, not down by the rest of the overview code, because
  // enterMode() (called synchronously during setup, before the overview
  // section further down ever runs) already reads it — a `let` declared
  // later would be in its temporal dead zone at that point.
  let overviewOpen = false;
  // true while the section is showing its resting composition (see
  // showRest) — renderFrame reads it during setup, so it lives up here.
  let resting = false;
  let sectionVisible = false;
  const countedUp: boolean[] = new Array(N).fill(false);
  // desktop lane bookkeeping (Three.js world units)
  const laneOf = new Map<number, Lane>(); // slide index -> its current lane (centre or a waiting side)
  let lastSide: Side | null = null;
  function pickSide(): Side {
    const pool = SIDES.filter((s) => s !== lastSide);
    const pick = pool[Math.floor(Math.random() * pool.length)];
    lastSide = pick;
    return pick;
  }

  // mobile lane bookkeeping — separate units, see MobileLane above
  const mobileLaneOf = new Map<number, MobileLane>();

  // seed every slide at its own waiting lane, invisible.
  for (let i = 0; i < N; i++) {
    laneOf.set(i, waitLaneFor(pickSide()));
    mobileLaneOf.set(i, MOBILE_WAIT_LANE);
    gsap.set(slides[i], { opacity: 0 });
  }

  // Not conditioned on `playing` — while the overview is showing, the
  // whole scene is already hidden from assistive tech via
  // sceneEl.style.visibility (see showOverview), so it doesn't matter
  // what an individual slide's own aria-hidden says at that point. This
  // does need to be right for previewSlide's sake, though: a slide shown
  // by clicking an overview card is active/exposed even though the
  // movie itself isn't "playing".
  function applyAria() {
    slides.forEach((slide, i) => {
      slide.dataset.active = String(i === idx && everActivated);
      if (i === idx && everActivated) slide.removeAttribute("aria-hidden");
      else slide.setAttribute("aria-hidden", "true");
    });
  }
  applyAria();

  /* ================= Three.js (desktop) ================= */
  let three: {
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    meshes: THREE.Mesh[];
    vector: THREE.Vector3;
    ro: ResizeObserver;
    running: boolean;
    // cached #mgScene size, refreshed only on actual resize (see
    // initThree's own resize()) — renderFrame reads these every frame
    // instead of sceneEl.clientWidth/Height directly; clientWidth/Height
    // are layout-triggering reads, and renderFrame also writes element
    // styles, so reading the live DOM property every frame forced a
    // synchronous reflow on every single tick (confirmed via a
    // performance trace: ~157ms of forced-reflow time attributed
    // directly to this function, enough to visibly drop frames right
    // as a slide's count-up/arrival finished).
    width: number;
    height: number;
  } | null = null;

  function renderFrame() {
    if (!three) return;
    three.renderer.render(three.scene, three.camera);
    const { camera, meshes, vector } = three;
    const sceneWidth = three.width;
    const sceneHeight = three.height;
    meshes.forEach((mesh, i) => {
      vector.setFromMatrixPosition(mesh.matrixWorld);
      vector.project(camera);
      const x = (vector.x * 0.5 + 0.5) * sceneWidth;
      const y = (-vector.y * 0.5 + 0.5) * sceneHeight;
      const scale = CAMERA_Z / (CAMERA_Z - mesh.position.z);
      const el = slides[i];
      el.style.transform = `translate(${x.toFixed(3)}px, ${y.toFixed(3)}px) translate(-50%, -50%) scale(${scale.toFixed(5)})`;
      el.style.filter = resting || scale >= 0.98 ? "" : `blur(${((1 - Math.min(scale, 1)) * 12).toFixed(1)}px)`;
      el.style.zIndex = String(Math.round(scale * 100));
    });
  }

  function initThree() {
    if (three) return;
    const scn = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1, 10, 4000);
    camera.position.z = CAMERA_Z;

    const renderer = new THREE.WebGLRenderer({ canvas: canvas!, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0); // genuinely transparent — the ShineField dust field behind the canvas stays visible through it

    const meshes = slides.map((_, i) => {
      const geo = new THREE.PlaneGeometry(560, 300);
      const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      const lane = laneOf.get(i)!;
      mesh.position.set(lane.x, lane.y, lane.z);
      scn.add(mesh);
      return mesh;
    });

    const resize = () => {
      const w = sceneEl!.clientWidth;
      const h = sceneEl!.clientHeight;
      if (!w || !h) return;
      camera.fov = (2 * Math.atan(h / 2 / CAMERA_Z) * 180) / Math.PI;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
      if (three) { three.width = w; three.height = h; }
      if (resting && mode === "desktop") placeRestDesktop();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(sceneEl!);

    three = { renderer, scene: scn, camera, meshes, vector: new THREE.Vector3(), ro, running: false, width: 0, height: 0 };
    resize(); // populates three.width/height before the first paint below
    renderFrame(); // paint the seeded (all-waiting) layout immediately, don't wait for a tick
  }

  function startThreeTicker() {
    if (!three || three.running) return;
    three.running = true;
    gsap.ticker.add(renderFrame);
  }
  function stopThreeTicker() {
    if (!three || !three.running) return;
    three.running = false;
    gsap.ticker.remove(renderFrame);
  }

  /* A waiting slide isn't perfectly frozen either — a slow, barely-visible
     ambient drift keeps it faintly alive in the background. `delay` is
     randomized per call so multiple waiting slides don't all breathe in
     lockstep. */
  function startDesktopWaitBreathe(i: number) {
    const delay = Math.random() * WAIT_BREATHE_DUR;
    gsap.to(slides[i], { opacity: WAIT_BREATHE_OPACITY, duration: WAIT_BREATHE_DUR, delay, ease: "sine.inOut", yoyo: true, repeat: -1 });
    if (three) {
      gsap.to(three.meshes[i].position, {
        z: WAIT_Z + WAIT_BREATHE_Z_RANGE, duration: WAIT_BREATHE_DUR, delay, ease: "sine.inOut", yoyo: true, repeat: -1,
      });
    }
  }
  // once a slide has arrived, its depth keeps creeping forward at a
  // small but clearly-visible constant speed through its hold and fade,
  // instead of sitting dead still.
  function startMobileHoldCreep(i: number, dur: number) {
    gsap.to(slides[i], {
      scale: MOBILE_HOLD_SCALE + MOBILE_HOLD_CREEP_SCALE_SPEED * dur,
      z: MOBILE_HOLD_Z + MOBILE_HOLD_CREEP_Z_SPEED * dur,
      duration: dur, ease: "none",
    });
  }
  function startDesktopHoldCreep(i: number, dur: number) {
    if (!three) return;
    gsap.to(three.meshes[i].position, {
      z: HOLD_Z + HOLD_CREEP_SPEED * dur, duration: dur, ease: "none",
    });
  }

  const holdFor = (i: number) => HOLD_DUR + (i > 0 ? LATER_SLIDE_EXTRA : 0);

  /* Arrival: one tween, ARRIVE_DUR, from wherever the slide is currently
     waiting (one of the 4 sides) straight to dead centre. Depth keeps
     going once this completes (startDesktopHoldCreep) — "the pause" is
     that creep, never a dead stop. `onArrived` fires once this slide is
     actually settled — see playMovie, which uses it to time the next
     advance off the real animation, not an assumed duration. */
  function promoteDesktop(inIndex: number, onArrived?: () => void) {
    initThree();
    if (!three) { onArrived?.(); return; }
    const mesh = three.meshes[inIndex];

    laneOf.set(inIndex, CENTER_LANE);
    gsap.killTweensOf(mesh.position);
    gsap.killTweensOf(slides[inIndex]);

    gsap.to(mesh.position, {
      x: CENTER_LANE.x, y: CENTER_LANE.y, z: HOLD_Z, duration: ARRIVE_DUR, ease: ARRIVE_EASE,
      onUpdate: function () {
        if (!countedUp[inIndex] && this.progress() >= COUNT_START_PROGRESS) {
          countedUp[inIndex] = true;
          countUp(slides[inIndex]);
        }
      },
      onComplete: () => {
        startDesktopHoldCreep(inIndex, holdFor(inIndex) + FADE_DUR);
        onArrived?.();
      },
    });
    gsap.fromTo(slides[inIndex], { opacity: 0 }, { opacity: 1, duration: ARRIVE_DUR, ease: ARRIVE_EASE });
  }

  /* Fades a finished slide out exactly where it is (its hold creep
     keeps running underneath) — same on desktop and mobile. */
  function fadeOutSlide(i: number, onDone?: () => void) {
    gsap.to(slides[i], { opacity: 0, duration: FADE_DUR, ease: FADE_EASE, onComplete: onDone });
  }

  /* ================= CSS transform (mobile) ================= */
  function mobileApplyImmediate() {
    slides.forEach((slide, i) => {
      const t = mobileLaneOf.get(i)!;
      gsap.set(slide, {
        xPercent: -50, yPercent: -50, x: t.x, y: t.y, z: t.z,
        scale: t.scale, opacity: t.opacity,
        filter: t.blur ? `blur(${t.blur}px)` : "none",
        zIndex: Math.round(t.scale * 100),
      });
    });
  }

  /* Mirrors promoteDesktop — one ARRIVE_DUR tween from whichever side
     this slide was last parked at, straight to dead centre. `scale`
     plays the role desktop's depth does. */
  function promoteMobile(inIndex: number, onArrived?: () => void) {
    mobileLaneOf.set(inIndex, MOBILE_CENTER_LANE);
    gsap.killTweensOf(slides[inIndex]);
    slides[inIndex].style.zIndex = "100";
    gsap.to(slides[inIndex], {
      x: MOBILE_CENTER_LANE.x, y: MOBILE_CENTER_LANE.y,
      scale: MOBILE_HOLD_SCALE, z: MOBILE_HOLD_Z, opacity: 1, filter: "none",
      duration: ARRIVE_DUR, ease: ARRIVE_EASE,
      onUpdate: function () {
        if (!countedUp[inIndex] && this.progress() >= COUNT_START_PROGRESS) {
          countedUp[inIndex] = true;
          countUp(slides[inIndex]);
        }
      },
      onComplete: () => {
        startMobileHoldCreep(inIndex, holdFor(inIndex) + FADE_DUR);
        onArrived?.();
      },
    });
  }

  /* ================= mode switching ================= */
  const desktopQuery = window.matchMedia(DESKTOP_QUERY);
  type Mode = "desktop" | "mobile";
  let mode: Mode = desktopQuery.matches ? "desktop" : "mobile";

  function enterMode(next: Mode) {
    mode = next;
    if (everActivated) {
      laneOf.set(idx, CENTER_LANE);
      mobileLaneOf.set(idx, MOBILE_CENTER_LANE);
    }
    if (mode === "desktop") {
      slides.forEach((s, i) => {
        s.style.transform = "";
        gsap.killTweensOf(s);
        s.style.filter = "";
        s.style.opacity = everActivated && !overviewOpen && i === idx ? "1" : "0";
      });
      initThree();
      if (three) {
        const lane = laneOf.get(idx)!;
        const mesh = three.meshes[idx];
        mesh.position.set(lane.x, lane.y, lane.z);
      }
      renderFrame();
      if (sectionVisible) startThreeTicker();
    } else {
      stopThreeTicker();
      slides.forEach((s) => { s.style.transform = ""; });
      mobileApplyImmediate();
    }
  }
  enterMode(mode);

  desktopQuery.addEventListener("change", () => {
    const next: Mode = desktopQuery.matches ? "desktop" : "mobile";
    if (next !== mode) {
      enterMode(next);
      buildOverviewCards();
      if (resting) {
        if (mode === "desktop") { closeOverview(); placeRestDesktop(); }
        else showOverview();
      }
    }
  });

  /* ================= the movie ================= */
  // Plays automatically the first time the section scrolls into view
  // (see the ScrollTrigger further down), then only via Replay. Each slide: ARRIVE_DUR in, holdFor(i)
  // at centre, FADE_DUR out in place. The next slide starts its own
  // entrance once that fade is NEXT_AFTER_FADE of the way done.
  let pendingTimers: gsap.core.Tween[] = [];
  function schedule(delay: number, fn: () => void): gsap.core.Tween {
    const t = gsap.delayedCall(delay, fn);
    pendingTimers.push(t);
    return t;
  }
  function killMovieTimers() {
    pendingTimers.forEach((t) => t.kill());
    pendingTimers = [];
  }

  // Parks a single slide invisibly at a freshly-picked waiting side —
  // shared by playMovie's own opening seed and previewSlide's "everyone
  // except the one being previewed" reset.
  function parkSlideAtWait(i: number) {
    if (mode === "desktop" && three) {
      const lane = waitLaneFor(pickSide());
      laneOf.set(i, lane);
      three.meshes[i].position.set(lane.x, lane.y, lane.z);
      gsap.set(slides[i], { opacity: 0 });
    } else if (mode === "mobile") {
      const lane = MOBILE_WAIT_LANE;
      mobileLaneOf.set(i, lane);
      gsap.set(slides[i], {
        x: lane.x, y: lane.y, z: lane.z, scale: lane.scale, opacity: lane.opacity, filter: `blur(${lane.blur}px)`,
      });
    }
  }

  // Runs one slide's full lifecycle — promote to centre, hold, fade out
  // in place — and schedules the next slide's own runSlide partway
  // through. The last slide's fade completing ends the movie.
  function runSlide(i: number) {
    idx = i;
    applyAria();
    const promote = mode === "desktop" ? promoteDesktop : promoteMobile;
    const isLast = i === N - 1;

    promote(i, () => {
      // scroll was held from the moment the section reached the top —
      // release it now that the first slide is actually playing (see
      // engageScrollLock's own comment)
      if (i === 0) releaseScrollLock();
      schedule(holdFor(i), () => fadeOutSlide(i, isLast ? finishMovie : undefined));
    });

    if (!isLast) {
      schedule(ARRIVE_DUR + holdFor(i) + FADE_DUR * NEXT_AFTER_FADE, () => runSlide(i + 1));
    }
  }

  function finishMovie() {
    playing = false;
    everPlayed = true;
    applyAria();
    showRest(true);
  }

  // Starts the very first slide's own arrival directly (there's no
  // outgoing slide to depart from on a cold start).
  function playMovie() {
    if (playing) return;
    hideRest();
    // the render loop is normally started by handleReachTop once the
    // section is actually at the top — but that's *also* what calls
    // playMovie() in the first place, so in practice this is a no-op
    // there. Explicit here too so playMovie (and previewSlide,
    // below) are correct no matter how they're invoked — e.g. directly,
    // for testing, without ever having scrolled the section into view
    // at all. Without this, animations tween the mesh correctly but the
    // DOM transform never repaints past whatever it was seeded at.
    if (mode === "desktop") startThreeTicker();
    killMovieTimers();
    playing = true;
    everActivated = true;
    countedUp.fill(false);
    for (let i = 0; i < N; i++) parkSlideAtWait(i);
    // desktop's waiting slides drift faintly at their sides; mobile's
    // all wait directly behind centre, where any visible drift would sit
    // right behind the playing slide's text — so they stay invisible
    if (mode === "desktop") for (let i = 1; i < N; i++) startDesktopWaitBreathe(i);
    runSlide(0);
  }

  function stopMovie() {
    killMovieTimers();
    playing = false;
    // defensive — should already be released by the time slide 0 has
    // arrived, but a stray call here should never leave scroll stuck
    releaseScrollLock();
    for (let i = 0; i < N; i++) {
      gsap.killTweensOf(slides[i]);
      if (mode === "desktop" && three) gsap.killTweensOf(three.meshes[i].position);
    }
  }

  // Jumps straight to one slide, shown on its own — used by the
  // overview's own cards (see buildOverviewCards). Not a mirror of
  // runSlide: there's no valid "currently active" slide to depart from
  // while resting on the overview (the movie isn't running), so this
  // just parks every *other* slide invisibly and promotes the one
  // that was clicked directly.
  function previewSlide(i: number) {
    hideRest();
    stopMovie();
    if (mode === "desktop") startThreeTicker(); // see playMovie's own comment
    for (let j = 0; j < N; j++) {
      if (j !== i) parkSlideAtWait(j);
    }
    idx = i;
    everActivated = true;
    applyAria();
    if (mode === "desktop") promoteDesktop(i);
    else promoteMobile(i);
  }

  /* ================= visibility ================= */
  // Starts the movie the first time the section reaches the top of the
  // viewport — the same "is this section now the one at the top" idiom
  // navTint.ts's own top-top/bottom-top triggers use, not raw
  // intersection. That's the only autoplay: once the movie has
  // finished, or been left mid-play, the section rests on its final
  // screen for good, and only the Replay button plays it again.
  //
  // Scroll is held in place — like the other pinned "scroll areas" —
  // from the moment it reaches the top until the first slide is
  // actually playing (see engageScrollLock/releaseScrollLock below, and
  // runSlide's own i===0 release once slide 0 arrives): long enough
  // that a visitor scrolling straight past doesn't blow through the
  // section before the movie even starts. After that it never traps
  // them again — they can keep scrolling while the rest of the movie
  // plays in the background. If they scroll away before it finishes,
  // that's treated the same as it finishing on its own: the section
  // rests on every slide at once.

  // Mirrors hero.ts's own scroll-lock idiom — overflow:hidden plus a
  // snap-back scroll listener, since overflow:hidden alone doesn't
  // reliably block a *programmatic* scrollTo in every engine — but
  // locks to wherever the page already was, not the page's very top.
  // This is a section reached by scrolling down to it, not a splash
  // intro: the point is to hold it exactly where it was reached, not
  // jump anywhere else.
  let lockedScrollY = 0;
  function snapBackToLock() {
    window.scrollTo(0, lockedScrollY);
  }
  function engageScrollLock() {
    lockedScrollY = window.scrollY;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    window.addEventListener("scroll", snapBackToLock);
  }
  function releaseScrollLock() {
    document.documentElement.style.overflow = "";
    document.body.style.overflow = "";
    window.removeEventListener("scroll", snapBackToLock);
  }

  function handleReachTop() {
    sectionVisible = true;
    if (mode === "desktop") startThreeTicker();
    if (!playing && !everActivated) {
      engageScrollLock();
      playMovie();
    }
  }
  function handleLeaveTop() {
    sectionVisible = false;
    if (mode === "desktop") stopThreeTicker();
    releaseScrollLock(); // defensive — scroll being blocked should make a real leave impossible while still locked
    if (playing) stopMovie();
    // a replay or a single previewed slide left mid-way also goes back
    // to the final screen
    if (everActivated && !resting) {
      everPlayed = true;
      applyAria();
      showRest(false);
    }
  }
  ScrollTrigger.create({
    trigger: section,
    start: "top top",
    end: "bottom top",
    onEnter: handleReachTop,
    onEnterBack: handleReachTop,
    onLeave: handleLeaveTop,
    onLeaveBack: handleLeaveTop,
  });
  // this trigger's pixel positions get calculated as soon as it's
  // created, which can be before web fonts finish swapping in and
  // resizing text elsewhere on the page — confirmed live: an instant
  // scrollIntoView() landing exactly on the (still-stale) cached "top
  // top" position sometimes didn't register as having crossed it, so
  // onEnter simply never fired until an incidental extra pixel of
  // scroll nudged past the (now-correct) real one.
  document.fonts?.ready.then(() => ScrollTrigger.refresh()).catch(() => {});

  /* ================= resting state + replay ================= */
  // Once the movie has played through (or been left), the section rests
  // on every slide at once. Desktop: the live slides themselves, placed
  // by their own Three.js meshes at the Figma composition's positions
  // and type sizes (REST_LAYOUT) — the same rendering path as the movie,
  // no separate HTML copy. Mobile (no WebGL): the stacked list of
  // cloned slides in #mgOverview. Either way it's uncovered by a growing
  // circle (revealCircle), mirroring the hero's own opening iris.
  const replayBtn = document.getElementById("mgOvToggle");
  const overview = document.getElementById("mgOverview");
  const ovGrid = document.getElementById("mgOvGrid");
  const ring = document.getElementById("mgRing");

  /* Desktop resting composition — Figma node 3612:8790, a 1920-wide
     frame. Per slide: where its content starts (x is the column's
     centre for the centred stat columns, the left edge for the
     left-aligned quotes; top is the content's top edge) and the font
     size of its headline text (the .mfig figure or the .mquote lines)
     in that frame. Each slide is scaled so its headline renders at
     exactly that size relative to the frame. cssFont is the headline
     size the [data-mg-rest] rules in global.css are written against
     (default: font) — every stat block in the frame is a uniform
     scale of one 190px-figure layout, so the stats share one set of
     rules at 190. */
  type RestSlot = { x: number; top: number; font: number; align: "center" | "left"; cssFont?: number };
  const REST_LAYOUT: Record<number, RestSlot> = {
    0: { x: 1073.8, top: 1059.3, font: 69.9, align: "left" }, // "They move at the speed of business"
    1: { x: 643.4, top: 1042.3, font: 151.6, align: "center", cssFont: 190 }, // 100%
    2: { x: 1500.4, top: 626.5, font: 166.5, align: "center", cssFont: 190 }, // 4M
    3: { x: 398, top: 625.9, font: 154.06, align: "center", cssFont: 190 }, // 150+
    // Michelle quote — Figma node 3837:5995: its text starts above the
    // stats' top row (CONTENT_TOP), beside the heading rather than under it
    4: { x: 796.8, top: 570.6, font: 45.285, align: "left" },
  };
  const FRAME_WIDTH = 1920;
  // the whole composition shifts horizontally (as one block) so the "1"
  // of 150+ lines up under the "m" of "momentum." in the heading
  const ALIGN_SLIDE = 3;
  const CONTENT_TOP = 626;
  const QUOTE_BADGE_ALLOWANCE = 170; // a quote's badge sits outside its own box, past its first line
  const REST_PAD_TOP = 8;
  const REST_PAD_BOTTOM = 30;
  const REST_PAD_SIDE = 24;

  // the on-screen box of the first visible character inside `el`
  function firstGlyphRect(el: HTMLElement): DOMRect | null {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent ?? "";
      const at = text.search(/\S/);
      if (at < 0) continue;
      const range = document.createRange();
      range.setStart(node, at);
      range.setEnd(node, at + 1);
      return range.getBoundingClientRect();
    }
    return null;
  }

  function headlineFont(slide: HTMLElement): number {
    const el = slide.querySelector<HTMLElement>(".mfig, .mquote");
    return el ? parseFloat(getComputedStyle(el).fontSize) : 0;
  }

  // Moves every mesh straight to its resting spot. Inverts renderFrame's
  // own projection (screen = sceneCentre + mesh·scale) to find the mesh
  // x/y/z that lands each slide exactly on its target.
  //
  // Each slide first gets --u: one Figma px expressed in its own live
  // px (its headline's live font size / the Figma size, taken at the
  // slot's cssFont scale — see REST_LAYOUT). The
  // [data-mg-rest] rules in global.css size the captions, sublines and
  // gaps in multiples of it, so each slide's internal proportions match
  // the Figma frame exactly; the whole slide is then scaled by k / u,
  // k being Figma px -> screen px for the composition as a whole —
  // chosen so the tallest column and the widest item both fit.
  function placeRestDesktop() {
    initThree();
    if (!three || !sceneEl) return;
    const W = three.width || sceneEl.clientWidth;
    const H = three.height || sceneEl.clientHeight;

    const geo = slides.map((slide, i) => {
      const slot = REST_LAYOUT[i];
      const ref = slot.cssFont ?? slot.font;
      const cssU = (headlineFont(slide) || ref) / ref;
      slide.style.setProperty("--u", `${cssU}px`);
      // live px per Figma px
      const u = (cssU * ref) / slot.font;
      const cs = getComputedStyle(slide);
      // in Figma px, now that --u has been applied
      const w = parseFloat(cs.width) / u;
      const h = parseFloat(cs.height) / u;
      const left = slot.align === "center" ? slot.x - w / 2 : slot.x;
      const right = left + w + (slot.align === "left" ? QUOTE_BADGE_ALLOWANCE : 0);
      return { u, w, h, left, right, bottom: slot.top + h };
    });
    const contentBottom = Math.max(...geo.map((g) => g.bottom));
    const contentRight = Math.max(...geo.map((g) => g.right));
    let k = Math.min(
      (W - 2 * REST_PAD_SIDE) / FRAME_WIDTH,
      (H - REST_PAD_TOP - REST_PAD_BOTTOM) / (contentBottom - CONTENT_TOP),
    );

    // Where the "1" glyph sits in Figma px, measured off the slide's own
    // text (its offset inside the slide, unscaled, over --u), and where
    // the heading's "m" sits on screen.
    const sceneRect = sceneEl.getBoundingClientRect();
    const alignSlide = slides[ALIGN_SLIDE];
    const alignFig = alignSlide.querySelector<HTMLElement>(".mfig");
    const headM = section!.querySelector<HTMLElement>(".hs__intro-head .hot");
    const glyphRect = alignFig && firstGlyphRect(alignFig);
    const headRect = headM && firstGlyphRect(headM);
    let ox = (W - FRAME_WIDTH * k) / 2;
    if (glyphRect && headRect) {
      const slideRect = alignSlide.getBoundingClientRect();
      const liveScale = slideRect.width / alignSlide.offsetWidth || 1;
      const g = geo[ALIGN_SLIDE];
      const glyphFigmaX = g.left + (glyphRect.left - slideRect.left) / liveScale / g.u;
      const headX = headRect.left - sceneRect.left;
      // keep the right-hand items on screen: shrink k rather than break
      // the alignment
      k = Math.min(k, (W - REST_PAD_SIDE - headX) / (contentRight - glyphFigmaX));
      ox = headX - glyphFigmaX * k;
    }
    const oy = REST_PAD_TOP - CONTENT_TOP * k;

    slides.forEach((slide, i) => {
      const slot = REST_LAYOUT[i];
      const g = geo[i];
      const scale = k / g.u;
      const cx = ox + (g.left + g.w / 2) * k;
      const cy = oy + (slot.top + g.h / 2) * k;
      const mesh = three!.meshes[i];
      gsap.killTweensOf(mesh.position);
      gsap.killTweensOf(slide);
      mesh.position.set((cx - W / 2) / scale, (H / 2 - cy) / scale, CAMERA_Z * (1 - 1 / scale));
      const fig = slide.querySelector<HTMLElement>("[data-mg-count]");
      if (fig) setCountText(fig, Number(fig.dataset.mgCount));
      slide.style.opacity = "1";
    });
    three.scene.updateMatrixWorld();
    renderFrame();
  }

  // Shows the resting state; `animate` runs the circle reveal (end of
  // the movie), otherwise it's simply there (scrolled away mid-movie).
  function showRest(animate: boolean) {
    resting = true;
    section!.dataset.mgRest = "true";
    if (mode === "desktop") {
      placeRestDesktop();
      slides.forEach((slide) => slide.removeAttribute("aria-hidden"));
    } else showOverview();
    if (animate) revealCircle();
    else sceneEl!.style.clipPath = "";
  }
  function hideRest() {
    resting = false;
    delete section!.dataset.mgRest;
    slides.forEach((slide) => slide.style.removeProperty("--u"));
    gsap.killTweensOf(revealState);
    sceneEl!.style.clipPath = "";
    if (ring) ring.style.opacity = "0";
    closeOverview();
    applyAria();
  }

  // Grows a clear circle from the scene's centre until it covers every
  // corner, with the hero's thin rose ring tracing its edge (see
  // Hero.astro's .hcb__ring) — fading once fully open.
  const revealState = { r: 0 };
  function revealCircle() {
    const W = sceneEl!.clientWidth;
    const H = sceneEl!.clientHeight;
    const maxR = Math.hypot(W, H) / 2 + 2;
    const apply = () => {
      const r = revealState.r;
      sceneEl!.style.clipPath = `circle(${r.toFixed(1)}px at 50% 50%)`;
      if (ring) {
        ring.style.width = ring.style.height = `${(r * 2).toFixed(1)}px`;
      }
    };
    gsap.killTweensOf(revealState);
    revealState.r = 0;
    if (ring) ring.style.opacity = "0.55";
    apply();
    gsap.to(revealState, {
      r: maxR, duration: REVEAL_DUR, ease: REVEAL_EASE, onUpdate: apply,
      onComplete: () => {
        sceneEl!.style.clipPath = "";
        if (ring) gsap.to(ring, { opacity: 0, duration: 0.4 });
      },
    });
  }

  // Each slide's quote badge is an inline SVG with its own id'd
  // <clipPath> (e.g. "clip0_2838_2564_g"), referenced via
  // clip-path:url(#...). cloneNode(true) copies those ids verbatim, so
  // once a clone exists, the *same* id is on both it and the original
  // live slide — url(#id) then resolves ambiguously (first match in
  // document order), and the badge silently fails to render. Rewrites
  // every id in the clone to be unique to it and repoints any
  // url(#...) reference (clip-path, fill, mask, filter) that pointed at
  // the old id.
  function deduplicateIds(root: HTMLElement, suffix: string) {
    const idMap = new Map<string, string>();
    root.querySelectorAll<HTMLElement>("[id]").forEach((el) => {
      const oldId = el.id;
      const newId = `${oldId}-${suffix}`;
      idMap.set(oldId, newId);
      el.id = newId;
    });
    if (idMap.size === 0) return;
    root.querySelectorAll<HTMLElement>("[clip-path], [fill], [mask], [filter]").forEach((el) => {
      for (const attr of ["clip-path", "fill", "mask", "filter"]) {
        const val = el.getAttribute(attr);
        const match = val?.match(/^url\(#(.+)\)$/);
        const newId = match && idMap.get(match[1]);
        if (newId) el.setAttribute(attr, `url(#${newId})`);
      }
    });
  }

  // Mobile's resting list: each item is the real slide's own DOM,
  // cloned once and shrunk with transform:scale (not zoom, which
  // doesn't rescale this site's vw-relative type scale). Measured off
  // the *original* slide via getComputedStyle — the live slide carries
  // its own transform, and the panel starts [hidden] (display:none).
  const OV_TARGET_WIDTH = 220;

  function buildOverviewCards() {
    if (!ovGrid) return;
    ovGrid.innerHTML = "";
    slides.forEach((slide, i) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "mg__ov-item";
      item.dataset.mgIndex = String(i);

      const naturalCs = getComputedStyle(slide);
      const naturalWidth = parseFloat(naturalCs.width) || OV_TARGET_WIDTH;
      const naturalHeight = parseFloat(naturalCs.height) || 0;
      const scale = Math.min(1, OV_TARGET_WIDTH / naturalWidth);
      item.style.width = `${Math.round(naturalWidth * scale)}px`;
      item.style.height = `${Math.round(naturalHeight * scale)}px`;

      const clone = slide.cloneNode(true) as HTMLElement;
      clone.removeAttribute("style");
      clone.removeAttribute("aria-hidden");
      clone.classList.add("mg__ov-clone");
      clone.style.position = "absolute";
      clone.style.top = "0";
      clone.style.left = "0";
      clone.style.transformOrigin = "top left";
      clone.style.transform = `scale(${scale})`;
      // stat figures start at their "0" placeholder and only count up
      // once actually promoted — the list always shows the real final
      // number instead.
      const clonedFig = clone.querySelector<HTMLElement>("[data-mg-count]");
      if (clonedFig) setCountText(clonedFig, Number(clonedFig.dataset.mgCount));
      deduplicateIds(clone, `ov${i}`);
      item.appendChild(clone);
      ovGrid.appendChild(item);

      item.addEventListener("click", () => previewSlide(i));
    });
  }
  buildOverviewCards();

  function showOverview() {
    if (!overview || overviewOpen) return;
    overviewOpen = true;
    overview.hidden = false;
    overview.style.opacity = "1";
    // the live carousel goes away completely, not just behind the
    // overlay's own opaque background.
    sceneEl!.style.visibility = "hidden";
  }
  function closeOverview() {
    if (!overview || !overviewOpen) return;
    overviewOpen = false;
    sceneEl!.style.visibility = "";
    overview.hidden = true;
    overview.style.opacity = "0";
  }

  replayBtn?.addEventListener("click", () => {
    stopMovie();
    everPlayed = false;
    playMovie();
  });

  // test hook — mirrors Hero's own exposed heroTimeline: lets Playwright
  // drive/read state directly without burning real movie time.
  (section as HTMLElement & {
    mgApi?: {
      goTo: (i: number) => void;
      playMovie: () => void;
      getState: () => { idx: number; playing: boolean; everActivated: boolean; everPlayed: boolean; overviewOpen: boolean };
    };
  }).mgApi = {
    goTo: (i: number) => previewSlide(i),
    playMovie,
    getState: () => ({ idx, playing, everActivated, everPlayed, overviewOpen }),
  };
}
