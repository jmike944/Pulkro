"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";

/**
 * The page's scroll container.
 *
 * From `lg` (1024 px, where the sidebar shows) the shell is exactly one viewport tall and the white work panel stays put:
 * its content scrolls inside this element (`#main-scroll`), never the document. Below `lg` the element is a plain block and
 * the document scrolls as usual (iOS keeps its collapsing address bar and tap-status-bar-to-top).
 *
 * Code that reads or listens to scrolling must not assume `window` — use the helpers below, which are right in both modes:
 * `scrollIntoView()` already works in both (it scrolls the nearest scroller); sticky offsets resolve against whichever scrolls
 * (size them with `--pk-pane-h`, see `app-shell.tsx`).
 */
export const MAIN_SCROLL_ID = "main-scroll";

export function getMainScroller(): HTMLElement | null {
  return typeof document === "undefined" ? null : document.getElementById(MAIN_SCROLL_ID);
}

/** True while the main scroller (not the window) is what scrolls the page — i.e. from `lg` up. */
export function isMainScrollInner(): boolean {
  const el = getMainScroller();
  return !!el && getComputedStyle(el).overflowY !== "visible";
}

/** The visible scrolling viewport in client coordinates: the scroller's box from `lg`, the window below. */
export function getScrollport(): { top: number; height: number } {
  const el = getMainScroller();
  if (el && isMainScrollInner()) {
    const r = el.getBoundingClientRect();
    return { top: r.top, height: r.height };
  }
  return { top: 0, height: window.innerHeight };
}

/**
 * Calls `fn` whenever the page scrolls or the viewport resizes, whichever element does the scrolling (the main scroller
 * from `lg`, the window below — and it keeps working when a resize crosses that line). Returns the unsubscribe function.
 */
export function onMainScroll(fn: () => void): () => void {
  const el = getMainScroller();
  window.addEventListener("scroll", fn, { passive: true });
  window.addEventListener("resize", fn);
  el?.addEventListener("scroll", fn, { passive: true });
  return () => {
    window.removeEventListener("scroll", fn);
    window.removeEventListener("resize", fn);
    el?.removeEventListener("scroll", fn);
  };
}

/** Whether the URL hash points at an element on the page (Next scrolls it into view itself on navigation). */
function hashTargetExists(): boolean {
  const raw = window.location.hash.slice(1);
  if (!raw) return false;
  let id = raw;
  try {
    id = decodeURIComponent(raw);
  } catch {
    /* keep the raw value */
  }
  return !!(document.getElementById(id) ?? document.getElementsByName(id)[0]);
}

/**
 * Renders the scroller (`className` carries the padding and the `lg:` sizing) and owns what the document used to do for free:
 *  - navigation to another page starts at the top (Next only resets the window; the search params alone — `?tab=`, `?w=`, `?i=` —
 *    are in-page state and leave the position alone), unless the URL has a `#anchor` that exists, which Next scrolls to;
 *  - keyboard scrolling (PageDown, Space, arrows, Home/End) needs focus inside the scroller, so on desktop it takes focus
 *    (without scrolling) after a navigation, unless the person is keyboard-navigating elsewhere or typing.
 */
export function MainScroller({ className, children }: { className?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  // Layout effect, so the reset lands in the same commit as the new page (no frame at the old offset). It runs after Next's own
  // scroll handler (a child), whose scrollIntoView() would otherwise leave the page's first element glued to the panel's edge.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || hashTargetExists()) return;
    el.scrollTop = 0;
  }, [pathname]);

  useEffect(() => {
    const el = ref.current;
    if (!el || !isMainScrollInner()) return;
    const active = document.activeElement as HTMLElement | null;
    // A focused element that is gone (the link that was clicked sits on the page that just got hidden) is no focus at all.
    const kept = !!active && active !== document.body && active.getClientRects().length > 0;
    // Inside the page, in a dialog, or reached by keyboard (sidebar link + Enter): leave the focus where it is.
    if (kept && (el.contains(active) || active.closest('[role="dialog"], [role="alertdialog"]') || active.matches(":focus-visible"))) return;
    el.focus({ preventScroll: true });
  }, [pathname]);

  return (
    // layoutScroll: motion's layout animations must know this element scrolls (the window is accounted for already).
    <motion.div ref={ref} id={MAIN_SCROLL_ID} tabIndex={-1} layoutScroll className={className}>
      {children}
    </motion.div>
  );
}
