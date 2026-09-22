import * as THREE from "three";
import { useGsap, prefersReducedMotion } from "./gsapSetup";

const N = 4;
const DESKTOP_QUERY = "(min-width: 1000px)";
// world-space distance from the camera to the z=0 "front" plane — fov is
// recomputed off this each resize so 1 Three.js unit at z=0 == 1 css px,
// which means every lane below can be authored directly in px-equivalent
// units instead of hand-derived ones.
const CAMERA_Z = 1000;
const AUTOPLAY_DELAY = 4;
const RESUME_DELAY = 3;

/* A slide's whole lifecycle is one continuous, never-quite-stopping curve
   rather than three separate phases stitched together with a hard stop in
   between (an approach tween completes, the slide sits dead still, then
   later a completely unrelated departure tween begins from scratch) — that
   stitched-together shape is exactly what reads as "start / stop / start".
   Instead:
     - DEPTH_APPROACH_DUR is a finite, decelerating ("power3.out") depth
       tween that carries a slide from the waiting depth to just past its
       readable resting point (HOLD_Z).
     - it's chained straight into an INFINITE ambient breathe (yoyo,
       repeat:-1) oscillating gently around HOLD_Z — this is the literal
       fix for "never let it pause": a finite tween, however long, still
       eventually reaches zero velocity and sits dead still if genuinely
       left alone (no autoplay, no gesture, ever) — an unbounded one
       physically cannot. "The pause" is this breathe: still moving, just
       very slowly, forever, until a departure interrupts it.
     - departure (DEPART_DUR) doesn't reset anything — it takes over from
       wherever the breathe currently sits and eases IN (slow to fast)
       toward the overshoot point, so it visibly picks up speed rather
       than snapping straight to full velocity.
     - SETTLE_DUR governs only the lateral (x/y/rotation) arrival, which
       has no reason to keep drifting once it's reached its lane — it
       settles well before DEPTH_APPROACH_DUR finishes.
   Lateral and depth are deliberately two separate, differently-timed
   tweens for exactly this reason: a single tween can't be "settled" in
   one dimension and "still slowly creeping" in another. */
const DEPTH_APPROACH_DUR = 3.7; // 0.3s faster than the original 4s — keeps momentum through the approach/pause without dragging
const SETTLE_DUR = 3;
// how long `transitioning` blocks a new gesture — tied to when a slide
// reads as arrived (SETTLE_DUR), not to the depth breathe, which by design
// never finishes.
const GUARD_DUR = SETTLE_DUR;
const DEPART_DUR = 1.0; // departure: picks up from the live creep, accelerates hard, gone
// how deep a waiting slide sits — invisible (opacity 0), so its exact
// depth barely matters visually; one shared constant is enough, no need
// for a pool of distinct spots the way the old visible background did.
const WAIT_Z = -1700;
// where DEPTH_APPROACH_DUR lands and the infinite hold-breathe then
// oscillates around (see the comment above) — a bit past prominent's z:0,
// so the slide still reads as very slightly larger than "arrived".
const HOLD_Z = 90;
const HOLD_BREATHE_DUR = 5;
const HOLD_BREATHE_Z_RANGE = 70;
// how close to the camera a departing slide overshoots to before it's
// reset — short of CAMERA_Z itself (which would divide by zero) but close
// enough that scale = CAMERA_Z/(CAMERA_Z-z) blows up dramatically, i.e.
// it visibly keeps growing as it fades, rather than just holding still
// and fading in place.
const OVERSHOOT_Z = 920;
// how far into its own approach a slide has to be before its number
// starts counting up — "as it gets closer" is a proximity thing, not a
// fixed delay. Desktop checks this against live depth every frame (see
// renderFrame); mobile has no per-frame projection to read, so it checks
// live scale directly instead (see checkMobileCount) — not timed to fire
// at some fixed point through the tween regardless of how front-loaded
// the easing actually is.
const COUNT_THRESHOLD = 0.72;
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

// the quote (see QUOTE_INDEX below) — fixed, not drawn from the pool the
// three stat slides randomly share (see pickProminentLane). Its own
// left-aligned text block reads better anchored well right of centre, so
// its emphasis (the word "move" in "They move") lands around 60% across
// the frame rather than wherever a randomly-picked lane happens to put it.
const QUOTE_INDEX = 3;
const QUOTE_LANE: Lane = { x: 220, y: 30, z: 0, rotY: -7, rotX: 2 };

