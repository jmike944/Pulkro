"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, ChevronRight, CloudOff, CloudUpload, Loader2, RefreshCw, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore, useNow, useSyncSummary } from "@/lib/hooks";
import { useUi } from "@/lib/ui-store";
import { fmtAgo, fmtTime, plural } from "@/lib/format";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";

/**
 * Sidebar chip — the "Detection on · 4 min ago" equivalent for offline sync.
 * `slim` is the sidebar's density: while everything is synced (online, nothing queued) it collapses to a quiet one-line
 * row aligned to the nav columns; offline or with records in the queue it grows back to the full card so the warning
 * keeps its weight. Either way it is the same button and opens the sync sheet.
 */
export function SyncChip({ collapsed, compact, slim }: { collapsed?: boolean; compact?: boolean; slim?: boolean }) {
  const { offline, pending, syncing, lastSyncAt } = useSyncSummary();
  const setOpen = useUi((s) => s.setSyncOpen);
  useNow(30_000);
  const state = offline ? "offline" : syncing.length || pending.length ? "syncing" : "ok";
  const row = !!slim && state === "ok";
  return (
    <button
      onClick={() => setOpen(true)}
      className={cn(
        "flex w-full items-center text-left transition",
        row
          ? "h-8 gap-3.5 rounded-[10px] px-3.5 text-[12.5px] hover:bg-surface/70"
          : cn(
              "gap-2.5 rounded-[14px] bg-surface/80 px-3.5 text-[13.5px] shadow-[0_1px_2px_rgb(16_24_40/0.04)] ring-1 ring-edge hover:bg-surface",
              slim ? "py-2 leading-5" : "py-3",
            ),
        collapsed && "justify-center px-0",
        compact && "w-auto rounded-full px-3 py-2 text-[12.5px]",
      )}
      aria-label="Estado de sincronización"
    >
      {/* In the slim row the dot sits in a 20px box so it lines up with the nav icons above. */}
      <span className={cn("relative inline-flex size-2.5 shrink-0", row && "m-[5px]")}>
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
            className={cn("flex min-w-0 items-baseline", row ? "gap-1" : "gap-1.5")}
          >
            {state === "ok" && (
              <>
                <span className={cn("shrink-0", row ? "font-medium text-ink" : "font-semibold text-ink")}>Sincronizado</span>
                {!compact && (
                  <span className="truncate text-subtle">
                    {row && "· "}
                    {fmtAgo(lastSyncAt)}
                  </span>
                )}
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

/**
 * Phone/tablet: labeled status pill floating above the tab bar (mounted by MobileNav) while the device is offline or
 * the queue lingers / failed; one tap opens the sync queue sheet. Online flushes take ~1–2 s per item, so "Enviando"
 * only shows once the queue has been busy for a moment instead of flashing after every capture.
 */
export function MobileSyncPill({ hidden }: { hidden?: boolean }) {
  const { offline, pending, syncing, queue } = useSyncSummary();
  const setOpen = useUi((s) => s.setSyncOpen);
  const count = pending.length + syncing.length;
  const failed = queue.some((q) => q.state === "error");
  const busy = !offline && count > 0;
  const [lingers, setLingers] = useState(false);
  useEffect(() => {
    if (!busy) return;
    const t = setTimeout(() => setLingers(true), 2500);
    return () => {
      clearTimeout(t);
      setLingers(false);
    };
  }, [busy]);
  const show = !hidden && (offline || (busy && (lingers || failed)));
  const warn = offline || failed;
  const label = offline ? "Sin conexión" : failed ? "Error de envío" : "Enviando";
  const detail = offline ? (count ? `${plural(count, "registro", "registros")} por enviar` : "se guarda en el dispositivo") : failed ? `${plural(count, "registro", "registros")} sin enviar` : plural(count, "registro", "registros");

  return (
    <div role="status" aria-live="polite" className="pointer-events-none absolute inset-x-0 bottom-full flex justify-center px-4 pb-2">
      <AnimatePresence initial={false}>
        {show && (
          <motion.button
            key="pill"
            type="button"
            onClick={() => setOpen(true)}
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 420, damping: 32 }}
            aria-label={`${label}, ${detail}. Abrir la cola de sincronización`}
            className={cn(
              "pointer-events-auto inline-flex min-h-11 max-w-full items-center gap-2.5 rounded-full py-2 pl-4 pr-3 text-[13.5px] shadow-lift ring-1",
              warn ? "bg-amber-soft text-amber-olive ring-amber-line" : "bg-sky-soft text-azure-fg ring-blue-mid",
            )}
          >
            <span className={cn("size-2.5 shrink-0 rounded-full", warn ? "bg-st-amber" : "bg-sky animate-pulse")} />
            <span className="min-w-0 truncate">
              <b className={cn("font-semibold", warn ? "text-amber-olive-ink" : "text-azure-fg")}>{label}</b> · {detail}
            </span>
            <ChevronRight className="size-4 shrink-0 opacity-60" />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
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
          <div className={cn("flex items-center gap-3 rounded-[16px] p-4", offline ? "bg-amber-soft" : "bg-blue-soft")}>
            <span className={cn("inline-flex size-10 items-center justify-center rounded-[12px]", offline ? "bg-amber-mid text-amber-fg" : "bg-blue-mid text-azure-fg")}>
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
                      q.state === "sincronizado" && "bg-teal-soft text-teal-fg",
                      q.state === "sincronizando" && "bg-blue-soft text-link",
                      q.state === "pendiente" && "bg-amber-soft text-amber-fg",
                      q.state === "error" && "bg-red-soft text-red-fg",
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
