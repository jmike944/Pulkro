"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, CloudOff, CloudUpload, Database, Globe, Image as ImageIcon, Loader2, MapPinned, MessageCircle, RefreshCw, Shuffle, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore, useNow, useScopedAudit, useScopedData, useSyncSummary } from "@/lib/hooks";
import { fmtAgo, fmtNum, fmtRelativeDay, fmtTime, plural } from "@/lib/format";
import type { SyncItem } from "@/lib/types";
import { isBulkRetryable } from "@/lib/sync/queue";
import { AuroraPanel, GlassCard } from "@/components/pk/aurora";
import { AnimatedNumber, IconTile, MiniStat, SectionHeader } from "@/components/pk/bits";
import { Segmented } from "@/components/pk/page";
import { TonePill } from "@/components/pk/status";
import { EmptyState } from "@/components/pk/feedback";
import { EASE } from "@/components/pk/motion";
import { Button } from "@/components/ui/button";
import { DocTag, SwitchLite, fmtBytes, type DocStatus } from "./shared";
import { SyncPipeline } from "./sync-pipeline";
import { DeviceData } from "./device-data";
import { StorageCalculator } from "./storage-calculator";

const DECISIONS: { icon: React.ReactNode; title: string; status: DocStatus; text: string; now: string }[] = [
  {
    icon: <Globe />,
    title: "Nube o servidor propio",
    status: "pendiente",
    text: "El desarrollador debe proponer opciones con costo mensual, retención y respaldos.",
    now: "Todo vive en el navegador (IndexedDB) y la sincronización con el servidor está simulada.",
  },
  {
    icon: <Database />,
    title: "Retención y respaldos",
    status: "pendiente",
    text: "Cuánto tiempo se guardan órdenes, fotos y bitácora, y cómo se recupera la información.",
    now: "Respaldo manual en JSON desde esta pantalla; sin copias automáticas.",
  },
  {
    icon: <ImageIcon />,
    title: "Compresión y límite de fotos",
    status: "pendiente",
    text: "Volumen estimado por mes, límite de fotos por jornada y calidad mínima para el reporte.",
    now: "Cada foto se reduce a 1600 px y JPEG 82% antes de guardarse; sin límite por jornada.",
  },
  {
    icon: <MapPinned />,
    title: "Mapas y GPS sin conexión",
    status: "pendiente",
    text: "Mapas sin conexión y política cuando el GPS no está disponible.",
    now: "El GPS funciona sin red; los mapas se cargan solo con conexión. Sin señal se pide justificación.",
  },
  {
    icon: <Shuffle />,
    title: "Conflictos y duplicados",
    status: "propuesto",
    text: "Cola con reintentos, estados pendiente · sincronizado · error y prevención de duplicados.",
    now: "Entrada o salida repetida se rechaza; la hora del servidor se sella al sincronizar.",
  },
  {
    icon: <MessageCircle />,
    title: "Correo y proveedor de WhatsApp",
    status: "pendiente",
    text: "Hoja de compartir del teléfono (MVP) o integración oficial con registro de entrega.",
    now: "Se abre WhatsApp o el correo del teléfono; nunca se afirma que el mensaje fue entregado.",
  },
];

