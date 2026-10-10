"use client";

import { useEffect } from "react";
import { MotionConfig } from "motion/react";
import { useOffline } from "next/offline";
import { bootstrapStore, useAppStore } from "@/lib/store";
import { useUi } from "@/lib/ui-store";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { Celebrate } from "@/components/pk/feedback";
import { PwaRegistrar } from "./pwa";

/** Global client providers: store bootstrap (IndexedDB), connectivity, motion prefs, toasts. */
export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    void bootstrapStore();
  }, []);
  return (
    <MotionConfig reducedMotion="user">
      <TooltipProvider delayDuration={250}>
        <ConnectivityWatcher />
        <PwaRegistrar />
        {children}
        <GlobalCelebrate />
        <Toaster position="top-center" richColors={false} closeButton />
      </TooltipProvider>
    </MotionConfig>
  );
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

function GlobalCelebrate() {
  const n = useUi((s) => s.celebrate);
  return <Celebrate trigger={n} />;
}
