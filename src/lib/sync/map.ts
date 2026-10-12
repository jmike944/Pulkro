/**
 * Database rows → the app's types (src/lib/types.ts). Pure functions, no I/O: the pull engine (pull.ts) fetches the rows, the
 * merge (merge.ts) puts the mapped records into the store. Ids stay the database uuids.
 *
 * Choices where the two models differ (architecture §3):
 *  - times: timestamptz values come back as "2026-10-11T05:36:32.429978+00:00"; the app compares ISO strings as text, so every
 *    time is normalised to `Date#toISOString()` (UTC, milliseconds). Pull cursors keep the raw server value (pull.ts).
 *  - `date` columns: Jornada.date stays "yyyy-MM-dd"; PostSaleCase.dueDate becomes 18:00 local time of that day (what the
 *    case dialog stores) and Client.since local midnight.
 *  - field records keep the device time the person saw (check-in/out `device_at`, note/share `device_at`, incident `device_at`)
 *    and fall back to the server time when the row has none.
 *  - children the app nests (crew history, closure, check-in/out, bitácora, timeline, shares, survey token) are attached by
 *    the merge; `photoIds` of incidents and cases are derived from photos.incident_id / case_id; Client.siteIds from sites.
 *  - the closure shown is the latest version (order_closures, highest `version`).
 *  - a survey's token is only visible to Administración and supervisors (survey_tokens): "" until (or unless) it arrives.
 *  - audit_log: `by` is the actor id, or "cliente" / "sistema" for the other actor kinds (the Bitácora shows "Cliente").
 */
import type {
  AuditEntry,
  Client,
  Closure,
  CrewChange,
  GeoStamp,
  Incident,
  Jornada,
  JornadaLogEntry,
  Material,
  Order,
  Photo,
  PostSaleCase,
  Report,
  ServiceType,
  ShareAttempt,
  Site,
  Survey,
  Unit,
  User,
  Worker,
} from "@/lib/types";
import type { ReportRow, Row } from "./tables";

/* ───────────── value helpers ───────────── */

/** A server time as the app's ISO string (UTC, milliseconds). */
export const iso = (value: string): string => {
  const t = Date.parse(value);
  return Number.isNaN(t) ? value : new Date(t).toISOString();
};
const isoOr = (value: string | null | undefined): string | undefined => (value ? iso(value) : undefined);
/** null → undefined (optional app fields). */
const opt = <T>(value: T | null | undefined): T | undefined => (value === null ? undefined : value);
/** A "yyyy-MM-dd" date at a local wall-clock time, as an ISO instant. */
const localDateTime = (date: string, hm: string): string => {
  const t = Date.parse(`${date}T${hm}:00`);
  return Number.isNaN(t) ? date : new Date(t).toISOString();
};
const num = (value: number | string | null | undefined): number => (typeof value === "number" ? value : Number(value ?? 0));

/** Sort by an ISO time, ties by id (stable across devices). */
export const byTime = <T extends { at: string; id?: string }>(a: T, b: T) =>
  a.at < b.at ? -1 : a.at > b.at ? 1 : (a.id ?? "").localeCompare(b.id ?? "");

/* ───────────── organisation and catalogs ───────────── */

export function mapUnit(r: Pick<Row<"units">, "id" | "name" | "code" | "city">): Unit {
  return { id: r.id, name: r.name, code: r.code, city: r.city };
}

export type ProfileFields = Pick<Row<"profiles">, "id" | "name" | "initials" | "role" | "title" | "unit_id" | "email" | "phone" | "hue" | "active">;

export function mapProfile(r: ProfileFields): User {
  return {
    id: r.id,
    name: r.name,
    initials: r.initials,
    role: r.role,
    title: r.title,
    unitId: r.unit_id,
    email: r.email,
    phone: r.phone,
    hue: r.hue,
    active: r.active,
  };
}

export function mapWorker(r: Row<"workers">): Worker {
  return { id: r.id, name: r.name, initials: r.initials, unitId: r.unit_id, specialty: r.specialty, phone: r.phone, hue: r.hue, active: r.active };
}

