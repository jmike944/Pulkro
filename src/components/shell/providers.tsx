"use client";

import { useEffect } from "react";
import { MotionConfig } from "motion/react";
import { useOffline } from "next/offline";
import { ThemeProvider, useTheme } from "next-themes";
import { bootstrapStore, useAppStore } from "@/lib/store";
import { useUi } from "@/lib/ui-store";
import { usePullScheduler } from "@/lib/sync/use-pull-scheduler";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { Celebrate } from "@/components/pk/feedback";
import { PwaRegistrar } from "./pwa";

/**
 * Global client providers: theme (Claro / Oscuro / Sistema), store bootstrap (IndexedDB), connectivity, the account pull
 * schedule, motion prefs, toasts.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    void bootstrapStore();
  }, []);
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange storageKey="pk.theme">
      <MotionConfig reducedMotion="user">
        <TooltipProvider delayDuration={250}>
          <ThemeColorSync />
          <ConnectivityWatcher />
          <PullScheduler />
          <PwaRegistrar />
          {children}
          <GlobalCelebrate />
          <Toaster position="top-center" richColors={false} closeButton />
        </TooltipProvider>
      </MotionConfig>
    </ThemeProvider>
  );
}

/** Outer chrome colors (= --canvas): the browser/PWA status bar matches them. Keep in sync with `viewport` in app/layout.tsx. */
const CHROME = { dark: "#050e18", lightPhone: "#f3f2ee", lightDesktop: "#f1f3f6" };

/**
 * The `viewport.themeColor` metas follow the OS color scheme; when the user forces Claro/Oscuro against it, point every
 * theme-color meta at the chrome of the theme actually shown so the status bar never clashes with the app.
 */
function ThemeColorSync() {
  const { resolvedTheme } = useTheme();
  useEffect(() => {
    if (!resolvedTheme) return;
    const phone = window.matchMedia("(max-width: 1023px)");
    const apply = () => {
      const color = resolvedTheme === "dark" ? CHROME.dark : phone.matches ? CHROME.lightPhone : CHROME.lightDesktop;
      document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => {
        if (m.content !== color) m.content = color;
      });
    };
    apply();
    // Next streams the viewport metas in after hydration (and re-renders them on navigation): keep them pinned.
    const watch = new MutationObserver(apply);
    watch.observe(document.head, { childList: true, subtree: true, attributes: true, attributeFilter: ["content"] });
    phone.addEventListener("change", apply);
    return () => {
      watch.disconnect();
      phone.removeEventListener("change", apply);
    };
  }, [resolvedTheme]);
  return null;
}

/** Mirrors browser connectivity (+ Next's offline detection) into the store's sync slice. */
function ConnectivityWatcher() {
  const nextOffline = useOffline();
  const setBrowserOffline = useAppStore((s) => s.setBrowserOffline);
  const hydrated = useAppStore((s) => s.hydrated);
  useEffect(() => {
    if (!hydrated) return;
    const update = () => setBrowserOffline(nextOffline || !navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, [nextOffline, setBrowserOffline, hydrated]);
  return null;
}

/** Account sessions: pulls the server's changes on focus, reconnect and every minute (lib/sync). */
function PullScheduler() {
  usePullScheduler();
  return null;
}

function GlobalCelebrate() {
  const n = useUi((s) => s.celebrate);
  return <Celebrate trigger={n} />;
}
