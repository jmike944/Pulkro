/**
 * Agenda y asignación — pure helpers (no React).
 * Week math, jornada visual status, double-booking detection, day-timeline packing and
 * the "recompute pending days" rule used when a single jornada is rescheduled.
 */
import { addDays, differenceInMinutes, format, getISOWeek, isSameDay, isSameMonth, isSunday, parseISO, startOfDay, startOfWeek } from "date-fns";
import { es } from "date-fns/locale";
import { jornadaMinutes } from "@/lib/domain";
import { fmtDay } from "@/lib/format";
import type { Tone } from "@/lib/status";
import type { Client, Jornada, Order, Site, User, Worker } from "@/lib/types";

export type AgendaView = "semana" | "dia" | "lista";

export const VIEW_ITEMS: { value: AgendaView; label: string }[] = [
  { value: "semana", label: "Semana" },
  { value: "dia", label: "Día" },
  { value: "lista", label: "Lista" },
];

/* ───────────── dates ───────────── */

export const dayKey = (d: Date) => format(d, "yyyy-MM-dd");

/** `?fecha=yyyy-MM-dd` → local date (invalid / missing → today). */
export function parseFecha(raw: string | null, today: Date): Date {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return startOfDay(today);
  const d = parseISO(raw);
  return Number.isNaN(d.getTime()) ? startOfDay(today) : d;
}

export const weekStartOf = (d: Date) => startOfWeek(d, { weekStartsOn: 1 });

export const weekDays7 = (focus: Date) => {
  const start = weekStartOf(focus);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
};

/** "6 – 11 oct 2026" / "29 sep – 4 oct 2026" */
export function rangeLabel(days: Date[]) {
  const a = days[0];
  const b = days[days.length - 1];
  if (isSameMonth(a, b)) return `${a.getDate()} – ${fmtDay(b)} ${b.getFullYear()}`;
  return `${fmtDay(a)} – ${fmtDay(b)} ${b.getFullYear()}`;
}

export const weekNumber = (d: Date) => getISOWeek(d);

/** "lun" */
export const dowShort = (d: Date) => format(d, "EEE", { locale: es }).replace(".", "");
/** "L" */
export const dowLetter = (d: Date) => format(d, "EEEEE", { locale: es }).toUpperCase();
/** "Jueves 9 de octubre" */
export const longDay = (d: Date) => {
  const s = format(d, "EEEE d 'de' MMMM", { locale: es });
  return s.charAt(0).toUpperCase() + s.slice(1);
};
/** "HH:mm" of an ISO datetime */
export const hm = (iso: string) => format(parseISO(iso), "HH:mm");

export const timeRange = (start: Date, end: Date) => `${format(start, "HH:mm")}–${format(end, "HH:mm")}`;

/** Next working day (skips Sundays, like the seed does). */
export function nextWorkingDay(d: Date) {
  let n = addDays(d, 1);
  while (isSunday(n)) n = addDays(n, 1);
  return n;
}

/* ───────────── scope ───────────── */

/** Units whose crews the current user plans or consults (doc §2). null = all units. */
export function scopeUnits(user: Pick<User, "role" | "unitId">, unitFilter: string | "all"): Set<string> | null {
  if (user.role === "direccion") return unitFilter === "all" ? null : new Set([unitFilter]);
  return new Set([user.unitId]);
}

export const inScope = (scope: Set<string> | null, unitId: string) => !scope || scope.has(unitId);

/* ───────────── jornada visual status ───────────── */

export type JornadaKind = "live" | "done" | "planned" | "late" | "nocrew" | "alert" | "moved";

export type JornadaVisual = { kind: JornadaKind; tone: Tone; label: string; live: boolean };

export function jornadaVisual(j: Jornada, order: Order, now: Date): JornadaVisual {
  if (j.status === "en_curso") return { kind: "live", tone: "sky", label: "En curso", live: true };
  if (j.status === "cerrada") return { kind: "done", tone: "teal", label: "Cerrada", live: false };
  if (order.status === "con_incidencia") return { kind: "alert", tone: "red", label: "Con incidencia", live: false };
  if (!j.workerIds.length) return { kind: "nocrew", tone: "slate", label: "Sin cuadrilla", live: false };
  if (order.status === "reprogramada") return { kind: "moved", tone: "amber", label: "Por confirmar", live: false };
  if (parseISO(j.plannedStart) < now) return { kind: "late", tone: "amber", label: "Sin entrada", live: false };
  return { kind: "planned", tone: "blue", label: "Programada", live: false };
}

