"use client";

import { motion } from "motion/react";
import { CalendarClock, Check, CircleAlert, ClipboardCheck, FileText, ShieldAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtDateTime, fmtTime } from "@/lib/format";
import { DONE_STATUSES } from "@/lib/status";
import { PulkroMark } from "@/components/pk/brand";
import { BigButton, NextStepCard } from "@/components/pk/mobile";
import { rowVariants, staggerContainer } from "@/components/pk/motion";
import { Gate, fmtShortDay } from "./field-bits";
import type { FieldReady } from "./use-field-state";

/**
 * What happens after this jornada closes (doc §3, pasos 10–11): another jornada pending → its link;
 * otherwise the closure validation with the required-evidence checklist.
 */
export function NextStep({ f }: { f: FieldReady }) {
  const { order } = f;
  const avatar = <PulkroMark className="size-11 rounded-[13px]" />;
  // The next pending day, or any other jornada of the order still open (skipped / in progress).
  const nextJornada = f.nextJornada ?? f.jornadas.find((j) => j.id !== f.jornada.id && j.status !== "cerrada");

  if (nextJornada && order.status !== "cancelada" && !DONE_STATUSES.includes(order.status)) {
    const live = nextJornada.status === "en_curso";
    return (
      <NextStepCard
        avatar={
          <span className="inline-flex size-11 items-center justify-center rounded-[13px] bg-sky-soft text-[#1667e0]">
            <CalendarClock className="size-5" />
          </span>
        }
        name={live ? `Jornada ${nextJornada.dayIndex} en curso` : nextJornada.dayIndex < f.jornada.dayIndex ? "Jornada pendiente" : "Siguiente jornada"}
        sub={`Jornada ${nextJornada.dayIndex} de ${f.total}`}
        value={fmtTime(nextJornada.plannedStart)}
        message={
          <>
            <b className="font-semibold text-ink">
              {fmtShortDay(nextJornada.plannedStart)} {fmtTime(nextJornada.plannedStart)}
            </b>{" "}
            en {f.site.name}. Cada jornada guarda su propia entrada, salida y fotos; el cierre definitivo es uno solo al terminar la última.
          </>
        }
        action={<BigButton href={`/jornada/${nextJornada.id}`}>Abrir Jornada {nextJornada.dayIndex}</BigButton>}
      />
    );
  }

  if (DONE_STATUSES.includes(order.status)) {
    return (
      <NextStepCard
        avatar={avatar}
        name="Cierre validado"
        sub={order.closure ? fmtDateTime(order.closure.validatedAt) : order.folio}
        value={order.folio}
        message={<>La orden ya tiene cierre definitivo. Desde el reporte se seleccionan las fotos y se comparte con el cliente por WhatsApp o correo.</>}
        action={
          <BigButton href={`/ordenes/${order.folio}/reporte`} variant="outline">
            <FileText /> Ver reporte
          </BigButton>
        }
      />
    );
  }

  if (order.status === "cancelada") return null;

  const blocking = f.blockers.filter((b) => b.severity === "block");
  const blockingIncident = f.blockers.find((b) => b.severity === "block" && b.href?.startsWith("/incidencias"));
  const closeReason = f.permissions.close ? null : `Solo el supervisor autoriza el cierre · ${f.roleLabel} tiene acceso de consulta.`;

  return (
    <NextStepCard
      avatar={avatar}
      name={blocking.length ? "Revisar antes de cerrar" : "Listo para validar cierre"}
      sub={`${order.folio} · ${f.total} ${f.total === 1 ? "jornada" : "jornadas"}`}
      value={
        <span className={cn("inline-flex items-center gap-1.5 text-[15px]", blocking.length ? "text-[#b86e00]" : "text-st-teal")}>
          {f.evidence.present}/{f.evidence.required}
          <span className="text-[12.5px] text-subtle">evidencias</span>
        </span>
      }
      message={
        <>
          <EvidenceChecklist f={f} />
          {blocking.length > 0 && !blockingIncident && (
            <p className="mt-3 text-[13.5px] leading-snug text-subtle">Si falta una foto obligatoria, el cierre solo procede con una excepción autorizada y justificada.</p>
          )}
        </>
      }
      action={
        blockingIncident ? (
          <BigButton href={blockingIncident.href} variant="outline">
            <ShieldAlert /> Resolver incidencia
          </BigButton>
        ) : (
          <Gate reason={closeReason} className="w-full">
            <BigButton href={`/ordenes/${order.folio}?cerrar=1`} disabled={!!closeReason}>
              <ClipboardCheck /> Validar cierre
            </BigButton>
          </Gate>
        )
      }
    />
  );
}

