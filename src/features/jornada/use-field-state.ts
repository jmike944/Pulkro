"use client";

import { useMemo } from "react";
import { closureBlockers, orderEvidence } from "@/lib/domain";
import { useAppStore, useCurrentUser, useIsOffline, useJornadaBundle, useLookups } from "@/lib/hooks";
import { can, canSeeOrder } from "@/lib/permissions";
import { DONE_STATUSES, ROLE_LABEL } from "@/lib/status";
import type { Incident, Jornada, OrderStatus, Photo, Worker } from "@/lib/types";

export type FieldBundle = NonNullable<ReturnType<typeof useJornadaBundle>>;

export type StepId = "entrada" | "antes" | "ejecucion" | "salida" | "despues";

export type FieldStep = {
  id: StepId;
  label: string;
  sub: string;
  done: boolean;
  alert?: boolean;
};

export type FieldWarning = { tone: "amber" | "info"; text: string };

const byTaken = (a: Photo, b: Photo) => a.takenAt.localeCompare(b.takenAt);

/** Why field capture is closed for an order in this status (null = open). */
function orderLockReason(status: OrderStatus): string | null {
  if (status === "cancelada") return "La orden fue cancelada; ya no admite captura en campo.";
  if (DONE_STATUSES.includes(status))
    return "El cierre ya fue validado. Los cambios se hacen desde la orden y generan una nueva versión del reporte.";
  return null;
}

export type FieldReady = ReturnType<typeof buildState>;

