/**
 * Post-sale helpers (doc §4.4): pure functions shared by /postventa, the case detail,
 * the public survey and the client pages. No React here.
 */
import { getMonth, getYear, isWithinInterval, parseISO, subDays } from "date-fns";
import {
  CircleHelp,
  Clock,
  ClipboardX,
  Hammer,
  Receipt,
  Sparkles,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { daysUntil, firstName } from "@/lib/format";
import { CASE_CATEGORY } from "@/lib/status";
import type { CaseCategory, CaseStatus, Order, PostSaleCase, ShareChannel, Survey, User } from "@/lib/types";

export const MONTHS_SHORT = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
export const MONTHS_LONG = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

/** Board order of a case's lifecycle. */
export const CASE_FLOW: CaseStatus[] = ["abierto", "en_proceso", "resuelto", "cerrado"];

export const CASE_CATEGORY_ICON: Record<CaseCategory, LucideIcon> = {
  calidad: Sparkles,
  puntualidad: Clock,
  personal: UserRound,
  danos: Hammer,
  faltante: ClipboardX,
  facturacion: Receipt,
  otro: CircleHelp,
};

/** Survey "channel" as staff understand it (descarga = link copied / QR shown on site). */
export const SURVEY_CHANNEL_LABEL: Record<ShareChannel, string> = {
  whatsapp: "WhatsApp",
  email: "Correo",
  descarga: "Enlace / QR",
};

export const RATING_LABELS = ["Malo", "Regular", "Bueno", "Muy bueno", "Excelente"] as const;

export const isCaseOpen = (c: Pick<PostSaleCase, "status">) => c.status === "abierto" || c.status === "en_proceso";

/** Open case whose commitment date already passed. */
export const isCaseOverdue = (c: Pick<PostSaleCase, "status" | "dueDate">) => isCaseOpen(c) && daysUntil(c.dueDate) < 0;

/** Who may own a case: Administración + supervisores of the order's unit (doc §4.4 "responsable"). */
export function caseOwnerCandidates(users: User[], unitId: string) {
  return users
    .filter((u) => u.active && u.unitId === unitId && (u.role === "administracion" || u.role === "supervisor"))
    .sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name) : a.role === "administracion" ? -1 : 1));
}

/** Public survey link — only call in the browser (event handlers, open dialogs). */
export function surveyUrl(token: string) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/encuesta/${token}`;
}

/** WhatsApp / mail body for a survey invitation. Never claims delivery. */
export function surveyMessage(opts: { contactName?: string; folio: string; title: string; url: string }) {
  const hello = opts.contactName ? `Hola ${firstName(opts.contactName.replace(/^(Lic|Ing|Dra?|Mtra?|Adm|Cap)\.\s*/i, ""))}` : "Hola";
  return `${hello}, le saluda Pulkro. Gracias por confiar en nosotros para el servicio ${opts.folio} (${opts.title}). ¿Nos regala un minuto para calificarlo? ${opts.url}`;
}

/** Phone to reach the client about an order: site contact first, then the client's main contact. */
export function contactFor(order: Pick<Order, "siteContact">, client?: { contactName: string; contactPhone: string }) {
  if (order.siteContact.phone) return { name: order.siteContact.name, phone: order.siteContact.phone };
  return { name: client?.contactName ?? "", phone: client?.contactPhone ?? "" };
}

/** Lower-case a channel label for running text, keeping brand names ("WhatsApp"). */
export const channelText = (label: string) => (label === "WhatsApp" ? label : label.toLowerCase());

export const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** Average overall rating of answered surveys (0 when none). */
export const csatOf = (surveys: Survey[]) => avg(surveys.filter((s) => s.answers).map((s) => s.answers!.overall));

/** CSAT + response count per month of the current year (up to the current month). */
export function csatByMonth(surveys: Survey[], now: Date) {
  const year = getYear(now);
  const upto = getMonth(now);
  return MONTHS_SHORT.slice(0, upto + 1).map((label, m) => {
    const answered = surveys.filter((s) => {
      if (!s.answers || !s.respondedAt) return false;
      const d = parseISO(s.respondedAt);
      return getYear(d) === year && getMonth(d) === m;
    });
    return { label, key: `m${m}`, value: Math.round(csatOf(answered) * 10) / 10, count: answered.length };
  });
}

/** Cases opened per month of the current year. */
export function casesByMonth(cases: PostSaleCase[], now: Date) {
  const year = getYear(now);
  const upto = getMonth(now);
  return MONTHS_SHORT.slice(0, upto + 1).map((label, m) => ({
    label,
    key: `c${m}`,
    value: cases.filter((c) => {
      const d = parseISO(c.createdAt);
      return getYear(d) === year && getMonth(d) === m;
    }).length,
  }));
}

export function inLastDays(iso: string | undefined, days: number, now: Date) {
  if (!iso) return false;
  return isWithinInterval(parseISO(iso), { start: subDays(now, days), end: now });
}

/** "Por qué se quejan": categories with counts, most frequent first (zero rows dropped). */
export function casesByCategory(cases: PostSaleCase[]) {
  const total = cases.length || 1;
  const counts = new Map<CaseCategory, number>();
  cases.forEach((c) => counts.set(c.category, (counts.get(c.category) ?? 0) + 1));
  return (Object.keys(CASE_CATEGORY) as CaseCategory[])
    .map((category) => ({ category, label: CASE_CATEGORY[category], value: counts.get(category) ?? 0, pct: (counts.get(category) ?? 0) / total }))
    .filter((x) => x.value > 0)
    .sort((a, b) => b.value - a.value);
}

/** NPS bucket for coloring chips and copy. */
export function npsGroup(n: number): "detractor" | "pasivo" | "promotor" {
  if (n >= 9) return "promotor";
  if (n >= 7) return "pasivo";
  return "detractor";
}