type CheckItem = { id: string; label: string; ok: boolean; warn?: boolean; detail?: string };

/** Required evidence per executed jornada + blocking incidents + sync state. */
export function EvidenceChecklist({ f }: { f: FieldReady }) {
  const checks: CheckItem[] = [];
  const open = f.jornadas.filter((j) => j.status !== "cerrada");
  checks.push({
    id: "jornadas",
    label: "Entrada y salida en todas las jornadas",
    ok: open.length === 0,
    detail: open.length ? `Falta salida en ${open.map((j) => `J${j.dayIndex}`).join(", ")}` : undefined,
  });
  f.evidence.perJornada
    .filter((x) => x.jornada.checkIn)
    .forEach((x) => {
      const label = f.total > 1 ? ` · J${x.jornada.dayIndex}` : "";
      checks.push({ id: `a-${x.jornada.id}`, label: `Fotos ANTES${label}`, ok: x.antes > 0, detail: x.antes ? `${x.antes}` : undefined });
      checks.push({ id: `d-${x.jornada.id}`, label: `Fotos DESPUÉS${label}`, ok: x.despues > 0, detail: x.despues ? `${x.despues}` : undefined });
    });
  const blockingIncidents = f.incidents.filter((i) => i.status === "abierta" && i.blocksClosure);
  const otherOpen = f.incidents.filter((i) => i.status === "abierta" && !i.blocksClosure);
  checks.push({
    id: "inc",
    label: "Sin incidencias que impidan el cierre",
    ok: blockingIncidents.length === 0,
    warn: blockingIncidents.length === 0 && otherOpen.length > 0,
    detail: blockingIncidents.length ? blockingIncidents.map((i) => i.folio).join(", ") : otherOpen.length ? `${otherOpen.length} abierta(s) sin bloqueo` : undefined,
  });
  const pending = f.pendingSync.length;
  checks.push({ id: "sync", label: "Registros sincronizados", ok: pending === 0, warn: pending > 0, detail: pending ? `${pending} por enviar` : undefined });

  return (
    <motion.ul variants={staggerContainer(0.04, 0.2)} initial="hidden" animate="show" className="space-y-2">
      {checks.map((c) => {
        const tone = c.ok && !c.warn ? "ok" : c.warn || c.id === "sync" ? "warn" : "bad";
        return (
          <motion.li key={c.id} variants={rowVariants} className="flex items-center gap-3 text-[14.5px]">
            <span
              className={cn(
                "inline-flex size-6 shrink-0 items-center justify-center rounded-full",
                tone === "ok" && "bg-[#e7f7f4] text-st-teal",
                tone === "warn" && "bg-[#fff6e6] text-[#b86e00]",
                tone === "bad" && "bg-[#fdeeee] text-st-red",
              )}
            >
              {tone === "ok" ? <Check className="size-3.5" strokeWidth={3} /> : tone === "warn" ? <CircleAlert className="size-3.5" /> : <X className="size-3.5" strokeWidth={3} />}
            </span>
            <span className={cn("min-w-0 flex-1", tone === "bad" ? "font-medium text-ink" : "text-[#3b4554]")}>{c.label}</span>
            {c.detail && <span className={cn("shrink-0 text-[12.5px] tabular", tone === "bad" ? "font-semibold text-st-red" : "text-subtle")}>{c.detail}</span>}
          </motion.li>
        );
      })}
    </motion.ul>
  );
}
