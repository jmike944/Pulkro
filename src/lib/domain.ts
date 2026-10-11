/**
 * Pure business rules (doc §8). No React here — safe to use in selectors, metrics and PDF.
 */
import { differenceInMinutes, isSameDay, parseISO } from "date-fns";
import type { GeoSource, Incident, Jornada, Order, OrderStatus, Photo, Report, Role, Survey, PostSaleCase } from "./types";
import type { Tone } from "./status";
import { can } from "./permissions";
import { plural } from "./format";

export type JornadaEvidence = {
  jornada: Jornada;
  antes: number;
  despues: number;
  complete: boolean;
};

export type OrderEvidence = {
  perJornada: JornadaEvidence[];
  antes: number;
  despues: number;
  incidencia: number;
  /** jornadas executed (checked in) */
  executed: number;
  /** required items (antes + después for each executed jornada) */
  required: number;
  /** required items present */
  present: number;
  complete: boolean;
};

export function orderEvidence(order: Order, jornadas: Jornada[], photos: Photo[]): OrderEvidence {
  const js = jornadas.filter((j) => j.orderId === order.id).sort((a, b) => a.dayIndex - b.dayIndex);
  const ps = photos.filter((p) => p.orderId === order.id);
  const perJornada = js.map((j) => {
    const antes = ps.filter((p) => p.jornadaId === j.id && p.kind === "antes").length;
    const despues = ps.filter((p) => p.jornadaId === j.id && p.kind === "despues").length;
    return { jornada: j, antes, despues, complete: antes > 0 && despues > 0 };
  });
  const executed = perJornada.filter((x) => x.jornada.checkIn);
  const required = executed.length * 2;
  const present = executed.reduce((s, x) => s + (x.antes > 0 ? 1 : 0) + (x.despues > 0 ? 1 : 0), 0);
  return {
    perJornada,
    antes: ps.filter((p) => p.kind === "antes").length,
    despues: ps.filter((p) => p.kind === "despues").length,
    incidencia: ps.filter((p) => p.kind === "incidencia").length,
    executed: executed.length,
    required,
    present,
    complete: executed.length > 0 && present === required && executed.length === perJornada.length,
  };
}

export type Blocker = { id: string; label: string; detail?: string; severity: "block" | "warn"; href?: string };

/**
 * Why an order can't be closed yet (doc §8: fotos obligatorias, jornadas, incidencias, sincronización).
 * Pass `role` so links point where that role can go: the supervisor to the jornada / incident screens, everyone else to
 * the matching tab of the order detail (field screens are supervisor-only).
 */
export function closureBlockers(
  order: Order,
  jornadas: Jornada[],
  photos: Photo[],
  incidents: Incident[],
  pendingSyncCount = 0,
  role?: Role,
): Blocker[] {
  const field = !role || can(role, "field.capture");
  const evidenceHref = (jornadaId: string) => (field ? `/jornada/${jornadaId}` : `/ordenes/${order.folio}?tab=evidencia`);
  const incidentHref = (incidentId: string) => (field ? `/incidencias?i=${incidentId}` : `/ordenes/${order.folio}?tab=incidencias`);
  const out: Blocker[] = [];
  const js = jornadas.filter((j) => j.orderId === order.id);
  const pending = js.filter((j) => j.status !== "cerrada");
  if (pending.length)
    out.push({ id: "jornadas", label: `${plural(pending.length, "jornada", "jornadas")} sin registro de salida`, severity: "block" });
  else if (!js.some((j) => j.checkIn && j.checkOut))
    // Same hard blocker as the server: a service that was never executed cannot be closed, not even with an exception.
    out.push({ id: "sin-ejecucion", label: "Ninguna jornada ejecutada (con entrada y salida)", severity: "block" });
  const ev = orderEvidence(order, jornadas, photos);
  ev.perJornada
    .filter((x) => x.jornada.checkIn)
    .forEach((x) => {
      if (!x.antes) out.push({ id: `antes-${x.jornada.id}`, label: `Falta foto ANTES · Jornada ${x.jornada.dayIndex}`, severity: "block", href: evidenceHref(x.jornada.id) });
      if (!x.despues) out.push({ id: `despues-${x.jornada.id}`, label: `Falta foto DESPUÉS · Jornada ${x.jornada.dayIndex}`, severity: "block", href: evidenceHref(x.jornada.id) });
    });
  incidents
    .filter((i) => i.orderId === order.id && i.status === "abierta")
    .forEach((i) =>
      out.push({ id: i.id, label: `Incidencia abierta ${i.folio}`, detail: i.description, severity: i.blocksClosure ? "block" : "warn", href: incidentHref(i.id) }),
    );
  if (pendingSyncCount > 0)
    out.push({ id: "sync", label: `${plural(pendingSyncCount, "registro", "registros")} sin sincronizar`, detail: "El PDF definitivo se bloquea hasta sincronizar.", severity: "warn" });
  return out;
}