/* Where an *active stat* slide pauses, readable — three options (never
   repeating the same one twice running, see pickProminentLane) so
   consecutive active slides don't always settle in the same spot. z:0 for
   all three — "prominent" means close/in-focus, only the lateral position
   varies. The quote slide doesn't draw from this pool at all — see
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
// desktop's z does — so scale plays that same role directly: a finite,
// front-loaded rise from MOBILE_WAIT's tiny scale to MOBILE_HOLD_SCALE
// (mirrors DEPTH_APPROACH_DUR/HOLD_Z), then an infinite ambient breathe
// around it (mirrors HOLD_BREATHE_DUR) — see checkMobileCount for how
// count-up reuses COUNT_THRESHOLD against this live value.
const MOBILE_HOLD_SCALE = 1.1;
const MOBILE_HOLD_Z = 40;
const MOBILE_HOLD_BREATHE_SCALE_RANGE = 0.08;
const MOBILE_HOLD_BREATHE_Z_RANGE = 70;
// how far/large a departing slide overshoots to before resetting — mobile
// has no real projection, so this is just an authored end-of-tween value.
const MOBILE_OVERSHOOT: MobileLane = { x: "0px", y: "0px", z: 260, rotY: 0, rotX: 0, scale: 2.4, blur: 0, opacity: 0 };
// mirrors WAIT_BREATHE_* above, authored directly since mobile has no live
// depth to derive a subtle "still alive back there" nudge from.
const MOBILE_WAIT_BREATHE_SCALE_BONUS = 0.06;
const MOBILE_WAIT_BREATHE_Z_BONUS = 60;

const TINTS = ["#F06496", "#BE7837", "#506E78", "#A0A073"];

/**
 * MomentumGallery — a "back to front" depth-of-field carousel replacing the
 * old horizontally-panning Momentum track (see Momentum.astro, retired).
 * Only ever two slides are visible at once: the active one, paused large
 * and readable up front, and whichever one is mid-transition. A slide
 * promoted to active emerges from dead centre and grows forward into its
 * lane; once its turn is over it doesn't recede into a visible background
 * — it keeps riding forward past the reader (growing further, per real
 * perspective) while fading to nothing, then resets invisibly to wait for
 * its next turn. Nothing is ever left visibly parked in the background.
 * Desktop renders the depth with a real Three.js scene (camera + soft
 * "card" meshes behind the real DOM text — the canvas itself stays
 * genuinely transparent so the ShineField dust field behind it keeps
 * showing through, see makeCardTexture's comment for why there's no
 * BokehPass/EffectComposer here) and syncs that DOM text's position/scale
 * to the mesh every frame; the actual stat/quote copy never lives inside
 * the canvas. Below 1000px, no WebGL context is ever created at all — a
 * plain CSS 3D transform stack approximates the same look, both because
 * touch devices are this codebase's own documented source of GPU-effect
 * crashes (ShineField/Day One's prior iPad history) and because a
 * mouse-only interaction (wheel) isn't the primary input there anyway.
 *
 * Navigation — wheel, arrow keys, or touch — is captured only while the
 * section fills the viewport (Hero's own overflow:hidden + scroll-snapback
 * lock, reused verbatim: a plain overflow:hidden alone doesn't reliably
 * block a programmatic/momentum scroll in Chromium). One gesture = one
 * slide. Auto-play advances on its own timer, pausing on any interaction
 * and resuming 3s later. Advancing past the last slide (or retreating
 * before the first) releases the lock and hands scroll to the next/previous
 * section instead of wrapping.
 */
