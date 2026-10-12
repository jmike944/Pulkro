"use client";

import { useEffect } from "react";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { isOffline, useAppStore } from "@/lib/store";
import { checkClock } from "./clock";
import { flagReauth, verifyAccount } from "./pull";

const INTERVAL_MS = 60_000;

/**
 * When an account session pulls (architecture §8: "pull on reconnect / interval / focus"): on window focus, when the tab
 * becomes visible, when the connection comes back, and every 60 s while the tab is visible. The same moments also send what
 * the queue holds (sync/push.ts, which also wakes itself for its retries), and so does the end of a re-authentication. The first pull and the one after
 * signing in are started by the store (ensureSeeded / startSupabaseSession). Also watches the browser's Supabase session:
 * signed out (refresh token revoked or expired) or replaced by another account's (an invite / recovery link opened on this
 * device) → "Vuelva a entrar", nothing pulled, data kept; this account's session back (signed in again in another tab) →
 * checked and syncing again.
 */
export function usePullScheduler() {
  const hydrated = useAppStore((s) => s.hydrated);
  const account = useAppStore((s) => s.session.mode === "supabase" && s.session.signedIn);

  useEffect(() => {
    if (!hydrated || !account || !isSupabaseConfigured) return;
    // The phone's clock against the server's (ClockWarning): a clock the person just corrected is measured again.
    const clock = () => {
      const s = useAppStore.getState();
      checkClock(useAppStore, () => getSupabaseBrowserClient().auth.refreshSession(), !isOffline(s) && !s.session.needsReauth);
    };
    const pull = (manual = false) => {
      clock();
      // The unsent changes first (a no-op when nothing is ready), then the server's. Both check first that this tab still
      // holds the device (lib/device-storage): one taken over while it was in the background sends and reads nothing.
      void useAppStore.getState().processSyncQueue();
      void useAppStore.getState().pullNow({ manual });
    };
    clock();
    const visible = () => document.visibilityState === "visible";

    const onFocus = () => pull();
    const onVisibility = () => {
      if (visible()) pull();
    };
    const timer = setInterval(() => {
      if (visible()) pull();
    }, INTERVAL_MS);
    // Reconnecting (the browser came back, or "Simular sin conexión" switched off) → pull, skipping the error backoff. A
    // browser reconnect reaches here through the store's offline flag (ConnectivityWatcher), once — no `online` listener
    // of its own, which would pull a second time.
    const stopStore = useAppStore.subscribe((s, prev) => {
      if (isOffline(prev) && !isOffline(s)) pull(true);
      // Signed in again: what waited for the session goes now.
      else if (prev.session.needsReauth && !s.session.needsReauth && s.session.signedIn) void s.processSyncQueue();
    });

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    let stopAuth = () => {};
    try {
      const { data } = getSupabaseBrowserClient().auth.onAuthStateChange((event, session) => {
        // Only store writes here: a Supabase call inside this callback would wait on the auth lock (hence the timeout).
        const s = useAppStore.getState();
        if (s.session.mode !== "supabase" || !s.session.signedIn) return;
        if (event === "SIGNED_OUT" || (session && session.user.id !== s.session.userId)) flagReauth(useAppStore);
        else if (session && s.session.needsReauth) setTimeout(() => void verifyAccount(useAppStore), 0);
      });
      stopAuth = () => data.subscription.unsubscribe();
    } catch {
      // not configured: nothing to watch
    }

    return () => {
      clearInterval(timer);
      stopStore();
      stopAuth();
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [hydrated, account]);
}
