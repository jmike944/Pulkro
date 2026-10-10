"use client";

import { useMemo } from "react";
import { useScopedData } from "@/lib/hooks";
import { OPEN_STATUSES } from "@/lib/status";
import { orderEvidence } from "@/lib/domain";
import { usePendingItems } from "@/features/pendientes/use-pending-items";
import { navFor, type NavBadgeKey } from "./nav";

/** Counts for the nav badges, from scoped data only; sections the role can't open always count 0. */
export function useNavBadges(): Record<NavBadgeKey, number> {
  const { user, orders, jornadas, photos, incidents, cases } = useScopedData();
  const { actionable } = usePendingItems();
  return useMemo(() => {
    const visible = new Set(navFor(user.role).all.flatMap((n) => (n.badge ? [n.badge] : [])));
    const evidencias = orders.filter((o) => {
      if (!["pendiente_validacion", "en_ejecucion", "jornada_cerrada", "reabierta"].includes(o.status)) return false;
      const ev = orderEvidence(o, jornadas, photos);
      return ev.perJornada.some((x) => x.jornada.status === "cerrada" && (!x.antes || !x.despues));
    }).length;
    const counts: Record<NavBadgeKey, number> = {
      ordenes: orders.filter((o) => OPEN_STATUSES.includes(o.status)).length,
      evidencias,
      incidencias: incidents.filter((i) => i.status === "abierta").length,
      postventa: cases.filter((c) => c.status === "abierto" || c.status === "en_proceso").length,
      pendientes: actionable,
    };
    for (const k of Object.keys(counts) as NavBadgeKey[]) if (!visible.has(k)) counts[k] = 0;
    return counts;
  }, [user.role, orders, jornadas, photos, incidents, cases, actionable]);
}