/* ───────────── agenda item ───────────── */

export type AgendaItem = {
  j: Jornada;
  order: Order;
  client?: Client;
  site?: Site;
  supervisor?: User;
  crew: Worker[];
  start: Date;
  end: Date;
  visual: JornadaVisual;
  /** workers of this jornada booked in another open jornada the same day */
  conflictIds: string[];
};

export type Lookups = {
  clients: Map<string, Client>;
  sites: Map<string, Site>;
  users: Map<string, User>;
  workers: Map<string, Worker>;
};

export function buildItem(j: Jornada, order: Order, lk: Lookups, now: Date, conflictIds: string[] = []): AgendaItem {
  return {
    j,
    order,
    client: lk.clients.get(order.clientId),
    site: lk.sites.get(order.siteId),
    supervisor: lk.users.get(order.supervisorId),
    crew: j.workerIds.map((id) => lk.workers.get(id)).filter((w): w is Worker => !!w),
    start: parseISO(j.plannedStart),
    end: parseISO(j.plannedEnd),
    visual: jornadaVisual(j, order, now),
    conflictIds,
  };
}

/** "J2/3" */
export const dayLabel = (j: Jornada, order: Order) => `J${j.dayIndex}/${Math.max(order.plannedDays, j.dayIndex)}`;
/** Multi-day orders only — "J1/1" is noise on single-day work. */
export const isMultiDay = (j: Jornada, order: Order) => Math.max(order.plannedDays, j.dayIndex) > 1;

/* ───────────── double booking ───────────── */

export type Booking = { jornadaId: string; orderId: string; folio: string; visible: boolean; start: Date; end: Date };
export type Conflict = { workerId: string; dayKey: string; bookings: Booking[]; overlap: boolean };

/**
 * Same worker in two (or more) open jornadas on the same day (doc §4.1 cuadrillas variables).
 * `jornadas` should already be limited to the units in scope and to non-cancelled orders.
 */
export function findConflicts(jornadas: Jornada[], orderById: Map<string, Order>, visibleIds: Set<string>): Conflict[] {
  const map = new Map<string, Booking[]>();
  for (const j of jornadas) {
    if (j.status === "cerrada") continue;
    const order = orderById.get(j.orderId);
    if (!order || order.status === "cancelada") continue;
    for (const w of j.workerIds) {
      const k = `${j.date}|${w}`;
      const list = map.get(k) ?? [];
      list.push({ jornadaId: j.id, orderId: j.orderId, folio: order.folio, visible: visibleIds.has(j.orderId), start: parseISO(j.plannedStart), end: parseISO(j.plannedEnd) });
      map.set(k, list);
    }
  }
  const out: Conflict[] = [];
  map.forEach((bookings, k) => {
    if (bookings.length < 2) return;
    const [date, workerId] = k.split("|");
    const sorted = [...bookings].sort((a, b) => a.start.getTime() - b.start.getTime());
    const overlap = sorted.some((b, i) => i > 0 && b.start < sorted[i - 1].end);
    out.push({ workerId, dayKey: date, bookings: sorted, overlap });
  });
  return out.sort((a, b) => a.dayKey.localeCompare(b.dayKey) || a.workerId.localeCompare(b.workerId));
}

/** jornadaId → worker ids that are double-booked in it. */
export function conflictIndex(conflicts: Conflict[]) {
  const m = new Map<string, string[]>();
  conflicts.forEach((c) =>
    c.bookings.forEach((b) => {
      const list = m.get(b.jornadaId) ?? [];
      if (!list.includes(c.workerId)) list.push(c.workerId);
      m.set(b.jornadaId, list);
    }),
  );
  return m;
}

/* ───────────── day timeline ───────────── */

export type Packed<T> = T & { col: number; cols: number };

