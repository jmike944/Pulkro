"use client";

import { useMemo } from "react";
import { isSameDay, parseISO, startOfDay } from "date-fns";
import { useLookups, useScopedData } from "@/lib/hooks";
import { jornadaMinutes, nextAction, orderEvidence, type NextAction } from "@/lib/domain";
import { DONE_STATUSES, OPEN_STATUSES, type Tone } from "@/lib/status";
import type { Client, Jornada, Order, OrderStatus, ServiceType, Site, Unit, User, Worker } from "@/lib/types";

/** Everything a list row / card / export needs about one order, joined once. */
export type OrderRow = {
  order: Order;
  client?: Client;
  site?: Site;
  service?: ServiceType;
  supervisor?: User;
  unit?: Unit;
  crew: Worker[];
  jornadas: Jornada[];
  closedDays: number;
  liveDays: number;
  /** jornadas with check-in (evidence becomes mandatory) */
  executed: number;
  antes: number;
  despues: number;
  /** an executed jornada has no ANTES photo */
  antesMissing: boolean;
  /** a closed jornada has no DESPUÉS photo */
  despuesMissing: boolean;
  /** Σ real minutes (live jornadas count elapsed time) */
  minutes: number;
  live: boolean;
  openIncidents: number;
  action: NextAction;
  /** works today (a jornada planned today or in progress) */
  today: boolean;
  /** planned start of today's jornada (for the "Hoy" ordering) */
  todayAt?: string;
  /** should have started already but has not */
  late: boolean;
  /** accent-free lowercase text for search */
  haystack: string;
};

export const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

const NOT_STARTED: OrderStatus[] = ["borrador", "programada", "reprogramada"];

export function useOrderRows(now: Date) {
  const data = useScopedData();
  const lk = useLookups();
  const { orders, jornadas, photos, incidents, reports, surveys, cases } = data;

  const rows = useMemo<OrderRow[]>(() => {
    const group = <T extends { orderId?: string }>(xs: T[]) => {
      const m = new Map<string, T[]>();
      for (const x of xs) {
        if (!x.orderId) continue;
        const arr = m.get(x.orderId);
        if (arr) arr.push(x);
        else m.set(x.orderId, [x]);
      }
      return m;
    };
    const jBy = group(jornadas);
    const pBy = group(photos);
    const iBy = group(incidents);
    const rBy = group(reports);
    const sBy = group(surveys);
    const cBy = group(cases);
    const today0 = startOfDay(now);

    return orders.map((order) => {
      const js = (jBy.get(order.id) ?? []).slice().sort((a, b) => a.dayIndex - b.dayIndex);
      const ps = pBy.get(order.id) ?? [];
      const incs = iBy.get(order.id) ?? [];
      const ev = orderEvidence(order, js, ps);
      const action = nextAction(
        order,
        { jornadas: js, photos: ps, incidents: incs, reports: rBy.get(order.id) ?? [], surveys: sBy.get(order.id) ?? [], cases: cBy.get(order.id) ?? [] },
        now,
      );
      const client = lk.clients.get(order.clientId);
      const site = lk.sites.get(order.siteId);
      const service = lk.serviceTypes.get(order.serviceTypeId);
      const supervisor = lk.users.get(order.supervisorId);
      const current = js.find((j) => j.status !== "cerrada") ?? js.at(-1);
      const crew = (current?.workerIds ?? []).map((id) => lk.workers.get(id)).filter((w): w is Worker => !!w);
      const liveDays = js.filter((j) => j.status === "en_curso").length;
      const executed = ev.perJornada.filter((x) => x.jornada.checkIn);
      const todayJ = js.find((j) => j.status === "en_curso") ?? js.find((j) => isSameDay(parseISO(j.plannedStart), now));
      return {
        order,
        client,
        site,
        service,
        supervisor,
        unit: lk.units.get(order.unitId),
        crew,
        jornadas: js,
        closedDays: js.filter((j) => j.status === "cerrada").length,
        liveDays,
        executed: executed.length,
        antes: ev.antes,
        despues: ev.despues,
        antesMissing: executed.some((x) => !x.antes),
        despuesMissing: executed.some((x) => x.jornada.status === "cerrada" && !x.despues),
        minutes: js.reduce((s, j) => s + jornadaMinutes(j, now), 0),
        live: liveDays > 0,
        openIncidents: incs.filter((i) => i.status === "abierta").length,
        action,
        today: order.status !== "cancelada" && !!todayJ,
        todayAt: todayJ?.plannedStart,
        late: NOT_STARTED.includes(order.status) && parseISO(order.scheduledStart) < today0,
        haystack: normalize(
          [order.folio, order.title, order.commercialRef, client?.name, client?.shortName, site?.name, site?.address, site?.municipality, supervisor?.name].join(" "),
        ),
      } satisfies OrderRow;
    });
  }, [orders, jornadas, photos, incidents, reports, surveys, cases, lk, now]);

  return { rows, user: data.user, unitFilter: data.unitFilter };
}

