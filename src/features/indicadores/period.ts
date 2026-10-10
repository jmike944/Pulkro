/**
 * Period math for /indicadores (Mes · Trimestre · Año).
 *
 * Two windows per period:
 *  - plan  = [start, end]   → work *scheduled* in the period (funnel, "dónde está el trabajo").
 *  - real  = [start, until] → things that *happened* (closures, hours, incidents, surveys).
 *    `until` is clipped at "now" for the current period so nothing in the future is counted.
 * Comparisons use the previous period up to the same elapsed point (fair "al mismo día").
 */
import {
  eachDayOfInterval,
  eachMonthOfInterval,
  eachWeekOfInterval,
  endOfDay,
  endOfMonth,
  endOfQuarter,
  endOfWeek,
  endOfYear,
  format,
  startOfDay,
  startOfWeek,
  subDays,
  subWeeks,
} from "date-fns";
import { es } from "date-fns/locale";

export type Granularity = "mes" | "trimestre" | "anio";

/** index = month 0-11 (mes) · quarter 0-3 (trimestre) · 0 (año) */
export type Period = { g: Granularity; year: number; index: number };

export const GRANULARITIES: { value: Granularity; label: string }[] = [
  { value: "mes", label: "Mes" },
  { value: "trimestre", label: "Trimestre" },
  { value: "anio", label: "Año" },
];

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const MONTHS_SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const dayLabel = (dt: Date) => format(dt, "d MMM", { locale: es }).replace(".", "");

export function periodStart(p: Period): Date {
  if (p.g === "mes") return new Date(p.year, p.index, 1);
  if (p.g === "trimestre") return new Date(p.year, p.index * 3, 1);
  return new Date(p.year, 0, 1);
}

export function periodEnd(p: Period): Date {
  const s = periodStart(p);
  if (p.g === "mes") return endOfMonth(s);
  if (p.g === "trimestre") return endOfQuarter(s);
  return endOfYear(s);
}

export function periodOf(date: Date, g: Granularity): Period {
  if (g === "mes") return { g, year: date.getFullYear(), index: date.getMonth() };
  if (g === "trimestre") return { g, year: date.getFullYear(), index: Math.floor(date.getMonth() / 3) };
  return { g, year: date.getFullYear(), index: 0 };
}

/** Move a period by n steps of its own granularity. */
export function shiftPeriod(p: Period, n: number): Period {
  if (p.g === "anio") return { ...p, year: p.year + n };
  const size = p.g === "mes" ? 12 : 4;
  const abs = p.year * size + p.index + n;
  return { g: p.g, year: Math.floor(abs / size), index: ((abs % size) + size) % size };
}

/** Re-anchor a period to another granularity, keeping the most recent day it covers. */
export function convertPeriod(p: Period, g: Granularity, now: Date): Period {
  const end = periodEnd(p);
  return periodOf(end > now ? now : end, g);
}

export const samePeriod = (a: Period, b: Period) => a.g === b.g && a.year === b.year && a.index === b.index;

/* ───────────── url keys ("2026-10" · "2026-T4" · "2026") ───────────── */

export function periodKey(p: Period): string {
  if (p.g === "mes") return `${p.year}-${String(p.index + 1).padStart(2, "0")}`;
  if (p.g === "trimestre") return `${p.year}-T${p.index + 1}`;
  return String(p.year);
}

export function parsePeriodKey(g: Granularity, key: string | null): Period | null {
  if (!key) return null;
  if (g === "mes") {
    const m = /^(\d{4})-(\d{2})$/.exec(key);
    if (!m) return null;
    const month = Number(m[2]) - 1;
    return month >= 0 && month < 12 ? { g, year: Number(m[1]), index: month } : null;
  }
  if (g === "trimestre") {
    const m = /^(\d{4})-T([1-4])$/.exec(key);
    return m ? { g, year: Number(m[1]), index: Number(m[2]) - 1 } : null;
  }
  const m = /^(\d{4})$/.exec(key);
  return m ? { g, year: Number(m[1]), index: 0 } : null;
}

export function isGranularity(v: string | null): v is Granularity {
  return v === "mes" || v === "trimestre" || v === "anio";
}

/* ───────────── labels ───────────── */

/** "Octubre 2026" · "T4 2026" · "2026" */
export function periodLabel(p: Period): string {
  if (p.g === "mes") return `${cap(MONTHS[p.index])} ${p.year}`;
  if (p.g === "trimestre") return `T${p.index + 1} ${p.year}`;
  return String(p.year);
}

/** Secondary label for menus: "1 – 31 oct" · "oct – dic" · "ene – dic". */
export function periodRangeLabel(p: Period): string {
  if (p.g === "mes") return `1 – ${periodEnd(p).getDate()} ${MONTHS_SHORT[p.index]}`;
  if (p.g === "trimestre") return `${MONTHS_SHORT[p.index * 3]} – ${MONTHS_SHORT[p.index * 3 + 2]}`;
  return "ene – dic";
}

/** For sentences: "octubre" · "octubre de 2025" · "el T4" · "2026". */
export function periodPhrase(p: Period, now: Date): string {
  const sameYear = p.year === now.getFullYear();
  if (p.g === "mes") return sameYear ? MONTHS[p.index] : `${MONTHS[p.index]} de ${p.year}`;
  if (p.g === "trimestre") return sameYear ? `el T${p.index + 1}` : `el T${p.index + 1} de ${p.year}`;
  return String(p.year);
}

