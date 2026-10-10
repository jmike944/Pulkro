/**
 * Report model — ONE final report per service (doc §4.3), aggregated across every jornada.
 * Pure data, shared by the HTML A4 preview and the react-pdf document so both always match.
 */
import { jornadaMinutes } from "@/lib/domain";
import { INCIDENT_TYPE, SEVERITY } from "@/lib/status";
import type {
  Client,
  Conformity,
  Incident,
  Jornada,
  Order,
  Photo,
  Report,
  ServiceType,
  Site,
  Unit,
  User,
  Worker,
} from "@/lib/types";

/** Recommended upper bound so the PDF stays light enough for WhatsApp. */
export const RECOMMENDED_MAX_PHOTOS = 12;

export const CONFORMITY_METHOD: Record<Conformity["method"], string> = {
  firma: "Firma en dispositivo",
  verbal: "Conformidad verbal",
  correo: "Confirmación por correo",
};

export const CONFIDENTIAL_NOTE =
  "Documento confidencial para uso exclusivo del cliente. Contiene información operativa, fotografías y ubicación del servicio; no debe reproducirse ni compartirse con terceros sin autorización de Pulkro Compañía de Servicios.";

/** Everything needed to compose a report for one order. */
export type ReportContext = {
  order: Order;
  client: Client;
  site: Site;
  serviceType: ServiceType;
  supervisor: User;
  unit: Unit;
  jornadas: Jornada[];
  photos: Photo[];
  incidents: Incident[];
  reports: Report[];
  workers: Map<string, Worker>;
  users: Map<string, User>;
};

export type ReportPhotoPair = { key: string; area: string; antes?: Photo; despues?: Photo };

export type ReportJornadaRow = {
  id: string;
  index: number;
  date: string;
  entrada?: string;
  salida?: string;
  minutes: number;
  gpsIn?: number;
  gpsOut?: number;
  offline: boolean;
  manual: boolean;
  crew: number;
};

export type ReportGpsPoint = {
  key: string;
  label: string;
  kind: "entrada" | "salida";
  lat: number;
  lng: number;
  accuracy: number;
  at: string;
  source: "gps" | "manual";
  offline: boolean;
};

export type ReportIncidentRow = {
  id: string;
  folio: string;
  type: string;
  severity: string;
  severityKey: Incident["severity"];
  description: string;
  resolution?: string;
  open: boolean;
  at: string;
};

export type ReportModel = {
  folio: string;
  title: string;
  serviceType: string;
  commercialRef: string;
  unitName: string;
  version: number;
  /** true while the preview shows changes that are not a generated version yet */
  draft: boolean;
  issuedAt: string;
  issuedBy: string;
  client: { name: string; shortName: string; segment: string; contactName: string; contactEmail: string; contactPhone: string; hue: number };
  site: { name: string; address: string; municipality: string; lat: number; lng: number };
  siteContact: { name: string; phone: string };
  period: { start: string; end: string; days: number; executed: number };
  schedule: string;
  jornadas: ReportJornadaRow[];
  totalMinutes: number;
  summary: string;
  activities: string[];
  specialInstructions: string;
  incidents: ReportIncidentRow[];
  pairs: ReportPhotoPair[];
  photoCount: number;
  supervisor: { name: string; title: string; phone: string; email: string; initials: string; hue: number };
  workers: { id: string; name: string; specialty: string; initials: string; hue: number }[];
  conformity?: Conformity & { methodLabel: string };
  exception?: { reason: string; authorizedBy: string; at: string };
  validatedAt?: string;
  validatedBy?: string;
  gps: ReportGpsPoint[];
};

export const isReportPhoto = (p: Photo) => p.kind === "antes" || p.kind === "despues";

/** Group ANTES/DESPUÉS photos by area into side-by-side pairs, in capture order. */
export function pairPhotos(photos: Photo[]): ReportPhotoPair[] {
  const areas = new Map<string, { antes: Photo[]; despues: Photo[] }>();
  [...photos]
    .filter(isReportPhoto)
    .sort((a, b) => a.takenAt.localeCompare(b.takenAt))
    .forEach((p) => {
      const g = areas.get(p.area) ?? { antes: [], despues: [] };
      (p.kind === "antes" ? g.antes : g.despues).push(p);
      areas.set(p.area, g);
    });
  const out: ReportPhotoPair[] = [];
  areas.forEach((g, area) => {
    const n = Math.max(g.antes.length, g.despues.length);
    for (let i = 0; i < n; i++) {
      const antes = g.antes[i];
      const despues = g.despues[i];
      out.push({ key: `${area}-${antes?.id ?? "x"}-${despues?.id ?? "x"}`, area, antes, despues });
    }
  });
  return out;
}

const hm = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

