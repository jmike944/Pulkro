/**
 * Evidence requests (doc §4.2 · §8): every executed jornada needs at least one ANTES and one
 * DESPUÉS photo before the order can be closed, unless an authorized exception was recorded.
 * Pure functions — safe in useMemo and tests.
 */
import { addDays, differenceInCalendarDays, differenceInMinutes, endOfDay, parseISO, subDays } from "date-fns";
import type { AuditEntry, Jornada, Order, Photo } from "@/lib/types";

export type EvidenceKind = "antes" | "despues";

export const KIND_LABEL: Record<EvidenceKind, string> = { antes: "ANTES", despues: "DESPUÉS" };

export type EvidenceRequest = {
  /** `${jornadaId}:${kind}` — stable across renders. */
  key: string;
  kind: EvidenceKind;
  order: Order;
  jornada: Jornada;
  supervisorId: string;
  /** When the photo became due: check-in for ANTES, check-out for DESPUÉS. */
  since: string;
  /** End of the day after `since`. */
  due: Date;
  overdue: boolean;
  /** Calendar days past due (≥ 1 when overdue). */
  overdueDays: number;
  /** Calendar days left until due (0 = today). */
  dueInDays: number;
  /** The order was already validated without this photo. */
  closed: boolean;
  /** Framing references: the ANTES photos of the jornada (for DESPUÉS) or of the order (for ANTES). */
  reference: Photo[];
};

export const requestKey = (jornadaId: string, kind: EvidenceKind) => `${jornadaId}:${kind}`;

/** Audit action the store's `logReminder` writes for a jornada ("Envió recordatorio de evidencia · Jornada 2"). */
export const REMINDER_ACTION = "Envió recordatorio de evidencia";

/**
 * Evidence reminders sent for one jornada, newest first (like the store's audit). Reminders are audit-only:
 * they never go into the jornada's bitácora.
 */
export const jornadaReminders = (audit: AuditEntry[], jornadaId: string) =>
  audit.filter((a) => a.entity === "jornada" && a.entityId === jornadaId && a.action.startsWith(REMINDER_ACTION));

const byTakenAt = (a: Photo, b: Photo) => a.takenAt.localeCompare(b.takenAt);

/**
 * Missing-evidence requests derived from scoped data.
 * ANTES is due from check-in; DESPUÉS is due from check-out (a crew still on site isn't late).
 * Cancelled orders and closures with an authorized exception are excluded.
 */
export function evidenceRequests(orders: Order[], jornadas: Jornada[], photos: Photo[], now: Date): EvidenceRequest[] {
  const orderById = new Map(orders.map((o) => [o.id, o] as const));
  const byJornada = new Map<string, { antes: Photo[]; despues: Photo[] }>();
  const antesByOrder = new Map<string, Photo[]>();
  for (const p of photos) {
    if (!p.jornadaId || (p.kind !== "antes" && p.kind !== "despues")) continue;
    const slot = byJornada.get(p.jornadaId) ?? { antes: [], despues: [] };
    slot[p.kind].push(p);
    byJornada.set(p.jornadaId, slot);
    if (p.kind === "antes") antesByOrder.set(p.orderId, [...(antesByOrder.get(p.orderId) ?? []), p]);
  }

  const out: EvidenceRequest[] = [];
  for (const j of jornadas) {
    if (!j.checkIn) continue;
    const order = orderById.get(j.orderId);
    if (!order || order.status === "cancelada" || order.closure?.exception) continue;
    const slot = byJornada.get(j.id);
    const push = (kind: EvidenceKind, since: string, reference: Photo[]) => {
      const due = endOfDay(addDays(parseISO(since), 1));
      const overdue = now > due;
      out.push({
        key: requestKey(j.id, kind),
        kind,
        order,
        jornada: j,
        supervisorId: order.supervisorId,
        since,
        due,
        overdue,
        overdueDays: overdue ? Math.max(1, differenceInCalendarDays(now, due)) : 0,
        dueInDays: Math.max(0, differenceInCalendarDays(due, now)),
        closed: !!order.closure,
        reference: [...reference].sort(byTakenAt),
      });
    };
    if (!slot?.antes.length) push("antes", j.checkIn.deviceAt, antesByOrder.get(order.id) ?? []);
    if (j.checkOut && !slot?.despues.length) push("despues", j.checkOut.deviceAt, slot?.antes ?? []);
  }
  return out.sort((a, b) => Number(b.overdue) - Number(a.overdue) || a.since.localeCompare(b.since));
}