/** Sincronización y datos: offline-first model, live queue, device storage, backup and pending infra decisions. */
export function SyncTab() {
  const { offline, pending, syncing, lastSyncAt, queue, account } = useSyncSummary();
  const forced = useAppStore((s) => s.sync.forcedOffline);
  const browserOffline = useAppStore((s) => s.sync.browserOffline);
  const setForced = useAppStore((s) => s.setForcedOffline);
  const retry = useAppStore((s) => s.retrySync);
  // Records the role may see on this device (doc §2), not the whole dataset the device keeps.
  const scoped = useScopedData();
  const audit = useScopedAudit();
  const stored =
    scoped.orders.length + scoped.jornadas.length + scoped.photos.length + scoped.incidents.length + scoped.reports.length +
    scoped.cases.length + scoped.surveys.length + audit.length;
  useNow(15_000);

  const errors = queue.filter((q) => q.state === "error").length;
  // Account sessions: "Reintentar" only resends what a resend can help (the sync sheet offers Descartar for the rest).
  const retryable = account ? queue.filter(isBulkRetryable).length : errors;
  const waiting = pending.length - errors;
  const sent = queue.filter((q) => q.state === "sincronizado").length;
  const toSend = pending.length + syncing.length;
  const status = offline ? { tone: "amber" as const, label: "Sin conexión" } : toSend ? { tone: "sky" as const, label: "Sincronizando" } : { tone: "teal" as const, label: "Al día" };

  return (
    <div>
      {/* ── Hero: live queue + offline-first model ── */}
      <AuroraPanel className="p-3 sm:p-6 lg:p-8">
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] xl:gap-10">
          <GlassCard className="p-5 sm:p-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <IconTile tone={offline ? "amber" : "sky"}>{offline ? <WifiOff /> : <CloudUpload />}</IconTile>
                <span className="text-[15px] font-medium text-ink">Cola de sincronización</span>
              </div>
              <TonePill tone={status.tone} live={!offline && toSend > 0}>
                {status.label}
              </TonePill>
            </div>
            <div className="mt-5 flex items-end gap-3">
              <AnimatedNumber value={toSend} className="text-[64px] font-medium leading-none tracking-[-0.045em] text-ink sm:text-[76px]" />
              <span className="mb-2 text-[15px] text-subtle">{toSend === 1 ? "registro por enviar" : "registros por enviar"}</span>
            </div>
            <p className="mt-3 text-[14px] text-subtle">
              Última sincronización {fmtAgo(lastSyncAt)} · {fmtTime(lastSyncAt)}
            </p>
            <div className="mt-6 grid grid-cols-3 divide-x divide-hairline border-t border-hairline pt-5">
              <MiniStat tone="amber" label="En espera" value={waiting} className="pr-3" />
              <MiniStat tone="red" label="Con error" value={errors} className="px-3 sm:px-5" />
              <MiniStat tone="teal" label="Enviados" value={sent} sub="recientes" className="pl-3 sm:pl-5" />
            </div>
            <div className="mt-5 flex items-center justify-between gap-4 rounded-[16px] bg-soft px-4 py-3">
              <div className="min-w-0">
                <p className="text-[14px] font-semibold text-ink">Simular sin conexión</p>
                <p className="text-[12.5px] leading-snug text-subtle">
                  {browserOffline ? "El navegador está sin red: la captura sigue funcionando." : "Pruebe la captura en campo sin internet."}
                </p>
              </div>
              <SwitchLite checked={forced} onChange={setForced} label="Simular sin conexión" />
            </div>
            <AnimatePresence initial={false}>
              {retryable > 0 && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                  <Button variant="outline" onClick={retry} disabled={offline} className="mt-3 h-11 w-full rounded-[12px] border-line font-semibold">
                    <RefreshCw className="size-4" /> Reintentar {plural(retryable, "envío", "envíos")} con error
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </GlassCard>

          <div className="flex min-w-0 flex-col justify-between gap-6 px-1 pb-1 sm:px-0">
            <div>
              <p className="flex flex-wrap items-center gap-2 text-[14px] font-medium text-ink/70">
                Cómo viaja un registro <DocTag status="confirmado" />
              </p>
              <p className="mt-2 max-w-lg font-serif text-[24px] leading-tight text-ink sm:text-[28px]">Se captura sin internet y se envía al recuperar la señal.</p>
            </div>
            <SyncPipeline offline={offline} queued={toSend} syncing={syncing.length > 0} stored={stored} lastSyncAt={lastSyncAt} />
            <ul className="grid gap-2 text-[13px] text-ink/75 sm:grid-cols-3">
              <li className="rounded-[14px] bg-surface/55 px-3 py-2.5 backdrop-blur-sm">
                <b className="font-semibold text-ink">1 · Captura local.</b> GPS, fotos e incidencias se guardan al instante con hora del dispositivo.
              </li>
              <li className="rounded-[14px] bg-surface/55 px-3 py-2.5 backdrop-blur-sm">
                <b className="font-semibold text-ink">2 · Cola.</b> Cada registro espera con marca de pendiente; las fotos se ven en la cola.
              </li>
              <li className="rounded-[14px] bg-surface/55 px-3 py-2.5 backdrop-blur-sm">
                <b className="font-semibold text-ink">3 · Servidor.</b> Al sincronizar se sella la hora del servidor; el PDF definitivo se habilita.
              </li>
            </ul>
          </div>
        </div>
      </AuroraPanel>

      {/* ── Queue activity + device data ── */}
      <section className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:gap-0">
        <div className="min-w-0 lg:border-r lg:border-hairline lg:pr-10">
          <QueueActivity queue={queue} offline={offline} />
        </div>
        <div className="min-w-0 lg:pl-10">
          <DeviceData />
        </div>
      </section>

      {/* ── Pending infrastructure decisions ── */}
      <section className="mt-12">
        <SectionHeader title="Decisiones de infraestructura" subtitle="Definiciones del documento maestro necesarias para cotizar. Cada tarjeta indica lo que hoy supone el prototipo." />
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <StorageCalculator />
          <motion.ul variants={{ show: { transition: { staggerChildren: 0.05 } } }} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-60px" }} className="grid gap-3 sm:grid-cols-2">
            {DECISIONS.map((d) => (
              <motion.li
                key={d.title}
                variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE } } }}
                className="flex flex-col rounded-[20px] border border-hairline bg-surface p-4 shadow-soft"
              >
                <div className="flex items-center justify-between gap-2">
                  <IconTile tone={d.status === "pendiente" ? "amber" : "sky"}>{d.icon}</IconTile>
                  <DocTag status={d.status} />
                </div>
                <p className="mt-3 text-[14.5px] font-semibold text-ink">{d.title}</p>
                <p className="mt-1 text-[13px] leading-relaxed text-subtle">{d.text}</p>
                <p className="mt-auto pt-3 text-[12.5px] leading-snug text-ink/75">
                  <span className="font-semibold text-ink">Hoy: </span>
                  {d.now}
                </p>
              </motion.li>
            ))}
          </motion.ul>
        </div>
      </section>
    </div>
  );
}

