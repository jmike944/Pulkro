"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "motion/react";
import { useAppStore, useCurrentUser } from "@/lib/hooks";
import { PulkroMark } from "@/components/pk/brand";
import { Shimmer } from "@/components/pk/feedback";
import { Sidebar } from "./sidebar";
import { MobileNav } from "./mobile-nav";
import { CommandMenu } from "./command-menu";
import { SyncSheet } from "./sync-indicator";
import { MainScroller } from "./main-scroll";
import { CardHeader } from "./card-header";
import { canSeeRoute } from "./nav";
import { RouteNotAllowed } from "./out-of-scope";

/**
 * Authenticated chrome: canvas + sidebar (desktop) / top+bottom bars (mobile) + white work panel.
 * Waits for the IndexedDB store to hydrate, then routes to /login when signed out. Routes the current role may not open
 * (nav.ts → canSeeRoute: typed URLs, old links, a role switch) render one uniform "No disponible para su rol" state.
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
  return <SignedInShell pathname={pathname}>{children}</SignedInShell>;
}

function SignedInShell({ pathname, children }: { pathname: string; children: React.ReactNode }) {
  const role = useCurrentUser().role;
  const allowed = canSeeRoute(role, pathname);

  // --pk-pane-h is the height of the scrolling viewport the page content sees: the whole window below lg; from lg up the work panel
  // minus its fixed card header (window minus the lg:py-3 margins of <main>, minus --pk-card-header-h). Size sticky asides with
  // it — `max-h-[calc(var(--pk-pane-h)-48px)]`.
  return (
    <div className="flex min-h-dvh bg-canvas [--pk-card-header-h:4rem] [--pk-pane-h:100dvh] lg:h-dvh lg:overflow-hidden lg:[--pk-pane-h:calc(100dvh-1.5rem-var(--pk-card-header-h))] print:h-auto print:overflow-visible">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col print:block">
        <MobileNav />
        <main className="min-w-0 flex-1 px-2 pb-[calc(92px+env(safe-area-inset-bottom))] pt-[max(8px,env(safe-area-inset-top))] lg:flex lg:min-h-0 lg:flex-col lg:py-3 lg:pb-3 lg:pl-0 lg:pr-3 print:block print:p-0">
          {/* From lg the panel is fixed in the window (rounded, clipping): a fixed card header (breadcrumbs, search, notifications) on
              top and the page scrolling inside it, underneath — see card-header.tsx and main-scroll.tsx. */}
          <div className="min-h-[calc(100dvh-108px)] rounded-[28px] bg-surface shadow-[0_1px_2px_rgb(16_24_40/0.04)] lg:flex lg:min-h-0 lg:flex-1 lg:flex-col lg:overflow-hidden lg:shadow-soft lg:ring-1 lg:ring-edge print:block print:min-h-0 print:overflow-visible print:rounded-none print:shadow-none print:ring-0">
            <CardHeader />
            <MainScroller className="px-5 py-6 sm:px-7 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-y-contain lg:px-10 lg:py-9 lg:outline-none lg:scrollbar-panel print:overflow-visible print:p-0">
              {allowed ? children : <RouteNotAllowed />}
            </MainScroller>
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
