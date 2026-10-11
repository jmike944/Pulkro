"use client";

import { useState } from "react";

/**
 * Number of times `open` has gone from false to true.
 *
 * Key a form on it (`{session > 0 && <Form key={session} open={open} />}`) so its state starts fresh on every open
 * while the closed modal stays mounted for its exit animation. Written with the "adjust state while rendering"
 * pattern, so the first open already renders session 1 (no extra paint with stale state).
 */
export function useOpenSession(open: boolean) {
  const [seen, setSeen] = useState({ open: false, session: 0 });
  if (seen.open !== open) setSeen({ open, session: open ? seen.session + 1 : seen.session });
  return seen.session;
}

/**
 * Footer buttons of the scheduling / crew modals. On phones (the modal is a FlowScreen) the primary action is the
 * 54px navy BigButton of the other flows; from lg it is the regular 44px dialog button.
 */
export const FOOTER_PRIMARY =
  "h-11 gap-2 rounded-[12px] px-5 text-[14px] font-semibold max-lg:h-[54px] max-lg:rounded-[14px] max-lg:text-[17px] max-lg:[&_svg:not([class*='size-'])]:size-5";
export const FOOTER_SECONDARY =
  "h-11 gap-2 rounded-[12px] border-line px-5 text-[14px] font-semibold max-lg:h-[54px] max-lg:rounded-[14px] max-lg:text-[17px] max-lg:[&_svg:not([class*='size-'])]:size-5";