/** `siteIds` = the client's sites on the device (merge.ts recomputes them whenever sites change). */
export function mapClient(r: Row<"clients">, siteIds: string[] = []): Client {
  return {
    id: r.id,
    name: r.name,
    shortName: r.short_name,
    segment: r.segment,
    unitId: r.unit_id,
    contactName: r.contact_name,
    contactPhone: r.contact_phone,
    contactEmail: r.contact_email,
    // `since` is optional in the database (a client registered without it): the record's creation stands in, flagged.
    since: r.since ? localDateTime(r.since, "00:00") : iso(r.created_at),
    ...(r.since ? {} : { sinceUnset: true }),
    hue: r.hue,
    siteIds,
  };
}

export function mapSite(r: Row<"sites">): Site {
  return { id: r.id, clientId: r.client_id, name: r.name, address: r.address, municipality: r.municipality, lat: num(r.lat), lng: num(r.lng) };
}

export function mapServiceType(r: Row<"service_types">): ServiceType {
  return { id: r.id, name: r.name, short: r.short, hue: r.hue, defaultHoursPerDay: num(r.default_hours_per_day) };
}

export function mapMaterial(r: Row<"materials">): Material {
  return { id: r.id, name: r.name, unit: r.unit };
}

/* ───────────── orders ───────────── */

/** orders.materials jsonb `[{ material_id, qty }]` → `[{ materialId, qty }]` (malformed entries are skipped). */
export function mapOrderMaterials(value: unknown): Order["materials"] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((e) => {
    if (!e || typeof e !== "object") return [];
    const { material_id, qty } = e as { material_id?: unknown; qty?: unknown };
    return typeof material_id === "string" ? [{ materialId: material_id, qty: num(qty as number) }] : [];
  });
}

/**
 * The order's own columns. Crew history and closure come from their tables: `prev` keeps what the device already attached
 * (merge.ts replaces them as those rows arrive). DB-only columns: scope_changed_at (pull.ts), row_version.
 */
export function mapOrder(r: Row<"orders">, prev?: Pick<Order, "crewHistory" | "closure">): Order {
  return {
    id: r.id,
    folio: r.folio,
    unitId: r.unit_id,
    clientId: r.client_id,
    siteId: r.site_id,
    serviceTypeId: r.service_type_id,
    supervisorId: r.supervisor_id,
    status: r.status,
    previousStatus: opt(r.previous_status),
    title: r.title,
    activities: r.activities ?? [],
    materials: mapOrderMaterials(r.materials),
    specialInstructions: r.special_instructions,
    siteContact: { name: r.site_contact_name, phone: r.site_contact_phone },
    scheduledStart: iso(r.scheduled_start),
    scheduledEnd: iso(r.scheduled_end),
    plannedDays: r.planned_days,
    commercialRef: r.commercial_ref,
    crewHistory: prev?.crewHistory ?? [],
    closure: prev?.closure,
    createdAt: iso(r.created_at),
    createdBy: r.created_by,
    updatedAt: iso(r.updated_at),
    priority: r.priority,
    reopenedAt: isoOr(r.reopened_at),
    archivedAt: isoOr(r.archived_at),
  };
}

export function mapCrewChange(r: Row<"crew_changes">): CrewChange {
  return { id: r.id, at: iso(r.created_at), workerIds: r.worker_ids ?? [], by: r.created_by, reason: r.reason, jornadaId: opt(r.jornada_id) };
}

/** One closure version. Conformity is optional on the server (decision 5); its time falls back to the validation. */
export function mapClosure(r: Row<"order_closures">): Closure {
  const validatedAt = iso(r.validated_at);
  return {
    id: r.id,
    version: r.version,
    validatedAt,
    validatedBy: r.validated_by,
    conformity: r.conformity_method
      ? {
          method: r.conformity_method,
          name: r.conformity_name ?? "",
          role: opt(r.conformity_role),
          signatureDataUrl: opt(r.conformity_signature),
          at: isoOr(r.conformity_at) ?? validatedAt,
          comment: opt(r.conformity_comment),
        }
      : undefined,
    exception:
      r.exception_reason && r.exception_authorized_by
        ? { reason: r.exception_reason, authorizedBy: r.exception_authorized_by, at: isoOr(r.exception_at) ?? validatedAt }
        : undefined,
    summary: r.summary,
  };
}

