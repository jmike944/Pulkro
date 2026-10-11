"use client";

import { useState } from "react";

/**
 * Dialog target that survives its own closing animation.
 *
 * Callers clear their target the moment a dialog closes (`setMove(null)`), which used to unmount the form before it
 * could animate out. `held` keeps the last non-null target so the content stays real while the exit plays, and
 * `session` counts every opening (a new target = a new session) so the form can be keyed to start clean each time.
 *
 * Pass `open` (when a dialog has no target, only a flag) to `useOpenSession` instead.
 */
export function useHeldTarget<T>(target: T | null) {
  const [state, setState] = useState(() => ({ prev: target, held: target, session: target ? 1 : 0 }));
  const changed = target !== state.prev;
  const next = changed ? { prev: target, held: target ?? state.held, session: target ? state.session + 1 : state.session } : state;
  if (changed) setState(next);
  return { held: next.held, session: next.session };
}

/** The one `useOpenSession` lives in `@/components/pk/use-open-session`; re-exported here so existing imports keep working. */
export { useOpenSession } from "@/components/pk/use-open-session";
