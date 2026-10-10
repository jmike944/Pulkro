"use client";

import { AnimatePresence, motion } from "motion/react";
import { CircleCheck, Download, FileText, Info, Mail, MessageCircle, RotateCcw, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { plural } from "@/lib/format";
import type { Report } from "@/lib/types";
import type { Tone } from "@/lib/status";
import { AuroraFrame } from "@/components/pk/aurora";
import { Eyebrow, IconTile, KeyValues } from "@/components/pk/bits";
import { TonePill } from "@/components/pk/status";
import { EASE } from "@/components/pk/motion";
import { Button } from "@/components/ui/button";
import type { OutputTask } from "./use-report-outputs";
import { SyncGatePanel, TaskProgress, type SyncGate } from "./task-progress";
import { SparkleBurst } from "./fx";
import { REASON, WithReason } from "./guard";

export type ReportStats = { photos: number; pairs: number; jornadas: number; incidents: number; pages: number };

export function reportStatus(latest?: Report): { tone: Tone; label: string } {
  if (!latest) return { tone: "slate", label: "Sin generar" };
  if (latest.shares.length) return { tone: "teal", label: "Envío iniciado" };
  return { tone: "navy", label: `Generado v${latest.version}` };
}

export function ReportCard({
  latest,
  dirty,
  reopened,
  nextVersion,
  stats,
  canShare,
  canExport,
  task,
  gate,
  contact,
  onGenerate,
  onWhatsApp,
  onEmail,
  onDownload,
  onOpenSync,
}: {
  latest?: Report;
  dirty: boolean;
  /** order reopened after closure: a new version is due even without visible changes */
  reopened?: boolean;
  nextVersion: number;
  stats: ReportStats;
  canShare: boolean;
  canExport: boolean;
  task: OutputTask | null;
  gate: SyncGate;
  contact: { name: string; phone: string; email: string };
  onGenerate: () => void;
  onWhatsApp: () => void;
  onEmail: () => void;
  onDownload: () => void;
  onOpenSync: () => void;
}) {
  const status = reportStatus(latest);
  const busy = !!task && task.step !== "listo" && task.step !== "error";
  const needsGenerate = dirty || !latest;
  const badge = needsGenerate ? `v${nextVersion}` : `v${latest?.version}`;

  const shareReason = !canShare ? REASON.share : !latest ? REASON.noReport : gate.kind !== "ok" ? REASON.sync : null;
  const downloadReason = !canExport ? REASON.export : !latest ? REASON.noReport : gate.kind !== "ok" ? REASON.sync : null;

  return (
    <AuroraFrame>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <IconTile tone="navy">
            <FileText />
          </IconTile>
          <div className="min-w-0">
            <p className="text-[17px] font-semibold text-ink">Reporte final</p>
            <p className="text-[13px] text-subtle">Un solo reporte por servicio</p>
          </div>
        </div>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={badge + needsGenerate}
            initial={{ opacity: 0, scale: 0.6, rotate: -8 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            exit={{ opacity: 0, scale: 0.6 }}
            transition={{ type: "spring", stiffness: 420, damping: 22 }}
            className={cn(
              "relative inline-flex h-8 items-center rounded-[10px] px-2.5 text-[14px] font-bold tabular",
              needsGenerate ? "border border-dashed border-line-dash text-subtle" : "bg-brand-deep text-white shadow-[0_8px_18px_-10px_rgb(7_36_63/0.8)]",
            )}
          >
            {badge}
            {!needsGenerate && <SparkleBurst className="-inset-3" />}
          </motion.span>
        </AnimatePresence>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <TonePill tone={status.tone} live={status.tone === "teal"}>
          {status.label}
        </TonePill>
        {latest?.shares.length ? <span className="text-[12.5px] text-subtle">sin confirmación de entrega</span> : null}
      </div>

      <KeyValues
        className="mt-5"
        rows={[
          { k: "Fotos seleccionadas", v: stats.photos ? `${stats.photos} · ${plural(stats.pairs, "par", "pares")}` : "Ninguna" },
          { k: "Jornadas", v: `${stats.jornadas} · un solo reporte` },
          { k: "Incidencias", v: stats.incidents || "Sin incidencias" },
          { k: "Páginas", v: stats.pages || "—" },
        ]}
      />

      <AnimatePresence initial={false}>
        {dirty && latest && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <p className="mt-4 flex gap-2.5 rounded-[14px] bg-violet-soft px-3.5 py-3 text-[13.5px] leading-snug text-violet-ink">
              <RotateCcw className="mt-0.5 size-4 shrink-0" />
              <span>
                {reopened ? "Orden reabierta tras el cierre." : "Hay cambios sin generar."} Se creará la <b className="font-semibold">v{nextVersion}</b>; la v{latest.version} queda
                en el historial.
              </span>
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-5">
        <AnimatePresence mode="wait" initial={false}>
          {task && task.step !== "error" ? (
            <motion.div key="task" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.25, ease: EASE }}>
              <TaskProgress task={task} />
            </motion.div>
          ) : needsGenerate ? (
            <motion.div key="gen" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.25, ease: EASE }}>
              <WithReason reason={canShare ? null : REASON.share} className="w-full">
                <motion.div whileTap={{ scale: canShare ? 0.985 : 1 }} className="w-full">
                  <Button onClick={onGenerate} disabled={!canShare} className="h-12 w-full rounded-[14px] text-[15.5px] font-semibold shadow-[0_12px_26px_-14px_rgb(7_36_63/0.85)]">
                    <Sparkles /> Generar PDF v{nextVersion}
                  </Button>
                </motion.div>
              </WithReason>
              {task?.step === "error" && <p className="mt-2 text-[13px] text-red-fg">{task.error} Intente de nuevo.</p>}
            </motion.div>
          ) : (
            <motion.div
              key="ready"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.25, ease: EASE }}
              className="flex items-center gap-3 rounded-[14px] bg-teal-soft px-3.5 py-3"
            >
              <CircleCheck className="size-5 shrink-0 text-teal-fg" />
              <div className="min-w-0 text-[13.5px] leading-snug">
                <p className="font-semibold text-ink">Versión v{latest?.version} lista para compartir</p>
                <p className="text-subtle">Edite la descripción o las fotos para crear una nueva versión.</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="my-6 h-px bg-hairline" />

      <Eyebrow>Compartir con el cliente</Eyebrow>
      <SyncGatePanel gate={gate} onOpenSync={onOpenSync} className="mt-3" />
      <div className="mt-3 grid gap-2.5">
        <WithReason reason={shareReason} className="w-full">
          <Button
            onClick={onWhatsApp}
            disabled={!!shareReason || busy}
            variant={needsGenerate ? "outline" : "default"}
            className={cn("h-12 w-full rounded-[14px] text-[15px] font-semibold", needsGenerate && "border-line")}
          >
            <MessageCircle /> Compartir por WhatsApp{latest && needsGenerate ? ` · v${latest.version}` : ""}
          </Button>
        </WithReason>
        <WithReason reason={shareReason} className="w-full">
          <Button onClick={onEmail} disabled={!!shareReason || busy} variant="outline" className="h-11 w-full rounded-[14px] border-line font-semibold">
            <Mail /> Enviar por correo
          </Button>
        </WithReason>
        <WithReason reason={downloadReason} className="w-full">
          <Button onClick={onDownload} disabled={!!downloadReason || busy} variant="outline" className="h-11 w-full rounded-[14px] border-line font-semibold">
            <Download /> Descargar PDF
          </Button>
        </WithReason>
      </div>
      <div className="mt-4 space-y-1 text-[12.5px] leading-snug text-subtle">
        <p className="truncate">
          WhatsApp: <span className="text-ink">{contact.name}</span> · {contact.phone}
        </p>
        <p className="truncate">
          Correo: <span className="text-ink">{contact.email}</span>
        </p>
        <p className="flex items-start gap-1.5 pt-2">
          <Info className="mt-px size-3.5 shrink-0" />
          Envío manual desde este dispositivo: se registra el intento, nunca la entrega.
        </p>
      </div>
    </AuroraFrame>
  );
}
