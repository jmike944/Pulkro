"use client";

import { ArrowRight, Ban, BadgeCheck, CalendarClock, FilePlus2, MapPin, MessageCircleHeart, Navigation, RotateCcw, Send, ShieldCheck, Users } from "lucide-react";
import { jornadaMinutes, surveyScore } from "@/lib/domain";
import { fmtAgo, fmtDateTime, fmtDay, fmtDuration, fmtRelativeDay, fmtTime, plural } from "@/lib/format";
import { CASE_CATEGORY, CASE_STATUS, SHARE_CHANNEL } from "@/lib/status";
import type { TimelineStep } from "@/components/pk/timeline";
import { Timeline } from "@/components/pk/timeline";
import { AvatarStack } from "@/components/pk/bits";
import { CONFORMITY_LABEL, compact, fmtTimeRange, jornadaTitle, stampSource } from "./orden-format";
import { useOrder, type OrderDetail } from "./order-context";

/** Lifecycle timeline built from real records (doc §3 main flow). */
export function OrderTimeline() {
  const { d } = useOrder();
  const steps = buildTimeline(d);
  // Seeded orders don't bump updatedAt on field captures; the audit trail does.
  const lastActivity = [d.order.updatedAt, ...d.audit.map((a) => a.at)].sort().at(-1) ?? d.order.updatedAt;
  return (
    <section>
      <div className="mb-6 flex items-baseline justify-between gap-4">
        <h2 className="text-[19px] font-medium tracking-[-0.01em] text-ink">Línea de tiempo</h2>
        <span className="text-[13px] text-subtle">Actualizado {fmtAgo(lastActivity)}</span>
      </div>
      <Timeline steps={steps} />
    </section>
  );
}

const Strong = ({ children }: { children: React.ReactNode }) => <span className="font-medium text-ink">{children}</span>;

