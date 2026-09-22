import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ScrollToPlugin } from "gsap/ScrollToPlugin";
import { Observer } from "gsap/Observer";

let registered = false;
export function useGsap() {
  if (!registered) {
    gsap.registerPlugin(ScrollTrigger, ScrollToPlugin, Observer);
    registered = true;
  }
  return { gsap, ScrollTrigger, Observer };
}

export const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
