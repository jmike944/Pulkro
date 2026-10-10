/**
 * Period-scoped indicators for /indicadores (doc §5). Pure: no React.
 * Builds on the shared metrics in `@/lib/metrics` and only adds the period slicing,
 * drill-down member lists and a few breakdowns the screen needs.
 */
import { parseISO } from "date-fns";
import type { CaseCategory, Incident, Jornada, Order, Photo, PostSaleCase, Report, ServiceType, Survey, User } from "@/lib/types";
import {
  complaintsSummary,
  incidentsByType,
  lifecycleFunnel,
  photoCompliance,
  satisfaction,
  stageDurations,
  supervisorProductivity,
} from "@/lib/metrics";
import { orderMinutes, plannedMinutes } from "@/lib/domain";
import { CASE_CATEGORY, DONE_STATUSES, OPEN_STATUSES } from "@/lib/status";
import { chartBuckets, type PeriodWindow } from "./period";

export type IndicatorInput = {
  orders: Order[];
  jornadas: Jornada[];
  photos: Photo[];
  incidents: Incident[];
  reports: Report[];
  cases: PostSaleCase[];
  surveys: Survey[];
  /** supervisors the current user may see (already scoped) */
  supervisors: User[];
  serviceTypes: ServiceType[];
};

const ts = (iso: string) => parseISO(iso).getTime();

export type FunnelStage = { key: string; label: string; count: number; orders: Order[] };

export type SplitRow = {
  key: "terminadas" | "en_curso" | "canceladas";
  label: string;
  tone: "navy" | "blue" | "slate";
  orders: Order[];
  sub: string;
  pct: number;
};

export type HoursRow = {
  serviceType: ServiceType;
  services: number;
  avgReal: number; // minutes
  avgPlanned: number; // minutes
  delta: number; // (real - planned) / planned
};

