/**
 * Indicators from doc §5. Pure functions over snapshot arrays.
 * "Servicio terminado" = order with a validated closure (closure.validatedAt).
 */
import {
  differenceInHours,
  eachDayOfInterval,
  endOfMonth,
  format,
  getMonth,
  getYear,
  isWithinInterval,
  parseISO,
  startOfMonth,
  startOfWeek,
  endOfWeek,
  subDays,
} from "date-fns";
import { es } from "date-fns/locale";
import type { Incident, IncidentType, Jornada, Order, Photo, PostSaleCase, Report, Survey, User } from "./types";
import { DONE_STATUSES, INCIDENT_TYPE, OPEN_STATUSES } from "./status";
import { jornadaMinutes, orderEvidence } from "./domain";

const MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

export const closedAt = (o: Order) => (o.closure ? parseISO(o.closure.validatedAt) : null);

/** Completed services per month of the current year, up to the current month. */
export function servicesByMonth(orders: Order[], now = new Date()) {
  const year = getYear(now);
  const upto = getMonth(now);
  const buckets = MONTHS.slice(0, upto + 1).map((label, m) => ({ label, month: m, value: 0 }));
  orders.forEach((o) => {
    const c = closedAt(o);
    if (c && getYear(c) === year && getMonth(c) <= upto) buckets[getMonth(c)].value++;
  });
  return buckets;
}

export function servicesInRange(orders: Order[], start: Date, end: Date) {
  return orders.filter((o) => {
    const c = closedAt(o);
    return c && isWithinInterval(c, { start, end });
  });
}

/** Completed services per day for the last N days. */
export function servicesByDay(orders: Order[], days = 14, now = new Date()) {
  return eachDayOfInterval({ start: subDays(now, days - 1), end: now }).map((d) => {
    const key = format(d, "yyyy-MM-dd");
    return {
      key,
      label: format(d, "EEEEE d", { locale: es }),
      value: orders.filter((o) => o.closure && o.closure.validatedAt.slice(0, 10) === key).length,
    };
  });
}

export function monthComparison(orders: Order[], now = new Date()) {
  const thisStart = startOfMonth(now);
  const prevStart = startOfMonth(subDays(thisStart, 1));
  const current = servicesInRange(orders, thisStart, now).length;
  // compare against the same elapsed fraction of last month
  const prevSamePoint = new Date(prevStart.getTime() + (now.getTime() - thisStart.getTime()));
  const prevToDate = servicesInRange(orders, prevStart, prevSamePoint < endOfMonth(prevStart) ? prevSamePoint : endOfMonth(prevStart)).length;
  const prevTotal = servicesInRange(orders, prevStart, endOfMonth(prevStart)).length;
  const delta = prevToDate ? (current - prevToDate) / prevToDate : 0;
  return { current, prevToDate, prevTotal, delta, prevLabel: format(prevStart, "MMMM", { locale: es }) };
}

export function weekRange(now = new Date()) {
  return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) };
}

export function statusBuckets(orders: Order[]) {
  const pendientes = orders.filter((o) => ["borrador", "programada", "reprogramada"].includes(o.status));
  const enProceso = orders.filter((o) => ["en_ejecucion", "jornada_cerrada", "pendiente_validacion", "con_incidencia", "reabierta"].includes(o.status));
  const terminados = orders.filter((o) => DONE_STATUSES.includes(o.status));
  return { pendientes, enProceso, terminados, abiertos: orders.filter((o) => OPEN_STATUSES.includes(o.status)) };
}

export function incidentsByType(incidents: Incident[]) {
  const total = incidents.length || 1;
  const counts = new Map<IncidentType, number>();
  incidents.forEach((i) => counts.set(i.type, (counts.get(i.type) ?? 0) + 1));
  return (Object.keys(INCIDENT_TYPE) as IncidentType[])
    .map((type) => ({ type, label: INCIDENT_TYPE[type].label, count: counts.get(type) ?? 0, pct: (counts.get(type) ?? 0) / total }))
    .sort((a, b) => b.count - a.count);
}

