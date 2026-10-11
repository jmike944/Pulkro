"use client";

import { useEffect } from "react";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { isOffline, useAppStore } from "@/lib/store";
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
    const pull = (manual = false) => {
      // The unsent changes first (a no-op when nothing is ready), then the server's. Both check first that this tab still
      // holds the device (lib/device-storage): one taken over while it was in the background sends and reads nothing.
      void useAppStore.getState().processSyncQueue();
      void useAppStore.getState().pullNow({ manual });
    };
    const visible = () => document.visibilityState === "visible";

    const onFocus = () => pull();
    const onVisibility = () => {
      if (visible()) pull();
    };
    // Reconnecting skips the error backoff; the store's offline flag flips on the same event, so read it a moment later.
    const onOnline = () => setTimeout(() => pull(true), 400);
    const timer = setInterval(() => {
      if (visible()) pull();
    }, INTERVAL_MS);
    // "Simular sin conexión" switched off (or the browser came back) → pull too.
    const stopStore = useAppStore.subscribe((s, prev) => {
      if (isOffline(prev) && !isOffline(s)) pull(true);
      // Signed in again: what waited for the session goes now.
      else if (prev.session.needsReauth && !s.session.needsReauth && s.session.signedIn) void s.processSyncQueue();
    });

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);

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
      window.removeEventListener("online", onOnline);
    };
  }, [hydrated, account]);
}