export function dueLabel(r: Pick<EvidenceRequest, "overdue" | "overdueDays" | "dueInDays">) {
  if (r.overdue) return r.overdueDays === 1 ? "Vencida por 1 día" : `Vencida por ${r.overdueDays} días`;
  if (r.dueInDays === 0) return "Vence hoy";
  if (r.dueInDays === 1) return "Vence mañana";
  return `Vence en ${r.dueInDays} días`;
}

export const neededLabel = (r: Pick<EvidenceRequest, "kind" | "jornada">) => `Foto ${KIND_LABEL[r.kind]} · Jornada ${r.jornada.dayIndex}`;

/**
 * How long DESPUÉS photos take to arrive after the crew leaves: average lag between check-out and
 * the first DESPUÉS photo, over jornadas (last `days`) where that photo was taken after check-out.
 */
export function despuesResponse(jornadas: Jornada[], photos: Photo[], now: Date, days = 30) {
  const from = subDays(now, days);
  const first = new Map<string, string>();
  for (const p of photos) {
    if (p.kind !== "despues" || !p.jornadaId) continue;
    const cur = first.get(p.jornadaId);
    if (!cur || p.takenAt < cur) first.set(p.jornadaId, p.takenAt);
  }
  let samples = 0;
  let late = 0;
  let lateMinutes = 0;
  for (const j of jornadas) {
    if (!j.checkOut) continue;
    const out = parseISO(j.checkOut.deviceAt);
    if (out < from || out > now) continue;
    const t = first.get(j.id);
    if (!t) continue;
    samples++;
    const lag = differenceInMinutes(parseISO(t), out);
    if (lag > 0) {
      late++;
      lateMinutes += lag;
    }
  }
  return { samples, late, avgLateMinutes: late ? lateMinutes / late : 0, onSiteRate: samples ? (samples - late) / samples : 1 };
}

/** Lag in the most readable unit: minutes → hours → days. */
export function lagParts(minutes: number): { value: number; unit: string } {
  if (minutes < 60) return { value: Math.round(minutes), unit: "min" };
  if (minutes < 48 * 60) return { value: Math.round((minutes / 60) * 10) / 10, unit: "h" };
  return { value: Math.round((minutes / 1440) * 10) / 10, unit: "días" };
}

/** Matching ANTES/DESPUÉS pair for a photo (same jornada + area, then same area, then same scene). */
export function findPair(photo: Photo, all: Photo[]): { before: Photo; after: Photo } | null {
  if (photo.kind !== "antes" && photo.kind !== "despues") return null;
  const other = photo.kind === "antes" ? "despues" : "antes";
  const pool = all.filter((p) => p.orderId === photo.orderId && p.kind === other);
  const sameScene = (p: Photo) =>
    p.source.type === "scene" && photo.source.type === "scene" && p.source.scene === photo.source.scene && p.source.seed === photo.source.seed;
  const match =
    pool.find((p) => p.jornadaId === photo.jornadaId && p.area === photo.area) ??
    pool.find((p) => sameScene(p)) ??
    pool.find((p) => p.area === photo.area);
  if (!match) return null;
  return photo.kind === "antes" ? { before: photo, after: match } : { before: match, after: photo };
}

/** Deterministic tile shape for the masonry gallery (keeps layout stable across renders). */
const SHAPES = [
  { cls: "aspect-[4/3]", h: 0.75 },
  { cls: "aspect-[3/4]", h: 1.333 },
  { cls: "aspect-square", h: 1 },
  { cls: "aspect-[4/3]", h: 0.75 },
  { cls: "aspect-[4/5]", h: 1.25 },
] as const;

export function tileShape(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return SHAPES[h % SHAPES.length];
}
