"use client";

import { useMemo } from "react";
import { addDays, isSunday } from "date-fns";
import { useAppStore, useLookups, useNow, useScopedData } from "@/lib/hooks";
import { fmtTime } from "@/lib/format";
import type { Tone } from "@/lib/status";
import type { Jornada, Order, Unit, User, Worker } from "@/lib/types";
import { dayKey, inScope, jornadaSpanMinutes, scopeUnits, weekStartOf } from "@/features/agenda/agenda-model";

export type TodayKind = "en_campo" | "asignado" | "doble" | "termino" | "libre" | "inactivo";
export type TodayStatus = { kind: TodayKind; label: string; tone: Tone; live: boolean; detail?: string };

export type WorkerStat = {
  worker: Worker;
  unit?: Unit;
  today: TodayStatus;
  /** jornadas this week (Mon–Sun) in the orders the user can see */
  weekJornadas: number;
  /** Σ jornada duration where the worker is in the crew — "horas de jornada asignada" */
  weekMinutes: number;
  last?: { date: string; folio: string; client?: string };
};

export type SupervisorToday = { label: string; tone: Tone; live: boolean; href?: string };

export const isAssigned = (k: TodayKind) => k === "en_campo" || k === "asignado" || k === "doble";
export const isAvailableToday = (k: TodayKind) => k === "libre" || k === "termino";

/**
 * Team view model. Availability ("hoy") uses every jornada of the unit — a worker booked by
 * another supervisor is not free. Workload numbers (jornadas, horas, último servicio) only use
 * the orders the current role may see (doc §2).
 */