/**
 * Execution status the jornadas support (server: private.derived_status). Used when confirming dates of a rescheduled
 * order, after a reschedule and when the last blocking incident is resolved — never an execution state without execution.
 */
export function derivedExecutionStatus(orderId: string, jornadas: Jornada[]): OrderStatus {
  const js = jornadas.filter((j) => j.orderId === orderId);
  if (!js.length) return "borrador";
  if (js.some((j) => j.status === "en_curso")) return "en_ejecucion";
  if (js.some((j) => j.status === "pendiente")) {
    if (js.some((j) => j.status === "cerrada")) return "jornada_cerrada";
    return js.some((j) => j.workerIds.length > 0) ? "programada" : "borrador";
  }
  return "pendiente_validacion";
}

/* ───────────── evidence integrity ───────────── */

/** How a check-in/out location was obtained, for labels and the report. */
export const GEO_SOURCE_LABEL: Record<GeoSource, string> = {
  gps: "GPS en sitio",
  manual: "Ubicación manual justificada",
  remota: "Supervisión remota",
};

/** Minimum length of the note required for a manual location or a remote-supervision record. */
export const GEO_NOTE_MIN = 8;

/** Minimum length of a post-sale case resolution (required to mark it resuelto or cerrado; server: update_case). */
export const CASE_RESOLUTION_MIN = 10;

/**
 * Text lengths the server stores (private.req_text and the table checks, trimmed). A longer or shorter text would be refused
 * for good once its capture is queued (the same request is resent), so the store refuses it first and the fields stop there.
 */
export const TEXT_LIMITS = {
  /** jornada_checks.note: the justification of a manual or remote check-in / check-out. */
  geoNote: { max: 500 },
  /** jornada_notes.text */
  jornadaNote: { min: 1, max: 2000 },
  /** incidents.description and post_sale_cases.description */
  description: { min: 3, max: 4000 },
  /** incidents.resolution / post_sale_cases.resolution */
  resolution: { max: 4000 },
  /** crew_changes.reason (assign_crew) */
  crewReason: { max: 500 },
  /** case_events.text (a note on a case) */
  caseNote: { max: 2000 },
  /** order_closures */
  summary: { min: 10, max: 8000 },
  conformityName: { max: 120 },
  conformityRole: { max: 120 },
  conformityComment: { max: 2000 },
  exception: { max: 2000 },
  /** surveys.respondent_name (record_manual_survey) */
  respondentName: { min: 2, max: 120 },
  /** catalogs (upsert_*) */
  clientName: { min: 2, max: 160 },
  clientShortName: { min: 1, max: 60 },
  siteName: { min: 2, max: 160 },
  workerName: { min: 3, max: 120 },
  serviceTypeName: { min: 2, max: 120 },
  serviceTypeShort: { min: 1, max: 40 },
  materialName: { min: 2, max: 120 },
  materialUnit: { min: 1, max: 12 },
  /** profiles.name (update_profile) */
  personName: { min: 3, max: 120 },
} as const;

/** `text` (trimmed) fits `limit`. */
export const fitsText = (text: string | undefined, limit: { min?: number; max: number }) => {
  const n = (text ?? "").trim().length;
  return n >= (limit.min ?? 0) && n <= limit.max;
};

/**
 * Survey link tokens the server accepts (private.check_token): 43–64 base64url characters, at least 16 distinct ones and
 * no 6-character sequence repeated. A random 256-bit token fails the last rule with probability ~10⁻⁸ (then regenerate).
 */
export function isStrongSurveyToken(token: string) {
  if (!/^[A-Za-z0-9_-]{43,64}$/.test(token) || new Set(token).size < 16) return false;
  const seen = new Set<string>();
  for (let i = 0; i + 6 <= token.length; i++) {
    const gram = token.slice(i, i + 6);
    if (seen.has(gram)) return false;
    seen.add(gram);
  }
  return true;
}

