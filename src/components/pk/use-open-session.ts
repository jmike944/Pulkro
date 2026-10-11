"use client";

import { useState } from "react";

/**
 * Number of times `open` has gone from false to true: 0 until a dialog first opens, then +1 on every false → true change.
 *
 * Key a form on it (`{session > 0 && <Form key={session} open={open} />}`) so its state starts fresh on every open
 * while the closed modal stays mounted for its exit animation. Written with the "adjust state while rendering"
 * pattern, so the first open already renders session 1 (no extra paint with stale state).
 *
 * The one implementation for every flag-driven modal; dialogs driven by a target use `useHeldTarget`
 * (`@/features/postventa/use-held-target`) instead.
 */
export function useOpenSession(open: boolean) {
  const [state, setState] = useState(() => ({ prev: open, session: open ? 1 : 0 }));
  const changed = open !== state.prev;
  const next = changed ? { prev: open, session: open ? state.session + 1 : state.session } : state;
  if (changed) setState(next);
  return next.session;
}
