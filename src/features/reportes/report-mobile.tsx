"use client";

import { motion } from "motion/react";
import { ChevronRight, CircleAlert, CircleCheck, Download, Info, Mail, MessageCircle, RotateCcw, Send, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtDuration, fmtTime, minutesBetween, plural } from "@/lib/format";
import type { Report, ShareChannel } from "@/lib/types";
import { PulkroMark } from "@/components/pk/brand";
import { IconTile } from "@/components/pk/bits";
import { ClientMark } from "@/components/pk/client-mark";
import { TonePill } from "@/components/pk/status";
import { AuroraStat, BigButton, FieldCaption, FlowHeading, FlowScreen, ItemCard, NextStepCard, SuccessHero } from "@/components/pk/mobile";
import type { OutputTask } from "./use-report-outputs";
import { SyncGatePanel, TaskProgress, type SyncGate } from "./task-progress";
import { reportStatus, type ReportStats } from "./report-card";
import { CHANNEL_TO_LABEL } from "./share";
import { reportFileName } from "./report-model";
import { REASON } from "./guard";

/* ───────────── status card (phones) ───────────── */

export function MobileReportCard({
  latest,
  dirty,
  reopened,
  nextVersion,
  stats,
  canShare,
  canExport,
  busy,
  task,
  gate,
  contactName,
  onGenerate,
  onShare,
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
  busy: boolean;
  task: OutputTask | null;
  gate: SyncGate;
  contactName: string;
  onGenerate: () => void;
  onShare: () => void;
  onDownload: () => void;
  onOpenSync: () => void;
}) {
  const status = reportStatus(latest);
  const needsGenerate = dirty || !latest;
  // Same rule as the desktop card: no definitive PDF out of the device while records of the order are unsynced.
  const downloadBlocked = !latest || !canExport || gate.kind !== "ok";
  return (
    <NextStepCard
      avatar={<PulkroMark className="size-11 rounded-[13px]" animated={busy} />}
      name="Reporte final"
      sub={`${status.label}${latest?.shares.length ? " · sin confirmación" : ""}`}
      value={
        <span className={cn("rounded-[10px] px-2 py-1 text-[15px] font-bold", needsGenerate ? "border border-dashed border-[#b9c7d6] text-subtle" : "bg-brand-deep text-white")}>
          v{needsGenerate ? nextVersion : latest?.version}
        </span>
      }
      message={
        <>
          {stats.photos ? (
            <>
              <b className="font-semibold text-ink">{plural(stats.photos, "foto", "fotos")}</b> en {plural(stats.pairs, "par", "pares")}
            </>
          ) : (
            "Sin fotos seleccionadas"
          )}
          {" · "}
          {plural(stats.jornadas, "jornada", "jornadas")} · {stats.incidents ? plural(stats.incidents, "incidencia", "incidencias") : "sin incidencias"} ·{" "}
          {plural(stats.pages || 1, "página", "páginas")}.{" "}
          {needsGenerate
            ? latest
              ? `${reopened ? "Orden reabierta tras el cierre" : "Hay cambios"}: se creará la v${nextVersion}.`
              : `Genere el PDF y compártalo con ${contactName}.`
            : `Listo para compartir con ${contactName}.`}
        </>
      }
      action={
        <>
          <SyncGatePanel gate={gate} onOpenSync={onOpenSync} className="mb-3" />
          {busy && task ? (
            <TaskProgress task={task} />
          ) : (
            <div className="grid gap-2.5">
              {canShare ? (
                needsGenerate ? (
                  <>
                    <BigButton onClick={onGenerate}>
                      <Sparkles /> Generar PDF v{nextVersion}
                    </BigButton>
                    {latest && (
                      <BigButton variant="outline" onClick={onShare}>
                        <Send /> Compartir v{latest.version}
                      </BigButton>
                    )}
                  </>
                ) : (
                  <BigButton onClick={onShare}>
                    <Send /> Compartir reporte
                  </BigButton>
                )
              ) : (
                <>
                  <BigButton variant="outline" onClick={onDownload} disabled={downloadBlocked}>
                    <Download /> {latest ? `Descargar PDF v${latest.version}` : "Aún sin PDF"}
                  </BigButton>
                  <p className="flex items-start gap-2 text-[13.5px] leading-snug text-subtle">
                    <Info className="mt-0.5 size-4 shrink-0" />
                    {REASON.share}
                  </p>
                </>
              )}
              {task?.step === "error" && <p className="text-[13.5px] leading-snug text-st-red">{task.error} Intente de nuevo.</p>}
            </div>
          )}
        </>
      }
    />
  );
}