export function buildTimeline(d: OrderDetail): TimelineStep[] {
  const { order, jornadas, reports, surveys, cases, audit, lk, now } = d;
  const userName = (id: string) => (id === "cliente" ? "Cliente" : (lk.users.get(id)?.name ?? "Usuario"));
  const cancelled = order.status === "cancelada";
  const steps: TimelineStep[] = [];

  /* 1 · authorized work (external commercial system) */
  steps.push({
    id: "autorizado",
    title: "Trabajo autorizado",
    icon: <BadgeCheck />,
    state: "done",
    detail: (
      <>
        Referencia <Strong>{order.commercialRef}</Strong> del sistema comercial
      </>
    ),
    when: fmtDay(order.createdAt),
  });

  /* 2 · manual registration */
  steps.push({
    id: "alta",
    title: "Alta manual de la orden",
    icon: <FilePlus2 />,
    state: "done",
    detail: `${userName(order.createdBy)} · ${d.unit?.name ?? ""}`,
    when: fmtDateTime(order.createdAt),
  });

  /* 3 · crew */
  const first = order.crewHistory[0];
  if (first) {
    const crew = compact(first.workerIds.map((id) => lk.workers.get(id)));
    const changes = order.crewHistory.length - 1;
    steps.push({
      id: "cuadrilla",
      title: "Cuadrilla asignada",
      icon: <Users />,
      state: "done",
      detail: (
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <AvatarStack people={crew} size={22} max={5} />
          <span>
            {plural(crew.length, "persona", "personas")} · {userName(first.by)}
            {changes > 0 && ` · ${plural(changes, "reasignación", "reasignaciones")}`}
          </span>
        </span>
      ),
      when: fmtDateTime(first.at),
    });
  } else {
    steps.push({
      id: "cuadrilla",
      title: "Asignar cuadrilla",
      icon: <Users />,
      state: cancelled ? "upcoming" : "current",
      detail: "Pendiente: el supervisor asigna al personal",
      when: "Pendiente",
    });
  }

  /* 4 · jornadas (independent records per day) */
  if (jornadas.length === 0) {
    steps.push({ id: "jornadas", title: "Programar jornadas", icon: <CalendarClock />, state: "upcoming", detail: "Sin fechas asignadas" });
  }
  jornadas.forEach((j) => {
    if (j.checkIn && j.checkOut) {
      steps.push({
        id: j.id,
        title: jornadaTitle(j),
        icon: <MapPin />,
        state: "done",
        detail: (
          <span className="inline-flex flex-wrap items-center gap-x-1.5">
            Entrada {fmtTime(j.checkIn.deviceAt)} · {stampSource(j.checkIn)}
            <ArrowRight className="size-3.5 text-[#98a2b3]" aria-label="a" />
            Salida {fmtTime(j.checkOut.deviceAt)} · <Strong>{fmtDuration(jornadaMinutes(j, now))}</Strong>
          </span>
        ),
        when: fmtDay(j.checkOut.deviceAt),
      });
    } else if (j.checkIn) {
      steps.push({
        id: j.id,
        title: jornadaTitle(j),
        icon: <Navigation />,
        state: "current",
        detail: (
          <>
            Entrada {fmtTime(j.checkIn.deviceAt)} · {stampSource(j.checkIn)} · en sitio <Strong>{fmtDuration(jornadaMinutes(j, now))}</Strong>
          </>
        ),
        when: "En curso",
      });
    } else {
      steps.push({
        id: j.id,
        title: jornadaTitle(j),
        icon: <CalendarClock />,
        state: "upcoming",
        detail: cancelled ? "No se ejecutó" : `Programada ${fmtTimeRange(j.plannedStart, j.plannedEnd)}`,
        when: fmtRelativeDay(j.plannedStart),
      });
    }
  });

  if (cancelled) {
    const entry = audit.find((a) => /cancel/i.test(a.action));
    steps.push({
      id: "cancelada",
      title: "Orden cancelada",
      icon: <Ban />,
      state: "alert",
      when: entry ? fmtDateTime(entry.at) : undefined,
      detail: entry?.reason ? `“${entry.reason}” · ${userName(entry.by)}` : "Sin motivo registrado",
    });
    return steps;
  }

  /* 5 · closure validation */
  const closure = order.closure;
  if (closure) {
    steps.push({
      id: "cierre",
      title: "Cierre validado",
      icon: <ShieldCheck />,
      state: "done",
      when: fmtDateTime(closure.validatedAt),
      detail: (
        <>
          {userName(closure.validatedBy)}
          {closure.conformity && (
            <>
              {" "}
              · conformidad {CONFORMITY_LABEL[closure.conformity.method].toLowerCase()} de {closure.conformity.name}
            </>
          )}
          {closure.exception && <span className="mt-1 block text-[#b86e00]">Excepción autorizada: {closure.exception.reason}</span>}
          {!d.isDone && <span className="mt-1 block">Quedó sin efecto al reabrir la orden.</span>}
        </>
      ),
    });
  } else {
    const blocked = order.status === "con_incidencia";
    const ready = order.status === "pendiente_validacion";
    steps.push({
      id: "cierre",
      title: "Validación de cierre",
      icon: <ShieldCheck />,
      state: blocked ? "alert" : ready ? "current" : "upcoming",
      when: "Pendiente",
      detail: blocked
        ? "Una incidencia abierta impide el cierre"
        : ready
          ? d.missing.length
            ? "Falta evidencia fotográfica"
            : "Evidencia completa · lista para validar"
          : "Al terminar todas las jornadas",
    });
  }

  /* 6 · report sent (manual share, never confirms delivery) */
  const shares = reports
    .flatMap((r) => r.shares.map((s) => ({ ...s, version: r.version })))
    .sort((a, b) => a.at.localeCompare(b.at));
  const firstShare = shares[0];
  const latest = reports[0];
  if (firstShare) {
    steps.push({
      id: "reporte",
      title: "Reporte enviado",
      icon: <Send />,
      state: "done",
      when: fmtDateTime(firstShare.at),
      detail: (
        <>
          {SHARE_CHANNEL[firstShare.channel]} a {firstShare.to} · v{firstShare.version}
          {shares.length > 1 && ` · ${plural(shares.length, "envío", "envíos")}`}
          <span className="mt-0.5 block text-[13px] text-[#98a2b3]">Envío iniciado desde el dispositivo · sin confirmación de entrega</span>
        </>
      ),
    });
  } else if (latest) {
    steps.push({
      id: "reporte",
      title: `Reporte v${latest.version} generado`,
      icon: <Send />,
      state: d.isDone ? "current" : "done",
      when: fmtDateTime(latest.generatedAt),
      detail: "Pendiente de compartir con el cliente",
    });
  } else {
    steps.push({
      id: "reporte",
      title: "Reporte al cliente",
      icon: <Send />,
      state: order.status === "finalizada" ? "current" : "upcoming",
      when: order.status === "finalizada" ? "Pendiente" : undefined,
      detail: "Un solo reporte con todas las jornadas",
    });
  }

  /* reopened after closure: new validation + new report version (doc §8) */
  if (closure && !d.isDone) {
    const reopen = audit.find((a) => a.action === "Cambió estado a Reabierta");
    steps.push({
      id: "reabierta",
      title: "Orden reabierta",
      icon: <RotateCcw />,
      state: "alert",
      when: reopen ? fmtDateTime(reopen.at) : undefined,
      detail: (
        <>
          {reopen?.reason ? `“${reopen.reason}” · ${userName(reopen.by)}. ` : ""}Se generará el reporte v{(latest?.version ?? 0) + 1}.
        </>
      ),
    });
    steps.push({
      id: "revalidacion",
      title: "Nueva validación de cierre",
      icon: <ShieldCheck />,
      state: order.status === "con_incidencia" ? "alert" : "current",
      when: "Pendiente",
      detail: d.missing.length ? "Falta evidencia fotográfica" : "Revise cambios y vuelva a validar",
    });
  }

  /* 7 · post-sale */
  const openCase = cases.find((c) => c.status === "abierto" || c.status === "en_proceso");
  const anyCase = [...cases].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const survey = [...surveys].sort((a, b) => b.sentAt.localeCompare(a.sentAt))[0];
  if (openCase) {
    steps.push({
      id: "postventa",
      title: "Seguimiento postventa",
      icon: <MessageCircleHeart />,
      state: "current",
      when: fmtDay(openCase.createdAt),
      detail: `Caso ${openCase.folio} · ${CASE_STATUS[openCase.status].label} · ${CASE_CATEGORY[openCase.category]}`,
    });
  } else if (survey?.respondedAt && survey.answers) {
    const score = surveyScore(survey) ?? 0;
    steps.push({
      id: "postventa",
      title: order.status === "archivada" ? "Seguimiento completo" : "Encuesta respondida",
      icon: <MessageCircleHeart />,
      state: "done",
      when: fmtDay(survey.respondedAt),
      detail: (
        <>
          Satisfacción <Strong>{score.toFixed(1)}/5</Strong> · NPS {survey.answers.nps}
          {survey.manual ? " · captura manual" : ""}
          {anyCase ? ` · caso ${anyCase.folio} ${CASE_STATUS[anyCase.status].label.toLowerCase()}` : ""}
        </>
      ),
    });
  } else if (survey) {
    steps.push({
      id: "postventa",
      title: "Encuesta enviada",
      icon: <MessageCircleHeart />,
      state: "current",
      when: fmtDay(survey.sentAt),
      detail: `${SHARE_CHANNEL[survey.channel]} · esperando respuesta del cliente`,
    });
  } else if (anyCase) {
    steps.push({
      id: "postventa",
      title: "Seguimiento postventa",
      icon: <MessageCircleHeart />,
      state: "done",
      when: fmtDay(anyCase.updatedAt),
      detail: `Caso ${anyCase.folio} · ${CASE_STATUS[anyCase.status].label}`,
    });
  } else {
    steps.push({
      id: "postventa",
      title: "Seguimiento postventa",
      icon: <MessageCircleHeart />,
      state: order.status === "reporte_enviado" ? "current" : "upcoming",
      detail: "Encuesta de satisfacción y atención de quejas",
    });
  }

  return steps;
}
