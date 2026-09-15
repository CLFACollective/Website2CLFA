import { useGsap } from "./gsapSetup";

/**
 * On mobile the fixed nav wordmark stays out of the way for most of the
 * scroll (there's no room for it next to the burger, and it would sit
 * on top of every section's own content) — it only surfaces at the very
 * top of the page and again once the footer comes into view. Desktop's
 * timing (hero.ts's `.is-gone` toggle) is unrelated and left alone; this
 * only ever acts below the 599px breakpoint, via its own `mobile-visible`
 * class so the two mechanisms can't fight over `.nav__logo`'s opacity.
 */
export function setupNavLogoMobile() {
  const logo = document.querySelector<HTMLElement>(".nav__logo");
  const footer = document.querySelector<HTMLElement>(".foot");
  if (!logo || !footer) return;

  const { ScrollTrigger } = useGsap();
  const mq = window.matchMedia("(max-width: 599px)");

  let atTop = window.scrollY < 4;
  let atFooter = false;
  const apply = () => logo.classList.toggle("mobile-visible", mq.matches && (atTop || atFooter));

  const onScroll = () => {
    atTop = window.scrollY < 4;
    apply();
  };
  window.addEventListener("scroll", onScroll, { passive: true });
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
