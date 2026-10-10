"use client";

import { useLayoutEffect, useRef, useState } from "react";

/**
 * True while the referenced element is at least `min` px wide. Mirrors a Tailwind `@min-[…]` container query
 * for the one case CSS can't express: mounting a different tree (so the order rail's map mounts once, not twice).
 * Measured before paint, so there is no flash of the narrow layout on wide screens.
 */
export function useMinWidth<T extends HTMLElement>(min: number) {
  const ref = useRef<T>(null);
  const [wide, setWide] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWide(el.clientWidth >= min));
    ro.observe(el);
    setWide(el.clientWidth >= min);
    return () => ro.disconnect();
  }, [min]);
  return [ref, wide] as const;
}