/* ───────────── generate / share flow (phones) ───────────── */

export type SentInfo = { channel: ShareChannel; at: string; version: number };

export function ReportFlow({
  open,
  onOpenChange,
  folio,
  title,
  client,
  latest,
  task,
  gate,
  sent,
  canShare,
  canExport,
  canPostventa,
  closedAt,
  contact,
  onWhatsApp,
  onEmail,
  onDownload,
  onOpenSync,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  folio: string;
  title: string;
  client: { name: string; hue: number };
  latest?: Report;
  task: OutputTask | null;
  gate: SyncGate;
  sent: SentInfo | null;
  canShare: boolean;
  canExport: boolean;
  canPostventa: boolean;
  closedAt?: string;
  contact: { name: string; phone: string; emailName: string; email: string };
  onWhatsApp: () => void;
  onEmail: () => void;
  onDownload: () => void;
  onOpenSync: () => void;
}) {
  const busy = !!task && task.step !== "listo" && task.step !== "error";
  const step = sent ? "enviado" : busy ? "progreso" : "compartir";
  const blocked = gate.kind !== "ok";

  return (
    <FlowScreen
      open={open}
      onOpenChange={onOpenChange}
      title={step === "enviado" ? undefined : step === "progreso" ? "Reporte PDF" : "Compartir reporte"}
      description="Generar y compartir el reporte final"
      footer={
        step === "enviado" ? (
          <div className="grid gap-2.5">
            {canPostventa && (
              <BigButton href={`/postventa?orden=${folio}`}>
                <Send /> Enviar encuesta
              </BigButton>
            )}
            <BigButton href="/" variant="outline">
              Volver a Hoy
            </BigButton>
          </div>
        ) : undefined
      }
    >
      {step === "progreso" && task && (
        <div>
          <FlowHeading
            eyebrow={
              <>
                <PulkroMark className="size-5 rounded-[6px]" /> {folio} · v{task.version}
              </>
            }
            title={task.kind === "generate" ? `Generando reporte v${task.version}` : `Preparando PDF v${task.version}`}
          >
            Fotos y páginas se componen en este dispositivo; funciona aun sin conexión.
          </FlowHeading>
          <PaperLoop />
          <TaskProgress task={task} className="mt-8" />
        </div>
      )}

      {step === "compartir" && (
        <div>
          <FlowHeading
            eyebrow={
              <>
                <PulkroMark className="size-5 rounded-[6px]" /> {folio}
                {latest && ` · v${latest.version}`}
              </>
            }
            title="Compartir con el cliente"
          >
            Elija cómo enviarlo. El envío es manual: se registra el intento, nunca la entrega.
          </FlowHeading>
          {task?.step === "listo" && (
            <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="mb-4 flex items-center gap-3 rounded-[16px] bg-[#e7f7f4] px-4 py-3 text-[14.5px] text-ink">
              <CircleCheck className="size-5 shrink-0 text-st-teal" />
              <span>
                <b className="font-semibold">PDF v{task.version} listo.</b> Revíselo y compártalo.
              </span>
            </motion.div>
          )}
          {task?.step === "error" && (
            <p className="mb-4 flex items-start gap-3 rounded-[16px] bg-[#fdeeee] px-4 py-3 text-[14.5px] leading-snug text-st-red">
              <CircleAlert className="mt-0.5 size-5 shrink-0" />
              <span>{task.error} Intente de nuevo.</span>
            </p>
          )}
          <SyncGatePanel gate={gate} onOpenSync={onOpenSync} className="mb-4" />
          {!latest ? (
            <p className="rounded-[16px] bg-sand px-4 py-4 text-[15px] text-subtle">{REASON.noReport}</p>
          ) : (
            <div>
              <FieldCaption>Canales</FieldCaption>
              <ShareOption
                icon={<MessageCircle />}
                tone="teal"
                title="WhatsApp"
                meta={`${contact.name} · ${contact.phone}`}
                disabled={!canShare || blocked}
                reason={!canShare ? REASON.share : undefined}
                onClick={onWhatsApp}
              />
              <ShareOption
                icon={<Mail />}
                tone="sky"
                title="Correo"
                meta={`${contact.emailName} · ${contact.email}`}
                disabled={!canShare || blocked}
                reason={!canShare ? REASON.share : undefined}
                onClick={onEmail}
              />
              <ShareOption
                icon={<Download />}
                tone="violet"
                title="Descargar PDF"
                meta={reportFileName(folio, latest.version)}
                disabled={!canExport || blocked}
                reason={!canExport ? REASON.export : undefined}
                onClick={onDownload}
              />
              <p className="mt-5 flex items-start gap-2 text-[13.5px] leading-snug text-subtle">
                <Info className="mt-0.5 size-4 shrink-0" />
                Cada intento queda en el historial de envíos con la nota “sin confirmación de entrega”.
              </p>
            </div>
          )}
        </div>
      )}

      {step === "enviado" && sent && (
        <SentScreen sent={sent} folio={folio} title={title} client={client} contactName={sent.channel === "email" ? contact.emailName : contact.name} closedAt={closedAt} />
      )}
    </FlowScreen>
  );
}

