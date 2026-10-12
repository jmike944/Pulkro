"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { KeyRound } from "lucide-react";
import { useAppStore } from "@/lib/hooks";
import { Button } from "@/components/ui/button";
import { loginHref } from "@/features/auth/safe-next";

/**
 * "Vuelva a entrar": the browser has no Supabase session for the account on the device (expired or revoked refresh token,
 * signed out elsewhere, another account's invite / recovery link opened here). The device keeps every record and unsent
 * change and keeps working, but nothing is synced until the person signs in again. /login recognises this state, offers the
 * same account (its data kept) and comes back here — to this very page, its query included (an open incident, an order's
 * closure: in-page state). Rendered inside the page's scroller, above the page, so the panes sized with `--pk-pane-h` stay
 * exact. Client-only (the shell renders it after hydration, never during prerender): useSearchParams needs no Suspense here.
 */
export function ReauthBanner() {
  const show = useAppStore((s) => s.session.mode === "supabase" && s.session.signedIn && !!s.session.needsReauth);
  const pathname = usePathname();
  // toString(), not .size (missing on iOS 15/16).
  const query = useSearchParams().toString();
  if (!show) return null;
  return (
    <div
      role="status"
      className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-2.5 rounded-[16px] bg-amber-soft px-4 py-3 ring-1 ring-amber-line lg:mb-8 print:hidden"
    >
      <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-[11px] bg-amber-mid text-amber-fg" aria-hidden>
        <KeyRound className="size-[18px]" />
      </span>
      <p className="min-w-[12rem] flex-1 text-[13.5px] leading-snug text-ink">
        <b className="font-semibold">Vuelva a entrar.</b>{" "}
        <span className="text-ink-soft">
          La sesión de su cuenta ya no está abierta en este dispositivo. Sus datos y cambios siguen aquí: entre de nuevo para seguir
          sincronizando.
        </span>
      </p>
      <Button asChild className="h-10 rounded-[12px] px-4 text-[14px] font-semibold">
        <Link href={loginHref(pathname, query)}>Entrar de nuevo</Link>
      </Button>
    </div>
  );
}