/** Short label for comparisons: "septiembre" · "T3" · "2025". */
export function periodShort(p: Period): string {
  if (p.g === "mes") return MONTHS[p.index];
  if (p.g === "trimestre") return `T${p.index + 1}`;
  return String(p.year);
}

/** Every selectable period from the first one with data up to the current one, newest first. */
export function periodOptions(g: Granularity, earliest: Date, now: Date): Period[] {
  const first = periodOf(earliest > now ? now : earliest, g);
  const out: Period[] = [];
  let p = periodOf(now, g);
  for (let guard = 0; guard < 240; guard++) {
    out.push(p);
    if (samePeriod(p, first)) break;
    p = shiftPeriod(p, -1);
  }
  return out;
}

/* ───────────── window ───────────── */

export type PeriodWindow = {
  period: Period;
  start: Date;
  end: Date;
  /** min(end, now) — cutoff for realized metrics */
  until: Date;
  isCurrent: boolean;
  label: string;
  phrase: string;
  /** "al 9 oct" when the period is still running, otherwise the range */
  cutoffLabel: string;
  prev: { period: Period; start: Date; until: Date; short: string; label: string };
};

export function periodWindow(p: Period, now: Date): PeriodWindow {
  const start = periodStart(p);
  const end = periodEnd(p);
  const isCurrent = now >= start && now <= end;
  const until = isCurrent ? now : end;
  const prevP = shiftPeriod(p, -1);
  const prevStart = periodStart(prevP);
  const prevEnd = periodEnd(prevP);
  const sameElapsed = new Date(prevStart.getTime() + (until.getTime() - start.getTime()));
  const prevUntil = isCurrent && sameElapsed < prevEnd ? sameElapsed : prevEnd;
  return {
    period: p,
    start,
    end,
    until,
    isCurrent,
    label: periodLabel(p),
    phrase: periodPhrase(p, now),
    cutoffLabel: isCurrent ? `al ${dayLabel(now)}` : periodRangeLabel(p),
    prev: { period: prevP, start: prevStart, until: prevUntil, short: periodShort(prevP), label: periodLabel(prevP) },
  };
}

/* ───────────── chart buckets (§5: servicios por día / semana / mes) ───────────── */

export type Bucket = {
  key: string;
  label: string;
  tip: string;
  start: Date;
  end: Date;
  /** false = context bar before the period starts (drawn muted, excluded from averages) */
  inPeriod: boolean;
  isNow: boolean;
};

export type BucketSet = { unit: "día" | "semana" | "mes"; title: string; buckets: Bucket[] };

export function chartBuckets(win: PeriodWindow, now: Date): BucketSet {
  const g = win.period.g;

  if (g === "mes") {
    // Whole month, padded back to 30 days of context while the month is young.
    const last = startOfDay(win.until);
    const from = subDays(last, 29) < win.start ? subDays(last, 29) : win.start;
    const today = format(now, "yyyy-MM-dd");
    const buckets = eachDayOfInterval({ start: from, end: last }).map((day) => ({
      key: format(day, "yyyy-MM-dd"),
      label: format(day, "d"),
      tip: format(day, "EEE d MMM", { locale: es }).replace(".", ""),
      start: day,
      end: endOfDay(day),
      inPeriod: day >= win.start,
      isNow: format(day, "yyyy-MM-dd") === today,
    }));
    return { unit: "día", title: "Servicios por día", buckets };
  }

  if (g === "trimestre") {
    // Weeks of the quarter, padded back to 13 weeks of context while the quarter is young.
    const lastWeek = startOfWeek(win.until, { weekStartsOn: 1 });
    const contextFrom = subWeeks(lastWeek, 12);
    const firstWeek = startOfWeek(win.start, { weekStartsOn: 1 });
    const from = contextFrom < firstWeek ? contextFrom : firstWeek;
    const buckets = eachWeekOfInterval({ start: from, end: win.until }, { weekStartsOn: 1 }).map((wk) => {
      const weekEnd = endOfWeek(wk, { weekStartsOn: 1 });
      const inPeriod = weekEnd >= win.start;
      // The week that straddles the quarter start only counts days inside the quarter.
      const s = inPeriod && wk < win.start ? win.start : wk;
      const e = weekEnd > win.until ? win.until : weekEnd;
      return {
        key: format(s, "yyyy-MM-dd"),
        label: dayLabel(s),
        tip: `Semana del ${dayLabel(s)}`,
        start: s,
        end: e,
        inPeriod,
        isNow: now >= wk && now <= weekEnd,
      };
    });
    return { unit: "semana", title: "Servicios por semana", buckets };
  }

  const buckets = eachMonthOfInterval({ start: win.start, end: win.until }).map((m) => {
    const e = endOfMonth(m);
    return {
      key: format(m, "yyyy-MM"),
      label: cap(MONTHS_SHORT[m.getMonth()]),
      tip: `${cap(MONTHS[m.getMonth()])} ${m.getFullYear()}`,
      start: m,
      end: e > win.until ? win.until : e,
      inPeriod: true,
      isNow: now >= m && now <= e,
    };
  });
  return { unit: "mes", title: "Servicios por mes", buckets };
}