const STATE_META: Record<SyncItem["state"], { label: string; cls: string; icon: React.ReactNode }> = {
  sincronizado: { label: "Sincronizado", cls: "bg-teal-soft text-teal-fg", icon: <Check className="size-4" strokeWidth={2.5} /> },
  sincronizando: { label: "Enviando", cls: "bg-blue-soft text-link", icon: <Loader2 className="size-4 animate-spin" /> },
  pendiente: { label: "Pendiente", cls: "bg-amber-soft text-amber-fg", icon: <CloudOff className="size-4" /> },
  error: { label: "Error", cls: "bg-red-soft text-red-fg", icon: <RefreshCw className="size-4" /> },
};

function QueueActivity({ queue, offline }: { queue: SyncItem[]; offline: boolean }) {
  const [filter, setFilter] = useState<"pendientes" | "todo">("todo");
  const items = useMemo(() => {
    const xs = [...queue].reverse();
    return filter === "pendientes" ? xs.filter((q) => q.state !== "sincronizado") : xs;
  }, [queue, filter]);

  return (
    <div>
      <SectionHeader
        title="Actividad de sincronización"
        subtitle="Movimientos recientes de este dispositivo; se conservan los últimos 60 enviados."
        action={
          <Segmented
            id="queue-filter"
            value={filter}
            onChange={setFilter}
            items={[
              { value: "todo", label: "Todo" },
              { value: "pendientes", label: "Pendientes" },
            ]}
          />
        }
      />
      {items.length === 0 ? (
        <EmptyState icon={filter === "pendientes" ? <Check /> : <CloudUpload />} title={filter === "pendientes" ? "Nada pendiente" : "Sin movimientos"}>
          {filter === "pendientes"
            ? "Todo lo capturado ya llegó al servidor."
            : `Registre una entrada, una foto o una incidencia${offline ? " sin conexión" : ""} para ver cómo viaja.`}
        </EmptyState>
      ) : (
        <ul className="max-h-[560px] overflow-y-auto pr-1 [scrollbar-width:thin]">
          <AnimatePresence initial={false}>
            {items.map((q) => {
              const m = STATE_META[q.state];
              return (
                <motion.li
                  key={q.id}
                  layout
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3, ease: EASE }}
                  className="flex items-center gap-3 border-b border-hairline py-3"
                >
                  <motion.span layout className={cn("inline-flex size-9 shrink-0 items-center justify-center rounded-full transition-colors duration-300", m.cls)}>
                    {m.icon}
                  </motion.span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14.5px] font-medium text-ink">{q.label}</p>
                    <p className="text-[12.5px] text-subtle">
                      {q.state === "error" && q.problem ? (q.problem.kind === "conflicto" ? "No se aplicó" : "Error") : m.label}
                      {q.bytes ? ` · ${fmtBytes(q.bytes)}` : ""}
                    </p>
                    {q.problem && q.state !== "sincronizado" && (
                      <p className={cn("text-[12.5px] leading-snug", q.state === "error" ? "text-red-fg" : "text-subtle")}>{q.problem.message}</p>
                    )}
                  </div>
                  <span className="shrink-0 text-right text-[12.5px] text-subtle tabular">
                    {fmtRelativeDay(q.at)}
                    <br />
                    {fmtTime(q.at)}
                  </span>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}
      <p className="mt-4 text-[12.5px] text-subtle">{fmtNum(queue.length)} movimientos en la cola local.</p>
    </div>
  );
}
