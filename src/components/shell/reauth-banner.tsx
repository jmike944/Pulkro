"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { KeyRound } from "lucide-react";
import { useAppStore } from "@/lib/hooks";
import { Button } from "@/components/ui/button";

/**
 * Account sessions whose Supabase session ended (expired or revoked refresh token, signed out elsewhere, deactivated profile):
 * the device keeps every record and unsent change and keeps working, but nothing is pulled until the person signs in again.
 * /login recognises this state, offers the same account and comes back here.
 */
export function ReauthBanner() {
  const show = useAppStore((s) => s.session.mode === "supabase" && s.session.signedIn && !!s.session.needsReauth);
  const pathname = usePathname();
  if (!show) return null;
  return (
    <div
      role="status"
      className="mx-3 mt-3 flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2.5 rounded-[16px] bg-amber-soft px-4 py-3 ring-1 ring-amber-line lg:mx-4"
    >
      <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-[11px] bg-amber-mid text-amber-fg" aria-hidden>
        <KeyRound className="size-[18px]" />
      </span>
      <p className="min-w-[12rem] flex-1 text-[13.5px] leading-snug text-ink">
        <b className="font-semibold">Su sesión venció.</b>{" "}
        <span className="text-ink-soft">Sus datos y cambios siguen en este dispositivo. Entre de nuevo para seguir sincronizando.</span>
      </p>
      <Button asChild className="h-10 rounded-[12px] px-4 text-[14px] font-semibold">
        <Link href={`/login?next=${encodeURIComponent(pathname)}`}>Entrar de nuevo</Link>
      </Button>
    </div>
  );
}
