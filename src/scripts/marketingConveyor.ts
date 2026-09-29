import { useGsap, prefersReducedMotion } from "./gsapSetup";

/* Belt geometry, in design px — see MarketingForEquity.astro. The run
 * is one continuous pass: the belt travels at a constant rate from
 * +THROW to -THROW across the pin, so the designed arrangement happens
 * in passing at the midpoint rather than being stopped on. */
const THROW = 2200;

/**
 * The "conveyor" card band on What We Do. Desktop: a pinned section
 * whose scroll progress retargets a damped gsap.to() driving --d (the
 * shared belt displacement) — the same "smooth scrub" recipe as
 * cardsFan.ts's setupScrollFan(), replacing the source's hand-rolled
 * `shown += (target-shown)*EASE` rAF loop. Below 900px there's no pin
 * — each card arrives on its own account instead, via its own scrubbed
 * ScrollTrigger writing --p directly (consumed by a CSS smoothstep
 * chain, see the component's own mobile media query).
 */
export function setupMarketingForEquity() {
  const section = document.getElementById("equity");
  const frame = section?.querySelector<HTMLElement>(".mfe__frame");
  if (!section || !frame) return;

  const unit = () => frame.style.setProperty("--u", `${frame.clientWidth / 1920}px`);
  const ro = new ResizeObserver(unit);
  ro.observe(frame);
  unit();

  const cards = Array.from(section.querySelectorAll<HTMLElement>(".mfe__card"));
  const { gsap, ScrollTrigger } = useGsap();

  if (prefersReducedMotion()) {
    section.style.setProperty("--d", "0");
    section.style.setProperty("--dabs", "0");
    cards.forEach((c) => c.style.setProperty("--p", "1"));
    return;
  }

  const setD = gsap.quickSetter(section, "--d") as (v: number) => void;
  const setDAbs = gsap.quickSetter(section, "--dabs") as (v: number) => void;
  const state = { d: THROW };
  const paint = () => { setD(state.d); setDAbs(Math.abs(state.d)); };

  let desktopTrigger: ScrollTrigger | null = null;
  let cardTriggers: ScrollTrigger[] = [];

  const setupDesktop = () => {
    state.d = THROW;
    paint();
    desktopTrigger = ScrollTrigger.create({
      trigger: section,
      start: "top top",
      end: "bottom bottom",
      onUpdate: (self) => {
        const target = THROW * (1 - 2 * self.progress);
        gsap.to(state, { d: target, duration: 0.5, ease: "power2.out", overwrite: true, onUpdate: paint });
      },
    });
  };
  const teardownDesktop = () => {
    desktopTrigger?.kill();
    desktopTrigger = null;
    gsap.killTweensOf(state);
  };

  const setupMobile = () => {
    cards.forEach((card) => {
      cardTriggers.push(
        ScrollTrigger.create({
          trigger: card,
          start: "top 85%",
          end: "top 50%",
          scrub: true,
          onUpdate: (self) => card.style.setProperty("--p", self.progress.toFixed(4)),
        }),
      );
    });
  };
  const teardownMobile = () => {
    cardTriggers.forEach((t) => t.kill());
    cardTriggers = [];
    cards.forEach((c) => c.style.removeProperty("--p"));
  };

  const stackQuery = window.matchMedia("(max-width:900px)");
  let mobile = stackQuery.matches;
  if (mobile) setupMobile();
  else setupDesktop();

  stackQuery.addEventListener("change", (e) => {
    if (e.matches === mobile) return;
    mobile = e.matches;
    if (mobile) { teardownDesktop(); setupMobile(); }
    else { teardownMobile(); setupDesktop(); }
  });
}