export function setupMomentumGallery() {
  const section = document.getElementById("momentum");
  const sceneEl = document.getElementById("mgScene");
  const canvas = document.getElementById("mgCanvas") as HTMLCanvasElement | null;
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
    // shows its final value, no tween, no lock, no canvas ever created.
    slides.forEach((slide) => {
      const fig = slide.querySelector<HTMLElement>("[data-mg-count]");
      if (fig) setCountText(fig, Number(fig.dataset.mgCount));
    });
    return;
  }

  const { gsap, Observer } = useGsap();

  const countUp = (slide: HTMLElement) => {
    const fig = slide.querySelector<HTMLElement>("[data-mg-count]");
    if (!fig) return;
    const target = Number(fig.dataset.mgCount);
    const obj = { v: 0 };
    setCountText(fig, 0);
    // 0.9s * 1.6 — slowed by 60% from the original pace.
    gsap.to(obj, { v: target, duration: 0.9 * 1.6, ease: "power3.out", onUpdate: () => setCountText(fig, obj.v) });
  };

  /* ---------- shared state (survives lock cycles and mode switches) ---------- */
  let idx = 0;
  let locked = false;
  let transitioning = false;
  let suppressEngage = false;
  // has the section been scrolled 20% into view yet? Declared up here
  // (not just before activateInitial's own definition further down)
  // because initThree() paints — and renderFrame's count-up check reads —
  // the seeded layout synchronously during setup, before activateInitial
  // itself is ever defined; a `let` referenced from there earlier than
  // this line would hit the temporal dead zone.
  let activated = false;
  // has this slide's number ever counted up yet? Permanent, not reset on
  // each approach — a slide only counts up the very first time it's ever
  // shown; every later turn just displays the number it already landed on.
  const countedUp: boolean[] = new Array(N).fill(false);

  // mobile has no per-frame projection to read a live "scale" off the way
  // desktop's renderFrame does — this is the equivalent, called from
  // mobileSwap's own tween onUpdate hooks instead of a render loop.
  function checkMobileCount(i: number) {
    if (countedUp[i]) return;
    const scale = gsap.getProperty(slides[i], "scale") as number;
    if (scale >= COUNT_THRESHOLD) {
      countedUp[i] = true;
      countUp(slides[i]);
    }
  }

  // a single shared "waiting" lane — where a slide sits invisibly (opacity
  // 0) between its own turns. No pool of distinct spots is needed the way
  // the old visible background lanes were: nothing should ever be seen
  // resting back there, so its exact depth/position barely matters.
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

  // seed the initial lanes — slide 0 (the initial idx) starts already in a
  // prominent lane, the other 3 invisible at the shared waiting lane, ready
  // for their turn.
  for (let i = 0; i < N; i++) {
    if (i === idx) {
      laneOf.set(i, PROMINENT_LANES[0]);
      mobileLaneOf.set(i, MOBILE_PROMINENT_LANES[0]);
      lastProminentIdx = 0;
      lastMobileProminentIdx = 0;
    } else {
      laneOf.set(i, WAIT_LANE);
      mobileLaneOf.set(i, MOBILE_WAIT);
    }
    // opacity is fully explicit now (see renderFrame's comment) — nothing
    // derives it from live scale/depth any more, so it has to be seeded
    // here rather than falling out of the first render/apply pass.
    gsap.set(slides[i], { opacity: i === idx ? 1 : 0 });
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
      // opacity is NOT derived here — it's explicitly tweened by
      // desktopSwap (fade in on approach, fade out on departure) so a
      // slide can be simultaneously large (overshooting past the camera
      // as it departs) AND fading to zero, which a scale-derived value
      // could never represent (it would just clamp at opacity 1).
      el.style.filter = scale >= 0.98 ? "" : `blur(${((1 - Math.min(scale, 1)) * 12).toFixed(1)}px)`;
      el.style.zIndex = String(Math.round(scale * 100));

      // "as it gets closer, start the count up" — driven by live proximity
      // (this scale value), not a fixed delay, so it actually tracks how
      // close/legible the number looks regardless of easing specifics.
      // Gated on `activated`: initThree() paints the *seeded* layout with
      // one synchronous renderFrame() call before the section has ever
      // been scrolled into view — slide 0 starts there already at
      // prominent scale (z:0, scale 1.0), which alone satisfies
      // COUNT_THRESHOLD and would otherwise fire this instantly on page
      // load, on desktop specifically, completely bypassing the 20%-
      // scroll gate below.
      if (activated && i === idx && !countedUp[i] && scale >= COUNT_THRESHOLD) {
        countedUp[i] = true;
        countUp(el);
      }
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
    renderFrame(); // paint the seeded layout immediately, don't wait for a tick
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
  // mirrors startDesktopHoldBreathe — once a slide has arrived, it keeps
  // gently growing/shrinking around MOBILE_HOLD_SCALE forever instead of
  // ever truly stopping. mobileSwap's departure overwrites this the
  // moment it starts, same as it would the approach tween itself.
  function startMobileHoldBreathe(i: number) {
    gsap.to(slides[i], {
      scale: MOBILE_HOLD_SCALE + MOBILE_HOLD_BREATHE_SCALE_RANGE,
      z: MOBILE_HOLD_Z + MOBILE_HOLD_BREATHE_Z_RANGE,
      duration: HOLD_BREATHE_DUR, ease: "sine.inOut", yoyo: true, repeat: -1,
    });
  }

  /* Once a slide has arrived (DEPTH_APPROACH_DUR completed), it keeps
     gently oscillating around HOLD_Z forever (repeat:-1) instead of ever
     truly stopping — see the top-of-file comment. Departure (desktopSwap)
     overwrites this the moment it starts, same as it would the approach
     tween itself. */
  function startDesktopHoldBreathe(i: number) {
    if (!three) return;
    gsap.to(three.meshes[i].position, {
      z: HOLD_Z + HOLD_BREATHE_Z_RANGE, duration: HOLD_BREATHE_DUR, ease: "sine.inOut", yoyo: true, repeat: -1,
    });
  }

  /* A promoted slide's lateral position is reset to dead centre
     *immediately*, while it's still at the waiting depth (small,
     invisible, low visual cost) — the SETTLE_DUR tween then moves x and y
     together, out from centre to its resting lane. That's what actually
     produces "emerges from the centre, fans out to the left/right as it
     comes forward" — snapping straight to the target lane and only
     animating depth meant two out of three lanes never visibly passed
     through centre at all, they just grew in place already off to the
     side. Depth runs on its own timeline: a finite DEPTH_APPROACH_DUR
     tween into HOLD_Z, chained straight into an infinite ambient breathe
     around it (see startDesktopHoldBreathe and the top-of-file comment) —
     "the pause" never actually reaches zero velocity, it just settles
     into a very slow, endless oscillation. Opacity fades in over the
     front portion of the lateral settle.

     Departure is not a mirror of the approach — it doesn't recede back
     into the depths. Once a slide has had its moment paused and readable,
     it picks up from wherever that depth breathe currently has it (no
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
  function desktopSwap(outIndex: number, inIndex: number) {
    initThree();
    if (!three) return;
    const meshes = three.meshes;

    const prominent = inIndex === QUOTE_INDEX ? QUOTE_LANE : PROMINENT_LANES[pickProminentLane()];
    laneOf.set(inIndex, prominent);
    const inMesh = meshes[inIndex];
    gsap.killTweensOf(inMesh.position);
    gsap.killTweensOf(inMesh.rotation);
    gsap.killTweensOf(slides[inIndex]);
    inMesh.position.x = 0;
    inMesh.position.y = 0;
    inMesh.rotation.x = 0;
    inMesh.rotation.y = 0;
    // countedUp is intentionally NOT reset here — a slide only ever counts
    // up once, the very first time it's shown (see the shared-state
    // comment above). Every later approach just displays its already-
    // final number.
    // lateral position/rotation settle on their own, shorter timeline —
    // once arrived there's no reason for them to keep drifting.
    gsap.to(inMesh.position, { x: prominent.x, y: prominent.y, duration: SETTLE_DUR, ease: "power3.out" });
    gsap.to(inMesh.rotation, { x: (prominent.rotX * Math.PI) / 180, y: (prominent.rotY * Math.PI) / 180, duration: SETTLE_DUR, ease: "power3.out" });
    // depth: a finite approach into HOLD_Z, chained straight into an
    // infinite ambient breathe around it (see the top-of-file comment) —
    // it never actually stops, picking up from wherever this slide's own
    // wait-breathe last left it.
    gsap.to(inMesh.position, {
      z: HOLD_Z, duration: DEPTH_APPROACH_DUR, ease: "power3.out",
      onComplete: () => startDesktopHoldBreathe(inIndex),
    });
    gsap.fromTo(slides[inIndex], { opacity: 0 }, { opacity: 1, duration: SETTLE_DUR * 0.6, ease: "power1.out" });

    // outgoing: keep riding forward on the same line it was already on
    // (no snapping back toward centre — this is a continuation, not a
    // retreat), picking up from whatever depth its own creep/breathe had
    // already reached, easing IN toward a hard accelerate.
    const outMesh = meshes[outIndex];
    laneOf.set(outIndex, WAIT_LANE);
    gsap.to(outMesh.position, { z: OVERSHOOT_Z, duration: DEPART_DUR, ease: "power3.in" });
    gsap.to(slides[outIndex], {
      opacity: 0, duration: DEPART_DUR, ease: "power3.in",
      onComplete: () => {
        outMesh.position.set(0, 0, WAIT_Z);
        outMesh.rotation.set(0, 0, 0);
        startDesktopWaitBreathe(outIndex);
      },
    });
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

  /* Mirrors desktopSwap's intent and its SETTLE_DUR/DEPTH_APPROACH_DUR
     split, authored explicitly since mobile has no live perspective
     projection to lean on. Both tweens use plain `.to()` (not `.fromTo()`)
     so they pick up from whatever the slide's own ambient wait-breathe
     already had it at — no reset, no jump. Lateral position/rotation/
     opacity/blur settle on their own short timeline; `scale` plays the
     role desktop's depth does — a finite, front-loaded approach into
     MOBILE_HOLD_SCALE, chained straight into an infinite ambient breathe
     around it (startMobileHoldBreathe) — "the pause" never actually
     reaches zero velocity, it just settles into a very slow, endless
     oscillation. Departure is NOT a mirror of the approach — the outgoing
     slide picks up from wherever that scale breathe currently has it and
     eases IN (slow, then visibly accelerating) toward MOBILE_OVERSHOOT on
     the same line it was already on, opacity fading to zero over the same
     window, then snaps back invisibly to MOBILE_WAIT once gone, where its
     own ambient breathe resumes. Nothing is ever left visibly parked in
     the background. */
  function mobileSwap(outIndex: number, inIndex: number) {
    const prominent = inIndex === QUOTE_INDEX ? MOBILE_QUOTE_LANE : MOBILE_PROMINENT_LANES[pickMobileProminentLane()];
    mobileLaneOf.set(inIndex, prominent);
    // countedUp is intentionally NOT reset here — see desktopSwap's
    // comment; a slide only ever counts up once, the first time shown.
    gsap.killTweensOf(slides[inIndex]);
    slides[inIndex].style.zIndex = "100";
    gsap.to(slides[inIndex], {
      x: prominent.x, y: prominent.y, rotationX: prominent.rotX, rotationY: prominent.rotY,
      opacity: prominent.opacity, filter: "none",
      duration: SETTLE_DUR, ease: "power3.out",
    });
    gsap.to(slides[inIndex], {
      scale: MOBILE_HOLD_SCALE, z: MOBILE_HOLD_Z, duration: DEPTH_APPROACH_DUR, ease: "power3.out",
      onUpdate: () => checkMobileCount(inIndex),
      onComplete: () => startMobileHoldBreathe(inIndex),
    });

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
    const isProminent = laneOf.get(idx) === QUOTE_LANE || PROMINENT_LANES.includes(laneOf.get(idx)!);
    if (!isProminent) {
      laneOf.set(idx, idx === QUOTE_INDEX ? QUOTE_LANE : PROMINENT_LANES[lastProminentIdx >= 0 ? lastProminentIdx : 0]);
    }
    const isMobileProminent = mobileLaneOf.get(idx) === MOBILE_QUOTE_LANE || MOBILE_PROMINENT_LANES.includes(mobileLaneOf.get(idx)!);
    if (!isMobileProminent) {
      mobileLaneOf.set(idx, idx === QUOTE_INDEX ? MOBILE_QUOTE_LANE : MOBILE_PROMINENT_LANES[lastMobileProminentIdx >= 0 ? lastMobileProminentIdx : 0]);
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
        // until the next transition's tween overwrote it.
        s.style.opacity = i === idx ? "1" : "0";
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
      if (locked) startThreeTicker();
    } else {
      stopThreeTicker();
      slides.forEach((s) => { s.style.transform = ""; });
      mobileApplyImmediate();
    }
  }
  enterMode(mode);

  // Nothing animates yet — no count-up, no ambient wait-breathe — until
  // the section is actually 20% into view (see the IntersectionObserver
  // below). The resting layout is already painted (enterMode/initThree
  // do that unconditionally), but its number stays at its unanimated
  // placeholder until then, so nothing plays out invisibly while the
  // visitor is still scrolling through earlier sections.
  function activateInitial() {
    if (activated) return;
    activated = true;
    countedUp[idx] = true;
    countUp(slides[idx]);
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

  /* ================= navigation ================= */
  let observerGesture: ReturnType<typeof Observer.create> | null = null;
  let autoplayCall: gsap.core.Tween | null = null;
  let resumeCall: gsap.core.Tween | null = null;
  let snapback: (() => void) | null = null;

  function armAutoplay() {
    autoplayCall?.kill();
    autoplayCall = gsap.delayedCall(AUTOPLAY_DELAY, advanceAuto);
  }
  function registerInteraction() {
    autoplayCall?.kill();
    resumeCall?.kill();
    resumeCall = gsap.delayedCall(RESUME_DELAY, armAutoplay);
  }
  function killTimers() {
    autoplayCall?.kill();
    resumeCall?.kill();
    autoplayCall = null;
    resumeCall = null;
  }

  function goTo(next: number) {
    if (transitioning || next === idx) return;
    transitioning = true;
    const out = idx;
    idx = next;
    applyAria();
    // count-up is proximity-driven now (see renderFrame/mobileSwap's own
    // progress check) — no immediate call here, it fires once the
    // promoted slide is actually close enough to read.
    if (mode === "desktop") desktopSwap(out, idx);
    else mobileSwap(out, idx);
    gsap.delayedCall(GUARD_DUR, () => { transitioning = false; });
  }

  function advanceAuto() {
    goTo((idx + 1) % N);
    armAutoplay();
  }

  function release(direction: "next" | "prev") {
    if (!locked) return;
    suppressEngage = true;
    teardownLock();
    const h = section!.getBoundingClientRect().height;
    gsap.to(window, {
      duration: 0.7, ease: "power2.inOut", overwrite: true,
      scrollTo: { y: direction === "next" ? `+=${h}` : `-=${h}`, autoKill: true },
      onComplete: () => {
        suppressEngage = false;
        // IntersectionObserver only fires on threshold crossings, not
        // continuously — if the user scrolled back into view during this
        // tween (rare, but possible), no new crossing event will follow,
        // so re-check directly rather than risk staying unlocked.
        const r = section!.getBoundingClientRect();
        const visible = Math.max(0, Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0)) / r.height;
        if (visible >= 0.9) setupLock();
      },
    });
  }

  function userAdvance() {
    registerInteraction();
    if (transitioning) return;
    if (idx === N - 1) release("next");
    else goTo(idx + 1);
  }
  function userRetreat() {
    registerInteraction();
    if (transitioning) return;
    if (idx === 0) release("prev");
    else goTo(idx - 1);
  }

  function onKeydown(e: KeyboardEvent) {
    const target = e.target as HTMLElement | null;
    if (target && /^(INPUT|TEXTAREA)$/.test(target.tagName)) return;
    if (target?.isContentEditable) return;
    if (e.key === "ArrowDown" || e.key === "ArrowRight") { e.preventDefault(); userAdvance(); }
    else if (e.key === "ArrowUp" || e.key === "ArrowLeft") { e.preventDefault(); userRetreat(); }
  }

  function setupLock() {
    if (locked) return;
    locked = true;
    const startY = window.scrollY;
    snapback = () => window.scrollTo(0, startY);
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    window.addEventListener("scroll", snapback);
    document.addEventListener("keydown", onKeydown);
    observerGesture = Observer.create({
      target: section!,
      type: "wheel,touch",
      preventDefault: true,
      tolerance: 10,
      dragMinimum: 60,
      onDown: userAdvance,
      onLeft: userAdvance,
      onUp: userRetreat,
      onRight: userRetreat,
    });
    if (mode === "desktop") startThreeTicker();
    armAutoplay();
  }

  function teardownLock() {
    if (!locked) return;
    locked = false;
    if (snapback) window.removeEventListener("scroll", snapback);
    snapback = null;
    document.documentElement.style.overflow = "";
    document.body.style.overflow = "";
    document.removeEventListener("keydown", onKeydown);
    observerGesture?.kill();
    observerGesture = null;
    stopThreeTicker();
    killTimers();
  }

  // clicking any same-page anchor link while locked (mega menu, footer,
  // kickoff CTA) needs to actually be able to scroll — overflow:hidden
  // would otherwise silently swallow smoothAnchors.ts's own scrollTo.
  document.addEventListener("click", (e) => {
    if (!locked) return;
    if ((e.target as HTMLElement).closest('a[href^="#"]')) teardownLock();
  });

  new IntersectionObserver(
    (entries) => {
      const entry = entries[0];
      // one-shot, not suppressEngage-gated — this has nothing to do with
      // the lock, it's the visitor scrolling into the section at all.
      if (entry.intersectionRatio >= 0.2) activateInitial();
      if (suppressEngage) return;
      if (entry.intersectionRatio >= 0.9) setupLock();
      else if (entry.intersectionRatio <= 0.1) teardownLock();
    },
    { threshold: [0, 0.1, 0.2, 0.9, 1] },
  ).observe(section);

  // test hook — mirrors hero.ts's exposed heroTimeline, lets Playwright
  // jump straight to a slide or force the lock off without burning real
  // gesture/timer time.
  (section as HTMLElement & { mgApi?: { goTo: (i: number) => void; forceUnlock: () => void } }).mgApi = {
    goTo,
    forceUnlock: () => { suppressEngage = true; teardownLock(); },
    activateInitial,
  };
}
