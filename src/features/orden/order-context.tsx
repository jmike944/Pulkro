"use client";

import { createContext, use, useMemo } from "react";
import { useAppStore, useCurrentUser, useLookups, useNow, useOrderBundle, type OrderBundle } from "@/lib/hooks";
import { can, canSeeOrder } from "@/lib/permissions";
import { activeJornada, closureBlockers, jornadaMinutes, nextAction, orderEvidence, plannedMinutes, type Blocker, type NextAction, type OrderEvidence } from "@/lib/domain";
import { DONE_STATUSES, OPEN_STATUSES } from "@/lib/status";
import type { Incident, Jornada, OrderStatus, User } from "@/lib/types";

export type Lookups = ReturnType<typeof useLookups>;

/** Who may do what (doc §2), with the sentence shown in tooltips when they can't. */
export const DENY = {
  edit: "Dirección solo consulta. Edita Administración (todo) o el supervisor (datos operativos).",
  reschedule: "Solo el supervisor o Administración reprograman jornadas.",
  cancel: "Solo Administración puede cancelar órdenes.",
  reopen: "Solo el supervisor o Administración reabren una orden cerrada.",
  crew: "Solo el supervisor asigna la cuadrilla.",
  capture: "Solo el supervisor captura en campo.",
  closure: "Solo el supervisor autoriza el cierre",
  photos: "Solo el supervisor selecciona las fotos del reporte.",
} as const;

export type Gate = { ok: boolean; reason?: string };

const gate = (perm: boolean, permReason: string, state: boolean, stateReason: string): Gate =>
  !perm ? { ok: false, reason: permReason } : !state ? { ok: false, reason: stateReason } : { ok: true };

/** Statuses where the closure dialog makes sense (blockers explain the rest). */
export const CLOSABLE: OrderStatus[] = ["pendiente_validacion", "reabierta", "con_incidencia"];
export const REOPENABLE: OrderStatus[] = ["finalizada", "reporte_enviado", "seguimiento"];
const RESCHEDULABLE: OrderStatus[] = ["borrador", "programada", "en_ejecucion", "jornada_cerrada", "reprogramada", "con_incidencia"];

export type MissingEvidence = { jornada: Jornada; kind: "antes" | "despues" };

export type OrderDetail = OrderBundle & {
  now: Date;
  lk: Lookups;
  user: User;
  evidence: OrderEvidence;
  blockers: Blocker[];
  action: NextAction;
  active?: Jornada;
  live?: Jornada;
  realMinutes: number;
  plannedMinutes: number;
  openIncidents: Incident[];
  pendingIds: Set<string>;
  missing: MissingEvidence[];
  pendingJornadas: Jornada[];
  isDone: boolean;
  isTerminal: boolean;
  perms: {
    edit: boolean;
    editOperational: boolean;
    crew: boolean;
    capture: boolean;
    closure: boolean;
    share: boolean;
  };
  gates: {
    edit: Gate;
    reschedule: Gate;
    cancel: Gate;
    reopen: Gate;
    crew: Gate;
    addJornada: Gate;
    closure: Gate;
    capture: Gate;
    resolve: Gate;
    photos: Gate;
  };
};

export type OrderUi = {
  setTab: (tab: OrderTab, opts?: { scroll?: boolean }) => void;
  openClosure: () => void;
  openCrew: (jornadaId?: string) => void;
  openIncident: (jornadaId?: string) => void;
  openSchedule: (mode: "reprogramar" | "agregar") => void;
  openEdit: () => void;
  openCancel: () => void;
  openReopen: () => void;
  openPhoto: (photoId: string) => void;
  confirmDates: () => void;
};

export const ORDER_TABS = ["resumen", "jornadas", "evidencia", "incidencias", "actividad"] as const;
export type OrderTab = (typeof ORDER_TABS)[number];

