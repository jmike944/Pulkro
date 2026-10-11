"use client";

import { useState } from "react";
import { useAppStore, useIsOffline } from "@/lib/hooks";
import { useUi } from "@/lib/ui-store";
import { fmtHours, plural } from "@/lib/format";
import type { Conformity } from "@/lib/types";
import type { OrderDetail } from "./order-context";

/**
 * "Validar cierre" model (doc §8), shared by the desktop dialog and the phone flow: the checklist built from
 * domain.closureBlockers(), the draft (conformity, signature, exception, description, declaration), what is still
 * missing at each stage, and the submit that calls store.validateClosure (which re-checks every rule itself).
 */

export type CheckState = "ok" | "block" | "warn" | "excepted";
export type CheckRow = { id: string; label: string; state: CheckState; detail?: string; links?: { label: string; href: string }[] };

/** Minimum length of the evidence-exception justification (same rule as store.validateClosure). */
export const EXCEPTION_MIN = 15;
const NAME_MIN = 3;
const SUMMARY_MIN = 10;

/** Builds the closure checklist from domain.closureBlockers() (doc §8). */
export function closureChecklist(d: OrderDetail, hasException: boolean): { rows: CheckRow[]; hardBlock: boolean; photosMissing: boolean } {
  const { blockers, jornadas, openIncidents, pendingSync, realMinutes } = d;
  const jornadaBlock = blockers.find((b) => b.id === "jornadas");
  const antes = blockers.filter((b) => b.id.startsWith("antes-"));
  const despues = blockers.filter((b) => b.id.startsWith("despues-"));
  const incBlock = blockers.filter((b) => openIncidents.some((i) => i.id === b.id) && b.severity === "block");
  const incWarn = blockers.filter((b) => openIncidents.some((i) => i.id === b.id) && b.severity === "warn");
  const sync = blockers.find((b) => b.id === "sync");
  const photosMissing = antes.length + despues.length > 0;
  const photoState = (n: number): CheckState => (n === 0 ? "ok" : hasException ? "excepted" : "block");
  const linksOf = (bs: typeof antes) =>
    bs.map((b) => ({ label: `Capturar en ${b.label.replace(/^Falta foto (ANTES|DESPUÉS) · /, "")}`, href: b.href ?? "#" }));
  const closed = jornadas.filter((j) => j.status === "cerrada").length;
  const missingIn = (n: number) => `Falta en ${plural(n, "jornada", "jornadas")}`;

  const rows: CheckRow[] = [
    {
      id: "jornadas",
      label: `Jornadas con salida registrada · ${closed}/${jornadas.length}`,
      state: jornadaBlock || jornadas.length === 0 ? "block" : "ok",
      detail: jornadaBlock
        ? `${plural(jornadas.length - closed, "jornada", "jornadas")} sin registro de salida`
        : jornadas.length === 0
          ? "No hay jornadas registradas"
          : `${fmtHours(realMinutes)} reales en sitio`,
    },
    {
      id: "antes",
      label: "Fotos ANTES en cada jornada",
      state: photoState(antes.length),
      detail: antes.length ? missingIn(antes.length) : undefined,
      links: linksOf(antes),
    },
    {
      id: "despues",
      label: "Fotos DESPUÉS en cada jornada",
      state: photoState(despues.length),
      detail: despues.length ? missingIn(despues.length) : undefined,
      links: linksOf(despues),
    },
    {
      id: "incidencias",
      label: "Sin incidencias que impidan el cierre",
      state: incBlock.length ? "block" : incWarn.length ? "warn" : "ok",
      detail: incBlock.length
        ? `${incBlock.map((b) => b.label.replace("Incidencia abierta ", "")).join(", ")} debe resolverse primero`
        : incWarn.length
          ? `${plural(incWarn.length, "abierta", "abiertas")} sin bloqueo: se incluirá en el reporte`
          : undefined,
      links: incBlock.map((b) => ({ label: `Resolver ${b.label.replace("Incidencia abierta ", "")}`, href: b.href ?? "#" })),
    },
    {
      id: "sync",
      label: "Registros sincronizados",
      state: sync ? "warn" : "ok",
      detail: sync ? `${plural(pendingSync.length, "registro", "registros")} sin sincronizar. ${sync.detail ?? ""}`.trim() : undefined,
    },
  ];
  return { rows, hardBlock: !!jornadaBlock || jornadas.length === 0 || incBlock.length > 0, photosMissing };
}

/** What the success screen shows once the store accepted the closure. */
export type ClosureDone = {
  at: string;
  offline: boolean;
  /** report version the next "Generar reporte" produces */
  nextVersion: number;
  method: Conformity["method"];
  name: string;
  role?: string;
  signature?: string;
  comment?: string;
};

