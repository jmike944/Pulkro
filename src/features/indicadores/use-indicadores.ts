"use client";

import { useMemo } from "react";
import { useAppStore, useScopedData } from "@/lib/hooks";
import { computeIndicators } from "./compute";
import type { PeriodWindow } from "./period";

/**
 * Indicators for the selected period, scoped to what the current role may see (doc §2):
 * supervisor → own orders · administración → own unit · dirección → all or the selected unit.
 */
export function useIndicadores(win: PeriodWindow, now: Date) {
  const scoped = useScopedData();
  const users = useAppStore((s) => s.users);
  const units = useAppStore((s) => s.units);
  const serviceTypes = useAppStore((s) => s.serviceTypes);
  const { user, unitFilter } = scoped;

  const scope = useMemo(() => {
    const visibleUnits =
      user.role === "direccion" ? (unitFilter === "all" ? units : units.filter((u) => u.id === unitFilter)) : units.filter((u) => u.id === user.unitId);
    const supervisors = users.filter(
      (u) => u.role === "supervisor" && u.active && (user.role === "supervisor" ? u.id === user.id : visibleUnits.some((v) => v.id === u.unitId)),
    );
    const label =
      user.role === "supervisor"
        ? "Mis asignaciones"
        : user.role === "direccion" && unitFilter === "all"
          ? "Todas las unidades"
          : (visibleUnits[0]?.name ?? "Mi unidad");
    return { visibleUnits, supervisors, label };
  }, [user, unitFilter, units, users]);

  const data = useMemo(
    () =>
      computeIndicators(
        {
          orders: scoped.orders,
          jornadas: scoped.jornadas,
          photos: scoped.photos,
          incidents: scoped.incidents,
          reports: scoped.reports,
          cases: scoped.cases,
          surveys: scoped.surveys,
          supervisors: scope.supervisors,
          serviceTypes,
        },
        win,
        now,
      ),
    [scoped, scope.supervisors, serviceTypes, win, now],
  );

  /** Earliest scheduled work in scope — the first selectable period. */
  const earliest = useMemo(() => {
    let min = Infinity;
    scoped.orders.forEach((o) => {
      const t = Date.parse(o.scheduledStart);
      if (t < min) min = t;
    });
    return Number.isFinite(min) ? new Date(min) : new Date(now.getFullYear(), 0, 1);
  }, [scoped.orders, now]);

  return { data, scope, scoped, user, unitFilter, units, earliest };
}
