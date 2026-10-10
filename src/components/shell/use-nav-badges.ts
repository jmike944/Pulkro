"use client";

import { useMemo } from "react";
import { useScopedData } from "@/lib/hooks";
import { OPEN_STATUSES } from "@/lib/status";
import { orderEvidence } from "@/lib/domain";
import { usePendingItems } from "@/features/pendientes/use-pending-items";

export function useNavBadges() {
  const { orders, jornadas, photos, incidents, cases } = useScopedData();
  const { actionable, items } = usePendingItems();
  return useMemo(() => {
    const evidencias = orders.filter((o) => {
      if (!["pendiente_validacion", "en_ejecucion", "jornada_cerrada", "reabierta"].includes(o.status)) return false;
      const ev = orderEvidence(o, jornadas, photos);
      return ev.perJornada.some((x) => x.jornada.status === "cerrada" && (!x.antes || !x.despues));
    }).length;
    return {
      ordenes: orders.filter((o) => OPEN_STATUSES.includes(o.status)).length,
      evidencias,
      incidencias: incidents.filter((i) => i.status === "abierta").length,
      postventa: cases.filter((c) => c.status === "abierto" || c.status === "en_proceso").length,
      pendientes: actionable,
      /** Everything a consulta role (Dirección, Administración) can follow even when none of it is actionable for them. */
      pendientesTotal: items.length,
    };
  }, [orders, jornadas, photos, incidents, cases, actionable, items.length]);
}