function ShareOption({
  icon,
  tone,
  title,
  meta,
  disabled,
  reason,
  onClick,
}: {
  icon: React.ReactNode;
  tone: "teal" | "sky" | "violet";
  title: string;
  meta: string;
  disabled: boolean;
  reason?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center gap-4 border-b border-hairline py-4 text-left last:border-0 active:bg-sand/60 disabled:opacity-50"
    >
      <IconTile tone={tone} className="size-12 rounded-[14px] [&_svg]:size-[22px]">
        {icon}
      </IconTile>
      <span className="min-w-0 flex-1">
        <span className="block text-[16px] font-semibold text-ink">{title}</span>
        <span className="block truncate text-[13.5px] text-subtle">{reason ?? meta}</span>
      </span>
      <ChevronRight className="size-[18px] shrink-0 text-[#98a2b3]" />
    </button>
  );
}

function SentScreen({ sent, folio, title, client, contactName, closedAt }: { sent: SentInfo; folio: string; title: string; client: { name: string; hue: number }; contactName: string; closedAt?: string }) {
  const label = CHANNEL_TO_LABEL[sent.channel];
  const elapsed = closedAt ? minutesBetween(closedAt, sent.at) : 0;
  return (
    <div className="pb-2">
      <SuccessHero title={sent.channel === "descarga" ? "PDF descargado" : `Envío iniciado por ${label}`}>
        {sent.channel === "descarga"
          ? "El PDF quedó en este dispositivo para entregarlo manualmente."
          : `Se abrió ${sent.channel === "whatsapp" ? "WhatsApp" : "su correo"} con el reporte para ${contactName}.`}{" "}
        Sin confirmación de entrega: confirme con el cliente que lo recibió.
      </SuccessHero>
      <ItemCard
        className="mt-8"
        leading={<ClientMark name={client.name} hue={client.hue} size={44} />}
        title={title}
        sub={`${folio} · v${sent.version} · ${fmtTime(sent.at)}`}
        status={<TonePill tone="teal">Envío iniciado</TonePill>}
      />
      {closedAt && elapsed > 0 && (
        <AuroraStat
          className="mt-4"
          label="Del cierre validado a este envío"
          value={fmtDuration(elapsed)}
          sub="Mientras antes llegue el reporte, antes se puede pedir la encuesta de satisfacción."
        />
      )}
    </div>
  );
}

