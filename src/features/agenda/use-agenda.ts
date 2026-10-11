"use client";

import { useMemo } from "react";
import { isSunday, parseISO } from "date-fns";
import { useAppStore, useLookups, useScopedData } from "@/lib/hooks";
import type { Order, User } from "@/lib/types";
import {
  buildItem,
  conflictIndex,
  dayKey,
  findConflicts,
  inScope,
  scopeUnits,
  weekDays7,
  type AgendaItem,
  type Conflict,
} from "./agenda-model";

export type DayLoad = {
  key: string;
  date: Date;
  /** distinct people assigned that day (units in scope, every order) */
  assigned: number;
  /** jornadas visible to the user that day */
  jornadas: number;
  conflicts: Conflict[];
};

export type Lane = { id: string; user?: User; items: number };

/**
 * Everything the agenda needs for the week around `focusKey` (yyyy-MM-dd):
 * visible jornadas (scoped, doc §2), supervisor lanes, unit workload and double bookings,
 * plus the orders still waiting for crew/dates.
 */
export function useAgendaData(focusKey: string, now: Date) {
  const scoped = useScopedData();
  const { user, unitFilter, orderIds } = scoped;
  const lk = useLookups();
  const allJornadas = useAppStore((s) => s.jornadas);
  const allOrders = useAppStore((s) => s.orders);
  const workers = useAppStore((s) => s.workers);
  const minuteKey = Math.floor(now.getTime() / 60_000);

  const scope = useMemo(() => scopeUnits(user, unitFilter), [user, unitFilter]);
  const orderById = useMemo(() => new Map(allOrders.map((o) => [o.id, o] as const)), [allOrders]);

  const available = useMemo(() => workers.filter((w) => w.active && inScope(scope, w.unitId)).length, [workers, scope]);

  const week = useMemo(() => {
    const nowDate = new Date(minuteKey * 60_000);
    const all7 = weekDays7(parseISO(focusKey));
    const keys = all7.map(dayKey);
    const keySet = new Set(keys);

    // Unit-level jornadas: real capacity, regardless of which supervisor owns the order.
    const unitJornadas = allJornadas.filter((j) => {
      if (!keySet.has(j.date)) return false;
      const o = orderById.get(j.orderId);
      return !!o && o.status !== "cancelada" && inScope(scope, o.unitId);
    });
    const conflicts = findConflicts(unitJornadas, orderById, orderIds);
    const byJornada = conflictIndex(conflicts);

    const items: AgendaItem[] = scoped.jornadas
      .filter((j) => keySet.has(j.date))
      .flatMap((j) => {
        const order = orderById.get(j.orderId);
        if (!order || order.status === "cancelada") return [];
        return [buildItem(j, order, lk, nowDate, byJornada.get(j.id) ?? [])];
      })
      .sort((a, b) => a.start.getTime() - b.start.getTime());

    const hasSunday =
      items.some((i) => isSunday(i.start)) || isSunday(parseISO(focusKey)) || (keys.includes(dayKey(nowDate)) && isSunday(nowDate));
    const days = hasSunday ? all7 : all7.slice(0, 6);

    const loads: DayLoad[] = days.map((d) => {
      const k = dayKey(d);
      const people = new Set<string>();
      unitJornadas.filter((j) => j.date === k).forEach((j) => j.workerIds.forEach((w) => people.add(w)));
      return { key: k, date: d, assigned: people.size, jornadas: items.filter((i) => i.j.date === k).length, conflicts: conflicts.filter((c) => c.dayKey === k) };
    });

    const supIds = user.role === "supervisor" ? [user.id] : Array.from(new Set(items.map((i) => i.order.supervisorId)));
    const lanes: Lane[] = supIds
      .map((id) => ({ id, user: lk.users.get(id), items: items.filter((i) => i.order.supervisorId === id).length }))
      .sort((a, b) => (a.user?.unitId ?? "").localeCompare(b.user?.unitId ?? "") || (a.user?.name ?? "").localeCompare(b.user?.name ?? ""));

    const people = new Set(items.flatMap((i) => i.j.workerIds));
    return {
      days,
      items,
      lanes,
      loads,
      conflicts: conflicts.filter((c) => days.some((d) => dayKey(d) === c.dayKey)),
      stats: {
        jornadas: items.length,
        people: people.size,
        live: items.filter((i) => i.visual.live).length,
      },
    };
  }, [allJornadas, orderById, orderIds, scope, scoped.jornadas, lk, focusKey, minuteKey, user]);

  const unassigned = useMemo(
    () =>
      scoped.orders
        .filter((o) => o.status === "borrador" || o.status === "reprogramada")
        .sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart)),
    [scoped.orders],
  );

  /** Latest audited reason per pending order (e.g. why it was reprogrammed). */
  const reasons = useMemo(() => {
    const ids = new Set(unassigned.map((o) => o.id));
    const m = new Map<string, string>();
    for (const a of scoped.audit) {
      if (a.orderId && ids.has(a.orderId) && a.reason && !m.has(a.orderId)) m.set(a.orderId, a.reason);
    }
    return m;
  }, [unassigned, scoped.audit]);

  const scopeLabel = useMemo(() => {
    if (!scope) return "todas las unidades";
    const id = [...scope][0];
    return lk.units.get(id)?.name ?? "su unidad";
  }, [scope, lk.units]);

  return {
    ...week,
    user,
    available,
    unassigned,
    reasons,
    multiLane: user.role !== "supervisor",
    scopeLabel,
    orderById: orderById as Map<string, Order>,
  };
}

export type AgendaData = ReturnType<typeof useAgendaData>;
