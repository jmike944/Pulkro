"use client";

import Link from "next/link";
import { motion } from "motion/react";
import {
  ArrowRight,
  CalendarCheck,
  CalendarDays,
  Camera,
  CircleCheck,
  FileText,
  MessageCircleHeart,
  Navigation,
  Send,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtAgo, fmtDateTime, fmtHours, fmtRelativeDay, fmtTime } from "@/lib/format";
import { SHARE_CHANNEL, type Tone } from "@/lib/status";
import { AuroraFrame } from "@/components/pk/aurora";
import { AnimatedNumber, ProgressLine } from "@/components/pk/bits";
import { OrderStatusPill, StatusDot, ToneText } from "@/components/pk/status";
import { Button } from "@/components/ui/button";
import { EASE } from "@/components/pk/motion";
import { toHours } from "./orden-format";
import { DENY, useOrder, type Gate, type OrderDetail, type OrderUi } from "./order-context";
import { Gated, GateHint } from "./ui";

const OPEN: Gate = { ok: true };

type Cta = {
  label: string;
  icon: LucideIcon;
  gate: Gate;
  href?: string;
  onClick?: () => void;
  /** squeegee shine across the button — the order is ready for its next big step */
  shine?: boolean;
  secondary?: { label: string; gate: Gate; onClick?: () => void; href?: string };
};

/** Next step for this order, mapped from domain.nextAction() to a concrete CTA. */
function resolveCta(d: OrderDetail, ui: OrderUi): Cta | null {
  const { order, action, perms } = d;
  const folio = order.folio;
  switch (action.label) {
    case "Asignar":
      return { label: "Asignar cuadrilla", icon: Users, gate: d.gates.crew, onClick: () => ui.openCrew() };
    case "Entrada":
      return { label: perms.capture ? "Registrar entrada" : "Ver jornada de hoy", icon: Navigation, gate: OPEN, href: action.href, shine: perms.capture };
    case "Continuar":
      return { label: perms.capture ? "Continuar jornada" : "Ver jornada en curso", icon: Navigation, gate: OPEN, href: action.href };
    case "Solicitar":
      // Incomplete only because a (re)scheduled jornada hasn't run yet.
      if (!d.missing.length && d.pendingJornadas.length)
        return { label: "Ver jornadas pendientes", icon: CalendarDays, gate: OPEN, onClick: () => ui.setTab("jornadas", { scroll: true }) };
      return {
        label: perms.capture ? "Completar evidencia" : "Ver evidencia faltante",
        icon: Camera,
        gate: OPEN,
        href: action.href,
        secondary: { label: "Validar con excepción autorizada", gate: d.gates.closure, onClick: ui.openClosure },
      };
    case "Cerrar":
      return { label: "Validar cierre", icon: ShieldCheck, gate: d.gates.closure, onClick: ui.openClosure, shine: d.gates.closure.ok };
    case "Resolver":
      return { label: perms.capture ? "Resolver incidencia" : "Ver incidencia", icon: TriangleAlert, gate: OPEN, onClick: () => ui.setTab("incidencias", { scroll: true }) };
    case "Generar":
      return { label: perms.share ? "Generar reporte" : "Ver reporte", icon: FileText, gate: OPEN, href: action.href, shine: perms.share };
    case "Compartir":
      return { label: perms.share ? "Compartir reporte" : "Ver reporte", icon: Send, gate: OPEN, href: action.href };
    case "Encuesta":
      return { label: "Enviar encuesta", icon: MessageCircleHeart, gate: OPEN, href: action.href };
    case "Atender":
      return { label: `Atender ${action.status.replace("Caso", "caso")}`, icon: MessageCircleHeart, gate: OPEN, href: action.href };
    case "Confirmar":
      return {
        label: "Confirmar fechas",
        icon: CalendarCheck,
        gate: perms.crew || perms.edit ? OPEN : { ok: false, reason: DENY.reschedule },
        onClick: ui.confirmDates,
        secondary: { label: "Cambiar fechas", gate: d.gates.reschedule, onClick: () => ui.openSchedule("reprogramar") },
      };
    default:
      if (order.status === "cancelada") return null;
      if (order.status === "programada" || order.status === "jornada_cerrada")
        return { label: order.status === "jornada_cerrada" ? "Ver próxima jornada" : "Ver jornadas", icon: CalendarDays, gate: OPEN, onClick: () => ui.setTab("jornadas", { scroll: true }) };
      if (order.status === "reporte_enviado" || order.status === "seguimiento")
        return { label: "Ver seguimiento", icon: MessageCircleHeart, gate: OPEN, href: `/postventa?orden=${folio}` };
      return { label: "Ver reporte", icon: FileText, gate: OPEN, href: `/ordenes/${folio}/reporte` };
  }
}

