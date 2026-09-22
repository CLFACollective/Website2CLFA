import * as THREE from "three";
import { useGsap, prefersReducedMotion } from "./gsapSetup";

const N = 5;
const DESKTOP_QUERY = "(min-width: 1000px)";
// world-space distance from the camera to the z=0 "front" plane — fov is
// recomputed off this each resize so 1 Three.js unit at z=0 == 1 css px,
// which means every lane below can be authored directly in px-equivalent
// units instead of hand-derived ones.
const CAMERA_Z = 1000;
const AUTOPLAY_DELAY = 4;
// how many full autoplay loops (every slide, once each) play out before
// the carousel stops on its own and just leaves the page free to scroll
// on — a passive visitor isn't expected to sit through this forever.
const MAX_AUTO_LOOPS = 3;

/* A slide's whole lifecycle is one continuous, never-quite-stopping curve
   rather than phases stitched together with a hard stop in between — that
   stitched-together shape is exactly what reads as "start / stop / start".
     - ARRIVE_DUR is ONE tween — lateral (x/y), depth (z), rotation, and
       opacity all animate together, same duration, same ease. This is
       deliberate: two independently-timed tweens (the old design split
       lateral from depth) can't help drifting out of sync with each
       other even when their durations are close, and that mismatch is
       exactly what read as a sudden pop to one side rather than a
       continuous, gradual emergence — the item would visibly "arrive"
       laterally while still mostly transparent/small, or vice versa.
       One tween can't drift out of sync with itself.
     - every slide goes through this arrival — including the very first
       one ever shown. It does not start pre-placed at full size; it
       starts at the shared waiting lane like everything else and only
       becomes prominent once activateInitial() promotes it, the same
       call every later slide gets.
     - count-up fires at a literal, fixed checkpoint: 3/4 of the way
       through this same tween (this.progress(), its own time-fraction),
       not a scale-derived proximity guess.
     - once ARRIVE_DUR completes, depth keeps creeping forward forever at
       a small but clearly-visible CONSTANT speed (linear, one direction,
       never yoyo'd) — not a decelerating tail, and not an oscillating
       breathe either: both of those spend time near-zero-velocity (a
       decelerating tail approaches stillness by definition; a yoyo
       breathe is momentarily still at each turnaround), which is exactly
       what read as "stuck". A constant hand-off speed never slows
       further and never reverses, so there is no instant, ever, where
       the number/quote is not visibly still moving.
     - departure (DEPART_DUR) doesn't reset anything — it takes over from
       wherever that creep currently sits and eases IN (slow to fast)
       toward the overshoot point, so it visibly picks up speed rather
       than snapping straight to full velocity. */
const ARRIVE_DUR = 2.5; // ~50% faster than the original 3.7s+3s split
// how long `transitioning` blocks a new advance — tied to the arrival
// itself, not to the depth creep, which by design never finishes on its
// own.
const GUARD_DUR = ARRIVE_DUR;
const DEPART_DUR = 1.0; // departure: picks up from the live creep, accelerates hard, gone
// how far into its own arrival (0-1, the tween's own time-progress) a
// slide has to be before its number starts counting up — a literal,
// fixed checkpoint (see the top-of-file comment), not a proximity guess.
const COUNT_START_PROGRESS = 0.75;
// how deep a waiting slide sits — invisible (opacity 0), so its exact
// depth barely matters visually; one shared constant is enough, no need
// for a pool of distinct spots the way the old visible background did.
const WAIT_Z = -1700;
// where ARRIVE_DUR lands and the infinite hold-creep then continues from
// — a bit past prominent's z:0, so the slide still reads as very
// slightly larger than "arrived".
const HOLD_Z = 90;
// constant world-units/second the depth keeps creeping forward at, once
// arrived, forever — a real, clearly-visible amount (not just
// technically-nonzero) so it never reads as stuck. CREEP_TAIL_DUR is
// just long enough that a departure (which always arrives well before
// it in practice) is what ends it, not the tween running out on its
// own, while keeping HOLD_Z + HOLD_CREEP_SPEED*CREEP_TAIL_DUR safely
// short of CAMERA_Z (dividing by zero territory).
const HOLD_CREEP_SPEED = 30;
const CREEP_TAIL_DUR = 20;
// how close to the camera a departing slide overshoots to before it's
// reset — short of CAMERA_Z itself (which would divide by zero) but close
// enough that scale = CAMERA_Z/(CAMERA_Z-z) blows up dramatically, i.e.
// it visibly keeps growing as it fades, rather than just holding still
// and fading in place.
const OVERSHOOT_Z = 920;
// a waiting slide isn't perfectly frozen either — a slow, barely-visible
// ambient drift (see startDesktopWaitBreathe/startMobileWaitBreathe) keeps
// it faintly alive in the background, so the next slide promoted doesn't
// have to cold-start from a dead stop. Deliberately tiny (opacity caps at
// WAIT_BREATHE_OPACITY) — this is not the old visible scattered "shelf",
// just a hint that something's there.
const WAIT_BREATHE_DUR = 6;
const WAIT_BREATHE_OPACITY = 0.06;
const WAIT_BREATHE_Z_RANGE = 180;

type Lane = { x: number; y: number; z: number; rotY: number; rotX: number };

