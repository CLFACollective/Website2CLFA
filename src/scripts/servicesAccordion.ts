import { prefersReducedMotion } from "./gsapSetup";

/**
 * Services accordion on What We Do — single-open (opening a row closes
 * whichever was open). The open/close animation itself is plain CSS
 * (grid-template-rows 0fr→1fr, see the component's own <style>): a
 * discrete click-triggered toggle, not a continuous/scroll-driven
 * value, so it doesn't need GSAP — same category as this codebase's
 * other plain-CSS state toggles (e.g. .nav--tinted's color transition).
 * This script only owns the row-arrival reveal (IntersectionObserver,
 * since each row arrives on its own account rather than the section's
 * — the list runs nearly two screens tall) and the open/close state.
 */
export function setupServicesAccordion() {
  const section = document.getElementById("services");
  if (!section) return;

  const rows = Array.from(section.querySelectorAll<HTMLElement>(".svc__row"));

  rows.forEach((row) => {
    const button = row.querySelector<HTMLButtonElement>(".svc__button");
    button?.addEventListener("click", () => {
      const opening = button.getAttribute("aria-expanded") !== "true";
      rows.forEach((r) => {
        const b = r.querySelector<HTMLButtonElement>(".svc__button");
        const isThisRow = r === row;
        const open = isThisRow && opening;
        r.toggleAttribute("data-open", open);
        b?.setAttribute("aria-expanded", String(open));
      });
    });
  });

  if (prefersReducedMotion()) {
    rows.forEach((r) => r.dataset.in = "true");
    return;
  }

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        (entry.target as HTMLElement).dataset.in = "true";
        io.unobserve(entry.target);
      });
    },
    { rootMargin: "0px 0px -18% 0px", threshold: 0.15 },
  );
  rows.forEach((r) => io.observe(r));
}
