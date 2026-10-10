/**
 * Reports hub (/reportes) derivations: one row per closed service, its latest version and
 * the last manual send attempt. Pure functions over scoped snapshot arrays.
 */
import { addWeeks, differenceInMinutes, isWithinInterval, parseISO, startOfWeek } from "date-fns";
import { fmtDay } from "@/lib/format";
import { stageDurations, weekRange } from "@/lib/metrics";
import type { Jornada, Order, Report, ShareAttempt, ShareChannel } from "@/lib/types";

export type HubStage = "por_generar" | "por_compartir" | "enviados";
export type HubTab = HubStage | "todos";

export const HUB_TABS: { value: HubTab; label: string; slug: string }[] = [
  { value: "por_generar", label: "Por generar", slug: "por-generar" },
  { value: "por_compartir", label: "Por compartir", slug: "por-compartir" },
  { value: "enviados", label: "Enviados", slug: "enviados" },
  { value: "todos", label: "Todos", slug: "todos" },
];

export type HubRow = {
  order: Order;
  latest?: Report;
  versions: number;
  lastShare?: ShareAttempt & { version: number };
  shareCount: number;
  stage: HubStage;
  /** closure date (falls back to the scheduled end) */
  date: string;
};

export function buildHubRows(orders: Order[], reports: Report[]): HubRow[] {
  const byOrder = new Map<string, Report[]>();
  reports.forEach((r) => byOrder.set(r.orderId, [...(byOrder.get(r.orderId) ?? []), r]));
  return orders
    .filter((o) => o.status !== "cancelada" && (o.closure || byOrder.has(o.id)))
    .map((o): HubRow => {
      const reps = [...(byOrder.get(o.id) ?? [])].sort((a, b) => b.version - a.version);
      const latest = reps[0];
      const shares = reps.flatMap((r) => r.shares.map((s) => ({ ...s, version: r.version }))).sort((a, b) => b.at.localeCompare(a.at));
      // Reopened after closure → the latest PDF is outdated and a new version is due (doc §8).
      const stage: HubStage = !latest || o.status === "reabierta" ? "por_generar" : latest.shares.length ? "enviados" : "por_compartir";
      return { order: o, latest, versions: reps.length, lastShare: shares[0], shareCount: shares.length, stage, date: o.closure?.validatedAt ?? o.scheduledEnd };
    });
}

/** Tab ordering: the longest-waiting work first; sent ones by most recent attempt. */
export function sortRows(rows: HubRow[], tab: HubTab) {
  const xs = [...rows];
  if (tab === "por_generar") return xs.sort((a, b) => a.date.localeCompare(b.date));
  if (tab === "por_compartir") return xs.sort((a, b) => (a.latest?.generatedAt ?? "").localeCompare(b.latest?.generatedAt ?? ""));
  if (tab === "enviados") return xs.sort((a, b) => (b.lastShare?.at ?? "").localeCompare(a.lastShare?.at ?? ""));
  return xs.sort((a, b) => b.date.localeCompare(a.date));
}

const inRange = (iso: string, start: Date, end: Date) => isWithinInterval(parseISO(iso), { start, end });

export function hubMetrics(orders: Order[], jornadas: Jornada[], reports: Report[], rows: HubRow[], now: Date) {
  const week = weekRange(now);
  const prevStart = addWeeks(week.start, -1);
  const prevEnd = addWeeks(week.end, -1);
  const thisWeek = reports.filter((r) => inRange(r.generatedAt, week.start, week.end)).length;
  const lastWeek = reports.filter((r) => inRange(r.generatedAt, prevStart, prevEnd)).length;

  const weekly = Array.from({ length: 6 }, (_, i) => {
    const start = startOfWeek(addWeeks(now, i - 5), { weekStartsOn: 1 });
    const end = addWeeks(start, 1);
    return {
      key: start.toISOString(),
      label: fmtDay(start),
      value: reports.filter((r) => {
        const t = parseISO(r.generatedAt);
        return t >= start && t < end;
      }).length,
    };
  });

  const shares = reports.flatMap((r) => r.shares);
  const channelCount = (c: ShareChannel) => shares.filter((s) => s.channel === c).length;
  const total = shares.length || 1;
  const channels = (["whatsapp", "email", "descarga"] as ShareChannel[])
    .map((c) => ({ channel: c, value: channelCount(c), pct: channelCount(c) / total }))
    .filter((c) => c.channel !== "descarga" || c.value > 0);

  // Cierre → envío (indicator from metrics) and its two halves: cierre → PDF, PDF → primer envío.
  const cierreEnvioDays = stageDurations(orders, jornadas, reports).stages.find((s) => s.key === "cierre_envio")?.days ?? 0;
  const toPdf: number[] = [];
  const toShare: number[] = [];
  const byOrder = new Map<string, Report[]>();
  reports.forEach((r) => byOrder.set(r.orderId, [...(byOrder.get(r.orderId) ?? []), r]));
  orders.forEach((o) => {
    const reps = byOrder.get(o.id);
    if (!o.closure || !reps?.length) return;
    const first = [...reps].sort((a, b) => a.version - b.version)[0];
    const firstShare = reps
      .flatMap((r) => r.shares)
      .map((s) => s.at)
      .sort()[0];
    // Same set for both halves (services with a send attempt), so they add up to cierre → envío.
    if (!firstShare) return;
    toPdf.push(Math.max(0, differenceInMinutes(parseISO(first.generatedAt), parseISO(o.closure.validatedAt))));
    toShare.push(Math.max(0, differenceInMinutes(parseISO(firstShare), parseISO(first.generatedAt))));
  });
  const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  const measured = orders.filter((o) => o.closure && byOrder.get(o.id)?.some((r) => r.shares.length)).length;

  const waiting = sortRows(
    rows.filter((r) => r.stage === "por_compartir"),
    "por_compartir",
  )[0];

  return {
    thisWeek,
    lastWeek,
    delta: lastWeek ? (thisWeek - lastWeek) / lastWeek : 0,
    weekly,
    channels,
    sharesTotal: shares.length,
    cierreEnvioMinutes: cierreEnvioDays * 24 * 60,
    toPdfMinutes: mean(toPdf),
    toShareMinutes: mean(toShare),
    measured,
    waiting,
    counts: {
      por_generar: rows.filter((r) => r.stage === "por_generar").length,
      por_compartir: rows.filter((r) => r.stage === "por_compartir").length,
      enviados: rows.filter((r) => r.stage === "enviados").length,
      todos: rows.length,
    } satisfies Record<HubTab, number>,
  };
}

export type HubMetrics = ReturnType<typeof hubMetrics>;