// the two quote slides (see QUOTE_INDICES below) — fixed, not drawn from
// the pool the three stat slides randomly share (see pickProminentLane).
// A left-aligned text block reads better anchored well right of centre,
// so its emphasis (the word "move" in "They move") lands around 60%
// across the frame rather than wherever a randomly-picked lane happens
// to put it. Both quotes share the same lane for consistency.
const QUOTE_INDICES = [3, 4];
const QUOTE_LANE: Lane = { x: 220, y: 30, z: 0, rotY: -7, rotX: 2 };

/* Where an *active stat* slide pauses, readable — three options (never
   repeating the same one twice running, see pickProminentLane) so
   consecutive active slides don't always settle in the same spot. z:0 for
   all three — "prominent" means close/in-focus, only the lateral position
   varies. The quote slides don't draw from this pool at all — see
   QUOTE_LANE. */
const PROMINENT_LANES: Lane[] = [
  { x: 0, y: 0, z: 0, rotY: 0, rotX: 0 },
  { x: -220, y: -40, z: 0, rotY: 7, rotX: -2 },
  { x: 220, y: 30, z: 0, rotY: -7, rotX: 2 },
];

// mobile has no per-frame projection loop to derive scale/opacity/blur from
// depth the way desktop does, so lanes carry those values explicitly, and
// "emerging from the centre"/"flying past and fading" are both authored
// directly (see mobileSwap) instead of falling out of real perspective.
type MobileLane = { x: string; y: string; z: number; rotY: number; rotX: number; scale: number; blur: number; opacity: number };
const MOBILE_PROMINENT_LANES: MobileLane[] = [
  { x: "0px", y: "0px", z: 0, rotY: 0, rotX: 0, scale: 1, blur: 0, opacity: 1 },
  { x: "-13vw", y: "-10px", z: 0, rotY: 6, rotX: -2, scale: 1, blur: 0, opacity: 1 },
  { x: "13vw", y: "8px", z: 0, rotY: -6, rotX: 2, scale: 1, blur: 0, opacity: 1 },
];
// mirrors QUOTE_LANE above — fixed, not drawn from the pool.
const MOBILE_QUOTE_LANE: MobileLane = { x: "13vw", y: "8px", z: 0, rotY: -6, rotX: 2, scale: 1, blur: 0, opacity: 1 };
// where a slide sits invisibly while it isn't its turn — same "barely
// matters, it's at opacity 0" reasoning as WAIT_Z above.
const MOBILE_WAIT: MobileLane = { x: "0px", y: "0px", z: -480, rotY: 0, rotX: 0, scale: 0.22, blur: 14, opacity: 0 };
// mobile has no live projection to grow "scale" out of depth the way
// desktop's z does — so scale plays that same role directly: it animates
// alongside x/y/rotation/opacity in ARRIVE_DUR's single combined tween up
// to MOBILE_HOLD_SCALE, then an infinite constant-speed creep past it
// (mirrors HOLD_CREEP_SPEED).
const MOBILE_HOLD_SCALE = 1.1;
const MOBILE_HOLD_Z = 40;
const MOBILE_HOLD_CREEP_SCALE_SPEED = 0.045; // scale units/second
const MOBILE_HOLD_CREEP_Z_SPEED = 30; // css-px-equivalent/second
// how far/large a departing slide overshoots to before resetting — mobile
// has no real projection, so this is just an authored end-of-tween value.
const MOBILE_OVERSHOOT: MobileLane = { x: "0px", y: "0px", z: 260, rotY: 0, rotX: 0, scale: 2.4, blur: 0, opacity: 0 };
// mirrors WAIT_BREATHE_* above, authored directly since mobile has no live
// depth to derive a subtle "still alive back there" nudge from.
const MOBILE_WAIT_BREATHE_SCALE_BONUS = 0.06;
const MOBILE_WAIT_BREATHE_Z_BONUS = 60;

const TINTS = ["#F06496", "#BE7837", "#506E78", "#A0A073", "#BE7837"];

/**
 * MomentumGallery — a "back to front" depth-of-field carousel replacing the
 * old horizontally-panning Momentum track (see Momentum.astro, retired).
 * Only ever two slides are visible at once: the active one, paused large
 * and readable up front, and whichever one is mid-transition. A slide
 * promoted to active emerges from dead centre, small and invisible, and
 * grows forward into its lane over one coordinated tween (see ARRIVE_DUR
 * above) — including the very first slide ever shown, which gets the
 * exact same entrance the moment the section activates, not a pre-placed
 * starting state. Once its turn is over it doesn't recede into a visible
 * background — it keeps riding forward past the reader (growing further,
 * per real perspective) while fading to nothing, then resets invisibly to
 * wait for its next turn. Nothing is ever left visibly parked in the
 * background. Desktop renders the depth with a real Three.js scene
 * (camera + soft "card" meshes behind the real DOM text — the canvas
 * itself stays genuinely transparent so the ShineField dust field behind
 * it keeps showing through, see makeCardTexture's comment for why there's
 * no BokehPass/EffectComposer here) and syncs that DOM text's
 * position/scale to the mesh every frame; the actual stat/quote copy
 * never lives inside the canvas. Below 1000px, no WebGL context is ever
 * created at all — a plain CSS 3D transform stack approximates the same
 * look, both because touch devices are this codebase's own documented
 * source of GPU-effect crashes (ShineField/Day One's prior iPad history)
 * and because a mouse-only interaction isn't relevant there anyway.
 *
 * There is no gesture navigation at all — no scroll-lock, no wheel/arrow-
 * key/touch capture. This is a passive, autoplay-only carousel that lives
 * in the normal page flow and never blocks scrolling. An IntersectionObserver
 * starts it playing once the section is fully in view (also the moment its
 * first arrival plays and its first count-up can fire — see
 * activateInitial); a window `scroll` listener pauses it the instant the
 * visitor starts scrolling at all, and a short settle-debounce resumes it
 * — from exactly where it left off, no reset — once they've stopped
 * scrolling with the section still fully in view. After MAX_AUTO_LOOPS
 * complete loops through every slide with nobody scrolling away in
 * between, it stops on its own and just leaves the page free to scroll
 * on, rather than looping forever for a purely passive visitor.
 */
