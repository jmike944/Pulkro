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
  /** "OS-24389 · Hilton · evidencia completa" — compact line used by the phone Today screen */
  sub: string;
  href: string;
  tone: Tone;
  /** the current role can complete it (otherwise it's a follow-up / consulta) */
  actionable: boolean;
  /** lower = more urgent */
  rank: number;
  /** when it started waiting (age is measured from here); for an entrada, the planned start */
  at: string;
  orderId?: string;
  /** folio the person will recognise in the target screen: the order's, or PV-… for a postventa case */
  folio: string;
  clientId?: string;
  client: string;
  site?: string;
  /** deadline: due date of a postventa case, planned start of an entrada */
  due?: string;
  /** stops the order from being closed (incident that blocks, missing ANTES/DESPUÉS photo) */
  blocksClosure: boolean;
  /** who has to act — a person ("Daniela O.") or an area ("Administración") */
  actor: string;
  /** user id of that person (absent when it is an area) */
  actorId?: string;
  /** action naming what happens on tap ("Validar cierre") and its short form for table rows ("Validar") */
  cta: string;
  ctaShort: string;
};

export type PendingGroupMeta = { kind: PendingKind; label: string; tone: Tone; hint: string };

/** Display order of the categories; `tone` is unique per category so charts can tell them apart. */
export const PENDING_GROUPS: PendingGroupMeta[] = [
  { kind: "incidencia", label: "Incidencias abiertas", tone: "red", hint: "Registrar la solución. Las que impiden el cierre van primero." },
  { kind: "cierre", label: "Listas para cierre", tone: "blue", hint: "Evidencia completa: validar el cierre para generar el reporte." },
  { kind: "evidencia", label: "Evidencia faltante", tone: "amber", hint: "Falta foto ANTES o DESPUÉS; sin ella no se puede validar el cierre." },
  { kind: "entrada", label: "Entradas de hoy", tone: "sky", hint: "Cuadrillas que inician hoy: registrar la entrada con GPS al llegar." },
  { kind: "reporte", label: "Reportes por compartir", tone: "navy", hint: "Cierre validado: generar y compartir el reporte con el cliente." },
  { kind: "asignar", label: "Por asignar", tone: "slate", hint: "Órdenes sin cuadrilla o con fechas por confirmar." },
  { kind: "caso", label: "Casos postventa", tone: "violet", hint: "Quejas y seguimientos abiertos, por fecha de compromiso." },
  { kind: "encuesta", label: "Encuestas por enviar", tone: "teal", hint: "Reporte enviado: pedir al cliente que califique el servicio." },
];

/** "Daniela Ortiz Peña" → "Daniela O." */
const shortPerson = (name?: string) => {
  if (!name) return undefined;
  const [first, last] = name.split(" ");
  return last ? `${first} ${last[0]}.` : first;
};