export function computeIndicators(d: IndicatorInput, win: PeriodWindow, now: Date) {
  const s = win.start.getTime();
  const e = win.end.getTime();
  const u = win.until.getTime();
  const inPlan = (iso: string) => {
    const x = ts(iso);
    return x >= s && x <= e;
  };
  const inReal = (iso: string) => {
    const x = ts(iso);
    return x >= s && x <= u;
  };

  /* ── work scheduled in the period (plan window) ── */
  const periodOrders = d.orders.filter((o) => inPlan(o.scheduledStart));
  const activeOrders = periodOrders.filter((o) => o.status !== "cancelada");
  const unitsInPeriod = new Set(periodOrders.map((o) => o.unitId)).size;

  /* ── funnel: counts from the shared metric, members for the drill-down sheet ── */
  const sharedIds = new Set(d.reports.filter((r) => r.shares.length).map((r) => r.orderId));
  const ratedIds = new Set(d.surveys.filter((x) => x.respondedAt).map((x) => x.orderId));
  const memberPredicates: Record<string, (o: Order) => boolean> = {
    programadas: (o) => o.status !== "borrador",
    ejecutadas: (o) => !["borrador", "programada", "reprogramada"].includes(o.status),
    finalizadas: (o) => !!o.closure,
    enviadas: (o) => sharedIds.has(o.id),
    calificadas: (o) => ratedIds.has(o.id),
  };
  const funnel: FunnelStage[] = lifecycleFunnel(d.orders, d.reports, d.surveys, win.start, win.end).map((st) => ({
    ...st,
    orders: activeOrders.filter(memberPredicates[st.key] ?? (() => false)),
  }));
  const drafts = activeOrders.filter((o) => o.status === "borrador").length;
  const notStarted = activeOrders.filter((o) => ["programada", "reprogramada"].includes(o.status) && ts(o.scheduledStart) > now.getTime()).length;

  /* ── dónde está el trabajo ── */
  const done = periodOrders.filter((o) => DONE_STATUSES.includes(o.status) || (!!o.closure && o.status !== "reabierta"));
  const doneIds = new Set(done.map((o) => o.id));
  const cancelled = periodOrders.filter((o) => !doneIds.has(o.id) && (o.status === "cancelada" || o.status === "reprogramada"));
  const cancelledIds = new Set(cancelled.map((o) => o.id));
  const inFlight = periodOrders.filter((o) => !doneIds.has(o.id) && !cancelledIds.has(o.id));
  const count = (xs: Order[], ...st: Order["status"][]) => xs.filter((o) => st.includes(o.status)).length;
  const parts = (items: [number, string, string][]) =>
    items
      .filter(([n]) => n > 0)
      .slice(0, 3)
      .map(([n, one, many]) => `${n} ${n === 1 ? one : many}`)
      .join(" · ");
  const doneSent = done.filter((o) => sharedIds.has(o.id)).length;
  const splitTotal = periodOrders.length || 1;
  const split: SplitRow[] = [
    {
      key: "terminadas",
      label: "Terminadas",
      tone: "navy",
      orders: done,
      sub: parts([
        [doneSent, "con reporte enviado", "con reporte enviado"],
        [done.length - doneSent, "sin reporte enviado", "sin reporte enviado"],
        [done.filter((o) => ratedIds.has(o.id)).length, "calificada", "calificadas"],
      ]) || "Sin cierres validados",
      pct: done.length / splitTotal,
    },
    {
      key: "en_curso",
      label: "En curso",
      tone: "blue",
      orders: inFlight,
      sub:
        parts([
          [count(inFlight, "pendiente_validacion", "reabierta"), "por validar", "por validar"],
          [count(inFlight, "con_incidencia"), "con incidencia", "con incidencia"],
          [count(inFlight, "en_ejecucion", "jornada_cerrada"), "en ejecución", "en ejecución"],
          [count(inFlight, "programada", "borrador"), "por iniciar", "por iniciar"],
        ]) || "Nada pendiente",
      pct: inFlight.length / splitTotal,
    },
    {
      key: "canceladas",
      label: "Canceladas o reprogramadas",
      tone: "slate",
      orders: cancelled,
      sub:
        parts([
          [count(cancelled, "cancelada"), "cancelada", "canceladas"],
          [count(cancelled, "reprogramada"), "reprogramada", "reprogramadas"],
        ]) || "Sin cambios de plan",
      pct: cancelled.length / splitTotal,
    },
  ];

  /* ── cómo avanza el trabajo ── */
  const stages = stageDurations(activeOrders, d.jornadas, d.reports);
  const stageSum = stages.stages.reduce((a, b) => a + b.days, 0);
  const bottleneck = stages.stages.reduce((m, x) => (x.days > m.days ? x : m), stages.stages[0]);

  /* ── realized: closures in [start, until] ── */
  const closed = d.orders.filter((o) => o.closure && inReal(o.closure.validatedAt));
  const closedIds = new Set(closed.map((o) => o.id));
  const prevS = win.prev.start.getTime();
  const prevU = win.prev.until.getTime();
  const prevClosed = d.orders.filter((o) => {
    if (!o.closure) return false;
    const x = ts(o.closure.validatedAt);
    return x >= prevS && x <= prevU;
  }).length;

  /* ── services series (día / semana / mes) ── */
  const closureTimes = d.orders.filter((o) => o.closure).map((o) => ts(o.closure!.validatedAt));
  const bucketSet = chartBuckets(win, now);
  const series = bucketSet.buckets.map((b) => {
    const bs = b.start.getTime();
    const be = b.end.getTime();
    return { ...b, value: closureTimes.filter((t) => t >= bs && t <= be).length };
  });
  const inPeriodSeries = series.filter((b) => b.inPeriod);
  const seriesAvg = inPeriodSeries.length ? inPeriodSeries.reduce((a, b) => a + b.value, 0) / inPeriodSeries.length : 0;
  const seriesPeak = inPeriodSeries.reduce<(typeof series)[number] | null>((m, b) => (!m || b.value > m.value ? b : m), null);

  /* ── horas reales por servicio (sum of check-in→check-out per jornada) ── */
  const realByOrder = new Map(closed.map((o) => [o.id, orderMinutes(o.id, d.jornadas)] as const));
  const planByOrder = new Map(closed.map((o) => [o.id, plannedMinutes(o.id, d.jornadas)] as const));
  const withHours = closed.filter((o) => (realByOrder.get(o.id) ?? 0) > 0);
  const totalReal = withHours.reduce((a, o) => a + realByOrder.get(o.id)!, 0);
  const totalPlan = withHours.reduce((a, o) => a + (planByOrder.get(o.id) ?? 0), 0);
  const hoursRows: HoursRow[] = d.serviceTypes
    .map((st) => {
      const xs = withHours.filter((o) => o.serviceTypeId === st.id);
      const real = xs.reduce((a, o) => a + realByOrder.get(o.id)!, 0);
      const plan = xs.reduce((a, o) => a + (planByOrder.get(o.id) ?? 0), 0);
      return {
        serviceType: st,
        services: xs.length,
        avgReal: xs.length ? real / xs.length : 0,
        avgPlanned: xs.length ? plan / xs.length : 0,
        delta: plan ? (real - plan) / plan : 0,
      };
    })
    .filter((r) => r.services > 0)
    .sort((a, b) => b.avgReal - a.avgReal);
  const hours = {
    avgMinutes: withHours.length ? totalReal / withHours.length : 0,
    avgPlannedMinutes: withHours.length ? totalPlan / withHours.length : 0,
    totalMinutes: totalReal,
    delta: totalPlan ? (totalReal - totalPlan) / totalPlan : 0,
    services: withHours.length,
    rows: hoursRows,
    realByOrder,
    planByOrder,
  };

  /* ── incidencias ── */
  const periodIncidents = d.incidents.filter((i) => inReal(i.createdAt));
  const incidentTypes = incidentsByType(periodIncidents).filter((x) => x.count > 0);
  const incidentsOpen = periodIncidents.filter((i) => i.status === "abierta").length;
  const ordersWithIncident = new Set(periodIncidents.map((i) => i.orderId)).size;
  const incidentOrderIds = new Set(d.incidents.map((i) => i.orderId));
  const closedWithIncidentRate = closed.length ? closed.filter((o) => incidentOrderIds.has(o.id)).length / closed.length : 0;

  /* ── satisfacción (surveys sent in the period) ── */
  const periodSurveys = d.surveys.filter((x) => inReal(x.sentAt));
  const sat = satisfaction(periodSurveys);
  const comments = periodSurveys
    .filter((x) => x.answers?.comment && x.respondedAt)
    .sort((a, b) => b.respondedAt!.localeCompare(a.respondedAt!))
    .slice(0, 4);

  /* ── cumplimiento fotográfico (closures in the period) ── */
  const compliance = photoCompliance(closed, d.jornadas, d.photos);

  /* ── servicios con quejas (cases linked to services closed in the period) ── */
  const periodCases = d.cases.filter((c) => closedIds.has(c.orderId));
  const complaints = complaintsSummary(closed, periodCases);
  const caseTotal = periodCases.length || 1;
  const caseCategories = (Object.keys(CASE_CATEGORY) as CaseCategory[])
    .map((cat) => {
      const n = periodCases.filter((c) => c.category === cat).length;
      return { key: cat, label: CASE_CATEGORY[cat], value: n, pct: n / caseTotal };
    })
    .filter((x) => x.value > 0)
    .sort((a, b) => b.value - a.value);

  /* ── productividad por supervisor ── */
  // Closed = closures in the period; open = open orders scheduled in the period.
  const prodOrders = [...closed, ...activeOrders.filter((o) => !closedIds.has(o.id) && OPEN_STATUSES.includes(o.status))];
  const supervisorOf = new Map(prodOrders.map((o) => [o.id, o.supervisorId] as const));
  const answeredBySupervisor = new Map<string, number>();
  d.surveys.forEach((x) => {
    const sup = x.answers ? supervisorOf.get(x.orderId) : undefined;
    if (sup) answeredBySupervisor.set(sup, (answeredBySupervisor.get(sup) ?? 0) + 1);
  });
  // h/servicio: real hours of the supervisor's *closed* orders ÷ closed orders (denominator still PENDIENTE §5).
  // The shared metric divides all worked hours (incl. open multi-day jobs) by closures, which overstates it mid-period.
  const closedMinutesBySupervisor = new Map<string, number>();
  closed.forEach((o) => closedMinutesBySupervisor.set(o.supervisorId, (closedMinutesBySupervisor.get(o.supervisorId) ?? 0) + (realByOrder.get(o.id) ?? 0)));
  const productivity = supervisorProductivity(prodOrders, d.jornadas, d.supervisors, d.surveys).map((r) => ({
    ...r,
    hoursPerService: r.closed ? (closedMinutesBySupervisor.get(r.user.id) ?? 0) / 60 / r.closed : 0,
    surveys: answeredBySupervisor.get(r.user.id) ?? 0,
  }));

  return {
    periodOrders,
    activeOrders,
    unitsInPeriod,
    funnel,
    drafts,
    notStarted,
    split,
    stages: { ...stages, sum: stageSum, bottleneck },
    closed,
    prevClosed,
    closedDelta: prevClosed ? (closed.length - prevClosed) / prevClosed : null,
    series: { ...bucketSet, data: series, avg: seriesAvg, peak: seriesPeak },
    hours,
    periodIncidents,
    incidentTypes,
    incidentsOpen,
    ordersWithIncident,
    closedWithIncidentRate,
    periodSurveys,
    sat,
    comments,
    compliance,
    periodCases,
    complaints,
    caseCategories,
    productivity,
    prodOrders,
  };
}