/** One-line state under the big number: "Jornada 2 de 3 · hoy 07:06", "Listo para validar"… */
function statusLine(d: OrderDetail): { text: string; tone: Tone; live?: boolean; icon?: LucideIcon } {
  const { order, jornadas, live, pendingJornadas, reports, missing, openIncidents, surveys, cases } = d;
  const n = jornadas.length;
  switch (order.status) {
    case "en_ejecucion":
      if (live?.checkIn)
        return { text: `Jornada ${live.dayIndex} de ${n} · ${fmtRelativeDay(live.checkIn.deviceAt).toLowerCase()} ${fmtTime(live.checkIn.deviceAt)}`, tone: "blue", live: true };
      return { text: "En ejecución", tone: "blue", live: true };
    case "programada":
    case "jornada_cerrada": {
      const next = pendingJornadas[0];
      if (!next) return { text: "Programada", tone: "blue" };
      return { text: `Jornada ${next.dayIndex} de ${n} · ${fmtRelativeDay(next.plannedStart).toLowerCase()} ${fmtTime(next.plannedStart)}`, tone: "blue" };
    }
    case "pendiente_validacion":
    case "reabierta": {
      if (pendingJornadas.length) return { text: `${pendingJornadas.length} jornada(s) por ejecutar`, tone: "blue" };
      if (openIncidents.some((i) => i.blocksClosure)) return { text: "Incidencia abierta impide el cierre", tone: "red", icon: TriangleAlert };
      if (missing.length) return { text: "Falta evidencia para cerrar", tone: "amber", icon: Camera };
      return { text: "Listo para validar", tone: "teal", icon: Sparkles };
    }
    case "con_incidencia": {
      const inc = openIncidents.find((i) => i.blocksClosure) ?? openIncidents[0];
      return { text: inc ? `${inc.folio} impide el cierre` : "Incidencia abierta", tone: "red", icon: TriangleAlert };
    }
    case "finalizada":
      if (reports[0]) return { text: `Reporte v${reports[0].version} listo · sin enviar`, tone: "navy", icon: FileText };
      return { text: order.closure ? `Cierre validado ${fmtDateTime(order.closure.validatedAt)}` : "Cierre validado", tone: "navy", icon: CircleCheck };
    case "reporte_enviado": {
      const share = reports.flatMap((r) => r.shares).sort((a, b) => b.at.localeCompare(a.at))[0];
      if (share) return { text: `${SHARE_CHANNEL[share.channel]} ${fmtAgo(share.at)} · sin confirmación de entrega`, tone: "teal", icon: Send };
      return { text: "Reporte enviado", tone: "teal", icon: Send };
    }
    case "seguimiento": {
      const c = cases.find((x) => x.status === "abierto" || x.status === "en_proceso");
      if (c) return { text: `Caso ${c.folio} en atención`, tone: "violet", icon: MessageCircleHeart };
      const sv = surveys.find((s) => s.respondedAt);
      return { text: sv ? "Encuesta respondida" : "Encuesta enviada", tone: "violet", icon: MessageCircleHeart };
    }
    case "reprogramada":
      return { text: "Fechas reprogramadas · confirme con el cliente", tone: "amber", icon: CalendarDays };
    case "borrador":
      return { text: "Sin cuadrilla asignada", tone: "slate", icon: Users };
    case "cancelada":
      return { text: "Orden cancelada", tone: "slate" };
    default:
      return { text: "Ciclo completo", tone: "slate", icon: CircleCheck };
  }
}