function buildState(b: FieldBundle, role: ReturnType<typeof useCurrentUser>["role"], workers: Map<string, Worker>, offline: boolean) {
  const { jornada, order, jornadas, photos, incidents, pendingSync } = b;
  const mine = photos.filter((p) => p.jornadaId === jornada.id);
  const antes = mine.filter((p) => p.kind === "antes").sort(byTaken);
  const despues = mine.filter((p) => p.kind === "despues").sort(byTaken);
  const jIncidents: Incident[] = incidents
    .filter((i) => i.jornadaId === jornada.id)
    .sort((x, y) => (x.status === y.status ? y.createdAt.localeCompare(x.createdAt) : x.status === "abierta" ? -1 : 1));
  const openIncidents = jIncidents.filter((i) => i.status === "abierta");
  const pendingIds = new Set(pendingSync.map((q) => q.entityId));
  const crew = jornada.workerIds.map((id) => workers.get(id)).filter((w): w is Worker => !!w);

  const index = Math.max(1, jornadas.findIndex((j) => j.id === jornada.id) + 1);
  const total = Math.max(jornadas.length, 1);
  const nextJornada: Jornada | undefined = jornadas.find((j) => j.dayIndex > jornada.dayIndex && j.status === "pendiente");
  const otherLive = jornadas.find((j) => j.id !== jornada.id && j.status === "en_curso");
  const earlierPending = jornadas.find((j) => j.dayIndex < jornada.dayIndex && j.status === "pendiente");

  const permissions = {
    capture: can(role, "field.capture"),
    crew: can(role, "crew.assign"),
    close: can(role, "closure.authorize"),
    select: can(role, "report.share"),
  };
  const roleLabel = ROLE_LABEL[role];
  const locked = orderLockReason(order.status);

  /** Reason the photo composer is unavailable (null = capture allowed). */
  const photoBlock = !permissions.capture
    ? `Solo el supervisor captura fotos · ${roleLabel} tiene acceso de consulta.`
    : locked
      ? locked
      : !jornada.checkIn
        ? "Registra la entrada para habilitar las fotos de esta jornada."
        : null;
  /** Reason incidents / notes are unavailable. */
  const recordBlock = !permissions.capture ? `Solo el supervisor registra incidencias y notas · ${roleLabel} tiene acceso de consulta.` : locked;
  const crewBlock = !permissions.crew
    ? `Solo el supervisor asigna la cuadrilla · ${roleLabel} tiene acceso de consulta.`
    : locked
      ? locked
      : jornada.status === "cerrada"
        ? "La jornada ya cerró: su cuadrilla queda como se registró en el historial."
        : null;
  const checkInBlock = !permissions.capture
    ? `Solo el supervisor registra la entrada · ${roleLabel} tiene acceso de consulta.`
    : locked
      ? locked
      : otherLive
        ? `Primero registra la salida de la Jornada ${otherLive.dayIndex}: no puede haber dos jornadas abiertas.`
        : null;
  const breakdownBlock = !permissions.capture
    ? `Solo el supervisor registra el desglose de horas · ${roleLabel} tiene acceso de consulta.`
    : locked
      ? locked
      : !jornada.checkOut
        ? "El desglose se registra después de la salida."
        : order.activities.length === 0
          ? "La orden no tiene actividades para desglosar."
          : null;
  const checkOutBlock = !permissions.capture
    ? `Solo el supervisor registra la salida · ${roleLabel} tiene acceso de consulta.`
    : !jornada.checkIn
      ? "No hay registro de entrada: la salida debe ir después de la entrada."
      : locked;

  const steps: FieldStep[] = [
    { id: "entrada", label: "Entrada", sub: "Hora y GPS", done: !!jornada.checkIn },
    { id: "antes", label: "Fotos ANTES", sub: antes.length ? `${antes.length} foto${antes.length === 1 ? "" : "s"}` : "Obligatorias", done: antes.length > 0 },
    {
      id: "ejecucion",
      label: "Ejecución",
      sub: openIncidents.length ? `${openIncidents.length} incidencia${openIncidents.length === 1 ? "" : "s"}` : "e incidencias",
      done: !!jornada.checkOut,
      alert: openIncidents.length > 0,
    },
    { id: "salida", label: "Salida", sub: "Hora y GPS", done: !!jornada.checkOut },
    { id: "despues", label: "Fotos DESPUÉS", sub: despues.length ? `${despues.length} foto${despues.length === 1 ? "" : "s"}` : "Obligatorias", done: despues.length > 0 },
  ];
  const currentStep = steps.findIndex((s) => !s.done);

  const evidence = orderEvidence(order, jornadas, photos);
  const blockers = closureBlockers(order, jornadas, photos, incidents, pendingSync.filter((q) => q.state !== "sincronizando").length);

  return {
    ...b,
    offline,
    role,
    roleLabel,
    antes,
    despues,
    jIncidents,
    openIncidents,
    pendingIds,
    crew,
    index,
    total,
    nextJornada,
    otherLive,
    earlierPending,
    permissions,
    locked,
    photoBlock,
    recordBlock,
    crewBlock,
    checkInBlock,
    checkOutBlock,
    breakdownBlock,
    steps,
    currentStep: currentStep === -1 ? steps.length : currentStep,
    evidence,
    blockers,
    /** GPS to stamp on photos: DESPUÉS photos usually come after the exit stamp. */
    photoGeo: (kind: "antes" | "despues") => {
      const g = kind === "despues" ? (jornada.checkOut ?? jornada.checkIn) : jornada.checkIn;
      return g ? { lat: g.lat, lng: g.lng } : {};
    },
  };
}

/** `missing` = not found OR outside the role's scope (doc §2): the screen never tells the two apart. */
export type FieldResult = { status: "missing" } | { status: "ok"; f: FieldReady };

/** Everything the field screen needs for one jornada, scoped to what the current role may see. */
export function useFieldState(jornadaId: string): FieldResult {
  const bundle = useJornadaBundle(jornadaId);
  const user = useCurrentUser();
  const unitFilter = useAppStore((s) => s.session.unitFilter);
  const { workers } = useLookups();
  const offline = useIsOffline();

  return useMemo<FieldResult>(() => {
    // useJornadaBundle is already scoped; the check stays as a second guard, with the same answer as "not found".
    if (!bundle || !canSeeOrder(user, bundle.order, unitFilter)) return { status: "missing" };
    return { status: "ok", f: buildState(bundle, user.role, workers, offline) };
  }, [bundle, user, unitFilter, workers, offline]);
}
