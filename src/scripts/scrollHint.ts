/**
 * A slim scroll bar for touch screens. Phones and tablets hide their
 * native scroll bar until a scroll is already under way, so on this
 * long, mostly full-screen page there was no sign of how much was left
 * or that there was more below. This one always shows (faintly): the
 * thumb's length is how much of the page is on screen, its position how
 * far down you are. Touch screens only (the CSS gates it on
 * pointer:coarse) — desktop has its own.
 */
export function setupScrollHint() {
  const bar = document.querySelector<HTMLElement>(".scrollhint");
  const thumb = bar?.querySelector<HTMLElement>("i");
  if (!bar || !thumb) return;

  let queued = false;
  const update = () => {
    queued = false;
    const doc = document.documentElement;
    const track = bar.clientHeight;
    const total = doc.scrollHeight;
    const view = window.innerHeight;
    if (total <= view + 1) { bar.style.opacity = "0"; return; }
    bar.style.opacity = "";
    const h = Math.max(28, (view / total) * track);
    const y = (window.scrollY / (total - view)) * (track - h);
    thumb.style.height = `${h.toFixed(1)}px`;
    thumb.style.transform = `translateY(${Math.max(0, Math.min(track - h, y)).toFixed(1)}px)`;
  };
  const queue = () => { if (!queued) { queued = true; requestAnimationFrame(update); } };

  window.addEventListener("scroll", queue, { passive: true });
  window.addEventListener("resize", queue);
  // pinned sections set their own heights after load — follow them
  new ResizeObserver(queue).observe(document.body);
  update();
}
