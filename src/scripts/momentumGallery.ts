import * as THREE from "three";
import { useGsap, prefersReducedMotion } from "./gsapSetup";

const N = 5;
const DESKTOP_QUERY = "(min-width: 1000px)";
// world-space distance from the camera to the z=0 "front" plane — fov is
// recomputed off this each resize so 1 Three.js unit at z=0 == 1 css px,
// which means every lane below can be authored directly in px-equivalent
// units instead of hand-derived ones.
const CAMERA_Z = 1000;

/* Per direct feedback ("don't overthink this"), this is deliberately
   plain: each slide gets a fixed, short, total time on screen —
   ARRIVE_DUR to fly in, HOLD_DUR to sit read­able, SETTLE_DUR to shrink
   into its own resting spot in the overview — the same three numbers
   for every slide, no per-slide exceptions. 2.4 seconds total (HOLD_DUR
   carries the later +.4s "slow it down a bit" adjustment — arrive's own
   speed was already the right feel, so that's what absorbs the extra
   time, not it). One tween per phase, ordinary named eases — no split
   timelines, no distance-fraction math. */
const ARRIVE_DUR = 0.6;
const HOLD_DUR = 1.1;
const SETTLE_DUR = 0.7;
const ARRIVE_EASE = "power2.out";
// Every slide, not just the last, settles into its own resting spot
// instead of flying off toward the camera and fading — see runSlide,
// settleDesktop/settleMobile. Decelerating into place reads as "coming
// to rest", not "departing".
const SETTLE_EASE = "power2.out";
// A settled slide dims rather than staying at full strength — at full
// opacity, several already-finished (but still fairly large) resting
// slides made whichever one is currently playing hard to pick out from
// the rest. Never invisible, unlike the old depart fade — just visibly
// "done, in the background" until the whole movie finishes.
const SETTLED_OPACITY = 0.6;
// As the *last* slide settles into its own spot, every already-dimmed
// slide gently brightens back to full opacity too — one at a time, not
// all at once — so the whole composition visibly comes together right
// as the movie concludes, rather than the dim staying until an instant
// cut to the (full-opacity) overview panel. See runSlide/
// brightenSettledSlides. Deliberately slower than it looks like it
// should need to be, with a symmetric ease (accelerates in, decelerates
// out — no front-loaded rush at the start the way an "out" ease alone
// would read): a quick opacity swing across 4 elements at once reads as
// a pop no matter how many in-between frames it technically has.
const BRIGHTEN_DUR = 1;
const BRIGHTEN_STAGGER = 0.15;
const BRIGHTEN_EASE = "sine.inOut";
// how far into a slide's own total on-screen time (0-1) the *next* slide
// starts its own entrance, overlapping the tail of one settle with the
// head of the next arrival instead of waiting for a full, sequential
// handoff. Never a visual clash: settling moves a slide *away* from
// centre toward its own distinct resting spot while the next arrival
// moves *into* centre from a different side each time, so the two are
// occupying different screen space even while they overlap in time.
const NEXT_START_PROGRESS = 0.75;
const ADVANCE_DELAY = (ARRIVE_DUR + HOLD_DUR + SETTLE_DUR) * NEXT_START_PROGRESS;
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
// holding, so the pause never reads as a dead stop. Bounded to exactly
// HOLD_DUR now (was an indefinite creep governed by scroll dwell, before
// the settle-into-place phase was time-driven) — that phase always
// starts right as this tween would complete anyway.
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
function mobileWaitLaneFor(side: Side): MobileLane {
  const base = { z: MOBILE_WAIT_Z, scale: MOBILE_WAIT_SCALE, blur: MOBILE_WAIT_BLUR, opacity: 0 };
  switch (side) {
    case "left": return { ...base, x: "-46vw", y: "0px" };
    case "right": return { ...base, x: "46vw", y: "0px" };
    case "top": return { ...base, x: "0px", y: "-34vh" };
    case "bottom": return { ...base, x: "0px", y: "34vh" };
  }
}
const MOBILE_HOLD_SCALE = 1.1;
const MOBILE_HOLD_Z = 40;
const MOBILE_HOLD_CREEP_SCALE_SPEED = 0.135;
const MOBILE_HOLD_CREEP_Z_SPEED = 90;
const MOBILE_WAIT_BREATHE_SCALE_BONUS = 0.06;
const MOBILE_WAIT_BREATHE_Z_BONUS = 60;
// Mobile has no Figma-derived collage of exact target positions to
// settle into the way desktop does (OVERVIEW_LAYOUT_DESKTOP) — its real
// overview is a plain vertical list whose exact row position for a
// given slide depends on the other 4 items' own natural heights, not
// something computable ahead of the browser laying it out. Instead,
// each slide settles into a small, fixed slot in a short accumulating
// filmstrip along the *top* of the scene — still genuinely visible and
// out of the way of whichever slide is playing large and centred below
// it, just not a pixel-exact preview of its real resting spot in the
// list (see settleMobile). Top, not bottom: the bottom corners are both
// already spoken for — .mg__ov-toggle (Replay) sits bottom-left and
// #kickoff (the sticky "Is it go time?" CTA) sits bottom-right, with
// barely a gap between them on a narrow phone; the scene's own top
// edge, just below the heading, is reliably clear.
const MOBILE_SETTLE_THUMB_WIDTH = 62;
const MOBILE_SETTLE_GAP = 8;
const MOBILE_SETTLE_TOP_MARGIN = 30;