/** Hours per day of a service type (server: upsert_service_type and the service_types check). */
export const SERVICE_HOURS_MIN = 0.5;
export const SERVICE_HOURS_MAX = 24;

export type PhotoTimingIssue = { id: "antes_after_checkout" | "despues_before_checkin"; label: string };

/**
 * Timing checks for a jornada photo against its check-in/out (doc §4.2 evidence integrity). Uses the real capture time
 * (EXIF when present), so a gallery pick taken at the wrong moment is flagged even when it was attached in time.
 */
export function photoTimingIssues(photo: Pick<Photo, "kind" | "takenAt">, jornada?: Pick<Jornada, "checkIn" | "checkOut">): PhotoTimingIssue[] {
  if (!jornada) return [];
  const at = photo.takenAt;
  const out: PhotoTimingIssue[] = [];
  if (photo.kind === "antes" && jornada.checkOut && at > jornada.checkOut.deviceAt)
    out.push({ id: "antes_after_checkout", label: "Foto ANTES tomada después del registro de salida" });
  if (photo.kind === "despues" && jornada.checkIn && at < jornada.checkIn.deviceAt)
    out.push({ id: "despues_before_checkin", label: "Foto DESPUÉS tomada antes del registro de entrada" });
  return out;
}

/** Real worked minutes = Σ(salida − entrada) per jornada (doc §5). */
export function jornadaMinutes(j: Jornada, now = new Date()) {
  if (!j.checkIn) return 0;
  const end = j.checkOut ? parseISO(j.checkOut.deviceAt) : now;
  return Math.max(0, differenceInMinutes(end, parseISO(j.checkIn.deviceAt)));
}

export function orderMinutes(orderId: string, jornadas: Jornada[]) {
  return jornadas.filter((j) => j.orderId === orderId && j.checkOut).reduce((s, j) => s + jornadaMinutes(j), 0);
}

export function plannedMinutes(orderId: string, jornadas: Jornada[]) {
  return jornadas
    .filter((j) => j.orderId === orderId)
    .reduce((s, j) => s + differenceInMinutes(parseISO(j.plannedEnd), parseISO(j.plannedStart)), 0);
}

/** The jornada a supervisor should work on now: in progress → today's pending → next pending. */
export function activeJornada(orderId: string, jornadas: Jornada[], now = new Date()) {
  const js = jornadas.filter((j) => j.orderId === orderId).sort((a, b) => a.dayIndex - b.dayIndex);
  return (
    js.find((j) => j.status === "en_curso") ??
    js.find((j) => j.status === "pendiente" && isSameDay(parseISO(j.plannedStart), now)) ??
    js.find((j) => j.status === "pendiente") ??
    js.at(-1)
  );
}

export type NextAction = {
  label: string;
  href: string;
  /** primary = navy button, secondary = outline button */
  variant: "primary" | "secondary";
  status: string; // short status text shown in tables ("Lista para cierre")
  tone: Tone;
};

type NextActionCtx = { jornadas: Jornada[]; photos: Photo[]; incidents: Incident[]; reports: Report[]; surveys: Survey[]; cases: PostSaleCase[] };

/**
 * Single source of truth for "what should happen next" on an order (dashboard, lists, cards).
 * Pass `role` (ctx.role): the step is then only offered to whoever can take it; other roles get "Ver" into the order detail
 * (the matching tab), never a link to a screen of another role (field screens are supervisor-only).
 */
export function nextAction(order: Order, ctx: NextActionCtx & { role?: Role }, now = new Date()): NextAction {
  const step = nextStep(order, ctx, now);
  if (!ctx.role) return step;
  const role = ctx.role;
  const base = `/ordenes/${order.folio}`;
  const view = (tab?: string): NextAction => ({ ...step, label: "Ver", href: tab ? `${base}?tab=${tab}` : base, variant: "secondary" });
  const field = can(role, "field.capture");
  switch (order.status) {
    case "borrador":
      return can(role, "crew.assign") ? step : view("jornadas");
    case "programada":
    case "jornada_cerrada":
    case "en_ejecucion":
      return field ? step : view(step.href.startsWith("/jornada/") ? "jornadas" : undefined);
    case "pendiente_validacion":
    case "reabierta":
      return field && can(role, "closure.authorize") ? step : view(step.label === "Solicitar" ? "evidencia" : undefined);
    case "con_incidencia":
      return field ? step : view("incidencias");
    case "finalizada":
      return can(role, "report.share") ? step : view();
    case "reprogramada":
      return can(role, "order.reschedule") ? step : view("jornadas");
    case "reporte_enviado":
    case "seguimiento":
      return can(role, "postventa.manage") ? step : { ...step, label: "Ver", variant: "secondary" };
    default:
      return step;
  }
}

