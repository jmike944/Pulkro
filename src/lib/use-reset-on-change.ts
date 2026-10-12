import { useState } from "react";

/**
 * Runs `reset` while rendering, once, when `key` differs from the previous render's: state tied to an identity (an account,
 * a photo, a token, one opening of a dialog) starts over when that identity changes. It is React's "adjusting some state
 * when a prop changes" (react.dev/learn/you-might-not-need-an-effect), never an effect, so no frame shows the previous
 * identity's state. `reset` gets the new key and the previous one, and sets this component's own state only.
 *
 *   useResetOnChange(userId, () => setDraft(EMPTY_DRAFT)); // another account: nothing of the last one's draft shows
 *   useResetOnChange(open, (isOpen) => {                   // every opening starts clean; closing keeps the last screen
 *     if (isOpen) setStep("tipo");                         // while it animates out
 *   });
 */
export function useResetOnChange<K>(key: K, reset: (key: K, previous: K) => void): void {
  const [seen, setSeen] = useState(key);
  if (!Object.is(seen, key)) {
    setSeen(key);
    reset(key, seen);
  }
}