/** Everything waiting on the current role, derived from scoped data (no automatic alerts — doc §1). */
export function usePendingItems() {
  const data = useScopedData();
  const user = useCurrentUser();
  const lk = useLookups();
  const now = useNow(60_000);

  return useMemo(() => {
    const { orders, jornadas, photos, incidents, reports, surveys, cases } = data;
    const items: PendingItem[] = [];
    const role = user.role;
    const orderById = new Map(orders.map((o) => [o.id, o] as const));
    const client = (id: string) => lk.clients.get(id)?.shortName ?? "";
    const supervisorOf = (orderId?: string) => shortPerson(lk.users.get(orderById.get(orderId ?? "")?.supervisorId ?? "")?.name) ?? "Supervisor";

    /** fields every item shares, resolved from its order */
    const ctx = (orderId: string | undefined) => {
      const o = orderId ? orderById.get(orderId) : undefined;
      return {
        orderId,
        folio: o?.folio ?? "",
        clientId: o?.clientId,
        client: o ? client(o.clientId) : "",
        site: o ? lk.sites.get(o.siteId)?.name : undefined,
        actor: supervisorOf(orderId),
        actorId: o?.supervisorId,
      };
    };

    for (const o of orders) {
      const c = client(o.clientId);
      if (o.status === "pendiente_validacion" || o.status === "reabierta") {
        const blockers = closureBlockers(o, jornadas, photos, incidents).filter((b) => b.severity === "block");
        if (!blockers.length)
          items.push({
            id: `cierre-${o.id}`, kind: "cierre", title: o.title, sub: `${o.folio} · ${c} · evidencia completa`, href: `/ordenes/${o.folio}?cerrar=1`,
            tone: "blue", actionable: can(role, "closure.authorize"), rank: 1, at: o.updatedAt, ...ctx(o.id), blocksClosure: false,
            cta: "Validar cierre", ctaShort: "Validar",
          });
      }
      if (["en_ejecucion", "jornada_cerrada", "pendiente_validacion", "reabierta", "con_incidencia"].includes(o.status)) {
        const ev = orderEvidence(o, jornadas, photos);
        ev.perJornada
          .filter((x) => x.jornada.status === "cerrada" && (!x.antes || !x.despues))
          .forEach((x) =>
            items.push({
              id: `ev-${x.jornada.id}`, kind: "evidencia",
              title: `Falta foto ${!x.despues ? "DESPUÉS" : "ANTES"} · Jornada\u00a0${x.jornada.dayIndex}`,
              sub: `${o.folio} · ${c}`, href: `/jornada/${x.jornada.id}`, tone: "amber",
              actionable: can(role, "field.capture"), rank: 2, at: x.jornada.checkOut?.deviceAt ?? o.updatedAt, ...ctx(o.id), blocksClosure: true,
              cta: `Tomar foto ${!x.despues ? "DESPUÉS" : "ANTES"}`, ctaShort: "Tomar foto",
            }),
          );
      }
      if (o.status === "finalizada") {
        const rep = reports.find((r) => r.orderId === o.id);
        items.push({
          id: `rep-${o.id}`, kind: "reporte", title: rep ? "Compartir reporte final" : "Generar reporte final", sub: `${o.folio} · ${c}`,
          href: `/ordenes/${o.folio}/reporte`, tone: "navy", actionable: can(role, "report.share"), rank: 4, at: o.closure?.validatedAt ?? o.updatedAt,
          ...ctx(o.id), blocksClosure: false, cta: rep ? "Compartir reporte" : "Generar reporte", ctaShort: rep ? "Compartir" : "Generar",
        });
      }
      if (o.status === "reporte_enviado" && !surveys.some((s) => s.orderId === o.id)) {
        items.push({
          id: `enc-${o.id}`, kind: "encuesta", title: "Enviar encuesta de satisfacción", sub: `${o.folio} · ${c}`, href: `/postventa?orden=${o.folio}`,
          tone: "teal", actionable: can(role, "postventa.manage"), rank: 7, at: o.updatedAt, ...ctx(o.id), actor: "Administración", actorId: undefined, blocksClosure: false,
          cta: "Enviar encuesta", ctaShort: "Enviar",
        });
      }
      if (o.status === "borrador" || o.status === "reprogramada") {
        items.push({
          id: `asg-${o.id}`, kind: "asignar", title: o.status === "borrador" ? "Asignar cuadrilla y fechas" : "Confirmar nuevas fechas", sub: `${o.folio} · ${c}`,
          href: `/ordenes/${o.folio}?tab=jornadas`, tone: "slate", actionable: can(role, "crew.assign"), rank: 5, at: o.createdAt, ...ctx(o.id), blocksClosure: false,
          cta: o.status === "borrador" ? "Asignar cuadrilla" : "Confirmar fechas", ctaShort: o.status === "borrador" ? "Asignar" : "Confirmar",
        });
      }
    }

    jornadas
      .filter((j) => j.status === "pendiente" && isSameDay(parseISO(j.plannedStart), now))
      .forEach((j) => {
        const o = orderById.get(j.orderId);
        if (!o || o.status === "cancelada") return;
        items.push({
          id: `in-${j.id}`, kind: "entrada", title: `Registrar entrada ${fmtTime(j.plannedStart)}`, sub: `${o.folio} · ${client(o.clientId)} · ${lk.sites.get(o.siteId)?.name ?? ""}`,
          href: `/jornada/${j.id}`, tone: "sky", actionable: can(role, "field.capture"), rank: 3, at: j.plannedStart, due: j.plannedStart, ...ctx(o.id), blocksClosure: false,
          cta: "Registrar entrada", ctaShort: "Registrar",
        });
      });

    incidents
      .filter((i) => i.status === "abierta")
      .forEach((i) => {
        const o = orderById.get(i.orderId);
        items.push({
          id: `inc-${i.id}`, kind: "incidencia", title: i.description, sub: `${i.folio} · ${o?.folio ?? ""}${i.blocksClosure ? " · impide el cierre" : ""}`, href: `/incidencias?i=${i.id}`,
          tone: "red", actionable: can(role, "field.capture"), rank: i.blocksClosure ? 0 : 6, at: i.createdAt, ...ctx(i.orderId), blocksClosure: i.blocksClosure,
          cta: "Resolver incidencia", ctaShort: "Resolver",
        });
      });

    cases
      .filter((c) => (c.status === "abierto" || c.status === "en_proceso") && (role !== "supervisor" || c.ownerId === user.id))
      .forEach((c) =>
        items.push({
          id: `cas-${c.id}`, kind: "caso", title: c.description, sub: `${c.folio} · ${client(c.clientId)}`, href: `/postventa/${c.folio}`, tone: "violet",
          actionable: can(role, "postventa.manage"), rank: 6, at: c.createdAt, due: c.dueDate, ...ctx(c.orderId), folio: c.folio, clientId: c.clientId, client: client(c.clientId),
          actor: shortPerson(lk.users.get(c.ownerId)?.name) ?? "Administración", actorId: c.ownerId, blocksClosure: false, cta: "Atender caso", ctaShort: "Atender",
        }),
      );

    // most urgent first; inside a rank, the one that has waited (or is due) the longest
    items.sort((a, b) => a.rank - b.rank || (a.due ?? a.at).localeCompare(b.due ?? b.at));
    return { items, actionable: items.filter((i) => i.actionable).length };
  }, [data, user, lk, now]);
}