/** The newer of two closure versions (higher version; equal versions → the later validation). */
export function newerClosure(a: Closure | undefined, b: Closure): Closure {
  if (!a) return b;
  const va = a.version ?? 0;
  const vb = b.version ?? 0;
  if (vb !== va) return vb > va ? b : a;
  return b.validatedAt >= a.validatedAt ? b : a;
}

/* ───────────── jornadas ───────────── */

/** jornadas.breakdown jsonb `[{ activity, hours }]` (null = none captured). */
export function mapBreakdown(value: unknown): Jornada["breakdown"] {
  if (!Array.isArray(value)) return undefined;
  return value.flatMap((e) => {
    if (!e || typeof e !== "object") return [];
    const { activity, hours } = e as { activity?: unknown; hours?: unknown };
    return typeof activity === "string" ? [{ activity, hours: num(hours as number) }] : [];
  });
}

/**
 * A jornada's own columns. Check-in/out and the bitácora come from jornada_checks / jornada_notes (`prev` keeps them).
 * A tombstoned jornada (`deleted_at`, a rescheduled pending day) maps to null: the merge removes it.
 */
export function mapJornada(r: Row<"jornadas">, prev?: Pick<Jornada, "checkIn" | "checkOut" | "log">): Jornada | null {
  if (r.deleted_at) return null;
  return {
    id: r.id,
    orderId: r.order_id,
    dayIndex: r.day_index,
    date: r.date,
    plannedStart: iso(r.planned_start),
    plannedEnd: iso(r.planned_end),
    workerIds: r.worker_ids ?? [],
    status: r.status,
    checkIn: prev?.checkIn,
    checkOut: prev?.checkOut,
    log: prev?.log ?? [],
    breakdown: mapBreakdown(r.breakdown),
    breakdownNote: opt(r.breakdown_note),
  };
}

/** jornada_checks → GeoStamp (`kind` decides checkIn / checkOut). */
export function mapCheck(r: Row<"jornada_checks">): GeoStamp {
  return {
    deviceAt: iso(r.device_at),
    serverAt: iso(r.server_at),
    lat: num(r.lat),
    lng: num(r.lng),
    accuracy: num(r.accuracy),
    by: r.created_by,
    offline: r.offline,
    source: r.source,
    note: opt(r.note),
  };
}

export function mapNote(r: Row<"jornada_notes">): JornadaLogEntry {
  return { id: r.id, at: iso(r.device_at ?? r.created_at), by: r.created_by, text: r.text };
}

/* ───────────── incidents, photos, cases ───────────── */

/** `photoIds` are derived from photos.incident_id (merge.ts); `prev` keeps the device's list until then. */
export function mapIncident(r: Row<"incidents">, prev?: Pick<Incident, "photoIds">): Incident {
  return {
    id: r.id,
    folio: r.folio,
    orderId: r.order_id,
    jornadaId: opt(r.jornada_id),
    type: r.type,
    severity: r.severity,
    description: r.description,
    photoIds: prev?.photoIds ?? [],
    status: r.status,
    blocksClosure: r.blocks_closure,
    createdAt: iso(r.device_at ?? r.created_at),
    createdBy: r.created_by,
    resolution: opt(r.resolution),
    resolvedAt: isoOr(r.resolved_at),
    resolvedBy: opt(r.resolved_by),
  };
}

/**
 * Photo metadata; the pixels stay in Storage (`{ type: "storage", path }`, shown through a signed URL). A deleted photo
 * (`deleted_at`) maps to null: the merge removes it. DB-only: mime_type, bytes, deleted_by.
 */