/**
 * MomentumGallery — a "back to front" depth-of-field carousel that plays
 * like a short movie, not a scroll-scrubbed one. A slide starts small
 * and invisible off to one of 4 sides — left, right, top, or bottom (see
 * waitLaneFor) — deep in the background, flies into dead centre
 * (ARRIVE_DUR), holds there readable (HOLD_DUR), then shrinks into its
 * own resting spot (SETTLE_DUR), dimming to SETTLED_OPACITY rather than
 * disappearing — on desktop, the exact position it'll occupy in the
 * final overview (see settleDesktop/OVERVIEW_LAYOUT_DESKTOP); on
 * mobile, a small accumulating filmstrip slot (see settleMobile).
 * Every slide does this, not just the last, so the resting composition
 * visibly builds up piece by piece as the movie plays — dimmed enough
 * that whichever slide is currently playing still reads clearly against
 * them — rather than appearing all at once at the end. 2.4 seconds
 * total per slide, the
 * same for every slide. The *next* slide doesn't wait for that whole
 * cycle — it starts its own entrance once the current one is
 * NEXT_START_PROGRESS (75%) through its own cycle (see runSlide),
 * overlapping the tail of one settle with the head of the next arrival
 * in time; they never visually clash because settling moves a slide
 * *away* from centre toward its own distinct resting spot while the
 * next arrival moves *into* centre — different screen space throughout.
 *
 * It plays automatically the first time the section scrolls into view —
 * the same idiom Hero's own intro movie uses (hero.ts), just without
 * locking scroll: this never traps the visitor, it just plays in the
 * background while they keep scrolling if they want to. If they scroll
 * away before it finishes, or once it finishes on its own, the section
 * settles on a static "overview" grid of all 5 slides' content at once
 * (see the "overview" section below) until the section is approached
 * again — scrolling away and back restarts the movie from slide 0, same
 * as a fresh first visit. A "Replay" button on the grid also restarts it
 * on demand, without needing to scroll away first. On desktop, since
 * every slide already settled into its exact final spot live during the
 * movie, this handoff is a plain instant swap, not a cross-fade — see
 * finishMovie/showOverview.
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
     rule's own comment — needed so the resting-collage scale math
     reads each stat's real content width, not one shared fixed
     width); count-up briefly displays every intermediate digit count
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
  let sectionVisible = false;
  const countedUp: boolean[] = new Array(N).fill(false);
  // set to whichever slide is currently shrinking into its resting
  // overview spot (see settleDesktop) — renderFrame's normal per-frame
  // blur, driven off live scale, would otherwise blur it out mid-shrink
  // (target scale is usually well under the 0.98 threshold), clashing
  // with the perfectly sharp overview clone it hands off to right after.
  // Only ever one slide at a time — consecutive slides' settle phases
  // never overlap each other (only a settle and the *next* slide's
  // arrival do — see NEXT_START_PROGRESS).
  let settlingIndex: number | null = null;

  // desktop lane bookkeeping (Three.js world units)
  const laneOf = new Map<number, Lane>(); // slide index -> its current lane (centre or a waiting side)
  let lastSide: Side | null = null;
  function pickSide(): Side {
    const pool = SIDES.filter((s) => s !== lastSide);
    const pick = pool[Math.floor(Math.random() * pool.length)];
    lastSide = pick;
    return pick;
  }

  // mobile lane bookkeeping — separate pool/units, see MobileLane above
  const mobileLaneOf = new Map<number, MobileLane>();
  let lastMobileSide: Side | null = null;
  function pickMobileSide(): Side {
    const pool = SIDES.filter((s) => s !== lastMobileSide);
    const pick = pool[Math.floor(Math.random() * pool.length)];
    lastMobileSide = pick;
    return pick;
  }

  // seed every slide at its own (randomly picked) waiting side, invisible.
  for (let i = 0; i < N; i++) {
    laneOf.set(i, waitLaneFor(pickSide()));
    mobileLaneOf.set(i, mobileWaitLaneFor(pickMobileSide()));
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
      el.style.filter = i === settlingIndex || scale >= 0.98 ? "" : `blur(${((1 - Math.min(scale, 1)) * 12).toFixed(1)}px)`;
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
  function startMobileWaitBreathe(i: number) {
    const delay = Math.random() * WAIT_BREATHE_DUR;
    gsap.to(slides[i], {
      opacity: WAIT_BREATHE_OPACITY,
      scale: MOBILE_WAIT_SCALE + MOBILE_WAIT_BREATHE_SCALE_BONUS,
      z: MOBILE_WAIT_Z + MOBILE_WAIT_BREATHE_Z_BONUS,
      duration: WAIT_BREATHE_DUR, delay, ease: "sine.inOut", yoyo: true, repeat: -1,
    });
  }
  // once a slide has arrived, its depth keeps creeping forward at a
  // small but clearly-visible constant speed for exactly HOLD_DUR,
  // instead of sitting dead still — settling into its resting spot
  // always takes over right as this would complete anyway.
  function startMobileHoldCreep(i: number) {
    gsap.to(slides[i], {
      scale: MOBILE_HOLD_SCALE + MOBILE_HOLD_CREEP_SCALE_SPEED * HOLD_DUR,
      z: MOBILE_HOLD_Z + MOBILE_HOLD_CREEP_Z_SPEED * HOLD_DUR,
      duration: HOLD_DUR, ease: "none",
    });
  }
  function startDesktopHoldCreep(i: number) {
    if (!three) return;
    gsap.to(three.meshes[i].position, {
      z: HOLD_Z + HOLD_CREEP_SPEED * HOLD_DUR, duration: HOLD_DUR, ease: "none",
    });
  }

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
        startDesktopHoldCreep(inIndex);
        onArrived?.();
      },
    });
    gsap.fromTo(slides[inIndex], { opacity: 0 }, { opacity: 1, duration: ARRIVE_DUR, ease: ARRIVE_EASE });
  }

  /* Computes exactly where slide i's own item will render once the
     overview is shown — the same placement/scale math buildOverviewCards
     itself uses (OVERVIEW_LAYOUT_DESKTOP, collageWidthEstimate), just
     expressed as on-screen pixel coordinates within #mgScene rather than
     percentages of the (still-hidden) collage box. Used by settleDesktop
     so the final slide can shrink directly into that exact spot instead
     of flying off toward the camera and fading. Defined here, ahead of
     OVERVIEW_LAYOUT_DESKTOP/collageWidthEstimate's own declarations
     further down — safe, since (like every function in this file) it
     only ever runs later, off a real event, by which point the whole
     module has finished its one-time setup. */
  function collageItemTarget(i: number): { centerX: number; centerY: number; scale: number } | null {
    if (!overview || !sceneEl) return null;
    const layout = OVERVIEW_LAYOUT_DESKTOP[i];
    const collageWidth = collageWidthEstimate();
    const collageHeight = collageWidth * (1654 / 1920);
    const overviewCs = getComputedStyle(overview);
    const collageLeft = (sceneEl.clientWidth - collageWidth) / 2; // .mg__overview centres it horizontally
    const collageTop = parseFloat(overviewCs.paddingTop); // ...and top-aligns it (align-items:flex-start) below that padding
    const naturalWidth = parseFloat(getComputedStyle(slides[i]).width) || OV_TARGET_WIDTH;
    const naturalHeight = parseFloat(getComputedStyle(slides[i]).height) || 0;
    const widthPx = collageWidth * (layout.width / 100);
    const scale = widthPx / naturalWidth;
    const heightPx = naturalHeight * scale;
    const leftPx = collageLeft + collageWidth * (layout.left / 100);
    const topPx = collageTop + collageHeight * (layout.top / 100);
    return { centerX: leftPx + widthPx / 2, centerY: topPx + heightPx / 2, scale };
  }

  /* Every slide (see runSlide) shrinks and moves directly to the exact
     spot it'll occupy in the resting overview, instead of flying off
     toward the camera and fading — dimming to SETTLED_OPACITY rather
     than disappearing, so the overview's own final composition visibly
     builds up one slide at a time as the movie plays, without the
     just-finished slides competing for attention with whichever one is
     currently playing. Inverts the same projection renderFrame uses
     (screen = sceneCentre ± mesh·scale) to find the mesh x/y/z that
     lands exactly on collageItemTarget's own screen coordinates. Once
     the *last* slide settles, showOverview reveals the rest of the
     overview panel with no cross-fade (see finishMovie) — nothing needs
     to blend, since every slide is already sitting exactly where its
     own overview item will be (at full opacity there — the dim is only
     ever on the live, still-mid-movie slide, a completely separate
     element from its overview clone). */
  function settleDesktop(i: number, onDone?: () => void) {
    const target = three && collageItemTarget(i);
    if (!three || !target || !sceneEl) { onDone?.(); return; }
    const mesh = three.meshes[i];
    const sceneWidth = sceneEl.clientWidth;
    const sceneHeight = sceneEl.clientHeight;
    const targetZ = CAMERA_Z * (1 - 1 / target.scale);
    const targetX = (target.centerX - sceneWidth / 2) / target.scale;
    const targetY = (sceneHeight / 2 - target.centerY) / target.scale;
    settlingIndex = i;
    gsap.killTweensOf(mesh.position);
    gsap.to(mesh.position, {
      x: targetX, y: targetY, z: targetZ, duration: SETTLE_DUR, ease: SETTLE_EASE,
      onComplete: () => { settlingIndex = null; onDone?.(); },
    });
    gsap.killTweensOf(slides[i]);
    gsap.to(slides[i], { opacity: SETTLED_OPACITY, duration: SETTLE_DUR, ease: SETTLE_EASE });
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
        startMobileHoldCreep(inIndex);
        onArrived?.();
      },
    });
  }

  /* Mirrors settleDesktop's intent (shrink into a resting spot instead
     of flying off and fading, visible while the next slide plays) but
     not its exact position-matching — mobile's real overview is a plain
     vertical list whose exact row position for this item depends on the
     other 4 items' own natural heights, not something computable ahead
     of the browser actually laying it out. Settles into a small, fixed
     slot in a short filmstrip along the bottom edge instead, one slot
     per index so all 5 stay visible without overlapping each other or
     the slide currently playing large and centred above them.
     showOverview's own fade-in (kept for mobile — see finishMovie)
     covers the difference between this approximate strip and wherever
     each item actually lands once the real list renders. */
  function settleMobile(i: number, onDone?: () => void) {
    gsap.killTweensOf(slides[i]);
    const naturalWidth = parseFloat(getComputedStyle(slides[i]).width) || OV_TARGET_WIDTH;
    const targetScale = MOBILE_SETTLE_THUMB_WIDTH / naturalWidth;
    const totalWidth = N * MOBILE_SETTLE_THUMB_WIDTH + (N - 1) * MOBILE_SETTLE_GAP;
    const slotX = -totalWidth / 2 + i * (MOBILE_SETTLE_THUMB_WIDTH + MOBILE_SETTLE_GAP) + MOBILE_SETTLE_THUMB_WIDTH / 2;
    const slotY = -(sceneEl!.clientHeight / 2) + MOBILE_SETTLE_TOP_MARGIN;
    slides[i].style.zIndex = "10";
    gsap.to(slides[i], {
      scale: targetScale, x: slotX, y: slotY, z: 0, filter: "none", opacity: SETTLED_OPACITY,
      duration: SETTLE_DUR, ease: SETTLE_EASE,
      onComplete: onDone,
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
      // the overview's layout (collage vs. uniform grid) is mode-specific
      buildOverviewCards();
    }
  });

  /* ================= the movie ================= */
  // Plays automatically the first time the section scrolls into view,
  // and restarts fresh any time it's scrolled away and back — see the
  // IntersectionObserver further down. Each slide gets its own full
  // ARRIVE_DUR (fly in) + HOLD_DUR (hold, still gently creeping) +
  // SETTLE_DUR (shrink into its resting overview spot) cycle, but the
  // *next* slide doesn't wait for that whole cycle to finish — it
  // starts its own entrance once the current one is NEXT_START_PROGRESS
  // through its own cycle (see runSlide), overlapping the tail of one
  // settle with the head of the next arrival in time. They never
  // visually clash: settling moves a slide away from centre toward its
  // own distinct resting spot while the next arrival moves into centre
  // from a different side — different screen space throughout.
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
      const lane = mobileWaitLaneFor(pickMobileSide());
      mobileLaneOf.set(i, lane);
      gsap.set(slides[i], {
        x: lane.x, y: lane.y, z: lane.z, scale: lane.scale, opacity: lane.opacity, filter: `blur(${lane.blur}px)`,
      });
    }
  }

  // Brightens every slide but the one currently settling (i.e. every
  // already-dimmed, previously-settled one) back to full opacity, one
  // at a time rather than all together — called as the *last* slide
  // settles into place, so the whole composition visibly comes
  // together right as the movie concludes. onDone fires once every
  // staggered tween has actually finished, not just started.
  function brightenSettledSlides(excludeIndex: number, onDone?: () => void) {
    const targets = slides.filter((_, j) => j !== excludeIndex);
    if (targets.length === 0) { onDone?.(); return; }
    gsap.killTweensOf(targets);
    gsap.to(targets, {
      opacity: 1, duration: BRIGHTEN_DUR, ease: BRIGHTEN_EASE,
      stagger: BRIGHTEN_STAGGER, onComplete: onDone,
    });
  }

  // Runs one slide's full lifecycle: promote it to centre, hold, then
  // settle it into its own resting overview spot (see settleDesktop/
  // settleMobile) — every slide, not just the last, so the resting
  // composition visibly builds up one piece at a time — and, separately,
  // schedules the *next* slide's own runSlide at ADVANCE_DELAY
  // regardless of whether this slide has finished settling yet (that's
  // the overlap). The last slide also triggers every other (already
  // dimmed) slide to brighten back up in a gentle stagger (see
  // brightenSettledSlides) — the movie only actually ends, hanging off
  // to finishMovie, once *both* that settle and that stagger are done.
  function runSlide(i: number) {
    idx = i;
    applyAria();
    const promote = mode === "desktop" ? promoteDesktop : promoteMobile;
    const settle = mode === "desktop" ? settleDesktop : settleMobile;
    const isLast = i === N - 1;

    promote(i, () => {
      // scroll was held from the moment the section reached the top —
      // release it now that the first slide is actually playing (see
      // engageScrollLock's own comment)
      if (i === 0) releaseScrollLock();
      schedule(HOLD_DUR, () => {
        if (isLast) {
          let remaining = 2;
          const onBothDone = () => { if (--remaining === 0) finishMovie(); };
          settle(i, onBothDone);
          brightenSettledSlides(i, onBothDone);
        } else {
          settle(i);
        }
      });
    });

    if (i < N - 1) {
      schedule(ADVANCE_DELAY, () => runSlide(i + 1));
    }
  }

  // By now every slide has already settled into place during its own
  // turn (see runSlide/settleDesktop). On desktop that's the exact spot
  // each one's overview item renders at (see collageItemTarget), so
  // showOverview reveals the panel with no cross-fade — nothing needs
  // to blend. Mobile's settle is only an approximate rest (see
  // settleMobile's own comment), so it keeps the fade to cover that gap.
  function finishMovie() {
    playing = false;
    everPlayed = true;
    applyAria();
    showOverview(mode === "desktop");
  }

  // Starts the very first slide's own arrival directly (there's no
  // outgoing slide to depart from on a cold start).
  function playMovie() {
    if (playing) return;
    closeOverview();
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
    for (let i = 1; i < N; i++) {
      if (mode === "desktop") startDesktopWaitBreathe(i);
      else startMobileWaitBreathe(i);
    }
    runSlide(0);
  }

  function stopMovie() {
    killMovieTimers();
    playing = false;
    // a killed tween never fires its own onComplete, so if this lands
    // mid-settle, nothing else would ever clear settlingIndex again
    settlingIndex = null;
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
    closeOverview();
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
  // viewport, and restarts it fresh from slide 0 every time it's
  // scrolled away from and then reaches the top again — the same
  // "is this section now the one at the top" idiom navTint.ts's own
  // top-top/bottom-top triggers use, not raw intersection.
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
  // settles on the overview until it's approached again.
  //
  // `hasLeftSinceActivating` distinguishes a genuine "scrolled away,
  // now scrolled back" from an incidental one — e.g. clicking an
  // overview card or the Replay button can itself cause the browser to
  // scroll the section into view if it wasn't already, which would
  // otherwise read as "just arrived" and wrongly restart the movie (and
  // re-lock scroll) out from under a manually-previewed slide. Only a
  // transition this trigger itself already saw as a real *leave*
  // re-arms the restart.
  let hasLeftSinceActivating = false;

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
    if (!playing && (!everActivated || hasLeftSinceActivating)) {
      engageScrollLock();
      playMovie();
    }
  }
  function handleLeaveTop() {
    sectionVisible = false;
    if (mode === "desktop") stopThreeTicker();
    hasLeftSinceActivating = true;
    releaseScrollLock(); // defensive — scroll being blocked should make a real leave impossible while still locked
    if (playing) {
      stopMovie();
      everPlayed = true;
      showOverview();
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

  /* ================= overview / replay ================= */
  // The resting state once the movie has played through or been left —
  // a static grid of every slide's own content at once, so a returning
  // visitor gets the whole thing at a glance rather than the movie
  // replaying itself unasked. "Replay" always restarts it from slide 0.
  const replayBtn = document.getElementById("mgOvToggle");
  const overview = document.getElementById("mgOverview");
  const ovGrid = document.getElementById("mgOvGrid");

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

  // Each grid item is the real slide's own DOM, cloned once — its
  // actual markup/classes, not a re-typed summary card. transform:scale
  // (not zoom, which doesn't rescale this site's vw-relative type
  // scale) shrinks the fully laid-out clone down to fit its own slot;
  // the wrapping button's own width/height are set to that same
  // post-scale size. Measured off the *original* slide via
  // getComputedStyle, not the clone or getBoundingClientRect — the live
  // slide already carries its own transform, and the overview panel
  // starts [hidden] (display:none), so either would measure wrong.
  const OV_TARGET_WIDTH = 220; // mobile's uniform grid target

  // Desktop's resting layout: the specific scattered composition from
  // the Figma design (node 3612:8791 — "Section - 4 · MOMENTUM"), not a
  // uniform grid. left/top/width are percentages of the collage box,
  // read directly off each element's own position in that design
  // (itself 1920×1654: the "Container" child, node 3612:8792, plus its
  // "Quote1"/"Quote2" siblings) — the collage box below locks to that
  // same aspect ratio so the composition holds at any viewport width.
  // Re-measured 2026-09-29 directly off get_design_context/get_metadata
  // for those exact nodes — the previous values here were noticeably
  // off (e.g. item 2's width read 21.81% vs the design's actual
  // 27.15%), confirmed live as the resting screen not matching the
  // Figma design. Slide 4 (the Kaylen quote) is placed in the design's
  // smaller "Quote1" slot — that slot's own placeholder copy in Figma
  // ("blah blah blah") is never used, only its position/size.
  //
  // Figma's own top values (in each comment below) centre the
  // composition in the lower half of its own tall, unconstrained
  // canvas — fine there, but #momentum's stage is a fixed 100svh (see
  // .pin__stage), so that same placement reads as everything crammed
  // near the bottom of the screen here. VERTICAL_SHIFT pulls the whole
  // composition up so its centre sits roughly where the topmost item
  // (the Kaylen quote, item 4) already was, near the top of the
  // section rather than the bottom.
  const VERTICAL_SHIFT = -22;
  const OVERVIEW_LAYOUT_DESKTOP: Record<number, { left: number; top: number; width: number }> = {
    0: { left: 50.52, top: 63.6 + VERTICAL_SHIFT, width: 35.54 }, // "They move at the speed of business" quote — Quote2 slot
    1: { left: 15.1, top: 61.31 + VERTICAL_SHIFT, width: 26.76 }, // 100% on-time delivery
    2: { left: 62.34, top: 30.77 + VERTICAL_SHIFT, width: 27.15 }, // 4M sales pipeline
    3: { left: 10.11, top: 34.03 + VERTICAL_SHIFT, width: 22.43 }, // 150+ RSVPs
    4: { left: 40.31, top: 37.12 + VERTICAL_SHIFT, width: 17.86 }, // Kaylen quote — Quote1 slot
  };
  // Approximates the collage box's own rendered pixel width without
  // needing to measure it directly (it can't be — the overview panel
  // starts [hidden]/display:none). #momentum's stage is a fixed 100svh
  // (see .pin__stage), so this "contains" the design's own 1920:1654
  // ratio within whichever of width or height is the tighter fit — same
  // idea as object-fit:contain — rather than always sizing from width
  // and relying on .mg__overview's own scroll fallback (see its CSS)
  // for the common case. #mgScene's own box is never hidden, so its
  // dimensions are always readable; padding figures come off
  // .mg__overview's own computed style, which — being purely
  // viewport-driven (clamp/vw), not layout-driven — still resolves
  // correctly while it's hidden.
  // Was 1.5 (a deliberate 50% overflow beyond a strict "contain" fit) —
  // tuned back when each stat's own box was measured off the full,
  // padded .mg__slide container rather than its actual content (see
  // .mg__slide--stat's own comment), which left every number rendering
  // under half its intended size. Now that that's fixed, the collage
  // is close to a correct "contain" fit on its own again; kept as a
  // small, no-longer-load-bearing nudge rather than 1.0 exactly, since
  // this composition still deliberately overflows its box slightly
  // rather than staying small enough to never need .mg__overview's own
  // scroll fallback (see its CSS).
  const COLLAGE_SIZE_BOOST = 1.2;
  function collageWidthEstimate(): number {
    const overviewCs = getComputedStyle(overview!);
    const hPad = parseFloat(overviewCs.paddingLeft) + parseFloat(overviewCs.paddingRight);
    const vPad = parseFloat(overviewCs.paddingTop) + parseFloat(overviewCs.paddingBottom);
    const widthFromWidth = Math.min(section!.clientWidth - hPad, 1560);
    const widthFromHeight = (sceneEl!.clientHeight - vPad) * (1920 / 1654);
    // a floor for the unlikely case of a very short viewport, where
    // padding alone could otherwise eat the whole available height
    return Math.max(320, Math.min(widthFromWidth, widthFromHeight)) * COLLAGE_SIZE_BOOST;
  }

  function buildOverviewCards() {
    if (!ovGrid) return;
    ovGrid.innerHTML = "";
    const isCollage = mode === "desktop";
    ovGrid.classList.toggle("mg__ov-grid--collage", isCollage);
    const collageWidth = isCollage ? collageWidthEstimate() : 0;
    if (isCollage) {
      ovGrid.style.width = `${collageWidth}px`;
      ovGrid.style.height = `${collageWidth * (1654 / 1920)}px`;
    } else {
      ovGrid.style.width = "";
      ovGrid.style.height = "";
    }

    slides.forEach((slide, i) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "mg__ov-item";
      item.dataset.mgIndex = String(i);

      const naturalCs = getComputedStyle(slide);
      const naturalWidth = parseFloat(naturalCs.width) || OV_TARGET_WIDTH;
      const naturalHeight = parseFloat(naturalCs.height) || 0;

      let scale: number;
      if (isCollage) {
        const layout = OVERVIEW_LAYOUT_DESKTOP[i];
        // not capped at 1 (unlike mobile's grid, below) — COLLAGE_SIZE_BOOST
        // deliberately renders these larger than the clone's own natural
        // full-bleed size for some items, not just closer to it.
        scale = (collageWidth * (layout.width / 100)) / naturalWidth;
        item.style.left = `${layout.left}%`;
        item.style.top = `${layout.top}%`;
        item.style.width = `${layout.width}%`;
      } else {
        scale = Math.min(1, OV_TARGET_WIDTH / naturalWidth);
        item.style.width = `${Math.round(naturalWidth * scale)}px`;
      }
      item.style.height = `${Math.round(naturalHeight * scale)}px`;

      const clone = slide.cloneNode(true) as HTMLElement;
      clone.removeAttribute("style");
      clone.classList.add("mg__ov-clone");
      clone.style.position = "absolute";
      clone.style.top = "0";
      clone.style.left = "0";
      clone.style.transformOrigin = "top left";
      clone.style.transform = `scale(${scale})`;
      // stat figures start at their "0" placeholder and only count up
      // once actually promoted — the overview always shows the real
      // final number instead.
      const clonedFig = clone.querySelector<HTMLElement>("[data-mg-count]");
      if (clonedFig) setCountText(clonedFig, Number(clonedFig.dataset.mgCount));
      deduplicateIds(clone, `ov${i}`);
      item.appendChild(clone);
      ovGrid.appendChild(item);

      item.addEventListener("click", () => previewSlide(i));
    });
  }
  buildOverviewCards();

  // skipFade: true right after the final slide's own desktop settle
  // (see finishMovie) — it's already sitting exactly where its overview
  // item will render, so cross-fading the whole panel in would fade
  // that one slide's content in on top of itself. Every other caller
  // (scroll-away mid-movie, mobile's approximate settle) has nothing
  // already in place, so they keep the cross-fade.
  function showOverview(skipFade = false) {
    if (!overview || overviewOpen) return;
    overviewOpen = true;
    overview.hidden = false;
    // the live carousel goes away completely, not just behind the
    // overlay's own opaque background.
    sceneEl!.style.visibility = "hidden";
    gsap.killTweensOf(overview);
    if (skipFade) overview.style.opacity = "1";
    else gsap.fromTo(overview, { opacity: 0 }, { opacity: 1, duration: 0.3, ease: "power1.out" });
  }
  function closeOverview() {
    if (!overview || !overviewOpen) return;
    overviewOpen = false;
    sceneEl!.style.visibility = "";
    gsap.killTweensOf(overview);
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
