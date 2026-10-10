"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Bell, Search } from "lucide-react";
import { useCurrentUser, useLookups, useNow, useScopedData, useSyncSummary } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { useUi } from "@/lib/ui-store";
import { fmtAgo } from "@/lib/format";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PersonAvatar } from "@/components/pk/bits";
import { Kbd } from "@/components/ui/kbd";

/**
 * Desktop: search pill (⌘K) + recent-activity bell.
 * Phone/tablet (mobile reference): compact search + round initials avatar → Perfil, with a sync dot.
 */
export function HeaderTools() {
  const setCommandOpen = useUi((s) => s.setCommandOpen);
  return (
    <div className="flex items-center gap-2.5 lg:gap-3">
      <button
        onClick={() => setCommandOpen(true)}
        className="hidden h-12 w-[min(420px,32vw)] items-center gap-3 rounded-[16px] border border-hairline bg-white px-4 text-left text-[15px] text-[#98a2b3] shadow-[0_1px_2px_rgb(16_24_40/0.03)] transition hover:border-[#d5dbe3] lg:flex"
      >
        <Search className="size-[18px] text-subtle" />
        <span className="flex-1 truncate">Buscar órdenes, clientes, folios</span>
        <Kbd className="bg-[#f2f4f7] text-[11px]">⌘K</Kbd>
      </button>
      <button
        onClick={() => setCommandOpen(true)}
        aria-label="Buscar"
        className="inline-flex size-11 items-center justify-center rounded-full bg-sand text-ink transition active:scale-95 lg:hidden"
      >
        <Search className="size-[18px]" />
      </button>
      <span className="hidden lg:block">
        <ActivityBell />
      </span>
      <ProfileAvatar className="lg:hidden" />
    </div>
  );
}

/** Round initials avatar (sand) linking to Perfil; a dot shows offline / pending sync. */
export function ProfileAvatar({ className }: { className?: string }) {
  const user = useCurrentUser();
  const { offline, pending } = useSyncSummary();
  return (
    <Link
      href="/perfil"
      aria-label={`Perfil de ${user.name}${offline ? " · sin conexión" : ""}`}
      className={cn("relative inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-sand text-[14px] font-semibold tracking-wide text-ink transition active:scale-95", className)}
    >
      {user.initials}
      {(offline || pending.length > 0) && (
        <span className={cn("absolute right-0 top-0 size-3 rounded-full ring-2 ring-white", offline ? "bg-st-amber" : "bg-sky animate-pulse")} />
      )}
    </Link>
  );
}

function ActivityBell() {
  const { audit, orders } = useScopedData();
  const lk = useLookups();
  const folios = useMemo(() => new Map(orders.map((o) => [o.id, o.folio])), [orders]);
  const now = useNow(60_000);
  const recent = useMemo(() => audit.slice(0, 14), [audit]);
  const fresh = recent.some((a) => now.getTime() - new Date(a.at).getTime() < 60 * 60_000);
  return (
    <Popover>
      <PopoverTrigger
        aria-label="Actividad reciente"
        className="relative inline-flex size-12 items-center justify-center rounded-[16px] border border-hairline bg-white shadow-[0_1px_2px_rgb(16_24_40/0.03)] transition hover:border-[#d5dbe3] max-md:size-11 max-md:rounded-[14px]"
      >
        <Bell className="size-[19px] text-ink" />
        {fresh && <span className="absolute right-3 top-2.5 size-2 rounded-full bg-st-red ring-2 ring-white" />}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] p-0">
        <div className="border-b border-hairline px-4 py-3">
          <p className="font-semibold text-ink">Actividad reciente</p>
          <p className="text-[12.5px] text-subtle">Bitácora de cambios con usuario, fecha y motivo.</p>
        </div>
        <ul className="max-h-[420px] overflow-y-auto p-2">
          {recent.map((a) => {
            const u = lk.users.get(a.by);
            return (
              <li key={a.id}>
                <Link
                  href={a.orderId && folios.get(a.orderId) ? `/ordenes/${folios.get(a.orderId)}` : "/"}
                  className="flex gap-3 rounded-[12px] p-2.5 hover:bg-muted"
                >
                  <PersonAvatar initials={u?.initials ?? "CL"} hue={u?.hue ?? 200} size={30} name={u?.name ?? "Cliente"} />
                  <span className="min-w-0 flex-1 text-[13px]">
                    <span className="block text-ink">
                      <b className="font-semibold">{u?.name.split(" ")[0] ?? "Cliente"}</b> {a.action.charAt(0).toLowerCase() + a.action.slice(1)}
                    </span>
                    {a.reason && <span className="block truncate text-subtle">“{a.reason}”</span>}
                    <span className="block text-[12px] text-subtle">{fmtAgo(a.at)}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