/** The featured "next action" card on the right of the summary (claim-detail "Ready to submit"). */
export function FeaturedCard() {
  const { d, ui } = useOrder();
  const { order, evidence, missing, realMinutes, plannedMinutes } = d;
  const cta = resolveCta(d, ui);
  const line = statusLine(d);
  const usePlanned = realMinutes === 0;
  const hours = toHours(usePlanned ? plannedMinutes : realMinutes);
  const first = missing[0];
  const excepted = d.isDone && !!order.closure?.exception && missing.length > 0;
  const evidenceText =
    evidence.required === 0
      ? "Sin jornadas ejecutadas"
      : excepted
        ? `${evidence.present} de ${evidence.required} · excepción autorizada`
        : `${evidence.present} de ${evidence.required}${
          first ? ` · falta ${first.kind === "antes" ? "ANTES" : "DESPUÉS"} J${first.jornada.dayIndex}${missing.length > 1 ? ` y ${missing.length - 1} más` : ""}` : " · completa"
        }`;
  const LineIcon = line.icon;

  return (
    <AuroraFrame innerClassName="p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <OrderStatusPill status={order.status} />
        <span className="text-[13px] font-medium text-subtle tabular">{order.folio}</span>
      </div>

      <p className="mt-6 text-[14px] text-subtle">{usePlanned ? "Horas planeadas" : "Horas reales"}</p>
      <div className="mt-1 flex items-end gap-2">
        <AnimatedNumber value={hours} format={{ maximumFractionDigits: 1 }} className="text-[56px] font-medium leading-[0.95] tracking-[-0.045em] text-ink" />
        <span className="mb-1.5 text-[20px] font-medium text-subtle">h</span>
        {!usePlanned && plannedMinutes > 0 && <span className="mb-2 ml-auto text-[13px] text-subtle">de {fmtHours(plannedMinutes)} plan</span>}
      </div>

      <p className="mt-3 flex min-h-6 items-center gap-2 text-[14px]">
        {line.live ? (
          <StatusDot tone="blue" live />
        ) : LineIcon ? (
          <motion.span
            initial={{ scale: 0.6, rotate: -20, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            transition={{ type: "spring", stiffness: 380, damping: 18, delay: 0.3 }}
            className="inline-flex"
          >
            <LineIcon className={cn("size-4", line.tone === "teal" ? "text-teal-fg" : line.tone === "amber" ? "text-amber-fg" : line.tone === "red" ? "text-red-fg" : "text-subtle")} />
          </motion.span>
        ) : null}
        <ToneText tone={line.tone} className="font-medium">
          {line.text}
        </ToneText>
      </p>

      <div className="mt-5 border-t border-hairline pt-4">
        <div className="flex items-baseline justify-between gap-3 text-[14px]">
          <span className="text-subtle">Evidencia</span>
          <span className="truncate font-semibold text-ink tabular">{evidenceText}</span>
        </div>
        <ProgressLine
          value={evidence.required ? evidence.present / evidence.required : 0}
          tone={evidence.complete ? "teal" : missing.length ? "amber" : "blue"}
          className="mt-2.5"
        />
      </div>

      {cta && (
        <div className="mt-6 space-y-2.5">
          <CtaButton cta={cta} />
          {cta.secondary && (
            <Gated gate={cta.secondary.gate} className="flex w-full">
              <Button
                variant="ghost"
                disabled={!cta.secondary.gate.ok}
                onClick={cta.secondary.onClick}
                className="h-10 w-full rounded-[12px] text-[14px] font-semibold text-ink"
              >
                {cta.secondary.label}
              </Button>
            </Gated>
          )}
          <GateHint gate={cta.gate} />
        </div>
      )}

      <Link
        href={`/ordenes/${order.folio}/reporte`}
        className="group mx-auto mt-5 flex w-fit items-center justify-center gap-1.5 rounded-md py-1 text-[14px] font-semibold text-link"
      >
        Vista previa del reporte
        <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
      </Link>
    </AuroraFrame>
  );
}

function CtaButton({ cta }: { cta: Cta }) {
  const Icon = cta.icon;
  const body = (
    <>
      <Icon className="size-[18px]" />
      {cta.label}
      {cta.shine && (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/25 to-transparent motion-reduce:hidden"
          initial={{ x: "-120%" }}
          animate={{ x: ["-120%", "360%"] }}
          transition={{ duration: 1.6, ease: EASE, repeat: Infinity, repeatDelay: 3.2, delay: 0.8 }}
        />
      )}
    </>
  );
  const cls = "relative h-12 w-full overflow-hidden rounded-[14px] text-[15px] font-semibold shadow-[0_10px_24px_-12px_rgb(7_36_63/0.65)]";
  if (cta.href)
    return (
      <Button asChild className={cls}>
        <Link href={cta.href}>{body}</Link>
      </Button>
    );
  return (
    <Gated gate={cta.gate} className="flex w-full">
      <Button className={cls} disabled={!cta.gate.ok} onClick={cta.onClick}>
        {body}
      </Button>
    </Gated>
  );
}
