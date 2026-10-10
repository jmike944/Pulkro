"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";

/** Width of the edge fade that hints at content hidden beyond a horizontally scrolled strip. */
export const EDGE_FADE_PX = 36;

/**
 * Fades the edges of a horizontally scrolling strip, only on the sides that still have content beyond them
 * (nothing at all when the strip fits, as on desktop). Spread `style` on the scroller and attach `ref`.
 * The mask is measured before paint and re-measured on scroll, on resize and whenever the content's size changes.
 */
export function useEdgeFade<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);
  const [fade, setFade] = useState({ start: false, end: false });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const start = el.scrollLeft > 2;
    const end = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
    setFade((f) => (f.start === start && f.end === end ? f : { start, end }));
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.addEventListener("scroll", measure, { passive: true });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    // late font swaps and label changes resize the items without resizing the strip itself
    Array.from(el.children).forEach((c) => ro.observe(c));
    return () => {
      el.removeEventListener("scroll", measure);
      ro.disconnect();
    };
  }, [measure]);
  // Labels and counts change the strip's width without resizing the box: re-measure after every render, before paint.
  useLayoutEffect(measure);

  const stops = [fade.start ? `transparent, #000 ${EDGE_FADE_PX}px` : "#000", fade.end ? `#000 calc(100% - ${EDGE_FADE_PX}px), transparent` : "#000"].join(", ");
  const mask = fade.start || fade.end ? `linear-gradient(to right, ${stops})` : undefined;
  const style: CSSProperties = { maskImage: mask, WebkitMaskImage: mask };
  return { ref, style };
}
