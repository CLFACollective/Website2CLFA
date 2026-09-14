import { useEffect, useRef } from "react";

export function PinkCursor() {
  const dot = useRef<HTMLDivElement>(null);

  useEffect(() => {
    /* Only wire up on fine-pointer (mouse) devices */
    if (!window.matchMedia("(pointer: fine)").matches) return;

    const onMove = (e: MouseEvent) => {
      if (dot.current) {
        dot.current.style.transform = `translate(${e.clientX}px,${e.clientY}px)`;
        /* over a pink ground the pink dot would vanish — flip it to white */
        const under = document.elementFromPoint(e.clientX, e.clientY);
        const onPink = !!under?.closest('[data-cursor="invert"]');
        dot.current.style.background = onPink ? "#FFFCF5" : "#F06496";
      }
    };

    window.addEventListener("mousemove", onMove);
    return () => {
      window.removeEventListener("mousemove", onMove);
    };
  }, []);

  return (
    <div ref={dot} aria-hidden="true" style={{
      position: "fixed", top: 0, left: 0, zIndex: 99999,
      width: 24, height: 24, borderRadius: "50%",
      background: "#F06496",
      transform: "translate(-200px,-200px)",
      marginLeft: -12, marginTop: -12,
      pointerEvents: "none",
      willChange: "transform",
    }} />
  );
}