/** Real hours per completed service. */
export function hoursPerService(orders: Order[], jornadas: Jornada[]) {
  const byOrder = new Map<string, number>();
  jornadas.forEach((j) => {
    if (j.checkOut) byOrder.set(j.orderId, (byOrder.get(j.orderId) ?? 0) + jornadaMinutes(j));
  });
  const done = orders.filter((o) => o.closure);
  const minutes = done.map((o) => byOrder.get(o.id) ?? 0).filter((m) => m > 0);
  const avg = minutes.length ? minutes.reduce((a, b) => a + b, 0) / minutes.length : 0;
  return { avgMinutes: avg, totalMinutes: minutes.reduce((a, b) => a + b, 0), byOrder };
}

export function supervisorProductivity(orders: Order[], jornadas: Jornada[], users: User[], surveys: Survey[]) {
  const sups = users.filter((u) => u.role === "supervisor");
  return sups
    .map((u) => {
      const mine = orders.filter((o) => o.supervisorId === u.id);
      const closed = mine.filter((o) => o.closure);
      const ids = new Set(mine.map((o) => o.id));
      const minutes = jornadas.filter((j) => ids.has(j.orderId) && j.checkOut).reduce((s, j) => s + jornadaMinutes(j), 0);
      const svs = surveys.filter((s) => ids.has(s.orderId) && s.answers);
      const csat = svs.length ? svs.reduce((s, x) => s + x.answers!.overall, 0) / svs.length : 0;
      return {
        user: u,
        closed: closed.length,
        open: mine.filter((o) => OPEN_STATUSES.includes(o.status)).length,
        hours: minutes / 60,
        hoursPerService: closed.length ? minutes / 60 / closed.length : 0,
        csat,
      };
    })
    .sort((a, b) => b.closed - a.closed);
}

export function satisfaction(surveys: Survey[]) {
  const answered = surveys.filter((s) => s.answers);
  const n = answered.length;
  const avg = (k: "overall" | "quality" | "punctuality" | "staff") => (n ? answered.reduce((s, x) => s + x.answers![k], 0) / n : 0);
  const promoters = answered.filter((s) => s.answers!.nps >= 9).length;
  const detractors = answered.filter((s) => s.answers!.nps <= 6).length;
  const dist = [1, 2, 3, 4, 5].map((v) => ({ score: v, count: answered.filter((s) => s.answers!.overall === v).length }));
  return {
    sent: surveys.length,
    answered: n,
    responseRate: surveys.length ? n / surveys.length : 0,
    overall: avg("overall"),
    quality: avg("quality"),
    punctuality: avg("punctuality"),
    staff: avg("staff"),
    nps: n ? Math.round(((promoters - detractors) / n) * 100) : 0,
    promoters,
    detractors,
    distribution: dist,
  };
}

/** Photo compliance = closed orders whose every executed jornada has ANTES and DESPUÉS. */
export function photoCompliance(orders: Order[], jornadas: Jornada[], photos: Photo[]) {
  const closed = orders.filter((o) => o.closure);
  const rows = closed.map((o) => ({ order: o, ev: orderEvidence(o, jornadas, photos) }));
  const compliant = rows.filter((r) => r.ev.complete);
  const missingDespues = rows.filter((r) => r.ev.perJornada.some((x) => x.jornada.checkIn && !x.despues));
  const missingAntes = rows.filter((r) => r.ev.perJornada.some((x) => x.jornada.checkIn && !x.antes));
  const withException = closed.filter((o) => o.closure?.exception);
  return {
    total: closed.length,
    compliant: compliant.length,
    rate: closed.length ? compliant.length / closed.length : 0,
    missingDespues: missingDespues.length,
    missingAntes: missingAntes.length,
    withException: withException.length,
    rows,
  };
}