/** Everything the order screen needs, derived once per render. `null` = not found or out of scope. */
export function useOrderDetailData(folio: string): OrderDetail | null {
  const bundle = useOrderBundle(folio);
  const user = useCurrentUser();
  const unitFilter = useAppStore((s) => s.session.unitFilter);
  const lk = useLookups();
  const now = useNow(30_000);

  return useMemo(() => {
    if (!bundle || !bundle.client || !bundle.site) return null;
    const { order, jornadas, photos, incidents, reports, surveys, cases, pendingSync } = bundle;
    if (!canSeeOrder(user, order, unitFilter)) return null;

    const evidence = orderEvidence(order, jornadas, photos);
    const blockers = closureBlockers(order, jornadas, photos, incidents, pendingSync.length);
    const action = nextAction(order, { jornadas, photos, incidents, reports, surveys, cases }, now);
    const missing: MissingEvidence[] = evidence.perJornada
      .filter((x) => x.jornada.checkIn)
      .flatMap((x) => [
        ...(x.antes ? [] : [{ jornada: x.jornada, kind: "antes" as const }]),
        ...(x.despues ? [] : [{ jornada: x.jornada, kind: "despues" as const }]),
      ]);
    const pendingJornadas = jornadas.filter((j) => j.status === "pendiente");
    const status = order.status;
    const isDone = DONE_STATUSES.includes(status);
    const isTerminal = isDone || status === "cancelada";

    const role = user.role;
    const perms = {
      edit: can(role, "order.edit"),
      editOperational: can(role, "order.editOperational"),
      crew: can(role, "crew.assign"),
      capture: can(role, "field.capture"),
      closure: can(role, "closure.authorize"),
      share: can(role, "report.share"),
    };

    const doneReason = status === "cancelada" ? "La orden está cancelada." : "Orden cerrada: reábrala para hacer cambios (se generará una nueva versión del reporte).";
    const closureReason = isDone
      ? "El cierre ya fue validado."
      : status === "cancelada"
        ? "La orden está cancelada."
        : "Registre la salida de todas las jornadas antes de validar el cierre.";

    const gates = {
      edit: gate(perms.edit || perms.editOperational, DENY.edit, !isTerminal, doneReason),
      reschedule: gate(
        perms.crew || perms.edit,
        DENY.reschedule,
        RESCHEDULABLE.includes(status) && (pendingJornadas.length > 0 || status === "borrador"),
        isTerminal ? doneReason : "No hay jornadas pendientes por reprogramar.",
      ),
      cancel: gate(perms.edit, DENY.cancel, OPEN_STATUSES.includes(status), isTerminal ? doneReason : "Solo se cancelan órdenes abiertas."),
      reopen: gate(perms.closure || perms.edit, DENY.reopen, REOPENABLE.includes(status), "Solo se reabren órdenes finalizadas o con reporte enviado."),
      crew: gate(perms.crew, DENY.crew, !isTerminal && (jornadas.length === 0 || jornadas.some((j) => j.status !== "cerrada")), isTerminal ? doneReason : "Todas las jornadas ya están cerradas."),
      addJornada: gate(perms.crew, DENY.crew, !isTerminal, doneReason),
      closure: gate(perms.closure, DENY.closure, CLOSABLE.includes(status), closureReason),
      capture: gate(perms.capture, DENY.capture, !isTerminal, doneReason),
      resolve: gate(perms.capture, DENY.capture, status !== "cancelada" && status !== "archivada", "La orden ya no admite cambios."),
      photos: gate(perms.capture, DENY.photos, status !== "cancelada" && status !== "archivada", "La orden ya no admite cambios."),
    };

    return {
      ...bundle,
      now,
      lk,
      user,
      evidence,
      blockers,
      action,
      active: activeJornada(order.id, jornadas, now),
      live: jornadas.find((j) => j.status === "en_curso"),
      realMinutes: jornadas.reduce((s, j) => s + jornadaMinutes(j, now), 0),
      plannedMinutes: plannedMinutes(order.id, jornadas),
      openIncidents: incidents.filter((i) => i.status === "abierta"),
      pendingIds: new Set(pendingSync.map((q) => q.entityId)),
      missing,
      pendingJornadas,
      isDone,
      isTerminal,
      perms,
      gates,
    };
  }, [bundle, user, unitFilter, lk, now]);
}

type Ctx = { d: OrderDetail; ui: OrderUi };
const OrderContext = createContext<Ctx | null>(null);

export function OrderProvider({ value, children }: { value: Ctx; children: React.ReactNode }) {
  return <OrderContext value={value}>{children}</OrderContext>;
}

export function useOrder() {
  const ctx = use(OrderContext);
  if (!ctx) throw new Error("useOrder must be used inside <OrderProvider>");
  return ctx;
}
