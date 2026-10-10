import { differenceInCalendarDays, parseISO } from "date-fns";
import { CalendarClock, Camera, ClipboardCheck, FileText, MessageSquareHeart, Send, TriangleAlert, Users, type LucideIcon } from "lucide-react";
import { fmtAgo, fmtTime, fmtNum } from "@/lib/format";
import { toneHex, toneSoftBg, toneText, type Tone } from "@/lib/status";
import { PENDING_GROUPS, type PendingItem, type PendingKind } from "./use-pending-items";

export const KIND_ICON: Record<PendingKind, LucideIcon> = {
  incidencia: TriangleAlert,
  cierre: ClipboardCheck,
  evidencia: Camera,
  entrada: CalendarClock,
  reporte: FileText,
  asignar: Users,
  caso: MessageSquareHeart,
  encuesta: Send,
};

export const KIND_LABEL: Record<PendingKind, string> = Object.fromEntries(PENDING_GROUPS.map((g) => [g.kind, g.label])) as Record<PendingKind, string>;
export const KIND_TONE: Record<PendingKind, Tone> = Object.fromEntries(PENDING_GROUPS.map((g) => [g.kind, g.tone])) as Record<PendingKind, Tone>;
export const kindHex = (k: PendingKind) => toneHex[KIND_TONE[k]];

/** Soft tinted tile classes for a tone (the house recipe: pale fill + tone text). */
export const tileTone = (t: Tone) => `${toneSoftBg[t]} ${toneText[t]}`;

/** One-word label for chips and the hero legend. */
export const KIND_SHORT: Record<PendingKind, string> = {
  incidencia: "Incidencias",
  cierre: "Cierres",
  evidencia: "Evidencia",
  entrada: "Entradas",
  reporte: "Reportes",
  asignar: "Por asignar",
  caso: "Postventa",
  encuesta: "Encuestas",
};

/** What a single item is, for the lead card. */
export const KIND_SINGULAR: Record<PendingKind, string> = {
  incidencia: "Incidencia abierta",
  cierre: "Lista para cierre",
  evidencia: "Evidencia faltante",
  entrada: "Entrada de hoy",
  reporte: "Reporte por compartir",
  asignar: "Por asignar",
  caso: "Caso postventa",
  encuesta: "Encuesta por enviar",
};

export type When = {
  text: string;
  /** late = past its deadline · soon = due today/tomorrow or waiting for days · calm = nothing to flag */
  level: "late" | "soon" | "calm";
};

const DAY_MS = 86_400_000;
const days = (n: number) => `${n} ${n === 1 ? "día" : "días"}`;

/** What the clock says about an item: a due date counts down, everything else counts how long it has waited. */
export function whenOf(it: PendingItem, now: Date): When {
  if (it.due && it.kind === "caso") {
    const n = differenceInCalendarDays(parseISO(it.due), now);
    if (n < 0) return { text: `Vencido hace ${days(-n)}`, level: "late" };
    if (n === 0) return { text: "Vence hoy", level: "soon" };
    if (n === 1) return { text: "Vence mañana", level: "soon" };
    return { text: `Vence en ${days(n)}`, level: "calm" };
  }
  if (it.kind === "entrada" && it.due) {
    // planned start today
    const start = parseISO(it.due);
    if (start.getTime() < now.getTime() - 30_000) return { text: `Debió iniciar a las ${fmtTime(start)}`, level: "late" };
    return { text: `A las ${fmtTime(start)}, ${fmtAgo(start)}`, level: "soon" };
  }
  const waited = now.getTime() - parseISO(it.at).getTime();
  const text = fmtAgo(it.at);
  return { text: text.charAt(0).toUpperCase() + text.slice(1), level: waited >= 3 * DAY_MS ? "soon" : "calm" };
}

export const whenClass = (level: When["level"]) => (level === "late" ? "font-medium text-red-fg" : level === "soon" ? "font-medium text-amber-fg" : "text-subtle");

/** Oldest-first detail for the "Por tipo" list: a due date for cases, the first start for entradas, otherwise how long the oldest has waited. */
export function oldestNote(kind: PendingKind, items: PendingItem[], now: Date): string {
  if (!items.length) return "";
  if (kind === "caso") {
    const w = whenOf(items[0], now).text;
    return `Primero: ${w.charAt(0).toLowerCase()}${w.slice(1)}`;
  }
  if (kind === "entrada") return `Primera a las ${fmtTime(items[0].at)}`;
  const oldest = items.reduce((a, b) => (a.at <= b.at ? a : b));
  const ago = fmtAgo(oldest.at);
  return items.length === 1 ? ago.charAt(0).toUpperCase() + ago.slice(1) : `La más antigua, ${ago}`;
}

/** One line under the lead item: why it matters, so the button needs no explanation. */
export function leadNote(it: PendingItem): string {
  switch (it.kind) {
    case "incidencia":
      return it.blocksClosure ? `Impide cerrar ${it.folio} hasta que se resuelva.` : "Registrar la solución para darla por resuelta.";
    case "evidencia":
      return `Sin esa foto no se puede validar el cierre de ${it.folio}.`;
    case "cierre":
      return "Jornadas y fotos ANTES y DESPUÉS completas. Al validar se genera el reporte.";
    case "entrada":
      return "Registrar la entrada con GPS al llegar al sitio.";
    case "reporte":
      return "Cierre validado: falta que el reporte llegue al cliente.";
    case "asignar":
      return "Aún sin cuadrilla ni fechas confirmadas.";
    case "caso":
      return "Queja o seguimiento abierto con el cliente.";
    case "encuesta":
      return "El reporte ya se envió: falta pedir la calificación del servicio.";
  }
}

export type QueueFacts = { n: number; blocking: number; ready: number };

/** The hero sentence. One voice, no partial emphasis: how many, what stops closures, what waits for validation. */
export function queueSentence(f: QueueFacts, scope: { mine: boolean; others: number }): string {
  const { n, blocking, ready } = f;
  const first = `${fmtNum(n)} ${n === 1 ? "pendiente" : "pendientes"}${scope.mine && scope.others > 0 ? " a su cargo" : ""}.`;
  const parts: string[] = [];
  if (blocking > 0) parts.push(blocking === 1 ? "1 impide cerrar una orden" : `${fmtNum(blocking)} impiden cerrar órdenes`);
  if (ready > 0) parts.push(`${fmtNum(ready)} ${ready === 1 ? "orden espera" : "órdenes esperan"} validación`);
  const second = parts.length ? `${parts.join(" y ")}.` : n === 1 ? "No frena el cierre de ninguna orden." : "Ninguno frena el cierre de una orden.";
  return `${first} ${second}`;
}