/* ───────────── tabs ───────────── */

export const ORDER_TABS = [
  { value: "abiertas", label: "Abiertas" },
  { value: "hoy", label: "Hoy" },
  { value: "validar", label: "Por validar" },
  { value: "incidencia", label: "Con incidencia" },
  { value: "terminadas", label: "Terminadas" },
  { value: "todas", label: "Todas" },
] as const;

export type OrderTab = (typeof ORDER_TABS)[number]["value"];

export const isOrderTab = (v: string | null): v is OrderTab => ORDER_TABS.some((t) => t.value === v);

const hasIncident = (r: OrderRow) => r.order.status === "con_incidencia" || (r.openIncidents > 0 && r.order.status !== "cancelada");

export const TAB_TEST: Record<OrderTab, (r: OrderRow) => boolean> = {
  abiertas: (r) => OPEN_STATUSES.includes(r.order.status),
  hoy: (r) => r.today,
  validar: (r) => r.order.status === "pendiente_validacion" || r.order.status === "reabierta",
  incidencia: hasIncident,
  terminadas: (r) => DONE_STATUSES.includes(r.order.status),
  todas: () => true,
};

const byStart = (a: OrderRow, b: OrderRow) => a.order.scheduledStart.localeCompare(b.order.scheduledStart);
const closedTime = (r: OrderRow) => r.order.closure?.validatedAt ?? r.order.scheduledEnd;

/** Sort that makes sense for each tab (soonest work first, most recent closures first). */
export const TAB_SORT: Record<OrderTab, (a: OrderRow, b: OrderRow) => number> = {
  abiertas: (a, b) => Number(b.live) - Number(a.live) || byStart(a, b),
  hoy: (a, b) => Number(b.live) - Number(a.live) || (a.todayAt ?? "").localeCompare(b.todayAt ?? ""),
  validar: (a, b) => a.order.scheduledEnd.localeCompare(b.order.scheduledEnd),
  incidencia: (a, b) => a.order.scheduledEnd.localeCompare(b.order.scheduledEnd),
  terminadas: (a, b) => closedTime(b).localeCompare(closedTime(a)),
  todas: (a, b) => b.order.scheduledStart.localeCompare(a.order.scheduledStart),
};

/* ───────────── quick stages (summary strip) ───────────── */

export const STAGES = [
  { value: "programadas", label: "Programadas", tone: "blue" as Tone, test: (r: OrderRow) => r.order.status === "programada" || r.order.status === "reprogramada" },
  { value: "ejecucion", label: "En ejecución", tone: "sky" as Tone, test: (r: OrderRow) => r.order.status === "en_ejecucion" || r.order.status === "jornada_cerrada" },
  { value: "validar", label: "Por validar", tone: "amber" as Tone, test: TAB_TEST.validar },
  { value: "incidencia", label: "Con incidencia", tone: "red" as Tone, test: hasIncident },
] as const;

export type Stage = (typeof STAGES)[number]["value"];

export const isStage = (v: string | null): v is Stage => STAGES.some((s) => s.value === v);

/* ───────────── filters ───────────── */

export type OrderFilters = {
  sup: string;
  srv: string;
  cli: string;
  uni: string;
  alta: boolean;
};

export const activeFilterCount = (f: OrderFilters) => [f.sup, f.srv, f.cli, f.uni].filter(Boolean).length + (f.alta ? 1 : 0);

export function applyFilters(rows: OrderRow[], f: OrderFilters, search: string) {
  const q = normalize(search);
  const terms = q ? q.split(/\s+/) : [];
  return rows.filter(
    (r) =>
      (!f.sup || r.order.supervisorId === f.sup) &&
      (!f.srv || r.order.serviceTypeId === f.srv) &&
      (!f.cli || r.order.clientId === f.cli) &&
      (!f.uni || r.order.unitId === f.uni) &&
      (!f.alta || r.order.priority === "alta") &&
      terms.every((t) => r.haystack.includes(t)),
  );
}