/** Side-by-side layout for overlapping blocks (calendar-style column packing). */
export function packColumns<T extends { top: number; bottom: number }>(items: T[]): Packed<T>[] {
  const sorted = [...items].sort((a, b) => a.top - b.top || b.bottom - a.bottom);
  const out: Packed<T>[] = [];
  let cluster: Packed<T>[] = [];
  let colEnds: number[] = [];
  let clusterEnd = -Infinity;
  const flush = () => {
    cluster.forEach((c) => (c.cols = colEnds.length));
    out.push(...cluster);
    cluster = [];
    colEnds = [];
  };
  for (const it of sorted) {
    if (it.top >= clusterEnd && cluster.length) flush();
    let col = colEnds.findIndex((end) => end <= it.top);
    if (col === -1) {
      col = colEnds.length;
      colEnds.push(it.bottom);
    } else colEnds[col] = it.bottom;
    cluster.push({ ...it, col, cols: 1 });
    clusterEnd = Math.max(clusterEnd, it.bottom);
  }
  if (cluster.length) flush();
  return out;
}

/** Visible hour range for the day timeline: 06–22 by default, widened to fit the day's work. */
export function hourRange(items: { start: Date; end: Date }[], day: Date) {
  let from = 6;
  let to = 22;
  for (const it of items) {
    const s = isSameDay(it.start, day) ? it.start.getHours() : 0;
    const e = isSameDay(it.end, day) ? it.end.getHours() + (it.end.getMinutes() ? 1 : 0) : 24;
    from = Math.min(from, s);
    to = Math.max(to, e);
  }
  return { from: Math.max(0, from), to: Math.min(24, to) };
}

/* ───────────── scheduling ───────────── */

export type DayPlan = { date: string; start: string; end: string };

/**
 * Jornada → plan row. The store builds start/end on the same calendar date, so overnight
 * jornadas (e.g. 23:00 → 04:00) can't be expressed; they are clamped to 23:59 and flagged.
 */
export function toDayPlan(j: Pick<Jornada, "date" | "plannedStart" | "plannedEnd">): DayPlan & { clamped: boolean; originalEnd: string } {
  const s = parseISO(j.plannedStart);
  const e = parseISO(j.plannedEnd);
  const start = format(s, "HH:mm");
  const end = format(e, "HH:mm");
  const clamped = !isSameDay(s, e) || end <= start;
  return { date: j.date, start, end: clamped ? "23:59" : end, clamped, originalEnd: end };
}

/**
 * The order's pending days with one of them moved (doc §8: one order, many jornadas).
 * Feed the result to `scheduleJornadas(orderId, days, motivo)`.
 */
export function pendingDaysWithMove(orderJornadas: Jornada[], moved: { jornadaId: string } & DayPlan) {
  return orderJornadas
    .filter((j) => j.status === "pendiente")
    .map((j) => {
      if (j.id === moved.jornadaId) return { date: moved.date, start: moved.start, end: moved.end, crew: j.workerIds, clamped: false, originalEnd: moved.end };
      const p = toDayPlan(j);
      return { ...p, crew: j.workerIds };
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
}

export const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

export const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

/** What is wrong with a plan row, and which field to mark: the date, or the start/end times. */
export type PlanIssue = { field: "date" | "time"; message: string };

/** Validate one plan row (a date not in the past, start and end on the same day). Returns the first issue or null. */
export function validatePlan(p: DayPlan, todayKey: string): PlanIssue | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date)) return { field: "date", message: "Elija una fecha." };
  if (p.date < todayKey) return { field: "date", message: "La fecha ya pasó: elija hoy o un día posterior." };
  if (!/^\d{2}:\d{2}$/.test(p.start) || !/^\d{2}:\d{2}$/.test(p.end)) return { field: "time", message: "Indique inicio y término." };
  if (minutesOf(p.end) <= minutesOf(p.start)) return { field: "time", message: "El término debe ser posterior al inicio, el mismo día: ajuste la hora." };
  return null;
}

/* ───────────── hours ───────────── */

/** Jornada span: real (entrada → salida) when closed, otherwise the planned window. */
export function jornadaSpanMinutes(j: Jornada, now = new Date()) {
  if (j.status === "cerrada" && j.checkIn && j.checkOut) return jornadaMinutes(j, now);
  return Math.max(0, differenceInMinutes(parseISO(j.plannedEnd), parseISO(j.plannedStart)));
}

export const REASON_CREW = "Solo el supervisor de la orden asigna cuadrilla y fechas. Dirección y Administración consultan.";
