"use client";

import { useEffect } from "react";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { isOffline, useAppStore } from "@/lib/store";
import { flagReauth } from "./pull";

const INTERVAL_MS = 60_000;

/**
 * When an account session pulls (architecture §8: "pull on reconnect / interval / focus"): on window focus, when the tab
 * becomes visible, when the connection comes back, and every 60 s while the tab is visible. The first pull and the one after
 * signing in are started by the store (ensureSeeded / startSupabaseSession). Also flags re-authentication when Supabase
 * signs the session out (refresh token revoked or expired) while the device still holds the account's data.
 */
export function usePullScheduler() {
  const hydrated = useAppStore((s) => s.hydrated);
  const account = useAppStore((s) => s.session.mode === "supabase" && s.session.signedIn);

  useEffect(() => {
    if (!hydrated || !account || !isSupabaseConfigured) return;
    const pull = (manual = false) => void useAppStore.getState().pullNow({ manual });
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
    });

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);

    let stopAuth = () => {};
    try {
      const { data } = getSupabaseBrowserClient().auth.onAuthStateChange((event, session) => {
        // Only store writes here (no Supabase calls inside this callback).
        const s = useAppStore.getState();
        if (s.session.mode !== "supabase" || !s.session.signedIn) return;
        if (event === "SIGNED_OUT" || (session && session.user.id !== s.session.userId)) flagReauth(useAppStore);
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
