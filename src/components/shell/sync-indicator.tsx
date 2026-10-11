"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { Check, ChevronRight, CloudDownload, CloudOff, CloudUpload, KeyRound, Loader2, RefreshCw, Trash2, TriangleAlert, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAppStore, useNow, useSyncSummary } from "@/lib/hooks";
import { useUi } from "@/lib/ui-store";
import { fmtAgo, fmtTime, plural } from "@/lib/format";
import type { SyncItem } from "@/lib/types";
import { NO_RETRY_HINTS, discardSet, discardSummary, isRetryable, isStopped, outcomeUnknown, waitsFor } from "@/lib/sync/queue";
import { ModalShell } from "@/components/pk/modal-shell";
import { ConfirmDialog } from "@/features/configuracion/shared";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";

/**
 * Sidebar chip — the "Detection on · 4 min ago" equivalent for offline sync.
 * `slim` is the sidebar's density: while everything is synced (online, nothing queued) it collapses to a quiet one-line
 * row aligned to the nav columns; offline or with records in the queue it grows back to the full card so the warning
 * keeps its weight. Either way it is the same button and opens the sync sheet.
 */
export function SyncChip({ collapsed, compact, slim }: { collapsed?: boolean; compact?: boolean; slim?: boolean }) {
  const { offline, pending, syncing, lastSyncAt, pulling, pullInitial, pullError, needsReauth, saveError } = useSyncSummary();
  const setOpen = useUi((s) => s.setSyncOpen);
  useNow(30_000);
  // Account sessions add the pull: first download, a failed update, a session to renew. A device that cannot store the
  // data comes first: captures would be lost if the app closed.
  const state = saveError
    ? "unsaved"
    : offline
    ? "offline"
    : needsReauth
      ? "reauth"
      : syncing.length || pending.length
        ? "syncing"
        : pulling && pullInitial
          ? "downloading"
          : pullError
            ? "stale"
            : "ok";
  const warn = state === "offline" || state === "reauth" || state === "stale" || state === "unsaved";
  const busy = state === "syncing" || state === "downloading";
  const row = !!slim && state === "ok";
  // Collapsed, only the dot shows: the name carries the state. Otherwise the visible text names the button.
  const spoken = {
    ok: `Sincronizado, ${fmtAgo(lastSyncAt)}`,
    syncing: `Sincronizando, ${pending.length + syncing.length} en cola`,
    offline: `Sin conexión, ${plural(pending.length, "pendiente", "pendientes")}`,
    downloading: "Descargando datos de su cuenta",
    stale: `Sin actualizar, ${fmtAgo(lastSyncAt)}`,
    reauth: "Vuelva a entrar, sin sincronizar",
    unsaved: "Sin guardar en el dispositivo",
  }[state];
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
      aria-label={collapsed ? `Sincronización: ${spoken}` : undefined}
    >
      {/* In the slim row the dot sits in a 20px box so it lines up with the nav icons above. */}
      <span className={cn("relative inline-flex size-2.5 shrink-0", row && "m-[5px]")}>
        <span
          className={cn("absolute inset-0 rounded-full animate-ping-soft", state === "ok" && "bg-st-blue", busy && "bg-sky", warn && "bg-st-amber")}
        />
        <span className={cn("relative size-2.5 rounded-full", state === "ok" && "bg-st-blue", busy && "bg-sky", warn && "bg-st-amber")} />
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
                <span className="truncate text-subtle">{compact ? pending.length : plural(pending.length, "pendiente", "pendientes")}</span>
              </>
            )}
            {state === "downloading" && (
              <>
                <span className="shrink-0 font-semibold text-ink">Descargando</span>
                {!compact && <span className="truncate text-subtle">datos de su cuenta</span>}
              </>
            )}
            {state === "stale" && (
              <>
                <span className="shrink-0 font-semibold text-ink">Sin actualizar</span>
                {!compact && <span className="truncate text-subtle">{fmtAgo(lastSyncAt)}</span>}
              </>
            )}
            {state === "reauth" && (
              <>
                <span className="shrink-0 font-semibold text-ink">Vuelva a entrar</span>
                {!compact && <span className="truncate text-subtle">sin sincronizar</span>}
              </>
            )}
            {state === "unsaved" && (
              <>
                <span className="shrink-0 font-semibold text-ink">Sin guardar</span>
                {!compact && <span className="truncate text-subtle">libere espacio</span>}
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
  const { offline, pending, syncing, queue, saveError } = useSyncSummary();
  const setOpen = useUi((s) => s.setSyncOpen);
  const count = pending.length + syncing.length;
  const failed = queue.some((q) => q.state === "error");
  const busy = !offline && count > 0;
  const unsaved = !!saveError;
  const [lingers, setLingers] = useState(false);
  useEffect(() => {
    if (!busy) return;
    const t = setTimeout(() => setLingers(true), 2500);
    return () => {
      clearTimeout(t);
      setLingers(false);
    };
  }, [busy]);
  const show = !hidden && (unsaved || offline || (busy && (lingers || failed)));
  const warn = unsaved || offline || failed;
  const label = unsaved ? "Sin guardar" : offline ? "Sin conexión" : failed ? "Error de envío" : "Enviando";
  const detail = unsaved
    ? "el teléfono no tiene espacio"
    : offline
      ? count
        ? `${plural(count, "registro", "registros")} por enviar`
        : "se guarda en el dispositivo"
      : failed
        ? `${plural(count, "registro", "registros")} sin enviar`
        : plural(count, "registro", "registros");

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
              // floats over page content: in dark the translucent tint needs an opaque surface under it
              warn
                ? "bg-amber-soft text-amber-olive ring-amber-line dark:bg-surface dark:bg-[image:linear-gradient(var(--amber-soft),var(--amber-soft))]"
                : "bg-sky-soft text-azure-fg ring-blue-mid dark:bg-surface dark:bg-[image:linear-gradient(var(--sky-soft),var(--sky-soft))]",
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

const STATE_WORD: Record<SyncItem["state"], string> = {
  sincronizado: "Enviado",
  sincronizando: "Enviando",
  pendiente: "En espera de conexión",
  error: "No se pudo enviar",
};

/** What a queue row says under its label: why it waits, or why the server did not apply it (usted). */
function rowDetail(q: SyncItem, waitFor: SyncItem | undefined, offline: boolean, account: boolean): string {
  if (q.state === "sincronizado" || q.state === "sincronizando") return STATE_WORD[q.state];
  if (q.state === "error") {
    if (!q.problem) return STATE_WORD.error;
    return q.problem.kind === "conflicto" ? `No se aplicó: ${q.problem.message}` : `No se pudo enviar: ${q.problem.message}`;
  }
  if (offline) return STATE_WORD.pendiente;
  if (waitFor)
    return waitFor.state === "error" ? `Bloqueado por «${waitFor.label}», que no se pudo enviar` : `En espera de «${waitFor.label}»`;
  if (q.problem && q.nextAt) return `${q.problem.message} (${fmtTime(q.nextAt)})`;
  return account ? "En cola" : STATE_WORD.pendiente;
}

/**
 * Sync queue: right sheet on desktop, bottom sheet below lg (same chrome as every other modal). Status first, then
 * the queue newest-first; the retry button lives in the sticky footer so it is reachable however long the queue is.
 * Queue rows do not animate: the list reorders on every capture and per-row motion made the whole sheet shimmer.
 */
export function SyncSheet() {
  const open = useUi((s) => s.syncOpen);
  const setOpen = useUi((s) => s.setSyncOpen);
  const { queue, offline, account } = useSyncSummary();
  const retry = useAppStore((s) => s.retrySync);
  // Account sessions: only what a resend can help (a duplicate check-in, a reused op id… only Descartar fixes those).
  const failed = queue.reduce((n, q) => n + ((account ? isRetryable(q) : q.state === "error") ? 1 : 0), 0);

  return (
    <ModalShell
      open={open}
      onOpenChange={setOpen}
      title="Sincronización"
      description="La captura funciona sin internet. Los registros quedan en el dispositivo y se envían al recuperar la conexión."
      desktop="sheet"
      size="sm"
      bodyClassName="pt-2"
      footer={
        failed > 0 ? (
          <Button onClick={retry} disabled={offline} className="h-11 rounded-[12px] px-5 text-[14px] font-semibold">
            <RefreshCw /> Reintentar {plural(failed, "envío", "envíos")}
          </Button>
        ) : undefined
      }
    >
      <SyncPanel />
    </ModalShell>
  );
}

function SyncPanel() {
  const { offline, queue, lastSyncAt, account, lastPullAt, pulling, pullInitial, pullError, needsReauth, saveError } = useSyncSummary();
  const pullNow = useAppStore((s) => s.pullNow);
  const forced = useAppStore((s) => s.sync.forcedOffline);
  const browserOffline = useAppStore((s) => s.sync.browserOffline);
  const setForced = useAppStore((s) => s.setForcedOffline);
  const items = useMemo(() => [...queue].reverse(), [queue]);
  const blockedBy = useMemo(() => waitsFor(queue), [queue]);
  const [discarding, setDiscarding] = useState<SyncItem | null>(null);
  const closeDiscard = useCallback(() => setDiscarding(null), []);
  const waiting = queue.filter((q) => q.state !== "sincronizado").length;
  const failed = queue.filter((q) => q.state === "error").length;
  useNow(30_000); // keeps "hace 2 min" honest while the sheet stays open
  const switchId = useId();

  const status: { tone: "amber" | "red" | "blue"; icon: React.ReactNode; title: string; detail: string } = saveError
    ? { tone: "red" as const, icon: <TriangleAlert className="size-5" />, title: "No se pudo guardar en el dispositivo", detail: saveError }
    : offline
    ? {
        tone: "amber" as const,
        icon: <WifiOff className="size-5" />,
        title: "Trabajando sin conexión",
        detail: waiting
          ? `${plural(waiting, "registro", "registros")} ${waiting === 1 ? "espera" : "esperan"} conexión`
          : "Nada por enviar. Lo que se capture queda en el dispositivo.",
      }
    : needsReauth
      ? {
          tone: "amber" as const,
          icon: <KeyRound className="size-5" />,
          title: "Vuelva a entrar",
          detail: "La sesión de su cuenta ya no está abierta en este dispositivo. Sus datos y cambios siguen aquí: entre de nuevo para recibir y enviar cambios.",
        }
    : failed
      ? {
          tone: "red" as const,
          icon: <TriangleAlert className="size-5" />,
          title: "Hay registros sin enviar",
          detail: account
            ? `El servidor no aplicó ${plural(failed, "registro", "registros")}. Se conservan en el dispositivo: revise cada uno abajo para reintentarlo o descartarlo.`
            : `${plural(failed, "registro", "registros")} con error. Reintente el envío o revise la conexión.`,
        }
      : pulling && pullInitial
        ? {
            tone: "blue" as const,
            icon: <Loader2 className="size-5 animate-spin" />,
            title: "Descargando datos de su cuenta…",
            detail: "Órdenes, jornadas, evidencias y postventa de su alcance. Puede seguir trabajando.",
          }
      : waiting
        ? {
            tone: "blue" as const,
            icon: <CloudUpload className="size-5" />,
            title: "Enviando registros…",
            detail: `${plural(waiting, "registro", "registros")} en cola · última sincronización ${fmtAgo(lastSyncAt)}`,
          }
        : {
            tone: "blue" as const,
            icon: <CloudUpload className="size-5" />,
            title: "Todo sincronizado",
            detail: `Última sincronización ${fmtAgo(lastSyncAt)} · ${fmtTime(lastSyncAt)}`,
          };

  return (
    <div className="space-y-5">
      <div
        role="status"
        className={cn(
          "flex items-center gap-3 rounded-[16px] p-4",
          status.tone === "amber" && "bg-amber-soft",
          status.tone === "red" && "bg-red-soft",
          status.tone === "blue" && "bg-blue-soft",
        )}
      >
        <span
          className={cn(
            "inline-flex size-10 shrink-0 items-center justify-center rounded-[12px]",
            status.tone === "amber" && "bg-amber-mid text-amber-fg",
            status.tone === "red" && "bg-red-tint text-red-fg",
            status.tone === "blue" && "bg-blue-mid text-azure-fg",
          )}
        >
          {status.icon}
        </span>
        <div className="min-w-0 flex-1 text-[14px] leading-snug">
          <p className="font-semibold text-ink">{status.title}</p>
          <p className="text-subtle">{status.detail}</p>
        </div>
      </div>

      {account && (
        <div className="flex min-h-14 flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-[16px] border border-hairline px-4 py-3 text-[14px]">
          <span className="min-w-0">
            <span className="block font-medium text-ink">Datos del servidor</span>
            <span className={cn("block text-[12.5px] leading-snug", pullError && !offline ? "text-amber-fg" : "text-subtle")}>
              {pulling
                ? "Actualizando…"
                : pullError && !offline
                  ? pullError
                  : lastPullAt
                    ? `Actualizados ${fmtAgo(lastPullAt)} · ${fmtTime(lastPullAt)}`
                    : "Aún no se descargan."}
            </span>
          </span>
          {needsReauth ? (
            <Button asChild variant="outline" className="h-10 rounded-[12px] border-line px-4 font-semibold">
              <Link href="/login">
                <KeyRound /> Entrar de nuevo
              </Link>
            </Button>
          ) : (
            <Button
              variant="outline"
              className="h-10 rounded-[12px] border-line px-4 font-semibold"
              disabled={offline || pulling}
              onClick={() => void pullNow({ manual: true })}
            >
              {pulling ? <Loader2 className="animate-spin" /> : <CloudDownload />} Actualizar ahora
            </Button>
          )}
        </div>
      )}

      <label className="flex min-h-14 cursor-pointer items-center justify-between gap-4 rounded-[16px] border border-hairline px-4 py-3 text-[14px]">
        <span className="min-w-0">
          <span id={`${switchId}-l`} className="block font-medium text-ink">
            Simular sin conexión
          </span>
          <span id={`${switchId}-d`} className="block text-[12.5px] leading-snug text-subtle">
            Para probar la captura sin internet{browserOffline ? ". El navegador ya está sin red." : "."}
          </span>
        </span>
        <Switch checked={forced} onCheckedChange={setForced} aria-labelledby={`${switchId}-l`} aria-describedby={`${switchId}-d`} />
      </label>

      <section aria-label="Cola de sincronización">
        <h3 className="mb-2 flex items-baseline justify-between text-[12px] font-semibold uppercase tracking-[0.1em] text-subtle">
          Cola de sincronización
          {items.length > 0 && <span className="tabular tracking-normal">{items.length}</span>}
        </h3>
        {items.length === 0 ? (
          <p className="rounded-[16px] border border-dashed border-line-strong px-4 py-5 text-[13.5px] leading-snug text-subtle">
            Aún no hay registros en este dispositivo. Al capturar una foto, una entrada o un cierre, aparece aquí hasta que se envíe.
          </p>
        ) : (
          <ul className="-mx-2">
            {items.map((q) => (
              <QueueRow key={q.id} item={q} waitFor={blockedBy.get(q.id)} offline={offline} account={account} onDiscard={() => setDiscarding(q)} />
            ))}
          </ul>
        )}
      </section>
      {account && <DiscardDialog item={discarding} onClose={closeDiscard} />}
    </div>
  );
}

/** "Fotos: 6, 2 registros de entrada o salida y 2 notas de bitácora" — the field captures a discard deletes, named. */
function capturesText(set: SyncItem[]): string {
  const sum = discardSummary(set);
  const parts = [
    sum.photos ? plural(sum.photos, "foto", "fotos") : "",
    sum.checks ? plural(sum.checks, "registro de entrada o salida", "registros de entrada o salida") : "",
    sum.notes ? plural(sum.notes, "nota de bitácora", "notas de bitácora") : "",
  ].filter(Boolean);
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} y ${parts.at(-1)}` : (parts[0] ?? "");
}

/** "Descartar": the change leaves the queue for good; the device goes back to what the server has. */
function DiscardDialog({ item, onClose }: { item: SyncItem | null; onClose: () => void }) {
  const queue = useAppStore((s) => s.sync.queue);
  const discard = useAppStore((s) => s.discardSyncItem);
  const set = item ? discardSet(queue, item.id) : [];
  const more = set.length - 1;
  const captures = capturesText(set);
  const sum = discardSummary(set);
  // The answer may have been lost after the server applied it: only the item itself goes (discardSet).
  const unknown = !!item && outcomeUnknown(item);
  // The item is being sent again (or went through) while the dialog was open: close it for good, never reopen by itself.
  useEffect(() => {
    if (item && !set.length) onClose();
  }, [item, set.length, onClose]);
  const many = set.length > 1;
  return (
    <ConfirmDialog
      open={!!item && set.length > 0}
      onOpenChange={(v) => !v && onClose()}
      icon={<Trash2 />}
      iconTone="amber"
      title="Descartar este cambio"
      description="No se enviará al servidor. Lo que este dispositivo muestra de ese registro vuelve a ser lo que tiene el servidor."
      rows={[
        { k: "Cambio", v: item?.label ?? "" },
        ...(more > 0 ? [{ k: "Cambios que dependen de él", v: `${more} más` }] : []),
        ...(sum.photos ? [{ k: "Fotos que se borran del dispositivo", v: String(sum.photos) }] : []),
        ...(sum.checks ? [{ k: "Registros de entrada o salida", v: String(sum.checks) }] : []),
        ...(sum.notes ? [{ k: "Notas de bitácora", v: String(sum.notes) }] : []),
      ]}
      checkboxLabel={
        captures
          ? `Entiendo que ${many ? "estos cambios no llegarán" : "este cambio no llegará"} al servidor y que se borrarán de este dispositivo: ${captures}.`
          : `Entiendo que ${many ? "estos cambios no llegarán" : "este cambio no llegará"} al servidor.`
      }
      confirmLabel={more > 0 ? `Descartar ${set.length} cambios` : "Descartar"}
      destructive
      onConfirm={() => {
        const n = item ? discard(item.id) : 0;
        if (n) toast.success(n === 1 ? "Cambio descartado" : `${n} cambios descartados`, { description: "Se vuelve a leer del servidor." });
        onClose();
      }}
    >
      {item?.problem && <p className="rounded-[14px] bg-soft px-4 py-3 text-[13.5px] leading-snug text-ink">{item.problem.message}</p>}
      {unknown && (
        <p className="mt-3 text-[13.5px] leading-snug text-subtle">
          El último envío no tuvo respuesta: puede que el servidor ya lo haya aplicado. Si es así, este dispositivo lo volverá a
          mostrar. Lo que depende de este cambio sigue en la cola y se enviará.
        </p>
      )}
      {more > 0 && (
        <>
          <p className="mt-3 text-[13.5px] leading-snug text-subtle">
            Usan lo que se descarta (la orden, la foto, la jornada, el registro nuevo…), así que tampoco podrían aplicarse y se
            descartan con él:
          </p>
          <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-[14px] border border-hairline px-4 py-2.5 text-[13px] leading-snug text-ink">
            {set.slice(1).map((q) => (
              <li key={q.id}>{q.label}</li>
            ))}
          </ul>
        </>
      )}
    </ConfirmDialog>
  );
}

function QueueRow({
  item: q,
  waitFor,
  offline,
  account,
  onDiscard,
}: {
  item: SyncItem;
  waitFor?: SyncItem;
  offline: boolean;
  account: boolean;
  onDiscard: () => void;
}) {
  const retry = useAppStore((s) => s.retrySyncItem);
  const detail = rowDetail(q, waitFor, offline, account);
  // Stopped items, and items retried after a server answer (a parent that may never arrive, a server that keeps failing): the
  // person decides. An item waiting for the network only waits.
  const stopped = account && isStopped(q);
  const canRetry = stopped && !!q.op && !NO_RETRY_HINTS.has(q.problem?.hint ?? "");
  return (
    <li className="flex items-start gap-3 rounded-[12px] px-2 py-2.5 text-[13.5px]">
      <span
        className={cn(
          "inline-flex size-7 shrink-0 items-center justify-center rounded-full",
          q.state === "sincronizado" && "bg-teal-soft text-teal-fg",
          q.state === "sincronizando" && "bg-blue-soft text-link",
          q.state === "pendiente" && "bg-amber-soft text-amber-fg",
          q.state === "error" && "bg-red-soft text-red-fg",
        )}
      >
        {q.state === "sincronizado" && <Check className="size-3.5" aria-hidden />}
        {q.state === "sincronizando" && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
        {q.state === "pendiente" && <CloudOff className="size-3.5" aria-hidden />}
        {q.state === "error" && <RefreshCw className="size-3.5" aria-hidden />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 text-ink">
          <span className="sr-only">{detail}: </span>
          {q.label}
        </span>
        {/* the icon alone must not carry the state: say it for everything that has not gone out yet */}
        {q.state !== "sincronizado" && (
          <span aria-hidden className={cn("block text-[12px] leading-snug", q.state === "error" ? "text-red-fg" : "text-subtle")}>
            {detail}
          </span>
        )}
        {stopped && (
          <span className="mt-1.5 flex flex-wrap gap-2">
            {canRetry && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 rounded-[10px] border-line px-3 text-[12.5px] font-semibold"
                disabled={offline}
                onClick={() => retry(q.id)}
                aria-label={`Reintentar «${q.label}»`}
              >
                <RefreshCw /> Reintentar
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="h-8 rounded-[10px] border-line px-3 text-[12.5px] font-semibold"
              onClick={onDiscard}
              aria-label={`Descartar «${q.label}»`}
            >
              <Trash2 /> Descartar
            </Button>
          </span>
        )}
      </span>
      <span className="shrink-0 pt-1 text-[12px] text-subtle tabular">{fmtTime(q.at)}</span>
    </li>
  );
}
