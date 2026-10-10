/**
 * Incident register helpers (doc §4.2 · §5 "Número y tipo de incidencias" · §8). Pure functions.
 */
import { differenceInMinutes, parseISO, subDays } from "date-fns";
import type { Client, Incident, Order, Photo, Severity } from "@/lib/types";

export const SEV_RANK: Record<Severity, number> = { alta: 0, media: 1, baja: 2 };

export type IncidentRow = {
  inc: Incident;
  order?: Order;
  client?: Client;
  photos: Photo[];
};

export function incidentStats(incidents: Incident[], now: Date) {
  const open = incidents.filter((i) => i.status === "abierta");
  const blocking = open.filter((i) => i.blocksClosure);
  const d30 = subDays(now, 30).toISOString();
  const d90 = subDays(now, 90).toISOString();
  const resolved30 = incidents.filter((i) => i.resolvedAt && i.resolvedAt >= d30);
  const created30 = incidents.filter((i) => i.createdAt >= d30);
  const recentResolved = incidents.filter((i) => i.resolvedAt && i.resolvedAt >= d90);
  const minutes = recentResolved.map((i) => Math.max(0, differenceInMinutes(parseISO(i.resolvedAt!), parseISO(i.createdAt))));
  return {
    open: open.length,
    highOpen: open.filter((i) => i.severity === "alta").length,
    blocking: blocking.length,
    blockingOrders: new Set(blocking.map((i) => i.orderId)).size,
    resolved30: resolved30.length,
    created30: created30.length,
    avgResolutionMinutes: minutes.length ? minutes.reduce((a, b) => a + b, 0) / minutes.length : 0,
    resolutionSamples: minutes.length,
  };
}

/** Open: blocking first, then severity, then newest. Resolved: most recently resolved. All: newest. */
export function sortRows(rows: IncidentRow[], tab: "abiertas" | "resueltas" | "todas") {
  const copy = [...rows];
  if (tab === "abiertas")
    return copy.sort(
      (a, b) =>
        Number(b.inc.blocksClosure) - Number(a.inc.blocksClosure) ||
        SEV_RANK[a.inc.severity] - SEV_RANK[b.inc.severity] ||
        b.inc.createdAt.localeCompare(a.inc.createdAt),
    );
  if (tab === "resueltas") return copy.sort((a, b) => (b.inc.resolvedAt ?? "").localeCompare(a.inc.resolvedAt ?? ""));
  return copy.sort((a, b) => Number(b.inc.status === "abierta") - Number(a.inc.status === "abierta") || b.inc.createdAt.localeCompare(a.inc.createdAt));
}

export const RESOLUTION_SUGGESTIONS = [
  "Se resolvió en sitio y se informó al contacto.",
  "Se repuso el material faltante.",
  "Se acordó con el cliente atenderlo en la misma jornada.",
  "Documentado; sin impacto en el alcance.",
];
