import { useEffect, useRef } from "react";
import { CLFA_LOGO_SYMBOL } from "./clfaLogo";
import { BlingField } from "./components/BlingField";
import { BrandInMotionCards } from "./components/BrandInMotionCards";
import { Ribbons } from "./components/Ribbons";
import { PinkCursor } from "./components/PinkCursor";
import { GridField } from "./components/GridField";
import { HeroOptionC } from "./components/HeroOptionC";
import { LogoScroller } from "./components/LogoScroller";

export default function App() {
  const winHeadRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const cleanups: Array<() => void> = [];

    /* Window A heading reveals like the "after day one" section. It gets its
       own observer with a lower threshold and no negative rootMargin, because
       the shared reveal observer's 0.25 threshold doesn't reliably fire for a
       heading centred inside the tall, overflow-hidden window frame. */
    const winHead = winHeadRef.current;
    if (winHead) {
      if (reduce) {
        winHead.classList.add("is-in");
      } else {
        const wio = new IntersectionObserver(
          (entries) => {
            entries.forEach((e) => {
              if (!e.isIntersecting) return;
              (e.target as HTMLElement).classList.add("is-in");
              wio.unobserve(e.target);
            });
          },
          { threshold: 0, rootMargin: "0px 0px -12% 0px" },
        );
        wio.observe(winHead);
        cleanups.push(() => wio.disconnect());
      }
    }

    /* ============================================================
       SCROLL CHOREOGRAPHY — pins, steps, parallax, count-ups
       ============================================================ */
    (function setupScroll() {
      const nav = document.getElementById("nav")!;


      const momPin = document.getElementById("momentum")!;
      const momTrack = document.getElementById("hsTrack");

      const rail = document.getElementById("rail");
      const railStops = Array.from(document.querySelectorAll<HTMLElement>(".rail__stop"));
      const dayCols = Array.from(document.querySelectorAll<HTMLElement>("#dayone .col"));
      const wins = Array.from(document.querySelectorAll<HTMLElement>("[data-win]"));
      const keep = document.querySelector<HTMLElement>("[data-keep]");
      const kickoff = document.getElementById("kickoff")!;
      const navLogo = document.querySelector<HTMLElement>(".nav__logo");
      const heroPin = document.getElementById("hero");
      const dayPin = document.getElementById("partnering");
      const motionPin = document.getElementById("motion");

      /* ---------- mega menu ---------- */
      const btn = document.getElementById("menuBtn")!;
      const label = btn.querySelector<HTMLElement>(".menu-btn__label")!;
      const mega = document.getElementById("mega")!;
      function setMenu(open: boolean) {
        document.body.classList.toggle("menu-open", open);
        btn.setAttribute("aria-expanded", open ? "true" : "false");
        label.textContent = open ? "Close" : "Menu";
      }
      const onBtn = () => setMenu(!document.body.classList.contains("menu-open"));
      const onMega = (e: Event) => {
        if ((e.target as HTMLElement).closest("a")) setMenu(false);
      };
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") setMenu(false);
      };
      btn.addEventListener("click", onBtn);
      mega.addEventListener("click", onMega);
      document.addEventListener("keydown", onKey);
      cleanups.push(() => {
        btn.removeEventListener("click", onBtn);
        mega.removeEventListener("click", onMega);
        document.removeEventListener("keydown", onKey);
        document.body.classList.remove("menu-open");
      });

      /* ---------- shimmer ---------- */
      if (!reduce) {
        const host = document.getElementById("shimmer")!;
        host.innerHTML = "";
        for (let i = 0; i < 22; i++) {
          const d = document.createElement("i");
          d.style.left = (Math.random() * 100).toFixed(2) + "vw";
          d.style.top = (Math.random() * 100).toFixed(2) + "svh";
          d.style.animationDelay = (Math.random() * 5.5).toFixed(2) + "s";
          d.style.color = Math.random() > 0.8 ? "var(--pink)" : "var(--fg)";
          host.appendChild(d);
        }
        cleanups.push(() => {
          host.innerHTML = "";
        });
      }

      function pinProgress(pin: HTMLElement) {
        const r = pin.getBoundingClientRect();
        const span = r.height - window.innerHeight;
        if (span <= 0) return 0;
        return Math.min(1, Math.max(0, -r.top / span));
      }
      function setStep(stage: HTMLElement, n: number) {
        if (stage.getAttribute("data-step") !== String(n)) stage.setAttribute("data-step", String(n));
      }

      function frame() {
        if (reduce) return;
        const vh = window.innerHeight;

        /* DAY ONE rail — now driven by the pinned section's scroll progress, so
           the stage holds full-screen while the timeline fills in. */
        if (rail && dayPin) {
          const dp = pinProgress(dayPin);
          const u = Math.min(1, Math.max(0, (dp - 0.12) / 0.62));
          /* dot positions: 1/6, 3/6, 5/6 of the rail (centres of the three columns) */
          const DOT_POS = [1/6, 3/6, 5/6];
          /* Remap the linear scroll so the ball travels to a dot, HOLDS there for
             a beat, then moves on — a plateau at each of the three stops. */
          const KX = [0, 0.12, 0.30, 0.42, 0.60, 0.72, 0.90, 1];
          const KY = [0, 1/6, 1/6, 3/6, 3/6, 5/6, 5/6, 1];
          let rp = 1;
          for (let k = 1; k < KX.length; k++) {
            if (u <= KX[k]) {
              const t = (u - KX[k - 1]) / (KX[k] - KX[k - 1]);
              rp = KY[k - 1] + t * (KY[k] - KY[k - 1]);
              break;
            }
          }
          rail.style.setProperty("--rp", rp.toFixed(4));
          /* a column activates the instant the ball parks on its dot */
          let active = -1;
          for (let k = 0; k < 3; k++) if (rp >= DOT_POS[k] - 0.002) active = k;
          dayCols.forEach((c, i) => {
            c.classList.toggle("on", i === active);
            /* Once the ball has reached a column, animate it in and keep it in —
               i <= active survives skipped frames so nothing disappears. */
            if (i <= active) {
              c.classList.add("is-rev");
              c.querySelector("p")?.classList.add("revealed");
            }
          });
          railStops.forEach((s, i) => s.classList.toggle("is-past", rp >= DOT_POS[i] - 0.002));
        }

        /* WINDOWS parallax */
        wins.forEach((w) => {
          const r = w.getBoundingClientRect();
          const pv = (vh / 2 - (r.top + r.height / 2)) / (vh / 2 + r.height / 2);
          w.style.setProperty("--pv", Math.max(-1, Math.min(1, pv)).toFixed(4));
        });

        if (keep) {
          const kr = keep.getBoundingClientRect();
          const kv = (vh / 2 - (kr.top + kr.height / 2)) / (vh / 2 + kr.height / 2);
          keep.style.setProperty("--kv", Math.max(-1, Math.min(1, kv)).toFixed(4));
        }

        /* MOMENTUM horizontal */
        if (momTrack) {
          const pRaw = pinProgress(momPin);
          const pp = Math.min(1, Math.max(0, (pRaw - 0.1) / 0.9));
          const dist = momTrack.scrollWidth - window.innerWidth;
          if (dist > 0) momTrack.style.transform = "translate3d(" + (-dist * pp).toFixed(1) + "px,0,0)";
        }

        /* Nav logo is held back only through the hero's opening beat — the
           rose prelude circle. The moment that circle has contracted away
           (just past the prelude, ~0.1 of the hero's scroll), the full-colour
           mark drops into the nav. */
        if (navLogo && heroPin) {
          const hr = heroPin.getBoundingClientRect();
          const hspan = hr.height - vh;
          const hp = hspan > 0 ? Math.min(1, Math.max(0, -hr.top / hspan)) : 1;
          navLogo.classList.toggle("is-gone", hp < 0.1);
        }

        const footer = document.querySelector("footer") || document.getElementById("contact");
        const nearFooter = footer ? footer.getBoundingClientRect().top < vh + 80 : false;
        /* hide the CTA while the brand-in-motion cards own the screen, bring it
           back once we've scrolled past that pinned section */
        const onMotion = motionPin
          ? (() => { const m = motionPin.getBoundingClientRect(); return m.top <= vh * 0.5 && m.bottom >= vh * 0.5; })()
          : false;
        kickoff.classList.toggle("is-on", window.scrollY > vh * 0.9 && !nearFooter && !onMotion);
      }

      let ticking = false;
      function onScroll() {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
          frame();
          ticking = false;
        });
      }
      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("resize", onScroll);
      window.addEventListener("load", onScroll);
      frame();
      cleanups.push(() => {
        window.removeEventListener("scroll", onScroll);
        window.removeEventListener("resize", onScroll);
        window.removeEventListener("load", onScroll);
      });

      /* ---------- reveals + count-up ---------- */
      function countUp(el: HTMLElement) {
        const target = parseFloat(el.getAttribute("data-count")!);
        const suffix = el.getAttribute("data-suffix") || "";
        const prefix = el.getAttribute("data-prefix") || "";
        if (reduce) {
          el.innerHTML = prefix + target + '<span class="unit">' + suffix + "</span>";
          return;
        }
        const t0 = performance.now();
        const dur = 1100;
        (function step(now: number) {
          const k = Math.min(1, (now - t0) / dur);
          const eased = 1 - Math.pow(1 - k, 3);
          el.innerHTML = prefix + Math.round(target * eased) + '<span class="unit">' + suffix + "</span>";
          if (k < 1) requestAnimationFrame(step);
        })(t0);
      }
      const io = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            if (!e.isIntersecting) return;
            const t = e.target as HTMLElement;
            t.classList.add("is-in");
            if (t.hasAttribute("data-count")) countUp(t);
            io.unobserve(t);
          });
        },
        { threshold: 0.25, rootMargin: "0px 0px -8% 0px" },
      );
      document.querySelectorAll<HTMLElement>(".reveal, .cloud, [data-count]").forEach((el) => io.observe(el));
      cleanups.push(() => io.disconnect());
    })();

    /* ============================================================
       SHADER BACKGROUND — "Mesh drift" WebGL, brand palette
       ============================================================ */
    if (!reduce) {
      (function setupShader() {
        const canvas = document.getElementById("shaderCanvas") as HTMLCanvasElement;
        if (!canvas) return;
        const gl = canvas.getContext("webgl", { antialias: false })!;
        if (!gl) {
          canvas.style.display = "none";
          return;
        }

        const VERT = "attribute vec2 a_position;\nvoid main(){ gl_Position = vec4(a_position, 0.0, 1.0); }";

        const FRAG = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform vec3 u_colors[8];
uniform vec4 u_scene;
uniform vec4 u_shape;
uniform vec4 u_surface;
uniform vec4 u_finish;
uniform vec4 u_transform;
uniform vec4 u_space;
uniform vec4 u_cursor;

#define u_resolution u_scene.xy
#define u_time u_scene.z
#define u_colorCount u_scene.w
#define u_scale u_shape.x
#define u_intensity u_shape.y
#define u_paramA u_shape.z
#define u_warp u_shape.w
#define u_detail u_surface.x
#define u_contrast u_surface.y
#define u_brightness u_surface.z
#define u_saturation u_surface.w
#define u_hue u_finish.x
#define u_vignette u_finish.y
#define u_blur u_finish.z
#define u_grain u_finish.w
#ifdef GL_FRAGMENT_PRECISION_HIGH
#define u_seed u_transform.x
#else
#define u_seed mod(u_transform.x, 31.0)
#endif
#define u_rotate u_transform.y
#define u_drift u_transform.z
#define u_oklab u_transform.w
#define u_offset u_space.xy
#define u_mouse u_space.zw
#define u_cursorPresence u_cursor.x
#define u_cursorEffect u_cursor.y
#define u_cursorStrength u_cursor.z
#define u_cursorRadius u_cursor.w

float hash21(vec2 p){
#ifndef GL_FRAGMENT_PRECISION_HIGH
  p = mod(p, 31.0);
#endif
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}
float grainHash(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float noise(vec2 p){
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
    mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
    u.y);
}
float fbm(vec2 p){
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++){
    v += a * noise(p);
    p = p * 2.03 + vec2(17.0, 9.2);
    a *= 0.5;
  }
  return v;
}
vec3 srgbToLinear(vec3 c){
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
}
vec3 linearToSrgb(vec3 c){
  return mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
vec3 linToOklab(vec3 c){
  float l = 0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b;
  float m = 0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b;
  float s = 0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b;
  l = pow(max(l, 0.0), 1.0 / 3.0);
  m = pow(max(m, 0.0), 1.0 / 3.0);
  s = pow(max(s, 0.0), 1.0 / 3.0);
  return vec3(
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s);
}
vec3 oklabToLin(vec3 c){
  float l = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z;
  float m = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z;
  float s = c.x - 0.0894841775 * c.y - 1.2914855480 * c.z;
  l = l * l * l; m = m * m * m; s = s * s * s;
  return vec3(
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s);
}
vec3 mixColour(vec3 a, vec3 b, float t){
  if (u_oklab > 0.5){
    vec3 la = linToOklab(srgbToLinear(a));
    vec3 lb = linToOklab(srgbToLinear(b));
    return clamp(linearToSrgb(oklabToLin(mix(la, lb, t))), 0.0, 1.0);
  }
  return mix(a, b, t);
}
vec3 palette(float x){
  float n = max(u_colorCount - 1.0, 1.0);
  float f = clamp(x, 0.0, 1.0) * n;
  vec3 col = u_colors[0];
  for (int i = 0; i < 7; i++){
    if (float(i) < n)
      col = mixColour(col, u_colors[i + 1], smoothstep(0.0, 1.0, clamp(f - float(i), 0.0, 1.0)));
  }
  return col;
}
vec3 hueRotate(vec3 col, float a){
  const mat3 toYIQ = mat3(0.299, 0.596, 0.211, 0.587, -0.274, -0.523, 0.114, -0.322, 0.312);
  const mat3 toRGB = mat3(1.0, 1.0, 1.0, 0.956, -0.272, -1.106, 0.621, -0.647, 1.703);
  vec3 yiq = toYIQ * col;
  float ca = cos(a), sa = sin(a);
  yiq = vec3(yiq.x, yiq.y * ca - yiq.z * sa, yiq.y * sa + yiq.z * ca);
  return toRGB * yiq;
}
vec3 shade(vec2 uv, vec2 p, float t){
  vec3 acc = u_colors[0] * 0.15;
  float total = 0.15;
  for (int i = 0; i < 8; i++){
    if (float(i) >= u_colorCount) break;
    float fi = float(i);
    vec2 c = vec2(
      sin(t * (0.21 + fi * 0.071) + fi * 2.4 + u_seed),
      cos(t * (0.17 + fi * 0.093) + fi * 1.7)) * (0.45 + u_intensity * 0.35);
    float w = exp(-dot(p - c, p - c) * 6.0);
    acc += u_colors[i] * w;
    total += w;
  }
  return acc / total;
}
void main(){
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  vec2 screenUv = uv;
  vec2 p = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / min(u_resolution.x, u_resolution.y);
  float cursorMask = 0.0;
  if (u_cursorPresence > 0.001){
    vec2 cursor = (0.5 * u_mouse * u_resolution.xy) / min(u_resolution.x, u_resolution.y);
    vec2 cursorDelta = p - cursor;
    if (u_cursorEffect < 0.5){
      p += cursor * u_cursorPresence * u_cursorStrength * 0.55;
    } else {
      float cursorDistance = length(cursorDelta);
      vec2 cursorDirection = cursorDelta / max(cursorDistance, 0.0001);
      cursorMask = u_cursorPresence * (1.0 - smoothstep(0.0, u_cursorRadius, cursorDistance));
      if (u_cursorEffect < 1.5){
        p -= cursorDirection * cursorMask * u_cursorStrength * 0.24;
      } else if (u_cursorEffect < 2.5){
        float cursorAngle = cursorMask * u_cursorStrength * 2.2;
        float cc = cos(cursorAngle), cs = sin(cursorAngle);
        p = cursor + mat2(cc, -cs, cs, cc) * cursorDelta;
      } else if (u_cursorEffect < 3.5){
        float ripple = sin(cursorDistance / max(u_cursorRadius, 0.001) * 18.0 - u_time * 5.0);
        p -= cursorDirection * ripple * cursorMask * u_cursorStrength * 0.07;
      }
    }
  }
  uv = p * min(u_resolution.x, u_resolution.y) / u_resolution.xy + 0.5;
  p *= u_scale;
  if (abs(u_rotate) > 0.0001){
    float cr = cos(u_rotate), sr = sin(u_rotate);
    p = mat2(cr, -sr, sr, cr) * p;
  }
  p += u_offset;
  if (u_drift > 0.0001)
    p += u_drift * vec2(sin(u_time * 0.31), cos(u_time * 0.23));
  if (u_warp > 0.0){
    p += u_warp * (vec2(fbm(p * u_detail + u_seed), fbm(p * u_detail + vec2(5.2, 1.3))) - 0.5);
  }
  vec3 col;
  if (u_blur > 0.0){
    float e = u_blur;
    float pe = e * u_scale;
    vec2 uvE = vec2(e) * min(u_resolution.x, u_resolution.y) / u_resolution.xy;
    col  = shade(uv, p, u_time) * 0.36;
    col += shade(uv + vec2(uvE.x, 0.0), p + vec2(pe, 0.0), u_time) * 0.16;
    col += shade(uv - vec2(uvE.x, 0.0), p - vec2(pe, 0.0), u_time) * 0.16;
    col += shade(uv + vec2(0.0, uvE.y), p + vec2(0.0, pe), u_time) * 0.16;
    col += shade(uv - vec2(0.0, uvE.y), p - vec2(0.0, pe), u_time) * 0.16;
  } else {
    col = shade(uv, p, u_time);
  }
  if (abs(u_contrast - 1.0) > 0.0001)
    col = (col - 0.5) * u_contrast + 0.5;
  if (abs(u_saturation - 1.0) > 0.0001){
    float luma = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(luma), col, u_saturation);
  }
  if (abs(u_hue) > 0.0001) col = hueRotate(col, u_hue);
  if (abs(u_brightness) > 0.0001) col += u_brightness;
  if (u_vignette > 0.0001){
    float vd = length(screenUv - 0.5) * 1.41421356;
    col *= 1.0 - u_vignette * smoothstep(0.35, 1.0, vd);
  }
  if (u_cursorPresence > 0.001 && u_cursorEffect > 3.5)
    col += (vec3(0.18) + col * 0.12) * cursorMask * u_cursorStrength;
  if (u_grain > 0.0001)
    col += (grainHash(gl_FragCoord.xy + vec2(u_seed * 17.0, u_seed * 31.0)) - 0.5) * u_grain;
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

        const U = {
          colors: [
            [1.0, 0.980392, 0.960784],
            [0.988, 0.847, 0.878],
            [0.953, 0.651, 0.769],
            [0.976, 0.784, 0.843],
          ] as number[][],
          colorCount: 4,
          scale: 1.3, intensity: 0.62, paramA: 0.67, warp: 0.192,
          detail: 2.016, contrast: 1.1, brightness: 0.0, saturation: 1.4,
          hue: 0.0, vignette: 0.18, blur: 0.0072, grain: 0.055,
          seed: 5069.0, rotate: 2.7227, offsetX: 0.09, offsetY: 0.15, drift: 0.148,
          cursorEnabled: true, cursorEffect: 2.0, cursorStrength: 0.73, cursorRadius: 0.365,
          oklab: 0.0, timeScale: -0.55,
        };

        function compile(type: number, src: string) {
          const sh = gl.createShader(type)!;
          gl.shaderSource(sh, src);
          gl.compileShader(sh);
          return sh;
        }
        const program = gl.createProgram()!;
        const vs = compile(gl.VERTEX_SHADER, VERT);
        const fs = compile(gl.FRAGMENT_SHADER, FRAG);
        gl.attachShader(program, vs);
        gl.attachShader(program, fs);
        gl.linkProgram(program);
        gl.deleteShader(vs);
        gl.deleteShader(fs);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
          canvas.style.display = "none";
          return;
        }
        gl.useProgram(program);

        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        const posLoc = gl.getAttribLocation(program, "a_position");
        gl.enableVertexAttribArray(posLoc);
        gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

        const u = (n: string) => gl.getUniformLocation(program, n);
        const uni = {
          colors: u("u_colors"), scene: u("u_scene"), shape: u("u_shape"),
          surface: u("u_surface"), finish: u("u_finish"), transform: u("u_transform"),
          space: u("u_space"), cursor: u("u_cursor"),
        };

        const flat: number[] = [];
        for (let i = 0; i < 8; i++) {
          const c = U.colors[i] || U.colors[U.colors.length - 1];
          flat.push(c[0], c[1], c[2]);
        }
        gl.uniform3fv(uni.colors, new Float32Array(flat));
        gl.uniform4f(uni.shape, U.scale, U.intensity, U.paramA, U.warp);
        gl.uniform4f(uni.surface, U.detail, U.contrast, U.brightness, U.saturation);
        gl.uniform4f(uni.finish, U.hue, U.vignette, U.blur, U.grain);
        gl.uniform4f(uni.transform, U.seed, U.rotate, U.drift, U.oklab);
        gl.uniform4f(uni.cursor, 0, U.cursorEffect, U.cursorStrength, U.cursorRadius);

        let targetX = 0, targetY = 0, targetPresence = 0, mouseX = 0, mouseY = 0, presence = 0;
        let pointerKnown = false, pcx = 0, pcy = 0;
        let bounds = canvas.getBoundingClientRect();
        let raf = 0, lastNow: number | null = null;
        let visible = document.visibilityState === "visible", inView = true;
        const start = performance.now();

        function resize() {
          const dpr = Math.min(window.devicePixelRatio || 1, 2);
          const rw = Math.max(1, Math.round(bounds.width * dpr));
          const rh = Math.max(1, Math.round(bounds.height * dpr));
          const s = Math.min(1, Math.sqrt(2000000 / Math.max(1, rw * rh)));
          const w = Math.max(1, Math.round(rw * s)), h = Math.max(1, Math.round(rh * s));
          if (canvas.width !== w || canvas.height !== h) {
            canvas.width = w;
            canvas.height = h;
            gl.viewport(0, 0, w, h);
          }
        }
        function req() {
          if (visible && inView && raf === 0) raf = requestAnimationFrame(render);
        }
        function updatePointer() {
          if (!pointerKnown || !bounds.width || !bounds.height) return;
          const inside = pcx >= bounds.left && pcx <= bounds.right && pcy >= bounds.top && pcy <= bounds.bottom;
          if (!inside) {
            targetPresence = 0;
            req();
            return;
          }
          const nx = ((pcx - bounds.left) / bounds.width) * 2 - 1;
          const ny = -(((pcy - bounds.top) / bounds.height) * 2 - 1);
          if (targetPresence === 0 && presence < 0.01) {
            mouseX = nx;
            mouseY = ny;
          }
          targetX = nx;
          targetY = ny;
          targetPresence = 1;
          req();
        }
        function layout() {
          bounds = canvas.getBoundingClientRect();
          resize();
          updatePointer();
          req();
        }

        const onPointerMove = (e: PointerEvent) => {
          pointerKnown = true;
          pcx = e.clientX;
          pcy = e.clientY;
          bounds = canvas.getBoundingClientRect();
          updatePointer();
        };
        const onBlur = () => {
          pointerKnown = false;
          targetPresence = 0;
          req();
        };
        const onVisibility = () => {
          visible = document.visibilityState === "visible";
          if (visible) req();
          else if (raf) {
            cancelAnimationFrame(raf);
            raf = 0;
            lastNow = null;
          }
        };
        window.addEventListener("resize", layout);
        window.addEventListener("scroll", layout, true);
        window.addEventListener("pointermove", onPointerMove, { passive: true });
        window.addEventListener("blur", onBlur);
        document.addEventListener("visibilitychange", onVisibility);

        const ro = new ResizeObserver(layout);
        ro.observe(canvas);
        const iov = new IntersectionObserver((e) => {
          inView = e[0] ? e[0].isIntersecting : true;
          if (inView) req();
          else if (raf) {
            cancelAnimationFrame(raf);
            raf = 0;
            lastNow = null;
          }
        });
        iov.observe(canvas);

        function render(now: number) {
          raf = 0;
          if (!visible || !inView) return;
          const dt = lastNow === null ? 0 : Math.min((now - lastNow) / 1000, 0.1);
          lastNow = now;
          const follow = 1 - Math.exp(-12 * dt);
          mouseX += (targetX - mouseX) * follow;
          mouseY += (targetY - mouseY) * follow;
          presence += (targetPresence - presence) * follow;
          resize();
          gl.uniform4f(uni.scene, canvas.width, canvas.height, ((now - start) / 1000) * U.timeScale, U.colorCount);
          gl.uniform4f(uni.space, U.offsetX, U.offsetY, mouseX, mouseY);
          gl.uniform4f(uni.cursor, U.cursorEnabled ? presence : 0, U.cursorEffect, U.cursorStrength, U.cursorRadius);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
          const settling =
            Math.abs(targetX - mouseX) > 0.001 ||
            Math.abs(targetY - mouseY) > 0.001 ||
            Math.abs(targetPresence - presence) > 0.001;
          if (Math.abs(U.timeScale) > 0.0001 || settling) req();
          else lastNow = null;
        }
        layout();

        cleanups.push(() => {
          if (raf) cancelAnimationFrame(raf);
          window.removeEventListener("resize", layout);
          window.removeEventListener("scroll", layout, true);
          window.removeEventListener("pointermove", onPointerMove);
          window.removeEventListener("blur", onBlur);
          document.removeEventListener("visibilitychange", onVisibility);
          ro.disconnect();
          iov.disconnect();
          gl.deleteProgram(program);
          gl.deleteBuffer(buf);
        });
      })();
    }

    return () => {
      cleanups.forEach((fn) => fn());
    };
  }, []);

  return (
    <>
      <PinkCursor />
      {/* CLFA logo, supplied SVG. .m takes the surrounding text colour, .dot stays pink. */}
      <div aria-hidden="true" dangerouslySetInnerHTML={{ __html: `<svg width="0" height="0" style="position:absolute">${CLFA_LOGO_SYMBOL}</svg>` }} />

      <nav className="nav" id="nav">
        <a className="nav__logo" href="#top" aria-label="CLFA Collective home">
          <svg className="clfa" viewBox="0 0 184 86">
            <use href="#clfa-logo" />
          </svg>
        </a>
        <button className="menu-btn" id="menuBtn" aria-expanded={false} aria-controls="mega" aria-label="Menu">
          <span className="menu-btn__label">Menu</span>
          <span className="menu-btn__bars" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        </button>
      </nav>

      <div className="mega" id="mega">
        <ul className="mega__list">
          <li>
            <a className="mega__link" href="#motion">
              <span className="no">01</span> What we do
            </a>
          </li>
          <li>
            <a className="mega__link" href="#who">
              <span className="no">02</span> Meet the collective
            </a>
          </li>
          <li>
            <a className="mega__link" href="#partnering">
              <span className="no">03</span> FAQs
            </a>
          </li>
          <li>
            <a className="mega__link" href="#contact">
              <span className="no">04</span> Let’s go
            </a>
          </li>
        </ul>
        <div className="mega__aside">
          <div>
            <p className="eyebrow">Is it go time?</p>
            <p>Give us all the details, or just enough to get started. Either way, we’ll take it from here.</p>
          </div>
          <div>
            <p className="eyebrow">Direct</p>
            <p>
              <a className="plain" href="#contact">hello@clfacollective.com</a>
              <br />
              <a className="plain" href="#contact">LinkedIn</a>
            </p>
          </div>
        </div>
      </div>

      <a className="kickoff" href="#contact" id="kickoff">Ready to kick off?</a>

      {/* ===================== 1 · HERO ===================== */}
      <HeroOptionC />

      {/* ===================== DARK ACT ===================== */}
      <div className="act" id="act">
        <div className="shimmer" aria-hidden="true" id="shimmer" />

        {/* ===================== 2 · BRAND IN MOTION ===================== */}
        <BrandInMotionCards />

        {/* ===================== RIBBONS ===================== */}
        <Ribbons />

        {/* ===================== WINDOW A ===================== */}
        <section className="win win--flat" data-win="">
          <div className="win__frame" style={{ background: "#506E78", color: "#FFFAF5" }}>
            <GridField />
            <div className="win__copy" style={{ color: "#FFFAF5" }}>
              <h2 ref={winHeadRef} className="reveal" style={{ fontSize: "clamp(40px, 9.4vw, 120px)" }}>
                Here’s what partnering with us is{" "}
                <span className="bd" style={{ color: "#FFA235", fontWeight: 800, letterSpacing: 0 }}>
                  actually like.
                </span>
              </h2>
            </div>
          </div>
        </section>

        {/* ===================== 3 · DAY ONE ===================== */}
        {/* Pinned full-screen like the brand-in-motion section: the section is
            a tall scroll track, and the stage holds full-screen while the rail
            timeline fills in, driven by the section's scroll progress. */}
        <section className="sec sec--slate pinday" id="partnering">
          <div className="pinday__stage">
            <BlingField />
            <div className="sec__inner">
              <h2 className="sec__head reveal" style={{ maxWidth: "15ch" }}>
                <span className="bd">Day one.</span> And the training wheels are <span className="bd hot" style={{ fontWeight: 900 }}>already off.</span>
              </h2>

              <div className="rail" id="rail">
                <span className="rail__fill" />
                <i className="rail__stop" style={{ left: "16.6%" }} />
                <i className="rail__stop" style={{ left: "50%" }} />
                <i className="rail__stop" style={{ left: "83.3%" }} />
                <i className="rail__ball" />
              </div>

              <div className="cols3" id="dayone">
                <div className="col">
                  <h3>Fast starts</h3>
                  <p>Quality deliverables in days, not weeks. We’re moving before the ink on the SOW dries.</p>
                </div>
                <div className="col">
                  <h3>No hand-holding required</h3>
                  <p>Our team has seen it all. We orient ourselves.</p>
                </div>
                <div className="col">
                  <h3>Strategy baked in from day one</h3>
                  <p>We don’t execute first and think later.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ===================== 3b · DON'T LET UP ===================== */}
        <section className="sec sec--forest keepup" data-keep="" style={{ background: "#344338", color: "#FFFAF5" }}>
          <GridField />
          <div className="sec__inner">
            <h2 className="keepup__big reveal">
              And after day one? <span className="bd" style={{ fontWeight: 800, letterSpacing: 0, color: "var(--flare)" }}>We don’t let up.</span>
            </h2>
            <p className="keepup__body reveal" style={{ fontSize: "48px", lineHeight: "55px", opacity: 1 }}>
              We&rsquo;re not a sprint team. (Well. We&rsquo;re not just a sprint team.) We&rsquo;re built to roll out cohesive systems of work without losing speed.
            </p>
          </div>
        </section>

        {/* ===================== 4 · MOMENTUM ===================== */}
        <section className="pin" id="momentum">
          <div className="pin__stage">
            <BlingField />
            <div className="hs__spine" aria-hidden="true">
              <span>MOMENTUM</span>
            </div>

            <div className="hs__head">
              <h2 className="hs__intro-head">
                <span className="bd">Measurable<br /><span className="hot" style={{ fontWeight: 900, lineHeight: .85, display: "block" }}>momentum.</span></span>
              </h2>
            </div>

            <div className="hs__track" id="hsTrack">
              <div className="hs__panel hs__panel--stat">
                <div className="hs__rule" />
                <p className="mfig" data-count="100" data-suffix="%" style={{ letterSpacing: "-3px" }}>
                  0<span className="unit">%</span>
                </p>
                <p className="mcap" style={{ fontWeight: 600 }}>On time-delivery</p>
                <h4 style={{ lineHeight: "24px" }}>Launches that actually launch. On time.</h4>
              </div>

              <div className="hs__panel hs__panel--stat">
                <div className="hs__rule" />
                <p className="mfig" data-count="4" data-prefix="$" data-suffix="M" style={{ letterSpacing: "-3px" }}>
                  $0<span className="unit">M</span>
                </p>
                <p className="mcap" style={{ fontWeight: 600 }}>Sales pipeline in 4 months</p>
                <h4 style={{ lineHeight: "24px" }}>Metrics-busting content<br />and paid.</h4>
              </div>

              <div className="hs__panel hs__panel--stat">
                <div className="hs__rule" />
                <p className="mfig" data-count="150" data-suffix="+" style={{ letterSpacing: "-1px" }}>
                  0<span className="unit">+</span>
                </p>
                <p className="mcap" style={{ fontWeight: 600 }}>RSVPs to an Ontologies insider talk</p>
                <h4 style={{ lineHeight: "24px" }}>Webinars so successful we need crowd control.</h4>
              </div>

              <div className="hs__panel hs__panel--quote">
                <div className="mquote__wrap">
                  <span className="mquote__badge" aria-hidden="true">
                    <svg viewBox="0 0 112 112" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <g clipPath="url(#clip0_2838_2564)">
                        <path d="M0 56C0 25.0721 25.0721 0 56 0C86.9279 0 112 25.0721 112 56C112 86.9279 86.9279 112 56 112C25.0721 112 0 86.9279 0 56Z" fill="#BE7837" />
                        <path d="M70.0776 83.824L63.1196 77.65C64.6223 76.9967 66.6476 75.7227 69.1956 73.828C71.809 71.868 74.161 69.5487 76.2516 66.87C78.3423 64.1913 79.3876 61.382 79.3876 58.442C78.7996 59.0953 77.7216 59.618 76.1536 60.01C74.651 60.402 73.1156 60.598 71.5476 60.598C68.3463 60.598 65.3083 59.3567 62.4336 56.874C59.6243 54.326 58.2196 50.4387 58.2196 45.212C58.2196 39.4627 59.951 34.9547 63.4136 31.688C66.8763 28.356 71.123 26.69 76.1536 26.69C81.315 26.69 85.5943 28.4867 88.9916 32.08C92.4543 35.6733 94.1856 40.9653 94.1856 47.956C94.1856 53.9667 93.0096 59.324 90.6576 64.028C88.371 68.732 85.3983 72.75 81.7396 76.082C78.1463 79.3487 74.259 81.9293 70.0776 83.824ZM25.4876 83.824L18.4316 77.65C19.9343 76.9967 21.9596 75.7227 24.5076 73.828C27.121 71.868 29.473 69.5487 31.5636 66.87C33.6543 64.1913 34.6996 61.382 34.6996 58.442C34.1116 59.0953 33.0336 59.618 31.4656 60.01C29.963 60.402 28.4603 60.598 26.9576 60.598C23.691 60.598 20.6203 59.3567 17.7456 56.874C14.9363 54.326 13.5316 50.4387 13.5316 45.212C13.5316 39.4627 15.263 34.9547 18.7256 31.688C22.1883 28.356 26.435 26.69 31.4656 26.69C36.627 26.69 40.9063 28.4867 44.3036 32.08C47.7663 35.6733 49.4976 40.9653 49.4976 47.956C49.4976 53.9667 48.3543 59.324 46.0676 64.028C43.781 68.732 40.8083 72.75 37.1496 76.082C33.491 79.3487 29.6036 81.9293 25.4876 83.824Z" fill="#FFFAF5" />
                      </g>
                      <defs>
                        <clipPath id="clip0_2838_2564">
                          <path d="M0 56C0 25.0721 25.0721 0 56 0C86.9279 0 112 25.0721 112 56C112 86.9279 86.9279 112 56 112C25.0721 112 0 86.9279 0 56Z" fill="white" />
                        </clipPath>
                      </defs>
                    </svg>
                  </span>
                  <blockquote className="mquote" style={{ fontSize: "clamp(26px,4.2vw,64px)" }}>
                    <span className="mquote__l1">They move</span>
                    <span className="mquote__l2">at the speed</span>
                    <span className="mquote__l3">of business</span>
                  </blockquote>
                  <p className="mquote__by">—Nicole</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ===================== 5 · WHO TAGS US IN ===================== */}
        <section className="sec sec--slate" id="who">
          <div className="sec__inner">
            <div className="who__top">
              <h2 className="sec__head reveal" style={{ margin: 0 }}>
                <span style={{ color: "#BE7837", fontFamily: "'Lora', Georgia, serif", fontStyle: "italic" }}>Who</span>{" "}
                <span style={{ color: "var(--charcoal)" }}>tags us in.</span>
              </h2>
              <p className="reveal" style={{ transitionDelay: ".12s", padding: "4px" }}>
                They’re healthcare and tech marketing. Equity-backed.
                Some are pre-launch. Some are post-acquisition.{" "}
                <span className="bd">All of them are moving fast.</span>
              </p>
            </div>

            <LogoScroller speed="42s" />
            <div style={{ height: "clamp(14px,1.8vw,26px)" }} />
            <LogoScroller speed="52s" reverse />
          </div>
        </section>

        {/* ===================== WINDOW B ===================== */}
        <section style={{ background: "#FFFCF5", overflow: "hidden", padding: "clamp(24px,3vw,48px) 0 0" }}>
          <div className="archB reveal" data-cursor="invert" style={{
            width: "100%",
            aspectRatio: "2 / 1",
            borderRadius: "50% 50% 0 0 / 100% 100% 0 0",
            background: "var(--rose)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}>
            <div style={{ color: "#FFFAF5", textAlign: "center", padding: "0 clamp(32px,10vw,160px)" }}>
              <h2 className="wev__head" style={{
                margin: 0, color: "#FFFAF5", letterSpacing: "-.025em", lineHeight: 1.04,
              }}>
                <span className="wev__lead" style={{
                  display: "block", fontWeight: 300, letterSpacing: "-.02em",
                  fontSize: "clamp(38px,5.6vw,88px)",
                }}>Whatever you've got,</span>
                <span style={{
                  display: "block", fontWeight: 800, letterSpacing: "-.03em", lineHeight: 1.0,
                  fontSize: "clamp(52px,8.1vw,128px)",
                }}>we've done more<br />with less.</span>
              </h2>
            </div>
          </div>
        </section>

        {/* ===================== FOOTER ===================== */}
        <footer className="foot" id="contact" style={{ background: "#232323" }}>
          <div className="foot__inner">
            <div className="foot__top">
              <div className="foot__brand">
                <svg className="clfa foot__logo" viewBox="0 0 184 86">
                  <use href="#clfa-logo" />
                </svg>
                <p className="foot__go">
                  Is it <span className="bd" style={{ color: "var(--pink)", fontFamily: "'Lora', Georgia, serif", fontStyle: "italic", letterSpacing: 0 }}>go time?</span>
                </p>
                <a className="btn btn--fill" href="#contact">Ready for kickoff</a>
              </div>
              <nav className="foot__nav">
                <p className="eyebrow">Explore</p>
                <a href="#motion">What we do</a>
                <a href="#partnering">How we work</a>
                <a href="#who">Who we work with</a>
                <a href="#momentum">Results</a>
              </nav>
              <div className="foot__contact">
                <p className="eyebrow">Get in touch</p>
                <a href="#">hello@clfacollective.com</a>
                <a href="#">LinkedIn</a>
              </div>
            </div>
            <div className="foot__row">
              <p>© 2026 CLFA Collective</p>
              <p>Draft R21 light · landing page only</p>
            </div>
          </div>
        </footer>
      </div>
      {/* /act */}
    </>
  );
}