export function buildReportModel(
  ctx: ReportContext,
  opts: { photoIds: string[]; summary: string; version: number; issuedAt: string; issuedBy: string; draft: boolean },
): ReportModel {
  const { order, client, site, serviceType, supervisor, unit } = ctx;
  const jornadas = [...ctx.jornadas].filter((j) => j.orderId === order.id).sort((a, b) => a.dayIndex - b.dayIndex);
  const executed = jornadas.filter((j) => j.checkIn);
  const ids = new Set(opts.photoIds);
  const selected = ctx.photos.filter((p) => ids.has(p.id) && isReportPhoto(p));

  const rows: ReportJornadaRow[] = jornadas.map((j) => ({
    id: j.id,
    index: j.dayIndex,
    date: j.checkIn?.deviceAt ?? j.plannedStart,
    entrada: j.checkIn?.deviceAt,
    salida: j.checkOut?.deviceAt,
    minutes: j.checkOut ? jornadaMinutes(j) : 0,
    gpsIn: j.checkIn ? Math.round(j.checkIn.accuracy) : undefined,
    gpsOut: j.checkOut ? Math.round(j.checkOut.accuracy) : undefined,
    offline: !!(j.checkIn?.offline || j.checkOut?.offline),
    manual: j.checkIn?.source === "manual" || j.checkOut?.source === "manual",
    crew: j.workerIds.length,
  }));

  const crewIds = new Set((executed.length ? executed : jornadas).flatMap((j) => j.workerIds));
  const workers = [...crewIds]
    .map((id) => ctx.workers.get(id))
    .filter((w): w is Worker => !!w)
    .sort((a, b) => a.name.localeCompare(b.name, "es"))
    .map((w) => ({ id: w.id, name: w.name, specialty: w.specialty, initials: w.initials, hue: w.hue }));

  const gps: ReportGpsPoint[] = executed.flatMap((j) => {
    const pts: ReportGpsPoint[] = [];
    if (j.checkIn)
      pts.push({ key: `${j.id}-in`, label: `Entrada · J${j.dayIndex}`, kind: "entrada", lat: j.checkIn.lat, lng: j.checkIn.lng, accuracy: j.checkIn.accuracy, at: j.checkIn.deviceAt, source: j.checkIn.source, offline: j.checkIn.offline });
    if (j.checkOut)
      pts.push({ key: `${j.id}-out`, label: `Salida · J${j.dayIndex}`, kind: "salida", lat: j.checkOut.lat, lng: j.checkOut.lng, accuracy: j.checkOut.accuracy, at: j.checkOut.deviceAt, source: j.checkOut.source, offline: j.checkOut.offline });
    return pts;
  });

  const schedules = new Set(jornadas.map((j) => `${hm(j.plannedStart)} – ${hm(j.plannedEnd)}`));
  const first = executed[0] ?? jornadas[0];
  const last = executed.at(-1) ?? jornadas.at(-1);
  const closure = order.closure;

  return {
    folio: order.folio,
    title: order.title,
    serviceType: serviceType?.name ?? "Servicio",
    commercialRef: order.commercialRef,
    unitName: unit?.name ?? "",
    version: opts.version,
    draft: opts.draft,
    issuedAt: opts.issuedAt,
    issuedBy: opts.issuedBy,
    client: {
      name: client.name,
      shortName: client.shortName,
      segment: client.segment,
      contactName: client.contactName,
      contactEmail: client.contactEmail,
      contactPhone: client.contactPhone,
      hue: client.hue,
    },
    site: { name: site.name, address: site.address, municipality: site.municipality, lat: site.lat, lng: site.lng },
    siteContact: order.siteContact,
    period: {
      start: first?.checkIn?.deviceAt ?? first?.plannedStart ?? order.scheduledStart,
      end: last?.checkOut?.deviceAt ?? last?.plannedEnd ?? order.scheduledEnd,
      days: jornadas.length || order.plannedDays,
      executed: executed.length,
    },
    schedule: schedules.size === 1 ? [...schedules][0] : schedules.size === 0 ? "—" : "Horario variable por jornada",
    jornadas: rows,
    totalMinutes: rows.reduce((s, r) => s + r.minutes, 0),
    summary: opts.summary,
    activities: order.activities,
    specialInstructions: order.specialInstructions,
    incidents: ctx.incidents
      .filter((i) => i.orderId === order.id)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((i) => ({
        id: i.id,
        folio: i.folio,
        type: INCIDENT_TYPE[i.type].label,
        severity: SEVERITY[i.severity].label,
        severityKey: i.severity,
        description: i.description,
        resolution: i.resolution,
        open: i.status === "abierta",
        at: i.createdAt,
      })),
    pairs: pairPhotos(selected),
    photoCount: selected.length,
    supervisor: {
      name: supervisor?.name ?? "Supervisor",
      title: supervisor?.title ?? "Supervisor",
      phone: supervisor?.phone ?? "",
      email: supervisor?.email ?? "",
      initials: supervisor?.initials ?? "S",
      hue: supervisor?.hue ?? 210,
    },
    workers,
    conformity: closure?.conformity ? { ...closure.conformity, methodLabel: CONFORMITY_METHOD[closure.conformity.method] } : undefined,
    exception: closure?.exception
      ? { reason: closure.exception.reason, authorizedBy: ctx.users.get(closure.exception.authorizedBy)?.name ?? "Supervisor", at: closure.exception.at }
      : undefined,
    validatedAt: closure?.validatedAt,
    validatedBy: closure ? (ctx.users.get(closure.validatedBy)?.name ?? "Supervisor") : undefined,
    gps,
  };
}

/** Split free text into paragraphs (blank lines or single line breaks). */
export const paragraphs = (text: string) =>
  text
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

export const reportFileName = (folio: string, version: number) => `Reporte_${folio}_v${version}.pdf`;

/** Has the selection or the description changed since the latest generated version? */
export function isDirty(latest: Report | undefined, photoIds: string[], summary: string) {
  if (!latest) return true;
  if (latest.summary.trim() !== summary.trim()) return true;
  if (latest.photoIds.length !== photoIds.length) return true;
  const set = new Set(latest.photoIds);
  return photoIds.some((id) => !set.has(id));
}
