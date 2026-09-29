import { useGsap, prefersReducedMotion } from "./gsapSetup";

/**
 * The "Why a collective?" pink circle/arch on About — unlike a
 * one-time reveal (reveals.ts), this rides in continuously the whole
 * time the section is in view: 0 while still below the fold, 1 once
 * it's climbed to mid-screen. Damped/retargeted via a ScrollTrigger,
 * same "smooth scrub" recipe as cardsFan.ts's setupScrollFan() and
 * marketingConveyor.ts, replacing the source's raw per-frame smoothstep.
 */
export function setupWhyCollective() {
  const section = document.querySelector<HTMLElement>("[data-page-why]");
  if (!section) return;

  if (prefersReducedMotion()) {
    section.style.setProperty("--in", "1");
    return;
  }

  const { gsap, ScrollTrigger } = useGsap();
  const setIn = gsap.quickSetter(section, "--in") as (v: number) => void;
  const state = { in: 0 };

  ScrollTrigger.create({
    trigger: section,
    start: "top bottom",
    end: "top top",
    onUpdate: (self) => {
      gsap.to(state, { in: self.progress, duration: 0.4, ease: "power2.out", overwrite: true, onUpdate: () => setIn(state.in) });
    },
  });
}