export function mapPhoto(r: Row<"photos">): Photo | null {
  if (r.deleted_at) return null;
  return {
    id: r.id,
    orderId: r.order_id,
    jornadaId: opt(r.jornada_id),
    incidentId: opt(r.incident_id),
    caseId: opt(r.case_id),
    kind: r.kind,
    area: r.area,
    takenAt: iso(r.taken_at),
    takenAtSource: r.taken_at_source,
    uploadedAt: isoOr(r.attached_at),
    origin: opt(r.origin),
    by: r.created_by,
    lat: opt(r.lat),
    lng: opt(r.lng),
    accuracy: opt(r.accuracy),
    geoSource: opt(r.geo_source),
    source: { type: "storage", path: r.storage_path, width: opt(r.width), height: opt(r.height) },
    selectedForReport: r.selected_for_report,
    note: opt(r.note),
  };
}

/** Timeline comes from case_events, `photoIds` from photos.case_id (merge.ts); `prev` keeps them until then. */
export function mapCase(r: Row<"post_sale_cases">, prev?: Pick<PostSaleCase, "timeline" | "photoIds">): PostSaleCase {
  return {
    id: r.id,
    folio: r.folio,
    orderId: r.order_id,
    clientId: r.client_id,
    category: r.category,
    severity: r.severity,
    channel: r.channel,
    description: r.description,
    ownerId: r.owner_id,
    dueDate: localDateTime(r.due_date, "18:00"),
    status: r.status,
    photoIds: prev?.photoIds ?? [],
    resolution: opt(r.resolution),
    createdAt: iso(r.created_at),
    createdBy: r.created_by,
    updatedAt: iso(r.updated_at),
    timeline: prev?.timeline ?? [],
  };
}

export function mapCaseEvent(r: Row<"case_events">): PostSaleCase["timeline"][number] {
  return { id: r.id, at: iso(r.created_at), by: r.created_by, text: r.text };
}

/* ───────────── reports and surveys ───────────── */

/** `shares` come from report_shares (`prev` keeps them). DB-only: closure_id, the frozen snapshot, device_at. */
export function mapReport(r: ReportRow, prev?: Pick<Report, "shares">): Report {
  return {
    id: r.id,
    orderId: r.order_id,
    version: r.version,
    generatedAt: iso(r.generated_at),
    generatedBy: r.generated_by,
    photoIds: r.photo_ids ?? [],
    summary: r.summary,
    shares: prev?.shares ?? [],
  };
}

export function mapShare(r: Row<"report_shares">): ShareAttempt {
  return { id: r.id, channel: r.channel, to: r.recipient, at: iso(r.device_at ?? r.created_at), by: r.created_by, note: r.note };
}

/** The token lives in survey_tokens (`prev` keeps it; "" while it is not on the device). DB-only: recorded_by. */
export function mapSurvey(r: Row<"surveys">, prev?: Pick<Survey, "token">): Survey {
  const answered =
    r.responded_at && r.overall !== null && r.quality !== null && r.punctuality !== null && r.staff !== null && r.nps !== null;
  return {
    id: r.id,
    token: prev?.token ?? "",
    orderId: r.order_id,
    clientId: r.client_id,
    sentAt: iso(r.sent_at),
    sentBy: r.sent_by,
    channel: r.channel,
    respondedAt: isoOr(r.responded_at),
    answers: answered
      ? { overall: r.overall!, quality: r.quality!, punctuality: r.punctuality!, staff: r.staff!, nps: r.nps!, comment: opt(r.comment) }
      : undefined,
    manual: r.manual,
    respondentName: opt(r.respondent_name),
  };
}

/* ───────────── audit ───────────── */

/**
 * Bitácora entry. `at` is the server time of the action. DB-only: device_at, op_id, actor_name (a name snapshot; the UI
 * resolves names from the people on the device), unit_id (the server already filtered by it).
 */
export function mapAudit(r: Row<"audit_log">): AuditEntry {
  return {
    id: String(r.id),
    at: iso(r.at),
    by: r.actor_kind === "usuario" && r.actor_id ? r.actor_id : r.actor_kind,
    entity: r.entity,
    entityId: r.entity_id,
    orderId: opt(r.order_id),
    action: r.action,
    reason: opt(r.reason),
  };
}
