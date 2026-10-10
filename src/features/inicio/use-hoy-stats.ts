"use client";

import { useMemo } from "react";
import { endOfMonth, parseISO, setMonth, startOfMonth } from "date-fns";
import type { useScopedData } from "@/lib/hooks";
import { daysUntil } from "@/lib/format";
import { closedAt, hoursPerService, incidentsByType, photoCompliance, servicesByMonth, servicesInRange, statusBuckets } from "@/lib/metrics";
import { jornadaMinutes, nextAction, type NextAction } from "@/lib/domain";
import type { Order } from "@/lib/types";

/**
 * Numbers shared by the desktop dashboard and the phone "Hoy", so both trees compute identically.
 * Each hook takes the caller's `useScopedData()` result (no second scoping pass) and the shared `now`.
 */
type Scoped = ReturnType<typeof useScopedData>;

export const MONTHS_ES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

/** Attention priority for the "requieren atención" list. */
const PRIORITY: Partial<Record<Order["status"], number>> = {
  con_incidencia: 0,
  pendiente_validacion: 1,
  reabierta: 1,
  en_ejecucion: 2,
  finalizada: 3,
  programada: 4,
  jornada_cerrada: 5,
  borrador: 6,
  reprogramada: 7,
};

/** Services closed in the selected month (vs the previous one), pipeline buckets and the year's hours / photo compliance. */
export function useHoyStats({ orders, jornadas, photos, incidents }: Scoped, now: Date, month: number) {
  return useMemo(() => {
    const ref = setMonth(now, month);
    const start = startOfMonth(ref);
    const end = month === now.getMonth() ? now : endOfMonth(ref);
    const prevStart = startOfMonth(setMonth(ref, month - 1));
    const prevEnd = endOfMonth(prevStart);
    const current = servicesInRange(orders, start, end).length;
    const prev = servicesInRange(orders, prevStart, prevEnd).length;
    const buckets = statusBuckets(orders);
    const yearClosed = orders.filter((o) => {
      const c = closedAt(o);
      return c && c.getFullYear() === now.getFullYear();
    });
    const hours = hoursPerService(yearClosed, jornadas);
    const compliance = photoCompliance(yearClosed, jornadas, photos);
    return {
      current,
      prev,
      delta: prev ? (current - prev) / prev : 0,
      prevLabel: MONTHS_ES[(month + 11) % 12].toLowerCase(),
      buckets,
      byMonth: servicesByMonth(orders, now),
      yearClosed: yearClosed.length,
      totalHours: hours.totalMinutes / 60,
      compliance,
      incidentsOpen: incidents.filter((i) => i.status === "abierta").length,
    };
  }, [orders, jornadas, photos, incidents, month, now]);
}

export type AttentionItem = {
  o: Order;
  a: NextAction;
  /** Σ real minutes logged on the order (live jornadas count elapsed time) */
  minutes: number;
};

/**
 * Orders waiting on someone, ranked by PRIORITY then start date. `top` is the desktop list (first 6);
 * `all` lets a smaller screen drop what it already shows elsewhere before cutting.
 */
export function useAttention({ orders, jornadas, photos, incidents, reports, surveys, cases }: Scoped, now: Date) {
  return useMemo(() => {
    const ctx = { jornadas, photos, incidents, reports, surveys, cases };
    const minutesBy = new Map<string, number>();
    for (const j of jornadas) minutesBy.set(j.orderId, (minutesBy.get(j.orderId) ?? 0) + jornadaMinutes(j, now));
    const all: AttentionItem[] = orders
      .filter((o) => PRIORITY[o.status] !== undefined)
      .filter((o) => o.status !== "programada" || daysUntil(o.scheduledStart) <= 1)
      .map((o) => ({ o, a: nextAction(o, ctx, now), minutes: minutesBy.get(o.id) ?? 0 }))
      .sort((x, y) => (PRIORITY[x.o.status]! - PRIORITY[y.o.status]!) || x.o.scheduledStart.localeCompare(y.o.scheduledStart));
    return { all, top: all.slice(0, 6) };
  }, [orders, jornadas, photos, incidents, reports, surveys, cases, now]);
}

/** This year's incidents and their top types ("Qué detiene los cierres"). */
export function useIncidentYear({ incidents }: Scoped, now: Date) {
  const incidentYear = useMemo(() => incidents.filter((i) => parseISO(i.createdAt).getFullYear() === now.getFullYear()), [incidents, now]);
  const incidentBars = useMemo(() => incidentsByType(incidentYear).slice(0, 5), [incidentYear]);
  return { incidentYear, incidentBars };
}