function nextStep(order: Order, ctx: NextActionCtx, now: Date): NextAction {
  const href = `/ordenes/${order.folio}`;
  const j = activeJornada(order.id, ctx.jornadas, now);
  switch (order.status) {
    case "borrador":
      return { label: "Asignar", href: `${href}?tab=jornadas`, variant: "secondary", status: "Sin cuadrilla", tone: "slate" };
    case "programada":
    case "jornada_cerrada": {
      const isToday = j && isSameDay(parseISO(j.plannedStart), now);
      if (isToday) return { label: "Entrada", href: `/jornada/${j!.id}`, variant: "primary", status: "Registrar entrada", tone: "blue" };
      return { label: "Ver", href, variant: "secondary", status: order.status === "jornada_cerrada" ? "Siguiente jornada" : "Programada", tone: order.status === "jornada_cerrada" ? "sky" : "blue" };
    }
    case "en_ejecucion":
      return { label: "Continuar", href: j ? `/jornada/${j.id}` : href, variant: "primary", status: "En ejecución", tone: "blue" };
    case "pendiente_validacion":
    case "reabierta": {
      const ev = orderEvidence(order, ctx.jornadas, ctx.photos);
      if (!ev.complete) {
        const missing = ev.perJornada.find((x) => x.jornada.checkIn && (!x.antes || !x.despues));
        return {
          label: "Solicitar", href: missing ? `/jornada/${missing.jornada.id}` : href, variant: "secondary",
          status: missing && !missing.despues ? "Falta foto DESPUÉS" : "Falta foto ANTES", tone: "amber",
        };
      }
      return { label: "Cerrar", href: `${href}?cerrar=1`, variant: "primary", status: "Lista para cierre", tone: "blue" };
    }
    case "con_incidencia": {
      const inc = ctx.incidents.find((i) => i.orderId === order.id && i.status === "abierta");
      return { label: "Resolver", href: inc ? `/incidencias?i=${inc.id}` : href, variant: "secondary", status: "Incidencia abierta", tone: "red" };
    }
    case "finalizada": {
      const rep = ctx.reports.find((r) => r.orderId === order.id);
      if (!rep) return { label: "Generar", href: `${href}/reporte`, variant: "primary", status: "Generar reporte", tone: "blue" };
      return { label: "Compartir", href: `${href}/reporte`, variant: "primary", status: "Reporte listo", tone: "blue" };
    }
    case "reporte_enviado": {
      const sv = ctx.surveys.find((s) => s.orderId === order.id);
      if (!sv) return { label: "Encuesta", href: `/postventa?orden=${order.folio}`, variant: "secondary", status: "Enviar encuesta", tone: "teal" };
      return { label: "Ver", href, variant: "secondary", status: sv.respondedAt ? "Encuesta respondida" : "Encuesta enviada", tone: "teal" };
    }
    case "seguimiento": {
      const c = ctx.cases.find((x) => x.orderId === order.id && (x.status === "abierto" || x.status === "en_proceso"));
      if (c) return { label: "Atender", href: `/postventa/${c.folio}`, variant: "secondary", status: `Caso ${c.folio}`, tone: "violet" };
      return { label: "Ver", href, variant: "secondary", status: "En seguimiento", tone: "violet" };
    }
    case "reprogramada":
      return { label: "Confirmar", href: `${href}?tab=jornadas`, variant: "secondary", status: "Confirmar fechas", tone: "amber" };
    case "cancelada":
      return { label: "Ver", href, variant: "secondary", status: "Cancelada", tone: "slate" };
    case "archivada":
    default:
      return { label: "Ver", href, variant: "secondary", status: "Archivada", tone: "slate" };
  }
}

/** Survey average 1-5 → 0..1 */
export const surveyScore = (s: Survey) =>
  s.answers ? (s.answers.overall + s.answers.quality + s.answers.punctuality + s.answers.staff) / 4 : null;

/** Whatsapp deep link (manual share, doc §4.3) */
export function whatsappLink(phone: string, text: string) {
  const digits = phone.replace(/\D/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export function mailtoLink(to: string, subject: string, body: string) {
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function mapsLink(lat: number, lng: number) {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}
