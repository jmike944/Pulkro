/**
 * Draft model for "Alta manual de orden de servicio" (doc §3 paso 2, §4.1).
 * Pure helpers: defaults, suggestions derived from past orders, per-step validation.
 */
import { addDays, format, isSunday, parseISO } from "date-fns";
import { TEXT_LIMITS } from "@/lib/domain";
import type { NewOrderInput } from "@/lib/store";
import type { Client, Order, ServiceType, User } from "@/lib/types";

export type DraftDay = { id: string; date: string; start: string; end: string };

export type Draft = {
  clientId: string;
  siteId: string;
  contactName: string;
  contactPhone: string;
  commercialRef: string;
  priority: Order["priority"];
  serviceTypeId: string;
  /** only meaningful when titleEdited — otherwise the title is suggested */
  title: string;
  titleEdited: boolean;
  activities: string[];
  customActivities: string[];
  materials: Record<string, number>;
  specialInstructions: string;
  supervisorId: string;
  days: DraftDay[];
  timesEdited: boolean;
  workerIds: string[];
  authorized: boolean;
};

export const STEPS = [
  { key: "cliente", label: "Cliente y sitio", short: "Cliente" },
  { key: "servicio", label: "Servicio", short: "Servicio" },
  { key: "programacion", label: "Programación y cuadrilla", short: "Jornadas" },
  { key: "revision", label: "Revisión", short: "Revisión" },
] as const;

export const MAX_DAYS = 14;
export const DEFAULT_START = "08:00";

let dayCounter = 0;
export const dayId = () => `d${Date.now().toString(36)}${(dayCounter++).toString(36)}`;

/* ───────────── dates & times ───────────── */

export const dateKey = (d: Date) => format(d, "yyyy-MM-dd");

/** First working day after `from` (Sundays are skipped, as in the field calendar). */
export function nextWorkingDay(from: Date) {
  let d = addDays(from, 1);
  while (isSunday(d)) d = addDays(d, 1);
  return d;
}

export function workingDaysFrom(first: string, n: number) {
  const out: string[] = [];
  let d = parseISO(first);
  while (out.length < n) {
    if (!isSunday(d) || out.length === 0) out.push(dateKey(d));
    d = addDays(d, 1);
  }
  return out;
}

