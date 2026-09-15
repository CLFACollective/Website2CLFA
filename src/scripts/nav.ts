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
  const main = document.getElementById("main");
  const kickoff = document.getElementById("kickoff");
  if (!btn || !mega) return;

  gsap.set(mega, { autoAlpha: 0, clipPath: "inset(0% 0% 100% 0%)" });
  gsap.set(links, { autoAlpha: 0, y: 26 });

  let open = false;

  /* focusable() over a plain querySelectorAll — `.mega` is animated with
     autoAlpha/clip-path rather than display:none, so its links are
     always technically "in the DOM"; we only want the ones actually
     reachable right now. */
  const focusable = () =>
    Array.from(mega.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'));

  const tl = gsap.timeline({ paused: true })
    .to(mega, { autoAlpha: 1, clipPath: "inset(0% 0% 0% 0%)", duration: 0.7, ease: "power3.inOut" })
    .to(links, { autoAlpha: 1, y: 0, duration: 0.55, ease: "power3.out", stagger: 0.07 }, 0.18);

  /* The links themselves are autoAlpha-animated (visibility:hidden until
     their own staggered tween starts at +0.18s into the timeline) — a
     link the browser still considers invisible can't take focus, so the
     initial focus-into-the-dialog has to wait for the open tween to
     actually finish rather than fire the instant tl.play() returns. */
  tl.eventCallback("onComplete", () => {
    if (open) focusable()[0]?.focus();
  });

  let opener: HTMLElement | null = null;

  /* The rest of the page (everything the full-screen mega sits on top
     of) is marked inert while the menu is open — that alone keeps Tab
     from ever reaching it, so there's no separate trap-loop to hand-roll
     here; Tab simply runs out of focusable elements inside .nav/.mega
     and stops, exactly like a native <dialog>. */
  const setMenu = (next: boolean, opts: { restoreFocus?: boolean } = {}) => {
    if (next === open) return;
    open = next;
    document.body.classList.toggle("menu-open", open);
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    if (label) label.textContent = open ? "Close" : "Menu";
    if (open) tl.play(); else tl.reverse();

    if (main) main.inert = open;
    if (kickoff) kickoff.inert = open;

    if (open) {
      opener = document.activeElement as HTMLElement | null;
    } else if (opts.restoreFocus !== false) {
      (opener ?? btn).focus();
      opener = null;
    }

    document.dispatchEvent(new CustomEvent("clfa:menu", { detail: { open } }));
  };

  btn.addEventListener("click", () => setMenu(!open));
  mega.addEventListener("click", (e) => {
    if ((e.target as HTMLElement).closest("a")) setMenu(false, { restoreFocus: false });
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && open) setMenu(false);
  });

  /* Belt-and-suspenders: `inert` already keeps focus from leaving via
     Tab, but a screen reader's own virtual cursor (or a browser without
     `inert` support) doesn't obey it the same way — loop Tab within the
     dialog's own focusable set as a fallback. */
  mega.addEventListener("keydown", (e) => {
    if (e.key !== "Tab" || !open) return;
    const items = focusable();
    if (!items.length) return;
    const firstEl = items[0];
    const lastEl = items[items.length - 1];
    if (e.shiftKey && document.activeElement === firstEl) {
      e.preventDefault();
      lastEl.focus();
    } else if (!e.shiftKey && document.activeElement === lastEl) {
      e.preventDefault();
      firstEl.focus();
    }
  });
}
