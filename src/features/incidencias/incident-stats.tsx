"use client";

import { cn } from "@/lib/utils";
import { fmtNum, plural } from "@/lib/format";
import { toneDot, type Tone } from "@/lib/status";
import { AnimatedNumber, BarList, Insight } from "@/components/pk/bits";
import { StatusDot } from "@/components/pk/status";
import { EmptyState } from "@/components/pk/feedback";
import { lagParts } from "@/features/evidencias/evidence-data";
import { ShieldCheck, TriangleAlert } from "lucide-react";
import type { incidentStats } from "./incident-data";

type Stats = ReturnType<typeof incidentStats>;

/** Dividers for a 2×2 (phones, lg) / 4-across (sm–md, 2xl) counter grid. */
const CELL = [
  "pr-4 sm:pr-6",
  "border-l border-hairline pl-4 sm:px-6",
  "pr-4 sm:border-l sm:border-hairline sm:px-6 lg:border-l-0 lg:pl-0 2xl:border-l 2xl:pl-6",
  "border-l border-hairline pl-4 sm:pl-6",
];

/** Four counters + "Por tipo" bars (no aurora hero on this page). */
export function IncidentStats({
  stats,
  byType,
  year,
  yearCount,
}: {
  stats: Stats;
  byType: { label: string; count: number; pct: number }[];
  year: number;
  yearCount: number;
}) {
  const res = lagParts(stats.avgResolutionMinutes);
  const top = byType[0];
  return (
    <section className="grid gap-10 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:gap-0">
      <div className="min-w-0 lg:border-r lg:border-hairline lg:pr-10">
        <div className="grid grid-cols-2 gap-y-8 sm:grid-cols-4 lg:grid-cols-2 2xl:grid-cols-4">
          <Counter className={CELL[0]} tone="red" label="Abiertas" value={stats.open} sub={stats.highOpen ? `${fmtNum(stats.highOpen)} de severidad alta` : "ninguna de severidad alta"} />
          <Counter
            className={CELL[1]}
            tone="amber"
            label="Bloquean cierre"
            value={stats.blocking}
            sub={
              stats.blocking ? (
                <span className="inline-flex items-center gap-1.5 font-medium text-st-red">
                  <StatusDot tone="red" live /> {plural(stats.blockingOrders, "orden detenida", "órdenes detenidas")}
                </span>
              ) : (
                "ninguna orden detenida"
              )
            }
          />
          <Counter className={CELL[2]} tone="teal" label="Resueltas 30 días" value={stats.resolved30} sub={`de ${fmtNum(stats.created30)} registradas`} />
          <Counter
            className={CELL[3]}
            tone="blue"
            label="Tiempo medio"
            value={stats.resolutionSamples ? res.value : 0}
            unit={stats.resolutionSamples ? res.unit : undefined}
            decimals={1}
            sub={stats.resolutionSamples ? "de resolución · últimos 90 días" : "sin resoluciones en 90 días"}
          />
        </div>
        <Insight icon={top && top.count ? <TriangleAlert /> : <ShieldCheck />} className="mt-8">
          {top && top.count ? (
            <>
              La causa más frecuente en {year} es <b className="font-semibold">{top.label.toLowerCase()}</b>: {Math.round(top.pct * 100)}% de{" "}
              {plural(yearCount, "incidencia", "incidencias")}. Registrarla con foto en el momento acelera su resolución.
            </>
          ) : (
            <>Sin incidencias registradas en {year}.</>
          )}
        </Insight>
      </div>

      <div className="min-w-0 lg:pl-10">
        <div className="mb-1 flex items-start justify-between gap-4">
          <h2 className="text-[19px] font-medium tracking-[-0.01em] text-ink">Por tipo</h2>
        </div>
        <p className="mb-6 text-[13.5px] text-subtle">
          {plural(yearCount, "incidencia", "incidencias")} · {year}
        </p>
        {byType.length ? (
          <BarList items={byType.map((b) => ({ label: b.label, value: b.count, pct: b.pct }))} />
        ) : (
          <EmptyState icon={<ShieldCheck />} title="Sin registros" className="py-8" />
        )}
      </div>
    </section>
  );
}

function Counter({
  label,
  value,
  sub,
  tone,
  unit,
  decimals = 0,
  className,
}: {
  label: string;
  value: number;
  sub: React.ReactNode;
  tone: Tone;
  unit?: string;
  decimals?: number;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className="mb-2.5 flex items-center gap-2 text-[13px] text-subtle sm:text-[14px]">
        <span className={cn("size-[6px] shrink-0 rounded-full", toneDot[tone])} />
        <span className="truncate">{label}</span>
      </p>
      <span className="flex items-baseline gap-1.5">
        <AnimatedNumber
          value={value}
          format={{ maximumFractionDigits: decimals }}
          className="text-[34px] font-medium leading-none tracking-[-0.04em] text-ink sm:text-[40px]"
        />
        {unit && <span className="text-[15px] text-subtle">{unit}</span>}
      </span>
      <span className="mt-2 block text-[12.5px] leading-snug text-subtle sm:text-[13.5px]">{sub}</span>
    </div>
  );
}