export function setupMomentumGallery() {
  const section = document.getElementById("momentum");
  const sceneEl = document.getElementById("mgScene");
  const canvas = document.getElementById("mgCanvas") as HTMLCanvasElement | null;
  const cue = document.getElementById("mgCue");
  if (!section || !sceneEl || !canvas) return;

  const slides = Array.from(section.querySelectorAll<HTMLElement>(".mg__slide")).sort(
    (a, b) => Number(a.dataset.mgIndex) - Number(b.dataset.mgIndex),
  );
  if (slides.length !== N) return;

  const setCountText = (el: HTMLElement, value: number) => {
    const prefix = el.dataset.mgPrefix || "";
    const suffix = el.dataset.mgSuffix || "";
    el.innerHTML = `${prefix}${Math.round(value)}<span class="unit">${suffix}</span>`;
  };

  if (prefersReducedMotion()) {
    // static stacked layout (CSS handles the geometry) — every number just
    // shows its final value, no tween, no autoplay, no canvas ever created.
    slides.forEach((slide) => {
      const fig = slide.querySelector<HTMLElement>("[data-mg-count]");
      if (fig) setCountText(fig, Number(fig.dataset.mgCount));
    });
    return;
  }

  const { gsap } = useGsap();

  const countUp = (slide: HTMLElement) => {
    const fig = slide.querySelector<HTMLElement>("[data-mg-count]");
    if (!fig) return;
    const target = Number(fig.dataset.mgCount);
    const obj = { v: 0 };
    setCountText(fig, 0);
    // 0.9s * 1.6 — slowed by 60% from the original pace.
    gsap.to(obj, { v: target, duration: 0.9 * 1.6, ease: "power3.out", onUpdate: () => setCountText(fig, obj.v) });
  };

  /* ---------- shared state ---------- */
  let idx = 0;
  let transitioning = false;
  let playing = false;
  // has this ever fully activated — declared up here (not just before
  // activateInitial's own definition further down) because initThree()
  // paints the seeded layout synchronously during setup, before
  // activateInitial itself is ever defined; a `let` referenced from
  // there earlier than this line would hit the temporal dead zone. Also
  // gates ensureActiveLaneIsProminent (see its own comment) — before
  // activation, `idx` sitting at the waiting lane is correct, not a bug
  // to "fix".
  let everActivated = false;
  // how many complete autoplay loops (every slide, once) have played with
  // nobody scrolling away in between — see MAX_AUTO_LOOPS.
  let autoLoopCount = 0;
  let stoppedForever = false;
  let cueShown = false;
  let cueTl: gsap.core.Timeline | null = null;
  // test-only: lets a test call goTo() deterministically (no live autoplay
  // timer racing it) while leaving the ticker/rendering fully live for DOM
  // assertions — unlike pause(), which also stops the ticker (the correct
  // real-world behavior, but wrong for a test that still wants to read
  // live transforms). See the exposed mgApi.disableAutoplay below.
  let autoplayDisabledForTest = false;
  // has this slide's number ever counted up yet? Permanent, not reset on
  // each approach — a slide only counts up the very first time it's ever
  // shown; every later turn just displays the number it already landed on.
  const countedUp: boolean[] = new Array(N).fill(false);

  // a single shared "waiting" lane — where a slide sits invisibly (opacity
  // 0) between its own turns, including before its very first turn. No
  // pool of distinct spots is needed the way the old visible background
  // lanes were: nothing should ever be seen resting back there, so its
  // exact depth/position barely matters.
  const WAIT_LANE: Lane = { x: 0, y: 0, z: WAIT_Z, rotY: 0, rotX: 0 };

  // desktop lane bookkeeping (Three.js world units)
  const laneOf = new Map<number, Lane>(); // slide index -> its current lane (prominent or waiting)
  let lastProminentIdx = -1;

  function pickProminentLane(): number {
    const pool = [0, 1, 2].filter((i) => i !== lastProminentIdx);
    const pick = pool[Math.floor(Math.random() * pool.length)];
    lastProminentIdx = pick;
    return pick;
  }

  // mobile lane bookkeeping — separate pool/units, see MobileLane above
  const mobileLaneOf = new Map<number, MobileLane>();
  let lastMobileProminentIdx = -1;

  function pickMobileProminentLane(): number {
    const pool = [0, 1, 2].filter((i) => i !== lastMobileProminentIdx);
    const pick = pool[Math.floor(Math.random() * pool.length)];
    lastMobileProminentIdx = pick;
    return pick;
  }

  // seed every slide at the shared waiting lane, invisible — including
  // idx 0. Nothing is prominent yet; activateInitial() promotes idx 0
  // through the exact same arrival every later slide gets, once the
  // section is actually fully in view (see play() below).
  for (let i = 0; i < N; i++) {
    laneOf.set(i, WAIT_LANE);
    mobileLaneOf.set(i, MOBILE_WAIT);
    gsap.set(slides[i], { opacity: 0 });
  }

  function applyAria() {
    slides.forEach((slide, i) => {
      slide.dataset.active = String(i === idx);
      if (i === idx) slide.removeAttribute("aria-hidden");
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
  } | null = null;

  /* No real depth-of-field pass here (GSAP + Three.js's own core render,
     not EffectComposer/BokehPass): BokehPass's shader hardcodes
     `gl_FragColor.a = 1.0` (three/examples/jsm/shaders/BokehShader.js),
     discarding alpha entirely — an opaque canvas would blot out the
     ShineField dust field sitting behind it, which the user explicitly
     asked to keep visible. Each card's softness is baked into its own
     texture instead (a radial gradient drawn through a canvas 2D blur
     filter), and its opacity is derived from live depth every frame
     (see renderFrame) — not literal camera DOF, but a comparable soft,
     receding look while the canvas stays genuinely transparent. */
  function makeCardTexture(tint: string): THREE.CanvasTexture {
    const size = 256;
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    const ctx = c.getContext("2d")!;
    ctx.filter = "blur(14px)";
    const g = ctx.createRadialGradient(size / 2, size / 2, size * 0.04, size / 2, size / 2, size * 0.4);
    g.addColorStop(0, tint);
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    return tex;
  }

  function renderFrame() {
    if (!three) return;
    three.renderer.render(three.scene, three.camera);
    const { camera, meshes, vector } = three;
    meshes.forEach((mesh, i) => {
      vector.setFromMatrixPosition(mesh.matrixWorld);
      vector.project(camera);
      const x = (vector.x * 0.5 + 0.5) * sceneEl!.clientWidth;
      const y = (-vector.y * 0.5 + 0.5) * sceneEl!.clientHeight;
      const scale = CAMERA_Z / (CAMERA_Z - mesh.position.z);
      // mesh opacity derived from the same live depth (fades as it
      // recedes) — one animated source (the mesh position, via GSAP)
      // rather than a second tween that could drift out of sync with it.
      const mat = mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.min(0.42, Math.max(0.12, scale * 0.42));
      const el = slides[i];
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%) scale(${scale.toFixed(3)})`;
      // DOM opacity is NOT derived here — it's explicitly tweened by
      // promoteDesktop/departDesktop (fade in on arrival, fade out on
      // departure) so a slide can be simultaneously large (overshooting
      // past the camera as it departs) AND fading to zero, which a
      // scale-derived value could never represent (it would just clamp
      // at opacity 1). Count-up is likewise driven by the arrival tween's
      // own progress (see promoteDesktop), not read here.
      el.style.filter = scale >= 0.98 ? "" : `blur(${((1 - Math.min(scale, 1)) * 12).toFixed(1)}px)`;
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
    renderer.setClearColor(0x000000, 0); // genuinely transparent — see makeCardTexture's comment on why there's no BokehPass here

    const meshes = slides.map((_, i) => {
      const geo = new THREE.PlaneGeometry(560, 300);
      const mat = new THREE.MeshBasicMaterial({ map: makeCardTexture(TINTS[i]), transparent: true, opacity: 0.4, depthWrite: false });
      const mesh = new THREE.Mesh(geo, mat);
      const lane = laneOf.get(i)!;
      mesh.position.set(lane.x, lane.y, lane.z);
      mesh.rotation.set((lane.rotX * Math.PI) / 180, (lane.rotY * Math.PI) / 180, 0);
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
    };
    const ro = new ResizeObserver(resize);
    ro.observe(sceneEl!);
    resize();

    three = { renderer, scene: scn, camera, meshes, vector: new THREE.Vector3(), ro, running: false };
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
     ambient drift (see the WAIT_BREATHE_* comment near the top) keeps it
     faintly alive in the background, so whenever it's next promoted it's
     picking up from some already-moving state rather than cold-starting
     from a dead stop. `delay` is randomized per call so multiple waiting
     slides don't all breathe in lockstep. */
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
      scale: MOBILE_WAIT.scale + MOBILE_WAIT_BREATHE_SCALE_BONUS,
      z: MOBILE_WAIT.z + MOBILE_WAIT_BREATHE_Z_BONUS,
      duration: WAIT_BREATHE_DUR, delay, ease: "sine.inOut", yoyo: true, repeat: -1,
    });
  }
  // mirrors startDesktopHoldCreep — once a slide has arrived, it keeps
  // growing at a small but clearly-visible constant speed forever instead
  // of ever truly stopping. mobileSwap's departure overwrites this the
  // moment it starts, same as it would the arrival tween itself.
  function startMobileHoldCreep(i: number) {
    gsap.to(slides[i], {
      scale: MOBILE_HOLD_SCALE + MOBILE_HOLD_CREEP_SCALE_SPEED * CREEP_TAIL_DUR,
      z: MOBILE_HOLD_Z + MOBILE_HOLD_CREEP_Z_SPEED * CREEP_TAIL_DUR,
      duration: CREEP_TAIL_DUR, ease: "none",
    });
  }

  // Once a slide has arrived (ARRIVE_DUR completed), its depth keeps
  // creeping forward at a small but clearly-visible CONSTANT speed
  // forever (linear, never yoyo'd) instead of ever truly slowing or
  // stopping — see the top-of-file comment. Departure overwrites this the
  // moment it starts, same as it would the arrival tween itself.
  function startDesktopHoldCreep(i: number) {
    if (!three) return;
    gsap.to(three.meshes[i].position, {
      z: HOLD_Z + HOLD_CREEP_SPEED * CREEP_TAIL_DUR, duration: CREEP_TAIL_DUR, ease: "none",
    });
  }

  /* One coordinated arrival — lateral (x/y), depth (z), and rotation all
     animate together in a single tween (same duration, same ease), with
     opacity fading in over that identical window — see the top-of-file
     comment for why splitting these into separately-timed tweens is what
     used to read as a sudden pop to one side rather than a continuous
     emergence. Depth keeps going once this completes (startDesktopHold
     Creep) — "the pause" is that creep, never a dead stop. Every slide
     goes through this, including the very first one ever shown — see
     activateInitial. */
  function promoteDesktop(inIndex: number) {
    initThree();
    if (!three) return;
    const mesh = three.meshes[inIndex];

    const prominent = QUOTE_INDICES.includes(inIndex) ? QUOTE_LANE : PROMINENT_LANES[pickProminentLane()];
    laneOf.set(inIndex, prominent);
    gsap.killTweensOf(mesh.position);
    gsap.killTweensOf(mesh.rotation);
    gsap.killTweensOf(slides[inIndex]);
    // countedUp is intentionally NOT reset here — a slide only ever counts
    // up once, the very first time it's shown (see the shared-state
    // comment above). Every later approach just displays its already-
    // final number.
    gsap.to(mesh.position, {
      x: prominent.x, y: prominent.y, z: HOLD_Z, duration: ARRIVE_DUR, ease: "power1.out",
      onUpdate: function () {
        // "as it gets closer, start the count up" — a fixed checkpoint
        // against this tween's own time-progress (this.progress()), not
        // a scale-derived proximity guess.
        if (!countedUp[inIndex] && this.progress() >= COUNT_START_PROGRESS) {
          countedUp[inIndex] = true;
          countUp(slides[inIndex]);
        }
      },
      onComplete: () => startDesktopHoldCreep(inIndex),
    });
    gsap.to(mesh.rotation, {
      x: (prominent.rotX * Math.PI) / 180, y: (prominent.rotY * Math.PI) / 180, duration: ARRIVE_DUR, ease: "power1.out",
    });
    gsap.fromTo(slides[inIndex], { opacity: 0 }, { opacity: 1, duration: ARRIVE_DUR, ease: "power1.out" });
  }

  /* Departure is not a mirror of the arrival — it doesn't recede back
     into the depths. Once a slide has had its moment paused and readable,
     it picks up from wherever its depth creep currently has it (no
     reset, no jump) and eases IN — slow at first, then visibly
     accelerating — toward OVERSHOOT_Z, growing dramatically larger per
     the perspective formula, while its opacity fades to zero over the
     same window, so it's gone by the time it would otherwise loom
     uncomfortably large. Only once fully transparent does it snap back —
     invisibly — to the shared waiting lane, where a faint ambient
     "breathe" (see startDesktopWaitBreathe) keeps it from looking frozen
     until its next turn. Nothing is ever visibly parked in the
     background; the only slides on screen at any moment are the one
     paused up front and whichever one is mid-transition. */
  function departDesktop(outIndex: number) {
    if (!three) return;
    const mesh = three.meshes[outIndex];
    laneOf.set(outIndex, WAIT_LANE);
    // promoteDesktop always kills prior tweens on this mesh before
    // starting its own — departure needs the same defensive kill: this
    // slide could be departing straight out of its own long-running hold
    // creep (up to CREEP_TAIL_DUR = 20s) or, on a repeat turn, still have
    // remnants of an even earlier ambient wait-breathe (repeat:-1,
    // genuinely infinite) that a relied-on auto-overwrite didn't
    // reliably catch — a real bug that showed up as a slide's *later*
    // turns getting stuck at a large, "already zoomed in" depth instead
    // of arriving from small again, because its own departure's z-tween
    // was fighting a stale one instead of running cleanly to OVERSHOOT_Z
    // and resetting via onComplete below.
    gsap.killTweensOf(mesh.position);
    gsap.to(mesh.position, { z: OVERSHOOT_Z, duration: DEPART_DUR, ease: "power3.in" });
    gsap.to(slides[outIndex], {
      opacity: 0, duration: DEPART_DUR, ease: "power3.in",
      onComplete: () => {
        mesh.position.set(0, 0, WAIT_Z);
        mesh.rotation.set(0, 0, 0);
        startDesktopWaitBreathe(outIndex);
      },
    });
  }

  function desktopSwap(outIndex: number, inIndex: number) {
    // triggered together, same instant, from the same goTo() call — one
    // group arriving and the other departing at once is what makes this
    // read as a single coordinated changeover rather than two unrelated
    // animations that happen to overlap.
    promoteDesktop(inIndex);
    departDesktop(outIndex);
  }

  /* ================= CSS transform (mobile) ================= */
  function mobileApplyImmediate() {
    slides.forEach((slide, i) => {
      const t = mobileLaneOf.get(i)!;
      gsap.set(slide, {
        xPercent: -50, yPercent: -50, x: t.x, y: t.y, z: t.z,
        rotationX: t.rotX, rotationY: t.rotY, scale: t.scale, opacity: t.opacity,
        filter: t.blur ? `blur(${t.blur}px)` : "none",
        zIndex: Math.round(t.scale * 100),
      });
    });
  }

  /* Mirrors promoteDesktop's intent — one coordinated arrival tween, not
     separately-timed pieces that can drift out of sync (see the
     top-of-file comment). `scale` plays the role desktop's depth does —
     it animates alongside x/y/rotation/opacity in the same tween up to
     MOBILE_HOLD_SCALE, then an infinite constant-speed creep past it
     (startMobileHoldCreep) — never reaching zero velocity, so "the
     pause" never reads as a stop. Uses a plain `.to()` (not `.fromTo()`)
     so it picks up from whatever the slide's own ambient wait-breathe
     already had it at — no reset, no jump. */
  function promoteMobile(inIndex: number) {
    const prominent = QUOTE_INDICES.includes(inIndex) ? MOBILE_QUOTE_LANE : MOBILE_PROMINENT_LANES[pickMobileProminentLane()];
    mobileLaneOf.set(inIndex, prominent);
    // countedUp is intentionally NOT reset here — see promoteDesktop's
    // comment; a slide only ever counts up once, the first time shown.
    gsap.killTweensOf(slides[inIndex]);
    slides[inIndex].style.zIndex = "100";
    gsap.to(slides[inIndex], {
      x: prominent.x, y: prominent.y, rotationX: prominent.rotX, rotationY: prominent.rotY,
      scale: MOBILE_HOLD_SCALE, z: MOBILE_HOLD_Z, opacity: prominent.opacity, filter: "none",
      duration: ARRIVE_DUR, ease: "power1.out",
      onUpdate: function () {
        if (!countedUp[inIndex] && this.progress() >= COUNT_START_PROGRESS) {
          countedUp[inIndex] = true;
          countUp(slides[inIndex]);
        }
      },
      onComplete: () => startMobileHoldCreep(inIndex),
    });
  }

  /* Departure is NOT a mirror of the arrival — the outgoing slide picks
     up from wherever its scale creep currently has it and eases IN
     (slow, then visibly accelerating) toward MOBILE_OVERSHOOT on the same
     line it was already on, opacity fading to zero over the same window,
     then snaps back invisibly to MOBILE_WAIT once gone, where its own
     ambient breathe resumes. Nothing is ever left visibly parked in the
     background. */
  function departMobile(outIndex: number) {
    // see departDesktop's comment — the same defensive kill promoteMobile
    // already does for its own start, needed here too so a stale
    // long-running hold creep or infinite wait-breathe can't fight this
    // departure's own tween across repeat turns.
    gsap.killTweensOf(slides[outIndex]);
    slides[outIndex].style.zIndex = "90";
    gsap.to(slides[outIndex], {
      scale: MOBILE_OVERSHOOT.scale, z: MOBILE_OVERSHOOT.z, opacity: MOBILE_OVERSHOOT.opacity,
      duration: DEPART_DUR, ease: "power3.in",
      onComplete: () => {
        gsap.set(slides[outIndex], {
          x: MOBILE_WAIT.x, y: MOBILE_WAIT.y, z: MOBILE_WAIT.z, rotationX: MOBILE_WAIT.rotX, rotationY: MOBILE_WAIT.rotY,
          scale: MOBILE_WAIT.scale, opacity: MOBILE_WAIT.opacity, filter: `blur(${MOBILE_WAIT.blur}px)`,
        });
        startMobileWaitBreathe(outIndex);
      },
    });
    mobileLaneOf.set(outIndex, MOBILE_WAIT);
  }

  function mobileSwap(outIndex: number, inIndex: number) {
    promoteMobile(inIndex);
    departMobile(outIndex);
  }

  /* ================= mode switching ================= */
  const desktopQuery = window.matchMedia(DESKTOP_QUERY);
  type Mode = "desktop" | "mobile";
  let mode: Mode = desktopQuery.matches ? "desktop" : "mobile";

  // A transition running entirely in one mode only updates that mode's own
  // lane map (desktopSwap -> laneOf, mobileSwap -> mobileLaneOf) — if the
  // user resizes across the breakpoint mid-interaction, the *other* map
  // can be stale and no longer agree that `idx` belongs in a prominent
  // lane. Cheap to guard against directly rather than keep both maps in
  // lockstep on every single transition.
  function ensureActiveLaneIsProminent() {
    // before the very first activation, idx correctly sits at the
    // waiting lane (see the seed loop) — that's not a staleness bug to
    // fix, it's the deliberate "hasn't arrived yet" state.
    if (!everActivated) return;
    const isProminent = laneOf.get(idx) === QUOTE_LANE || PROMINENT_LANES.includes(laneOf.get(idx)!);
    if (!isProminent) {
      laneOf.set(idx, QUOTE_INDICES.includes(idx) ? QUOTE_LANE : PROMINENT_LANES[lastProminentIdx >= 0 ? lastProminentIdx : 0]);
    }
    const isMobileProminent = mobileLaneOf.get(idx) === MOBILE_QUOTE_LANE || MOBILE_PROMINENT_LANES.includes(mobileLaneOf.get(idx)!);
    if (!isMobileProminent) {
      mobileLaneOf.set(idx, QUOTE_INDICES.includes(idx) ? MOBILE_QUOTE_LANE : MOBILE_PROMINENT_LANES[lastMobileProminentIdx >= 0 ? lastMobileProminentIdx : 0]);
    }
  }

  function enterMode(next: Mode) {
    mode = next;
    ensureActiveLaneIsProminent();
    if (mode === "desktop") {
      slides.forEach((s, i) => {
        s.style.transform = "";
        gsap.killTweensOf(s);
        s.style.filter = "";
        // explicit, not cleared to "" — clearing would fall back to the
        // CSS default (opacity:1) and flash every waiting slide visible
        // until the next transition's tween overwrote it. Before
        // activation, nothing is visible yet at all (everActivated is
        // false), matching the seed loop.
        s.style.opacity = everActivated && i === idx ? "1" : "0";
      });
      initThree();
      if (three) {
        // initThree() only ever positions a mesh from laneOf on its own
        // first creation — on a later mode re-entry the meshes already
        // exist, so the (possibly just-fixed) active lane needs applying
        // explicitly, snapped rather than tweened since this is a resize,
        // not a promotion.
        const lane = laneOf.get(idx)!;
        const mesh = three.meshes[idx];
        mesh.position.set(lane.x, lane.y, lane.z);
        mesh.rotation.set((lane.rotX * Math.PI) / 180, (lane.rotY * Math.PI) / 180, 0);
      }
      renderFrame();
      if (playing) startThreeTicker();
    } else {
      stopThreeTicker();
      slides.forEach((s) => { s.style.transform = ""; });
      mobileApplyImmediate();
    }
  }
  enterMode(mode);

  // Nothing animates yet — no arrival, no count-up, no ambient wait-
  // breathe — until the section is actually fully scrolled into view
  // (see play() below). idx 0 gets promoted through the exact same
  // arrival every later slide gets, not pre-placed at full size — see
  // promoteDesktop/promoteMobile.
  //
  // Sets `transitioning` itself, same as goTo() does — this promotion
  // doesn't go through goTo() (there's no outgoing slide to depart on
  // the very first activation), so without this a goTo() call arriving
  // before the arrival settles wouldn't be blocked by the guard the way
  // every later transition is, and could start departing idx 0 while its
  // own arrival opacity tween is still fighting to reach 1 — a real race
  // that in practice AUTOPLAY_DELAY (4s) being longer than ARRIVE_DUR
  // (2.5s) usually masks, but shouldn't rely on that.
  function activateInitial() {
    if (everActivated) return;
    everActivated = true;
    transitioning = true;
    if (mode === "desktop") promoteDesktop(idx);
    else promoteMobile(idx);
    gsap.delayedCall(GUARD_DUR, () => { transitioning = false; });
    for (let i = 0; i < N; i++) {
      if (i === idx) continue;
      if (mode === "desktop") startDesktopWaitBreathe(i);
      else startMobileWaitBreathe(i);
    }
  }

  desktopQuery.addEventListener("change", () => {
    const next: Mode = desktopQuery.matches ? "desktop" : "mobile";
    if (next !== mode) enterMode(next);
  });

  /* ================= scroll cue ================= */
  // mirrors Hero's own cueTl (hero.ts) — a paused, infinitely-repeating
  // pulse built once and played/paused rather than recreated, so
  // play()/pause() (see below) can cheaply resume it exactly where it
  // left off the same way they do everything else in this component.
  function initCueTimeline() {
    if (!cue || cueTl) return;
    const line = cue.querySelector("i");
    if (!line) return;
    cueTl = gsap.timeline({ repeat: -1, paused: true })
      .fromTo(line, { scaleY: 0, transformOrigin: "top" }, { scaleY: 1, duration: 0.95, ease: "power2.inOut" })
      .to(line, { scaleY: 0, transformOrigin: "bottom", duration: 0.95, ease: "power2.inOut" });
  }

  // Fades the "Scroll" cue in the first time the visitor has actually
  // seen every slide once (see advanceAuto's own autoLoopCount check) —
  // there's nothing to invite them onward from before that.
  function showScrollCue() {
    if (!cue || cueShown) return;
    cueShown = true;
    initCueTimeline();
    gsap.to(cue, { opacity: 1, duration: 0.8, ease: "power1.out" });
    if (playing) cueTl?.play();
  }

  // Once MAX_AUTO_LOOPS finishes with nobody interrupting, hand scroll
  // off to the next section rather than looping forever for a purely
  // passive visitor — but only if they're still actually here; if
  // `playing` is already false they scrolled away under their own steam
  // and this would be an unwelcome surprise arriving later.
  function autoScrollToNextSection() {
    if (!playing) return;
    const h = section!.getBoundingClientRect().height;
    gsap.to(window, {
      duration: 0.9, ease: "power2.inOut", overwrite: true,
      scrollTo: { y: `+=${h}`, autoKill: true },
    });
  }

  /* ================= autoplay ================= */
  let autoplayCall: gsap.core.Tween | null = null;

  function killTimers() {
    autoplayCall?.kill();
    autoplayCall = null;
  }

  function armAutoplay() {
    if (stoppedForever || autoplayDisabledForTest) return;
    autoplayCall?.kill();
    autoplayCall = gsap.delayedCall(AUTOPLAY_DELAY, advanceAuto);
  }

  function goTo(next: number) {
    if (transitioning || next === idx) return;
    transitioning = true;
    const out = idx;
    idx = next;
    applyAria();
    // count-up is progress-driven now (see promoteDesktop/promoteMobile's
    // own this.progress() check) — no immediate call here, it fires once
    // the promoted slide's arrival is 3/4 of the way there.
    if (mode === "desktop") desktopSwap(out, idx);
    else mobileSwap(out, idx);
    gsap.delayedCall(GUARD_DUR, () => { transitioning = false; });
  }

  function advanceAuto() {
    // belt-and-braces: in real usage armAutoplay() already refuses to
    // schedule another call once stoppedForever, so this only matters if
    // something (a test, a future caller) invokes advanceAuto directly.
    if (stoppedForever) return;
    const next = (idx + 1) % N;
    goTo(next);
    if (next === 0) {
      autoLoopCount++;
      // the visitor has now seen every slide once — invite them onward.
      if (autoLoopCount === 1) showScrollCue();
      // a purely passive visitor isn't expected to watch forever — after
      // MAX_AUTO_LOOPS full loops, stop and, if they're still sitting
      // here, scroll on to the next section for them. Scrolling away and
      // back resets nothing here on purpose: once it's genuinely
      // finished, re-entering the view shouldn't restart it from scratch.
      if (autoLoopCount >= MAX_AUTO_LOOPS) {
        stoppedForever = true;
        killTimers();
        autoScrollToNextSection();
        return;
      }
    }
    armAutoplay();
  }

  /* ================= play / pause on scroll ================= */
  function sectionVisibleRatio(): number {
    const r = section!.getBoundingClientRect();
    return Math.max(0, Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0)) / Math.max(1, r.height);
  }

  function play() {
    if (playing || stoppedForever) return;
    playing = true;
    activateInitial();
    if (mode === "desktop") startThreeTicker();
    armAutoplay();
    // resume the cue's pulse exactly where it left off, same as
    // everything else pause()/play() drive — no-op if it was never shown.
    if (cueShown) cueTl?.play();
  }
  function pause() {
    if (!playing) return;
    playing = false;
    stopThreeTicker();
    killTimers();
    cueTl?.pause();
  }

  // The instant the visitor starts scrolling at all, pause — never fight
  // or trap their scroll. A short settle-debounce after they stop again
  // checks whether the section is now (still) fully in view and, if so,
  // resumes exactly where it left off (idx/lane state is never reset by
  // pause/resume) — this is what makes "scroll away, scroll back" pick
  // back up instead of restarting.
  let settleCall: gsap.core.Tween | null = null;
  function onWindowScroll() {
    pause();
    settleCall?.kill();
    settleCall = gsap.delayedCall(0.25, () => {
      if (sectionVisibleRatio() >= 0.9) play();
    });
  }
  window.addEventListener("scroll", onWindowScroll, { passive: true });

  // Catches the section already being fully in view without requiring a
  // scroll event first (e.g. a deep link, or a very short page).
  new IntersectionObserver(
    (entries) => {
      if (entries[0].intersectionRatio >= 0.9) play();
    },
    { threshold: [0.9] },
  ).observe(section);

  // test hook — mirrors hero.ts's exposed heroTimeline, lets Playwright
  // drive state directly without burning real scroll/timer time.
  // advanceAuto specifically exists so a test can simulate MAX_AUTO_LOOPS
  // full loops (3 * N * AUTOPLAY_DELAY would otherwise be over a minute
  // of real waiting) without faking the underlying loop-counting logic.
  (section as HTMLElement & {
    mgApi?: {
      goTo: (i: number) => void;
      play: () => void;
      pause: () => void;
      activateInitial: () => void;
      advanceAuto: () => void;
      disableAutoplay: () => void;
      getState: () => { idx: number; playing: boolean; autoLoopCount: number; stoppedForever: boolean };
    };
  }).mgApi = {
    goTo,
    play,
    pause,
    advanceAuto,
    activateInitial,
    disableAutoplay: () => { autoplayDisabledForTest = true; killTimers(); },
    getState: () => ({ idx, playing, autoLoopCount, stoppedForever }),
  };
}
