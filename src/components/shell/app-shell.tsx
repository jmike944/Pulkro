"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "motion/react";
import { useAppStore } from "@/lib/hooks";
import { PulkroMark } from "@/components/pk/brand";
import { Shimmer } from "@/components/pk/feedback";
import { Sidebar } from "./sidebar";
import { MobileNav } from "./mobile-nav";
import { CommandMenu } from "./command-menu";
import { SyncSheet } from "./sync-indicator";

/**
 * Authenticated chrome: canvas + sidebar (desktop) / top+bottom bars (mobile) + white work panel.
 * Waits for the IndexedDB store to hydrate, then routes to /login when signed out.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const hydrated = useAppStore((s) => s.hydrated);
  const signedIn = useAppStore((s) => s.session.signedIn);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (hydrated && !signedIn) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [hydrated, signedIn, router, pathname]);

  if (!hydrated || !signedIn) return <ShellSkeleton />;

  return (
    <div className="flex min-h-dvh bg-canvas">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileNav />
        <main className="min-w-0 flex-1 px-2 pb-[calc(92px+env(safe-area-inset-bottom))] pt-[max(8px,env(safe-area-inset-top))] lg:py-3 lg:pb-3 lg:pl-0 lg:pr-3 print:p-0">
          <div className="min-h-[calc(100dvh-108px)] rounded-[28px] bg-surface px-5 py-6 shadow-[0_1px_2px_rgb(16_24_40/0.04)] sm:px-7 lg:min-h-full lg:px-10 lg:py-9 lg:shadow-soft lg:ring-1 lg:ring-edge print:rounded-none print:p-0 print:shadow-none print:ring-0">
            {children}
          </div>
        </main>
      </div>
      <CommandMenu />
      <SyncSheet />
    </div>
  );
}

function ShellSkeleton() {
  return (
    <div className="flex min-h-dvh bg-canvas">
      <div className="hidden w-[272px] shrink-0 flex-col gap-4 px-5 pt-6 lg:flex">
        <div className="flex items-center gap-3">
          <PulkroMark animated />
          <span className="font-brand text-[19px] font-extrabold tracking-[0.16em] text-brand-ink">PULKRO</span>
        </div>
        <Shimmer className="mt-4 h-16" />
        <Shimmer className="h-11" />
        {Array.from({ length: 8 }).map((_, i) => (
          <Shimmer key={i} className="h-9" />
        ))}
      </div>
      <div className="flex-1 p-3">
        <div className="flex h-full min-h-[96dvh] flex-col items-center justify-center rounded-[28px] bg-surface">
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center gap-4">
            <PulkroMark animated className="size-14 rounded-[16px]" />
            <p className="text-[13px] text-subtle">Cargando datos del dispositivo…</p>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
