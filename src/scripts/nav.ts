import { useGsap } from "./gsapSetup";

/**
 * Nav + mega menu. The panel wipe and the staggered link list are a
 * single GSAP timeline (paused, scrubbed forward/back by play()/
 * reverse()) rather than a CSS-transition class toggle — that's what
 * lets the stagger and the clip-path wipe read as one choreographed
 * beat instead of two separately-timed CSS rules.
 */
export function setupNav() {
  const { gsap } = useGsap();
  const btn = document.getElementById("menuBtn");
  const label = btn?.querySelector<HTMLElement>(".menu-btn__label");
  const mega = document.getElementById("mega");
  const links = mega ? Array.from(mega.querySelectorAll<HTMLElement>(".mega__list li")) : [];
  if (!btn || !mega) return;

  gsap.set(mega, { autoAlpha: 0, clipPath: "inset(0% 0% 100% 0%)" });
  gsap.set(links, { autoAlpha: 0, y: 26 });

  const tl = gsap.timeline({ paused: true })
    .to(mega, { autoAlpha: 1, clipPath: "inset(0% 0% 0% 0%)", duration: 0.7, ease: "power3.inOut" })
    .to(links, { autoAlpha: 1, y: 0, duration: 0.55, ease: "power3.out", stagger: 0.07 }, 0.18);

  let open = false;
  const setMenu = (next: boolean) => {
    open = next;
    document.body.classList.toggle("menu-open", open);
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    if (label) label.textContent = open ? "Close" : "Menu";
    if (open) tl.play(); else tl.reverse();
    document.dispatchEvent(new CustomEvent("clfa:menu", { detail: { open } }));
  };

  btn.addEventListener("click", () => setMenu(!open));
  mega.addEventListener("click", (e) => {
    if ((e.target as HTMLElement).closest("a")) setMenu(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && open) setMenu(false);
  });
}