export type Indicators = ReturnType<typeof computeIndicators>;

/* ───────────── copy helpers ───────────── */

/** 0.5 → "la mitad", 0.33 → "un tercio", otherwise "el 42%". */
export function shareWords(share: number) {
  if (share >= 0.45 && share <= 0.55) return "la mitad";
  if (share >= 0.3 && share < 0.38) return "un tercio";
  if (share >= 0.62 && share <= 0.7) return "dos tercios";
  if (share >= 0.22 && share < 0.3) return "una cuarta parte";
  if (share >= 0.72 && share <= 0.78) return "tres cuartas partes";
  return `el ${Math.round(share * 100)}%`;
}

const STAGE_SUBJECT: Record<string, string> = {
  alta_prog: "Asignar la cuadrilla",
  prog_inicio: "La espera para iniciar",
  inicio_cierre: "La ejecución",
  cierre_envio: "Enviar el reporte",
};

/** "La espera para iniciar es la mitad del ciclo; la ejecución, un tercio." */
export function stageInsight(stages: { key: string; days: number }[], sum: number) {
  if (sum <= 0) return null;
  const sorted = [...stages].sort((a, b) => b.days - a.days);
  const top = sorted[0];
  const exec = stages.find((x) => x.key === "inicio_cierre");
  const lead = `${STAGE_SUBJECT[top.key] ?? top.key} es ${shareWords(top.days / sum)} del ciclo`;
  if (top.key !== "inicio_cierre" && exec && exec.days > 0) return `${lead}; la ejecución, ${shareWords(exec.days / sum)}.`;
  const second = sorted[1];
  if (second && second.days > 0) return `${lead}; ${(STAGE_SUBJECT[second.key] ?? second.key).toLowerCase()}, ${shareWords(second.days / sum)}.`;
  return `${lead}.`;
}

/** Days → "14 h" under a day, else "2.3 días". */
export function fmtDays(days: number) {
  if (days <= 0) return "—";
  if (days < 1) return `${Math.max(1, Math.round(days * 24))} h`;
  const v = days.toFixed(1).replace(/\.0$/, "");
  return `${v} ${v === "1" ? "día" : "días"}`;
}