export function useTeamData() {
  const scoped = useScopedData();
  const { user, unitFilter } = scoped;
  const lk = useLookups();
  const workers = useAppStore((s) => s.workers);
  const users = useAppStore((s) => s.users);
  const allJornadas = useAppStore((s) => s.jornadas);
  const allOrders = useAppStore((s) => s.orders);
  const now = useNow(60_000);
  const minuteKey = Math.floor(now.getTime() / 60_000);

  const scope = useMemo(() => scopeUnits(user, unitFilter), [user, unitFilter]);
  const orderById = useMemo(() => new Map<string, Order>(allOrders.map((o) => [o.id, o] as const)), [allOrders]);

  return useMemo(() => {
    const nowDate = new Date(minuteKey * 60_000);
    const todayK = dayKey(nowDate);
    const live = (o?: Order) => !!o && o.status !== "cancelada";

    const team = workers.filter((w) => inScope(scope, w.unitId)).sort((a, b) => a.name.localeCompare(b.name));
    const unitIds = new Set(team.map((w) => w.unitId));

    // availability: all jornadas today in the units in scope
    const todayByWorker = new Map<string, Jornada[]>();
    allJornadas.forEach((j) => {
      if (j.date !== todayK) return;
      const o = orderById.get(j.orderId);
      if (!live(o) || !inScope(scope, o!.unitId)) return;
      j.workerIds.forEach((w) => todayByWorker.set(w, [...(todayByWorker.get(w) ?? []), j]));
    });

    // workload: scoped jornadas, indexed by worker
    const byWorker = new Map<string, Jornada[]>();
    scoped.jornadas.forEach((j) => {
      if (!live(orderById.get(j.orderId))) return;
      j.workerIds.forEach((w) => {
        const list = byWorker.get(w);
        if (list) list.push(j);
        else byWorker.set(w, [j]);
      });
    });

    const weekStart = weekStartOf(nowDate);
    const weekDaysAll = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    const weekKeys = new Set(weekDaysAll.map(dayKey));

    const todayStatus = (w: Worker): TodayStatus => {
      if (!w.active) return { kind: "inactivo", label: "Inactivo", tone: "slate", live: false };
      const js = todayByWorker.get(w.id) ?? [];
      const open = js.filter((j) => j.status !== "cerrada");
      const folio = (j: Jornada) => {
        const o = orderById.get(j.orderId);
        return o && scoped.orderIds.has(o.id) ? o.folio : "otra cuadrilla";
      };
      if (open.length >= 2) return { kind: "doble", label: "Doble asignación", tone: "amber", live: false, detail: open.map((j) => `${folio(j)} ${fmtTime(j.plannedStart)}`).join(" · ") };
      const inField = open.find((j) => j.status === "en_curso");
      if (inField) return { kind: "en_campo", label: "En campo", tone: "sky", live: true, detail: folio(inField) };
      if (open[0]) return { kind: "asignado", label: `Asignado · ${fmtTime(open[0].plannedStart)}`, tone: "blue", live: false, detail: folio(open[0]) };
      if (js.length) return { kind: "termino", label: "Terminó jornada", tone: "teal", live: false };
      return { kind: "libre", label: "Disponible hoy", tone: "teal", live: false };
    };

    const stats: WorkerStat[] = team.map((w) => {
      const mine = byWorker.get(w.id) ?? [];
      const week = mine.filter((j) => weekKeys.has(j.date));
      const done = mine.filter((j) => j.status !== "pendiente" && j.date <= todayK).sort((a, b) => b.plannedStart.localeCompare(a.plannedStart));
      const lastJ = done[0];
      const lastOrder = lastJ ? orderById.get(lastJ.orderId) : undefined;
      return {
        worker: w,
        unit: lk.units.get(w.unitId),
        today: todayStatus(w),
        weekJornadas: week.length,
        weekMinutes: week.reduce((s, j) => s + jornadaSpanMinutes(j, nowDate), 0),
        last: lastJ && lastOrder ? { date: lastJ.date, folio: lastOrder.folio, client: lk.clients.get(lastOrder.clientId)?.shortName } : undefined,
      };
    });

    // hero bars: distinct people assigned per day this week (unit capacity view)
    const perDay = new Map<string, Set<string>>();
    allJornadas.forEach((j) => {
      if (!weekKeys.has(j.date)) return;
      const o = orderById.get(j.orderId);
      if (!live(o) || !inScope(scope, o!.unitId)) return;
      const set = perDay.get(j.date) ?? new Set<string>();
      j.workerIds.forEach((w) => set.add(w));
      perDay.set(j.date, set);
    });
    const showSunday = isSunday(nowDate) || (perDay.get(dayKey(weekDaysAll[6]))?.size ?? 0) > 0;
    const weekBars = (showSunday ? weekDaysAll : weekDaysAll.slice(0, 6)).map((d) => ({ key: dayKey(d), date: d, value: perDay.get(dayKey(d))?.size ?? 0 }));

    const active = stats.filter((s) => s.worker.active);
    const supervisors: User[] = users
      .filter((u) => u.role === "supervisor" && u.active)
      .filter((u) => (user.role === "supervisor" ? u.id === user.id : inScope(scope, u.unitId)))
      .sort((a, b) => a.unitId.localeCompare(b.unitId) || a.name.localeCompare(b.name));

    const supervisorToday = new Map<string, SupervisorToday>();
    supervisors.forEach((u) => {
      const js = scoped.jornadas
        .filter((j) => j.date === todayK && orderById.get(j.orderId)?.supervisorId === u.id && live(orderById.get(j.orderId)))
        .sort((a, b) => a.plannedStart.localeCompare(b.plannedStart));
      const inField = js.find((j) => j.status === "en_curso");
      const next = js.find((j) => j.status === "pendiente");
      if (inField) {
        supervisorToday.set(u.id, {
          label: `En campo · ${orderById.get(inField.orderId)?.folio} desde ${inField.checkIn ? fmtTime(inField.checkIn.deviceAt) : fmtTime(inField.plannedStart)}`,
          tone: "sky",
          live: true,
          href: `/jornada/${inField.id}`,
        });
      } else if (next) {
        supervisorToday.set(u.id, { label: `Jornada hoy · ${fmtTime(next.plannedStart)}`, tone: "blue", live: false, href: `/jornada/${next.id}` });
      } else if (js.length) {
        supervisorToday.set(u.id, { label: "Jornadas de hoy cerradas", tone: "teal", live: false });
      } else supervisorToday.set(u.id, { label: "Disponible", tone: "slate", live: false });
    });

    return {
      user,
      team,
      stats,
      unitIds,
      multiUnit: unitIds.size > 1,
      weekBars,
      todayIndex: weekBars.findIndex((b) => b.key === todayK),
      counts: {
        active: active.length,
        assignedToday: active.filter((s) => isAssigned(s.today.kind)).length,
        availableToday: active.filter((s) => isAvailableToday(s.today.kind)).length,
        doubleToday: active.filter((s) => s.today.kind === "doble").length,
        inField: active.filter((s) => s.today.kind === "en_campo").length,
      },
      supervisors,
      supervisorToday,
      scopeLabel: !scope ? `${lk.units.size} unidades` : (lk.units.get([...scope][0])?.name ?? "tu unidad"),
      byWorker,
      orderById,
    };
  }, [workers, users, allJornadas, orderById, scoped.jornadas, scoped.orderIds, scope, lk, user, minuteKey]);
}

export type TeamData = ReturnType<typeof useTeamData>;

/** Hue from a name — stable avatar tint for new catalog entries. */
export function hueFromName(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
}

/** Same rule as the seed: first letters of the first two words longer than 2 chars. */
export function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter((p) => p.length > 2);
  const src = parts.length ? parts : name.trim().split(/\s+/);
  return src
    .slice(0, 2)
    .map((p) => p[0] ?? "")
    .join("")
    .toUpperCase();
}
