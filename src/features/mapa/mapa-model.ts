/**
 * Mapa del día — pure helpers (no React).
 * Which jornadas belong to a day, their status from the entrada/salida stamps, list order, filters and the pin offsets
 * that keep two services at the same site from hiding each other.
 */
import { parseISO } from "date-fns";
import type { Tone } from "@/lib/status";
import type { Client, Incident, Jornada, Order, ServiceType, Site, User, Worker } from "@/lib/types";
import { dayKey } from "@/features/agenda/agenda-model";
import { JORNADA_STATUS } from "@/features/orden/orden-format";

/* ───────────── status ───────────── */

export type ServiceStatus = "por_iniciar" | "en_curso" | "terminada";

/** Same tones as the jornada status everywhere else (pendiente slate · en curso blue · cerrada teal). */
export const SERVICE_STATUS: Record<ServiceStatus, { label: string; plural: string; tone: Tone; live: boolean }> = {
  en_curso: { label: "En curso", plural: "En curso", tone: JORNADA_STATUS.en_curso.tone, live: true },
  terminada: { label: "Terminada", plural: "Terminadas", tone: JORNADA_STATUS.cerrada.tone, live: false },
  por_iniciar: { label: "Por iniciar", plural: "Por iniciar", tone: JORNADA_STATUS.pendiente.tone, live: false },
};

/** Overlay flag: the order has an open incident. */
export const INCIDENT_TONE: Tone = "red";

/** Por iniciar = no entrada · En curso = entrada without salida · Terminada = salida registered. */
export function serviceStatus(j: Jornada): ServiceStatus {
  if (j.checkOut || j.status === "cerrada") return "terminada";
  if (j.checkIn || j.status === "en_curso") return "en_curso";
  return "por_iniciar";
}

/** List order: work in progress first, then what is still to start, then what is done. */
export const STATUS_ORDER: ServiceStatus[] = ["en_curso", "por_iniciar", "terminada"];

/* ───────────── day ───────────── */

/**
 * A jornada belongs to `key` (yyyy-MM-dd) when it is planned that day or its entrada was registered that day. On today's map a
 * jornada still in progress from an earlier day shows too (same rule as Hoy): it is on site now.
 */
export function isOnDay(j: Jornada, key: string, todayKey: string) {
  if (j.date === key || dayKey(parseISO(j.plannedStart)) === key) return true;
  if (j.checkIn && dayKey(parseISO(j.checkIn.deviceAt)) === key) return true;
  return key === todayKey && serviceStatus(j) === "en_curso";
}

/* ───────────── service row ───────────── */

export type MapaService = {
  /** jornada id */
  id: string;
  j: Jornada;
  order: Order;
  client?: Client;
  site?: Site;
  serviceType?: ServiceType;
  supervisor?: User;
  crew: Worker[];
  status: ServiceStatus;
  /** Open incidents of the order (this jornada's first). */
  openIncidents: Incident[];
  photos: { antes: number; despues: number };
};

export function compareServices(a: MapaService, b: MapaService) {
  return STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || a.j.plannedStart.localeCompare(b.j.plannedStart);
}

/** Planned start passed without an entrada (only meaningful for "Por iniciar"). */
export const isLate = (s: MapaService, now: Date) => s.status === "por_iniciar" && parseISO(s.j.plannedStart) < now;

/* ───────────── filters ───────────── */

export type StatusFilter = "todos" | ServiceStatus | "incidencia";

export function matchesStatus(s: MapaService, f: StatusFilter) {
  if (f === "todos") return true;
  if (f === "incidencia") return s.openIncidents.length > 0;
  return s.status === f;
}

export function statusCounts(services: MapaService[]) {
  const out = { todos: services.length, en_curso: 0, terminada: 0, por_iniciar: 0, incidencia: 0 } satisfies Record<StatusFilter, number>;
  for (const s of services) {
    out[s.status]++;
    if (s.openIncidents.length) out.incidencia++;
  }
  return out;
}

/* ───────────── pins ───────────── */

/** Horizontal pixel nudge for the 2nd, 3rd… service at the same site so every pin stays visible and clickable. */
const NUDGE = [0, 18, -18, 36, -36, 54, -54];

export function siteNudges(services: MapaService[]) {
  const seen = new Map<string, number>();
  const out = new Map<string, number>();
  for (const s of services) {
    if (!s.site) continue;
    const n = seen.get(s.site.id) ?? 0;
    seen.set(s.site.id, n + 1);
    out.set(s.id, NUDGE[n % NUDGE.length]);
  }
  return out;
}
