import { differenceInMinutes, format } from "date-fns";
import { es } from "date-fns/locale";
import { d, fmtTime } from "@/lib/format";
import type { Conformity, GeoStamp, Jornada } from "@/lib/types";

/** "jue 9 oct" */
export const fmtWeekdayDay = (iso: string | Date) => format(d(iso), "EEE d MMM", { locale: es }).replace(/\./g, "");

/** "07:00–16:00" */
export const fmtTimeRange = (a: string, b: string) => `${fmtTime(a)}–${fmtTime(b)}`;

/** "07:06:12" */
export const fmtSeconds = (iso: string) => format(d(iso), "HH:mm:ss");

/** "HH:mm" for <input type="time"> */
export const toTimeInput = (iso: string) => format(d(iso), "HH:mm");

/** Planned minutes of one jornada. */
export const jornadaPlanned = (j: Jornada) => Math.max(0, differenceInMinutes(d(j.plannedEnd), d(j.plannedStart)));

/** "Jornada 2 · jue 9 oct" */
export const jornadaTitle = (j: Jornada) => `Jornada ${j.dayIndex} · ${fmtWeekdayDay(j.date)}`;

export const CONFORMITY_LABEL: Record<Conformity["method"], string> = {
  firma: "Firma en el dispositivo",
  verbal: "Verbal",
  correo: "Por correo",
};

export const JORNADA_STATUS: Record<Jornada["status"], { label: string; tone: "slate" | "blue" | "teal" }> = {
  pendiente: { label: "Pendiente", tone: "slate" },
  en_curso: { label: "En curso", tone: "blue" },
  cerrada: { label: "Cerrada", tone: "teal" },
};

/** Short GPS description: "GPS ±8 m" or "Manual". */
export const stampSource = (s: GeoStamp) => (s.source === "manual" ? "Ubicación manual" : `GPS ±${Math.round(s.accuracy)} m`);

/** Hours with one decimal as a number (for animated counters). */
export const toHours = (minutes: number) => Math.round((minutes / 60) * 10) / 10;

/** Signed minutes diff label: "+20 min", "−1 h 5 min". */
export function fmtDiff(minutes: number) {
  const m = Math.round(minutes);
  if (m === 0) return "En plan";
  const abs = Math.abs(m);
  const h = Math.floor(abs / 60);
  const r = abs % 60;
  const body = h === 0 ? `${r} min` : r === 0 ? `${h} h` : `${h} h ${r} min`;
  return `${m > 0 ? "+" : "−"}${body}`;
}

/** Drop missing lookups: `compact(ids.map((id) => map.get(id)))`. */
export const compact = <T,>(xs: (T | undefined | null)[]) => xs.filter((x): x is T => x != null);

/** "Ana, Luis y Marco" / "Ana, Luis, Marco y 2 más": first names, spelled out (touch has no avatar hover). */
export function crewNames(crew: { name: string }[], max = 3) {
  const names = crew.map((w) => w.name.split(" ")[0]);
  const rest = names.length > max + 1 ? names.length - max : 0; // never "y 1 más"
  const shown = rest ? names.slice(0, max) : names;
  const tail = rest ? `${rest} más` : (shown.pop() ?? "");
  if (!shown.length) return tail;
  const conj = !rest && /^h?[ií](?![aeou])/i.test(tail) ? "e" : "y"; // "Ana e Irma"
  return `${shown.join(", ")} ${conj} ${tail}`;
}