/** Mini A4 sheet with a looping squeegee pass while the PDF is composed. */
function PaperLoop() {
  return (
    <div className="mx-auto mt-2 w-[150px]" aria-hidden>
      <div className="relative aspect-[210/297] overflow-hidden rounded-[4px] bg-white p-3.5 shadow-[0_18px_36px_-18px_rgb(2_58_99/0.45)] ring-1 ring-black/5">
        <div className="flex items-center gap-1.5">
          <span className="size-3.5 rounded-[4px] bg-brand-deep" />
          <span className="h-1.5 w-10 rounded-full bg-[#dfe6ee]" />
        </div>
        <div className="mt-2 h-[2px] rounded-full bg-gradient-to-r from-brand via-sky to-[#b9c7ff]" />
        <div className="mt-2.5 space-y-1.5">
          {[90, 70, 84, 56].map((w, i) => (
            <div key={i} className="h-1 rounded-full bg-[#eef1f5]" style={{ width: `${w}%` }} />
          ))}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-1.5">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={cn("aspect-[4/3] rounded-[3px]", i % 2 ? "bg-[#dcf4ef]" : "bg-[#fff1d6]")} />
          ))}
        </div>
        <motion.span
          className="absolute inset-y-0 left-0 w-full motion-reduce:hidden"
          initial={{ x: "-110%" }}
          animate={{ x: "110%" }}
          transition={{ duration: 1.6, repeat: Infinity, repeatDelay: 0.3, ease: [0.65, 0, 0.35, 1] }}
        >
          <span className="absolute inset-y-0 right-[5px] w-2/3 bg-gradient-to-r from-transparent via-sky/15 to-white/90" />
          <span className="absolute inset-y-[-6%] right-0 w-[5px] rounded-full bg-brand/85 shadow-[0_0_16px_rgb(122_209_244/0.95)]" />
        </motion.span>
      </div>
    </div>
  );
}

/* ───────────── description editor (phones) ───────────── */

export function DescriptionFlow({
  open,
  onOpenChange,
  value,
  onChange,
  original,
  canEdit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  value: string;
  onChange: (v: string) => void;
  original: string;
  canEdit: boolean;
}) {
  return (
    <FlowScreen
      open={open}
      onOpenChange={onOpenChange}
      title="Descripción"
      description="Editar la descripción del servicio"
      footer={
        <div className="grid gap-2.5">
          <BigButton onClick={() => onOpenChange(false)}>Listo</BigButton>
          {value.trim() !== original.trim() && (
            <BigButton variant="outline" onClick={() => onChange(original)}>
              <RotateCcw /> Restaurar texto del cierre
            </BigButton>
          )}
        </div>
      }
    >
      <FlowHeading title="Descripción del servicio">Se imprime en el reporte. Al cambiarla, el siguiente PDF se guarda como una nueva versión.</FlowHeading>
      <FieldCaption>Texto para el cliente</FieldCaption>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={!canEdit}
        rows={9}
        aria-label="Descripción del servicio"
        placeholder="Describa el trabajo realizado para el cliente…"
        className="block w-full resize-none rounded-[14px] border border-[#e2e0da] bg-[#faf9f6] px-4 py-3.5 text-[16px] leading-relaxed text-ink outline-none placeholder:text-[#98a2b3] focus:border-sky focus:ring-3 focus:ring-sky/30 disabled:opacity-60"
      />
      <p className="mt-2 text-right text-[12.5px] text-subtle tabular">{value.trim().length} caracteres</p>
    </FlowScreen>
  );
}
