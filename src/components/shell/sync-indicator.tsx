"use client";

import { AnimatePresence, motion } from "motion/react";
import { Check, CloudOff, CloudUpload, Loader2, RefreshCw, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore, useNow, useSyncSummary } from "@/lib/hooks";
import { useUi } from "@/lib/ui-store";
import { fmtAgo, fmtTime } from "@/lib/format";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";

/** Sidebar chip — the "Detection on · 4 min ago" equivalent for offline sync. */
export function SyncChip({ collapsed, compact }: { collapsed?: boolean; compact?: boolean }) {
  const { offline, pending, syncing, lastSyncAt } = useSyncSummary();
  const setOpen = useUi((s) => s.setSyncOpen);
  useNow(30_000);
  const state = offline ? "offline" : syncing.length || pending.length ? "syncing" : "ok";
  return (
    <button
      onClick={() => setOpen(true)}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-[14px] bg-white/80 px-3.5 py-3 text-left text-[13.5px] shadow-[0_1px_2px_rgb(16_24_40/0.04)] ring-1 ring-black/[0.03] transition hover:bg-white",
        collapsed && "justify-center px-0",
        compact && "w-auto rounded-full px-3 py-2 text-[12.5px]",
      )}
      aria-label="Estado de sincronización"
    >
      <span className="relative inline-flex size-2.5 shrink-0">
        <span
          className={cn(
            "absolute inset-0 rounded-full animate-ping-soft",
            state === "ok" && "bg-st-blue",
            state === "syncing" && "bg-sky",
            state === "offline" && "bg-st-amber",
          )}
        />
        <span className={cn("relative size-2.5 rounded-full", state === "ok" && "bg-st-blue", state === "syncing" && "bg-sky", state === "offline" && "bg-st-amber")} />
      </span>
      {!collapsed && (
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={state + pending.length}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2 }}
            className="flex min-w-0 items-baseline gap-1.5"
          >
            {state === "ok" && (
              <>
                <span className="font-semibold text-ink">Sincronizado</span>
                {!compact && <span className="truncate text-subtle">{fmtAgo(lastSyncAt)}</span>}
              </>
            )}
            {state === "syncing" && (
              <>
                <span className="font-semibold text-ink">{compact ? "Enviando" : "Sincronizando"}</span>
                <span className="truncate text-subtle">{pending.length + syncing.length}{compact ? "" : " en cola"}</span>
              </>
            )}
            {state === "offline" && (
              <>
                <span className="font-semibold text-ink">Sin conexión</span>
                <span className="truncate text-subtle">{pending.length}{compact ? "" : " pendientes"}</span>
              </>
            )}
          </motion.span>
        </AnimatePresence>
      )}
    </button>
  );
}

/** Sync queue sheet: pending/synced items, simulate offline, retry. */
export function SyncSheet() {
  const open = useUi((s) => s.syncOpen);
  const setOpen = useUi((s) => s.setSyncOpen);
  const { offline, queue, lastSyncAt } = useSyncSummary();
  const forced = useAppStore((s) => s.sync.forcedOffline);
  const browserOffline = useAppStore((s) => s.sync.browserOffline);
  const setForced = useAppStore((s) => s.setForcedOffline);
  const retry = useAppStore((s) => s.retrySync);
  const items = [...queue].reverse();
  const pending = queue.filter((q) => q.state !== "sincronizado").length;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent className="w-full gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b border-hairline p-6">
          <SheetTitle className="font-serif text-[26px] font-medium">Sincronización</SheetTitle>
          <SheetDescription>
            La captura funciona sin internet. Los registros quedan en el dispositivo y se envían al recuperar la conexión.
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-4 border-b border-hairline p-6">
          <div className={cn("flex items-center gap-3 rounded-[16px] p-4", offline ? "bg-[#fff6e6]" : "bg-[#edf4ff]")}>
            <span className={cn("inline-flex size-10 items-center justify-center rounded-[12px]", offline ? "bg-[#ffe7bd] text-[#b86e00]" : "bg-[#cfe3fb] text-[#1667e0]")}>
              {offline ? <WifiOff className="size-5" /> : <CloudUpload className="size-5" />}
            </span>
            <div className="min-w-0 flex-1 text-[14px]">
              <p className="font-semibold text-ink">{offline ? "Trabajando sin conexión" : pending ? "Enviando registros…" : "Todo sincronizado"}</p>
              <p className="text-subtle">
                {offline ? `${pending} registro(s) esperando conexión` : `Última sincronización ${fmtAgo(lastSyncAt)} · ${fmtTime(lastSyncAt)}`}
              </p>
            </div>
          </div>
          <label className="flex items-center justify-between gap-4 text-[14px]">
            <span>
              <span className="block font-medium text-ink">Simular sin conexión</span>
              <span className="text-subtle">Prueba la captura offline en campo{browserOffline ? " · el navegador está sin red" : ""}</span>
            </span>
            <Switch checked={forced} onCheckedChange={setForced} />
          </label>
          {queue.some((q) => q.state === "error") && (
            <Button variant="outline" onClick={retry} className="w-full">
              <RefreshCw /> Reintentar envíos con error
            </Button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          <p className="mb-3 text-[12px] font-semibold uppercase tracking-[0.1em] text-subtle">Cola de sincronización</p>
          {items.length === 0 && <p className="text-[14px] text-subtle">Sin movimientos recientes en este dispositivo.</p>}
          <ul className="space-y-1">
            <AnimatePresence initial={false}>
              {items.map((q) => (
                <motion.li
                  key={q.id}
                  layout
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-3 rounded-[12px] px-2 py-2.5 text-[13.5px] hover:bg-muted"
                >
                  <span
                    className={cn(
                      "inline-flex size-7 shrink-0 items-center justify-center rounded-full",
                      q.state === "sincronizado" && "bg-[#e7f7f4] text-st-teal",
                      q.state === "sincronizando" && "bg-[#edf4ff] text-link",
                      q.state === "pendiente" && "bg-[#fff6e6] text-[#b86e00]",
                      q.state === "error" && "bg-[#fdeeee] text-st-red",
                    )}
                  >
                    {q.state === "sincronizado" && <Check className="size-3.5" />}
                    {q.state === "sincronizando" && <Loader2 className="size-3.5 animate-spin" />}
                    {q.state === "pendiente" && <CloudOff className="size-3.5" />}
                    {q.state === "error" && <RefreshCw className="size-3.5" />}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-ink">{q.label}</span>
                  <span className="shrink-0 text-[12px] text-subtle tabular">{fmtTime(q.at)}</span>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </div>
      </SheetContent>
    </Sheet>
  );
}
