import {
  differenceInCalendarDays,
  differenceInMinutes,
  format,
  formatDistanceToNowStrict,
  isToday,
  isTomorrow,
  isYesterday,
  parseISO,
} from "date-fns";
import { es } from "date-fns/locale";

export const d = (iso: string | Date) => (typeof iso === "string" ? parseISO(iso) : iso);

/** "9 oct" */
export const fmtDay = (iso: string | Date) => format(d(iso), "d MMM", { locale: es }).replace(".", "");
/** "9 oct 2026" */
export const fmtDate = (iso: string | Date) => format(d(iso), "d MMM yyyy", { locale: es }).replace(".", "");
/** "jueves 9 de octubre" */
export const fmtLongDay = (iso: string | Date) => format(d(iso), "EEEE d 'de' MMMM", { locale: es });
/** "08:14" */
export const fmtTime = (iso: string | Date) => format(d(iso), "HH:mm");
/** "9 oct, 08:14" */
export const fmtDateTime = (iso: string | Date) =>
  `${fmtDay(iso)}, ${fmtTime(iso)}`;
/** "OCT" */
export const fmtMonthShort = (iso: string | Date) =>
  format(d(iso), "MMM", { locale: es }).replace(".", "").toUpperCase();
/** "Octubre" */
export const fmtMonthLong = (iso: string | Date) => {
  const m = format(d(iso), "MMMM", { locale: es });
  return m.charAt(0).toUpperCase() + m.slice(1);
};

/** "Hoy", "Mañana", "Ayer", or "9 oct" */
export function fmtRelativeDay(iso: string | Date) {
  const date = d(iso);
  if (isToday(date)) return "Hoy";
  if (isTomorrow(date)) return "Mañana";
  if (isYesterday(date)) return "Ayer";
  return fmtDay(date);
}

/** "hace 4 min" */
export const fmtAgo = (iso: string | Date) => {
  const date = d(iso);
  const dist = formatDistanceToNowStrict(date, { locale: es });
  return date.getTime() > Date.now() + 30_000 ? `en ${dist}` : `hace ${dist}`;
};

/** "3 días" / "1 día" / "hoy" — calendar days from today to date (negative = overdue). */
export function daysUntil(iso: string | Date) {
  return differenceInCalendarDays(d(iso), new Date());
}

export function fmtDaysLeft(iso: string | Date) {
  const n = daysUntil(iso);
  if (n === 0) return "hoy";
  if (n === 1) return "1 día";
  if (n > 1) return `${n} días`;
  if (n === -1) return "vencido 1 día";
  return `vencido ${Math.abs(n)} días`;
}

/** Minutes → "4 h 30 min" / "45 min" */
export function fmtDuration(minutes: number) {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r} min`;
  if (r === 0) return `${h} h`;
  return `${h} h ${r} min`;
}

/** Hours with one decimal "4.5 h" */
export const fmtHours = (minutes: number) => `${(minutes / 60).toFixed(1).replace(/\.0$/, "")} h`;

export const minutesBetween = (a: string, b: string) => differenceInMinutes(d(b), d(a));

const nf = new Intl.NumberFormat("es-MX");
export const fmtNum = (n: number) => nf.format(n);
export const fmtPct = (n: number, digits = 0) => `${(n * 100).toFixed(digits)}%`;
export const fmtMXN = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n);

/** Coordinates "25.6866, -100.3161" */
export const fmtCoords = (lat: number, lng: number) => `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

/** Greeting by local hour. */
export function greeting(date = new Date()) {
  const h = date.getHours();
  if (h < 12) return "Buenos días";
  if (h < 19) return "Buenas tardes";
  return "Buenas noches";
}

export const firstName = (name: string) => name.split(" ")[0];

export const plural = (n: number, one: string, many: string) => `${fmtNum(n)} ${n === 1 ? one : many}`;