export const toMinutes = (hm: string) => {
  const [h, m] = hm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

export const fromMinutes = (min: number) => {
  const m = Math.max(0, Math.min(23 * 60 + 59, Math.round(min)));
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

export const endFor = (start: string, hours: number) => fromMinutes(toMinutes(start) + hours * 60);

export const dayMinutes = (d: Pick<DraftDay, "start" | "end">) => Math.max(0, toMinutes(d.end) - toMinutes(d.start));

export const isSundayKey = (key: string) => !!key && isSunday(parseISO(key));

export function makeDays(dates: string[], start: string, hours: number): DraftDay[] {
  return dates.map((date) => ({ id: dayId(), date, start, end: endFor(start, hours) }));
}

/* ───────────── suggestions from history ───────────── */

export type MaterialSuggestion = { materialId: string; qty: number; uses: number };

/**
 * Activities and materials typically used for a service type, learned from existing
 * orders in the store (deduped, most frequent first).
 */
export function serviceSuggestions(orders: Order[], serviceTypeId: string) {
  const acts = new Map<string, number>();
  const mats = new Map<string, number[]>();
  for (const o of orders) {
    if (o.serviceTypeId !== serviceTypeId) continue;
    for (const a of o.activities) {
      const key = a.trim();
      if (key) acts.set(key, (acts.get(key) ?? 0) + 1);
    }
    for (const m of o.materials) {
      const arr = mats.get(m.materialId);
      if (arr) arr.push(m.qty);
      else mats.set(m.materialId, [m.qty]);
    }
  }
  const activities = [...acts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es")).map(([a]) => a);
  const materials: MaterialSuggestion[] = [...mats.entries()]
    .map(([materialId, qtys]) => {
      const sorted = [...qtys].sort((a, b) => a - b);
      return { materialId, qty: Math.max(1, Math.round(sorted[Math.floor(sorted.length / 2)])), uses: qtys.length };
    })
    .sort((a, b) => b.uses - a.uses);
  return { activities, materials };
}

/** Special instructions used before for this client (most recent first, unique). */
export function instructionSuggestions(orders: Order[], clientId: string, limit = 3) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const o of [...orders].filter((x) => x.clientId === clientId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
    const t = o.specialInstructions.trim();
    if (t && !seen.has(t)) {
      seen.add(t);
      out.push(t);
      if (out.length >= limit) break;
    }
  }
  return out;
}

/* ───────────── defaults ───────────── */

export function initialDraft(opts: { user: User; client?: Client; now: Date }): Draft {
  const { user, client, now } = opts;
  const first = dateKey(nextWorkingDay(now));
  return {
    clientId: client?.id ?? "",
    siteId: client && client.siteIds.length === 1 ? client.siteIds[0] : "",
    contactName: client?.contactName ?? "",
    contactPhone: client?.contactPhone ?? "",
    commercialRef: "",
    priority: "normal",
    serviceTypeId: "",
    title: "",
    titleEdited: false,
    activities: [],
    customActivities: [],
    materials: {},
    specialInstructions: "",
    supervisorId: user.role === "supervisor" ? user.id : "",
    days: makeDays([first], DEFAULT_START, 8),
    timesEdited: false,
    workerIds: [],
    authorized: false,
  };
}

export const suggestedTitle = (service?: ServiceType, siteName?: string) =>
  service ? `${service.name}${siteName ? ` · ${siteName}` : ""}` : "";

/* ───────────── validation ───────────── */

export type Issues = { errors: Record<string, string>; warnings: Record<string, string>; first?: string };

const REF_PATTERN = /^[A-Z]{2,5}-\d{4}-\d{2,6}$/;
export const normalizeRef = (s: string) => s.trim().toUpperCase().replace(/\s+/g, "");

/**
 * `duplicateRef`: another (non-cancelled) order already uses this commercial reference. `folio` is only present when that
 * order is inside the creator's scope (doc §2); otherwise the warning never names it.
 */
type Ctx = { today: string; title: string; duplicateRef?: { folio?: string } };

export function validateStep(step: number, d: Draft, ctx: Ctx): Issues {
  const errors: Record<string, string> = {};
  const warnings: Record<string, string> = {};

  if (step === 0) {
    if (!d.clientId) errors.client = "Elija el cliente del servicio";
    else if (!d.siteId) errors.site = "Elija el sitio donde se hará el trabajo";
    if (!d.contactName.trim()) errors.contactName = "Indique quién recibe a la cuadrilla";
    const digits = d.contactPhone.replace(/\D/g, "");
    if (!digits) errors.contactPhone = "Indique el teléfono del contacto en sitio";
    else if (digits.length < 10) errors.contactPhone = "El teléfono debe tener al menos 10 dígitos";
    const ref = normalizeRef(d.commercialRef);
    if (!ref) errors.commercialRef = "La referencia del sistema comercial es obligatoria";
    else if (ref.length < 5) errors.commercialRef = "La referencia debe tener al menos 5 caracteres";
    else if (!REF_PATTERN.test(ref)) warnings.commercialRef = "Formato habitual: COT-2026-1187";
    if (ref && ctx.duplicateRef)
      warnings.commercialRefDup = ctx.duplicateRef.folio
        ? `Ya existe la orden ${ctx.duplicateRef.folio} con esta referencia`
        : "Ya existe una orden con esta referencia (fuera de su alcance)";
  }

  if (step === 1) {
    if (!d.serviceTypeId) errors.service = "Elija el tipo de servicio";
    if (ctx.title.trim().length < 4) errors.title = "Escriba un título descriptivo";
    // The suggested title (service · site) can be longer than the server stores.
    else if (ctx.title.trim().length > TEXT_LIMITS.orderTitle.max) errors.title = `El título admite hasta ${TEXT_LIMITS.orderTitle.max} caracteres: acórtelo`;
    if (d.serviceTypeId && d.activities.length === 0) errors.activities = "Seleccione al menos una actividad";
  }

  if (step === 2) {
    if (!d.supervisorId) errors.supervisor = "Asigne un supervisor";
    if (d.days.length === 0) errors.days = "Agregue al menos una jornada";
    const seen = new Map<string, number>();
    d.days.forEach((day) => seen.set(day.date, (seen.get(day.date) ?? 0) + 1));
    for (const day of d.days) {
      const k = `day:${day.id}`;
      if (!day.date) errors[k] = "Elija la fecha";
      else if (day.date < ctx.today) errors[k] = "La fecha ya pasó: elija hoy o un día posterior";
      else if ((seen.get(day.date) ?? 0) > 1) errors[k] = "Ya hay otra jornada ese día: elija otra fecha";
      else if (!day.start || !day.end) errors[k] = "Indique el horario";
      else if (toMinutes(day.end) <= toMinutes(day.start)) errors[k] = "La salida debe ser después de la entrada";
      else if (isSundayKey(day.date)) warnings[k] = "Domingo: confirme el acceso con el cliente";
      else if (dayMinutes(day) > 12 * 60) warnings[k] = "Jornada de más de 12 h";
    }
  }

  if (step === 3) {
    if (!d.authorized) errors.authorized = "Marque la casilla para confirmar que el trabajo está autorizado";
  }

  return { errors, warnings, first: Object.values(errors)[0] };
}

export function toInput(d: Draft, title: string, canAssign: boolean): NewOrderInput {
  return {
    clientId: d.clientId,
    siteId: d.siteId,
    serviceTypeId: d.serviceTypeId,
    supervisorId: d.supervisorId,
    title: title.trim(),
    activities: d.activities,
    materials: Object.entries(d.materials)
      .filter(([, qty]) => qty > 0)
      .map(([materialId, qty]) => ({ materialId, qty })),
    specialInstructions: d.specialInstructions.trim(),
    siteContact: { name: d.contactName.trim(), phone: d.contactPhone.trim() },
    commercialRef: normalizeRef(d.commercialRef),
    priority: d.priority,
    days: d.days.map(({ date, start, end }) => ({ date, start, end })),
    workerIds: canAssign ? d.workerIds : [],
  };
}

/** Same rule the store applies in createOrder(): jornadas + crew → Programada, else Borrador. */
export const willBeScheduled = (d: Draft, canAssign: boolean) => d.days.length > 0 && canAssign && d.workerIds.length > 0;

/**
 * Predicts the folio the store will assign (max + 1). Shown as provisional. An account session cannot predict it: the server
 * assigns it when the order reaches it (until then the order shows "OS-PEND-…").
 */
export function provisionalFolio(orders: Order[], account = false) {
  if (account) return "OS-PEND";
  const max = orders.reduce((m, o) => Math.max(m, parseInt(o.folio.split("-")[1] ?? "0", 10) || 0), 0);
  return `OS-${String(max + 1).padStart(5, "0")}`;
}
