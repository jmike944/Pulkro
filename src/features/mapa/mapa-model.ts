/**
 * Mapa del día — pure helpers (no React).
 * Which jornadas belong to a day, their status from the entrada/salida stamps, list order, filters and the pin offsets
 * that keep two services at the same site from hiding each other.
 */
import { parseISO } from "date-fns";
import { fmtTime, plural } from "@/lib/format";
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

type StatusStat = { count: number; sub: string };

/** Earliest of some ISO times, or undefined. */
const earliest = (isos: (string | undefined)[]) =>
  isos.filter((x): x is string => !!x).sort((a, b) => a.localeCompare(b))[0];

/**
 * The day's counters (one per status filter) with a line of context each, like the Órdenes stages: who has been on site
 * since when, closed services still missing a photo, services late to start (or the next start), incidents that block a
 * closure.
 */
export function statusStats(services: MapaService[], now: Date): Record<Exclude<StatusFilter, "todos">, StatusStat> {
  const of = (st: ServiceStatus) => services.filter((s) => s.status === st);
  const live = of("en_curso");
  const done = of("terminada");
  const waiting = of("por_iniciar");
  const withIncident = services.filter((s) => s.openIncidents.length > 0);

  const since = earliest(live.map((s) => s.j.checkIn?.deviceAt));
  const missingPhotos = done.filter((s) => !s.photos.antes || !s.photos.despues).length;
  const late = waiting.filter((s) => isLate(s, now)).length;
  const next = earliest(waiting.map((s) => s.j.plannedStart));
  const blocking = withIncident.filter((s) => s.openIncidents.some((i) => i.blocksClosure)).length;

  return {
    en_curso: { count: live.length, sub: !live.length ? "nadie en sitio" : since ? `en sitio desde ${fmtTime(since)}` : "en sitio" },
    terminada: {
      count: done.length,
      sub: !done.length ? "ninguna todavía" : missingPhotos ? plural(missingPhotos, "con fotos pendientes", "con fotos pendientes") : "con fotos completas",
    },
    por_iniciar: {
      count: waiting.length,
      sub: !waiting.length ? "sin pendientes" : late ? plural(late, "con retraso", "con retraso") : next ? `próximo a las ${fmtTime(next)}` : "por iniciar",
    },
    incidencia: {
      count: withIncident.length,
      sub: !withIncident.length ? "ninguna abierta" : blocking ? plural(blocking, "bloquea el cierre", "bloquean el cierre") : "sin bloqueos",
    },
  };
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
