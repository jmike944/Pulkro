"use client";

import { useMemo } from "react";
import { isSameDay, parseISO } from "date-fns";
import { useCurrentUser, useLookups, useNow, useScopedData } from "@/lib/hooks";
import { can } from "@/lib/permissions";
import { closureBlockers, orderEvidence } from "@/lib/domain";
import { fmtTime } from "@/lib/format";
import type { Tone } from "@/lib/status";

export type PendingKind = "cierre" | "evidencia" | "entrada" | "incidencia" | "reporte" | "encuesta" | "caso" | "asignar";

export type PendingItem = {
  id: string;
  kind: PendingKind;
  title: string;
  sub: string;
  href: string;
  tone: Tone;
  /** the current role can complete it (otherwise it's a follow-up / consulta) */
  actionable: boolean;
  /** lower = more urgent */
  rank: number;
  at: string;
  orderId?: string;
};

export const PENDING_GROUPS: { kind: PendingKind; label: string }[] = [
  { kind: "incidencia", label: "Incidencias abiertas" },
  { kind: "cierre", label: "Listas para cierre" },
  { kind: "evidencia", label: "Evidencia faltante" },
  { kind: "entrada", label: "Entradas de hoy" },
  { kind: "reporte", label: "Reportes por compartir" },
  { kind: "asignar", label: "Por asignar" },
  { kind: "caso", label: "Casos postventa" },
  { kind: "encuesta", label: "Encuestas por enviar" },
];

/** Everything waiting on the current role, derived from scoped data (no automatic alerts — doc §1). */
export function usePendingItems() {
  const data = useScopedData();
  const user = useCurrentUser();
  const lk = useLookups();
  const now = useNow(60_000);

  return useMemo(() => {
    const { orders, jornadas, photos, incidents, reports, surveys, cases } = data;
    const items: PendingItem[] = [];
    const client = (id: string) => lk.clients.get(id)?.shortName ?? "";
    const role = user.role;

    for (const o of orders) {
      const c = client(o.clientId);
      if (o.status === "pendiente_validacion" || o.status === "reabierta") {
        const blockers = closureBlockers(o, jornadas, photos, incidents).filter((b) => b.severity === "block");
        if (!blockers.length)
          items.push({ id: `cierre-${o.id}`, kind: "cierre", title: o.title, sub: `${o.folio} · ${c} · evidencia completa`, href: `/ordenes/${o.folio}?cerrar=1`, tone: "blue", actionable: can(role, "closure.authorize"), rank: 1, at: o.updatedAt, orderId: o.id });
      }
      if (["en_ejecucion", "jornada_cerrada", "pendiente_validacion", "reabierta", "con_incidencia"].includes(o.status)) {
        const ev = orderEvidence(o, jornadas, photos);
        ev.perJornada
          .filter((x) => x.jornada.status === "cerrada" && (!x.antes || !x.despues))
          .forEach((x) =>
            items.push({
              id: `ev-${x.jornada.id}`, kind: "evidencia",
              title: `Falta foto ${!x.despues ? "DESPUÉS" : "ANTES"} · Jornada ${x.jornada.dayIndex}`,
              sub: `${o.folio} · ${c}`, href: `/jornada/${x.jornada.id}`, tone: "amber",
              actionable: can(role, "field.capture"), rank: 2, at: x.jornada.checkOut?.deviceAt ?? o.updatedAt, orderId: o.id,
            }),
          );
      }
      if (o.status === "finalizada") {
        const rep = reports.find((r) => r.orderId === o.id);
        items.push({ id: `rep-${o.id}`, kind: "reporte", title: rep ? "Compartir reporte final" : "Generar reporte final", sub: `${o.folio} · ${c}`, href: `/ordenes/${o.folio}/reporte`, tone: "blue", actionable: can(role, "report.share"), rank: 4, at: o.closure?.validatedAt ?? o.updatedAt, orderId: o.id });
      }
      if (o.status === "reporte_enviado" && !surveys.some((s) => s.orderId === o.id)) {
        items.push({ id: `enc-${o.id}`, kind: "encuesta", title: "Enviar encuesta de satisfacción", sub: `${o.folio} · ${c}`, href: `/postventa?orden=${o.folio}`, tone: "teal", actionable: can(role, "postventa.manage"), rank: 7, at: o.updatedAt, orderId: o.id });
      }
      if (o.status === "borrador" || o.status === "reprogramada") {
        items.push({ id: `asg-${o.id}`, kind: "asignar", title: o.status === "borrador" ? "Asignar cuadrilla y fechas" : "Confirmar nuevas fechas", sub: `${o.folio} · ${c}`, href: `/ordenes/${o.folio}?tab=jornadas`, tone: "slate", actionable: can(role, "crew.assign"), rank: 5, at: o.createdAt, orderId: o.id });
      }
    }

    jornadas
      .filter((j) => j.status === "pendiente" && isSameDay(parseISO(j.plannedStart), now))
      .forEach((j) => {
        const o = orders.find((x) => x.id === j.orderId);
        if (!o || o.status === "cancelada") return;
        items.push({ id: `in-${j.id}`, kind: "entrada", title: `Registrar entrada ${fmtTime(j.plannedStart)}`, sub: `${o.folio} · ${client(o.clientId)} · ${lk.sites.get(o.siteId)?.name ?? ""}`, href: `/jornada/${j.id}`, tone: "blue", actionable: can(role, "field.capture"), rank: 3, at: j.plannedStart, orderId: o.id });
      });

    incidents
      .filter((i) => i.status === "abierta")
      .forEach((i) => {
        const o = orders.find((x) => x.id === i.orderId);
        items.push({ id: `inc-${i.id}`, kind: "incidencia", title: i.description, sub: `${i.folio} · ${o?.folio ?? ""}${i.blocksClosure ? " · impide el cierre" : ""}`, href: `/incidencias?i=${i.id}`, tone: "red", actionable: can(role, "field.capture"), rank: i.blocksClosure ? 0 : 6, at: i.createdAt, orderId: i.orderId });
      });

    cases
      .filter((c) => (c.status === "abierto" || c.status === "en_proceso") && (role !== "supervisor" || c.ownerId === user.id))
      .forEach((c) =>
        items.push({ id: `cas-${c.id}`, kind: "caso", title: c.description, sub: `${c.folio} · ${client(c.clientId)}`, href: `/postventa/${c.folio}`, tone: "violet", actionable: can(role, "postventa.manage"), rank: 6, at: c.dueDate, orderId: c.orderId }),
      );

    items.sort((a, b) => a.rank - b.rank || a.at.localeCompare(b.at));
    return { items, actionable: items.filter((i) => i.actionable).length };
  }, [data, user, lk, now]);
}
