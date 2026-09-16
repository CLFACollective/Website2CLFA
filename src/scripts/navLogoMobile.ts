import { useGsap } from "./gsapSetup";

/**
 * On mobile the fixed nav wordmark stays visible everywhere except the
 * footer (which carries its own big wordmark already, so the fixed one
 * would be redundant clutter there). Desktop's timing (hero.ts's
 * `.is-gone` toggle) is unrelated and left alone; this only ever acts
 * below the 599px breakpoint, via its own `mobile-visible` class so the
 * two mechanisms can't fight over `.nav__logo`'s opacity.
 */
export function setupNavLogoMobile() {
  const logo = document.querySelector<HTMLElement>(".nav__logo");
  const footer = document.querySelector<HTMLElement>(".foot");
  if (!logo || !footer) return;

  const { ScrollTrigger } = useGsap();
  const mq = window.matchMedia("(max-width: 599px)");

  let atFooter = false;
  const apply = () => logo.classList.toggle("mobile-visible", mq.matches && !atFooter);

  mq.addEventListener("change", apply);

  ScrollTrigger.create({
    trigger: footer,
    start: "top bottom",
    end: "bottom top",
    onToggle: (self) => {
      atFooter = self.isActive;
      apply();
    },
  });

  apply();
}