export type ClosureDraft = ReturnType<typeof useClosureDraft>;

/** The closure form. Mount it once per opening (the dialog keys it by session) so every opening starts clean. */
export function useClosureDraft(d: OrderDetail) {
  const { order, serviceType, site, user, reports } = d;
  const offline = useIsOffline();
  const validateClosure = useAppStore((s) => s.validateClosure);

  const [initial] = useState(() => ({
    name: order.siteContact.name,
    role: "Contacto en sitio",
    summary:
      order.closure?.summary ??
      `Se realizó ${serviceType.name.toLowerCase()} en ${site.name} conforme a la orden ${order.folio}. ${order.activities.slice(0, 3).join(". ")}${order.activities.length ? "." : ""}`,
  }));
  const [method, setMethod] = useState<Conformity["method"]>("firma");
  const [name, setName] = useState(initial.name);
  const [role, setRole] = useState(initial.role);
  const [signature, setSignature] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [summary, setSummary] = useState(initial.summary);
  const [exception, setException] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  const exceptionOk = exception.trim().length >= EXCEPTION_MIN;
  const { rows, hardBlock, photosMissing } = closureChecklist(d, exceptionOk);
  const nameOk = name.trim().length >= NAME_MIN;
  const conformityOk = nameOk && (method !== "firma" || !!signature);
  const summaryOk = summary.trim().length >= SUMMARY_MIN;
  /** step 1 (checklist): nothing hard-blocks and missing photos carry a justified exception */
  const reviewOk = !hardBlock && (!photosMissing || exceptionOk);
  const valid = reviewOk && conformityOk && summaryOk && confirmed;
  const nextVersion = (reports[0]?.version ?? 0) + 1;

  // What is still missing, per stage: the phone flow shows one stage at a time, the dialog the first that applies.
  const reviewHint = hardBlock
    ? "Resuelva los bloqueos de la lista"
    : photosMissing && !exceptionOk
      ? "Falta justificar la excepción de evidencia"
      : undefined;
  const conformityHint = conformityOk
    ? undefined
    : method === "firma" && !signature
      ? "Pida al cliente que firme en el recuadro"
      : "Escriba el nombre de quien acepta";
  const confirmHint = !summaryOk
    ? "Escriba la descripción para el reporte"
    : !confirmed
      ? "Marque la casilla de confirmación"
      : undefined;

  /** Anything the supervisor would have to capture again (the client's signature above all, plus the method and the confirmation). */
  const dirty =
    !!signature ||
    method !== "firma" ||
    confirmed ||
    exception.trim().length > 0 ||
    comment.trim().length > 0 ||
    summary.trim() !== initial.summary.trim() ||
    name.trim() !== initial.name.trim() ||
    role.trim() !== initial.role;

  /** Validates the closure. Returns what the success screen needs, or null when the store refused it (it says why in a toast). */
  const submit = (): ClosureDone | null => {
    if (!valid) return null;
    const at = new Date().toISOString();
    const conformity: Conformity = {
      method,
      name: name.trim(),
      role: role.trim() || undefined,
      signatureDataUrl: method === "firma" ? (signature ?? undefined) : undefined,
      at,
      comment: comment.trim() || undefined,
    };
    validateClosure(order.id, {
      summary: summary.trim(),
      conformity,
      exception: photosMissing ? { reason: exception.trim(), authorizedBy: user.id, at } : undefined,
    });
    // The store re-checks every rule; a refusal leaves the order untouched, so the closure on file is the old one.
    const after = useAppStore.getState().orders.find((o) => o.id === order.id);
    if (!after?.closure || after.closure === order.closure) return null;
    useUi.getState().fireCelebrate();
    return {
      at,
      offline,
      nextVersion,
      method,
      name: conformity.name,
      role: conformity.role,
      signature: conformity.signatureDataUrl,
      comment: conformity.comment,
    };
  };

  return {
    method,
    setMethod,
    name,
    setName,
    role,
    setRole,
    signature,
    setSignature,
    comment,
    setComment,
    summary,
    setSummary,
    exception,
    setException,
    confirmed,
    setConfirmed,
    rows,
    hardBlock,
    photosMissing,
    exceptionOk,
    conformityOk,
    summaryOk,
    reviewOk,
    valid,
    nextVersion,
    offline,
    reviewHint,
    conformityHint,
    confirmHint,
    /** the first thing still missing, in form order (the desktop footer hint) */
    missing: reviewHint ?? conformityHint ?? confirmHint,
    dirty,
    submit,
  };
}