export function complaintsSummary(orders: Order[], cases: PostSaleCase[]) {
  const withCases = new Set(cases.map((c) => c.orderId));
  const closed = orders.filter((o) => o.closure).length || 1;
  return {
    total: cases.length,
    open: cases.filter((c) => c.status === "abierto" || c.status === "en_proceso").length,
    servicesWithComplaints: withCases.size,
    rate: withCases.size / closed,
  };
}

/** Average elapsed time between lifecycle milestones (the "Cómo avanza el trabajo" panel). */
export function stageDurations(orders: Order[], jornadas: Jornada[], reports: Report[]) {
  const firstCheckIn = new Map<string, Date>();
  jornadas.forEach((j) => {
    if (!j.checkIn) return;
    const t = parseISO(j.checkIn.deviceAt);
    const cur = firstCheckIn.get(j.orderId);
    if (!cur || t < cur) firstCheckIn.set(j.orderId, t);
  });
  const firstShare = new Map<string, Date>();
  reports.forEach((r) =>
    r.shares.forEach((s) => {
      const t = parseISO(s.at);
      const cur = firstShare.get(r.orderId);
      if (!cur || t < cur) firstShare.set(r.orderId, t);
    }),
  );
  const acc = { alta_prog: [] as number[], prog_inicio: [] as number[], inicio_cierre: [] as number[], cierre_envio: [] as number[], total: [] as number[] };
  orders.forEach((o) => {
    const created = parseISO(o.createdAt);
    const assigned = o.crewHistory[0] ? parseISO(o.crewHistory[0].at) : null;
    const start = firstCheckIn.get(o.id);
    const closed = o.closure ? parseISO(o.closure.validatedAt) : null;
    const shared = firstShare.get(o.id);
    if (assigned) acc.alta_prog.push(differenceInHours(assigned, created) / 24);
    if (assigned && start) acc.prog_inicio.push(differenceInHours(start, assigned) / 24);
    if (start && closed) acc.inicio_cierre.push(differenceInHours(closed, start) / 24);
    if (closed && shared) acc.cierre_envio.push(differenceInHours(shared, closed) / 24);
    if (shared) acc.total.push(differenceInHours(shared, created) / 24);
  });
  const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  return {
    stages: [
      { key: "alta_prog", label: "Alta a programación", days: mean(acc.alta_prog) },
      { key: "prog_inicio", label: "Programación a inicio", days: mean(acc.prog_inicio) },
      { key: "inicio_cierre", label: "Inicio a cierre validado", days: mean(acc.inicio_cierre) },
      { key: "cierre_envio", label: "Cierre a reporte enviado", days: mean(acc.cierre_envio) },
    ],
    totalDays: mean(acc.total),
  };
}

/** Funnel of orders created in a window and how far they got. */
export function lifecycleFunnel(orders: Order[], reports: Report[], surveys: Survey[], start: Date, end: Date) {
  const inWindow = orders.filter((o) => isWithinInterval(parseISO(o.scheduledStart), { start, end }) && o.status !== "cancelada");
  const shared = new Set(reports.filter((r) => r.shares.length).map((r) => r.orderId));
  const answered = new Set(surveys.filter((s) => s.respondedAt).map((s) => s.orderId));
  const reached = (pred: (o: Order) => boolean) => inWindow.filter(pred).length;
  const programmed = reached((o) => o.status !== "borrador");
  const started = reached((o) => !["borrador", "programada", "reprogramada"].includes(o.status));
  const closed = reached((o) => !!o.closure);
  const sent = reached((o) => shared.has(o.id));
  const rated = reached((o) => answered.has(o.id));
  return [
    { key: "programadas", label: "Programadas", count: programmed },
    { key: "ejecutadas", label: "En ejecución", count: started },
    { key: "finalizadas", label: "Finalizadas", count: closed },
    { key: "enviadas", label: "Reporte enviado", count: sent },
    { key: "calificadas", label: "Calificadas", count: rated },
  ];
}
