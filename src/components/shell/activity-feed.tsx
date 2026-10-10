"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { useLookups, useNow, useScopedData } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { fmtAgo } from "@/lib/format";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PersonAvatar } from "@/components/pk/bits";
import { BottomSheet } from "./bottom-sheet";

/** Last 14 scoped audit entries + whether anything changed in the last hour (drives the red "fresh" dot). */
function useRecentActivity() {
  const { audit, orders } = useScopedData();
  const now = useNow(60_000);
  const recent = useMemo(() => audit.slice(0, 14), [audit]);
  const folios = useMemo(() => new Map(orders.map((o) => [o.id, o.folio])), [orders]);
  const fresh = recent.some((a) => now.getTime() - new Date(a.at).getTime() < 60 * 60_000);
  return { recent, folios, fresh };
}

/** Recent-activity rows (who, action, reason, time ago), each linking to its order. Shared by the desktop popover and the phone sheet. */
export function ActivityList({ className, onNavigate }: { className?: string; onNavigate?: () => void }) {
  const { recent, folios } = useRecentActivity();
  const lk = useLookups();
  if (recent.length === 0) return <p className="px-3 py-8 text-center text-[14px] text-subtle">Sin actividad reciente.</p>;
  return (
    <ul className={cn("max-h-[420px] overflow-y-auto p-2", className)}>
      {recent.map((a) => {
        const u = lk.users.get(a.by);
        return (
          <li key={a.id}>
            <Link
              href={a.orderId && folios.get(a.orderId) ? `/ordenes/${folios.get(a.orderId)}` : "/"}
              onClick={onNavigate}
              className="flex gap-3 rounded-[12px] p-2.5 hover:bg-muted active:bg-muted"
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
  );
}

/** Desktop: bell popover with the recent-activity feed (the card header's right edge). `compact` is the 40px size of that bar. */
export function ActivityBell({ compact = false, className }: { compact?: boolean; className?: string }) {
  const { fresh } = useRecentActivity();
  return (
    <Popover>
      <PopoverTrigger
        aria-label={fresh ? "Actividad reciente · hay cambios en la última hora" : "Actividad reciente"}
        className={cn(
          "relative inline-flex items-center justify-center border border-hairline bg-surface shadow-[0_1px_2px_rgb(16_24_40/0.03)] transition hover:border-line-strong",
          compact ? "size-10 rounded-[14px]" : "size-12 rounded-[16px] max-md:size-11 max-md:rounded-[14px]",
          className,
        )}
      >
        <Bell className={cn("text-ink", compact ? "size-[18px]" : "size-[19px]")} />
        {fresh && <span className={cn("absolute size-2 rounded-full bg-st-red ring-2 ring-surface", compact ? "right-2 top-1.5" : "right-3 top-2.5")} />}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(360px,calc(100vw-24px))] p-0">
        <div className="border-b border-hairline px-4 py-3">
          <p className="font-semibold text-ink">Actividad reciente</p>
          <p className="text-[12.5px] text-subtle">Bitácora de cambios con usuario, fecha y motivo.</p>
        </div>
        <ActivityList />
      </PopoverContent>
    </Popover>
  );
}

/** Phone/tablet: round sand bell (same style as the search button, red dot when fresh) opening the feed in a bottom sheet. */
export function MobileActivityButton({ className }: { className?: string }) {
  const { fresh } = useRecentActivity();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={fresh ? "Actividad reciente · hay cambios en la última hora" : "Actividad reciente"}
        aria-haspopup="dialog"
        className={cn("relative inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-sand text-ink transition active:scale-95 lg:hidden", className)}
      >
        <Bell className="size-[18px]" />
        {fresh && <span className="absolute right-2.5 top-2.5 size-2.5 rounded-full bg-st-red ring-2 ring-sand" />}
      </button>
      <BottomSheet open={open} onOpenChange={setOpen} title="Actividad reciente" description="Bitácora de cambios con usuario, fecha y motivo.">
        <ActivityList className="max-h-none p-0" onNavigate={() => setOpen(false)} />
      </BottomSheet>
    </>
  );
}
