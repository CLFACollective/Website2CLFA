/**
 * FAQ accordion — independent per-row toggling, any number open at
 * once (unlike Services, which is single-open). Plain click handler +
 * CSS grid-template-rows transition, same reasoning as
 * servicesAccordion.ts: a discrete state toggle doesn't need GSAP.
 */
export function setupQAAccordion() {
  const section = document.getElementById("faq-list");
  if (!section) return;

  section.querySelectorAll<HTMLElement>(".qa__row").forEach((row) => {
    const button = row.querySelector<HTMLButtonElement>(".qa__q");
    button?.addEventListener("click", () => {
      const open = button.getAttribute("aria-expanded") !== "true";
      row.toggleAttribute("data-open", open);
      button.setAttribute("aria-expanded", String(open));
    });
  });
}
