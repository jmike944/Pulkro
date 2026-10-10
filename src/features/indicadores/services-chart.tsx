"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";
import { fmtNum, plural } from "@/lib/format";
import { AnimatedNumber, Panel } from "@/components/pk/bits";
import type { Indicators } from "./compute";
import type { PeriodWindow } from "./period";
import { CardHead, DeltaChip } from "./bits";

const HEIGHT = 184;

/** Phones: bars are ~6px wide, so a finger scrubs across the plot and the bucket under it is picked by x position. */
const pickBucket = (e: React.PointerEvent<HTMLDivElement>, count: number) => {
  const r = e.currentTarget.getBoundingClientRect();
  return Math.min(count - 1, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * count)));
};

/** §5 "Servicios por día/semana/mes": closures with a validated date, bucketed to the period. */
export function ServicesChart({ ind, win }: { ind: Indicators; win: PeriodWindow }) {
  const { data, avg, peak, unit, title } = ind.series;
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((b) => b.value));
  const every = data.length > 24 ? 5 : data.length > 12 ? 2 : 1;
  const padded = data.some((b) => !b.inPeriod);
  const subtitle =
    unit === "día"
      ? padded
        ? `Cierres validados · últimos 30 días ${win.cutoffLabel}`
        : `Cierres validados · cada día de ${win.phrase}`
      : unit === "semana"
        ? `Cierres validados · semanas de ${win.phrase}`
        : `Cierres validados · meses de ${win.phrase}`;

  return (
    <Panel className="print:break-inside-avoid">
      <CardHead title={title} subtitle={subtitle} className="flex-wrap">
        <div className="ml-auto flex items-center gap-3">
          <div className="text-right">
            <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-subtle">Terminados</p>
            <AnimatedNumber value={ind.closed.length} className="text-[30px] font-medium leading-none tracking-[-0.04em] text-ink" />
          </div>
          <DeltaChip delta={ind.closedDelta} label={ind.closedDelta === null ? `Sin datos de ${win.prev.short}` : `vs ${win.prev.short}`} />
        </div>
      </CardHead>

      {/* phones: the finger covers the floating tooltip, so the picked bar is read out above the plot */}
      <p className="mb-6 flex h-6 items-center text-[13.5px] text-subtle sm:hidden">
        {hover !== null && data[hover] ? (
          <span className="truncate">
            <b className="font-semibold text-ink tabular">{plural(data[hover].value, "servicio", "servicios")}</b> · {data[hover].tip}
            {!data[hover].inPeriod && " (fuera del periodo)"}
          </span>
        ) : (
          <span className="truncate">Toque o deslice sobre las barras</span>
        )}
      </p>

      <div className="relative" style={{ height: HEIGHT }}>
        {/* average guide */}
        {avg > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.9 }}
            className="pointer-events-none absolute inset-x-0 z-[1] border-t border-dashed border-[#9fb3c8] dark:border-faint"
            style={{ bottom: `${(avg / max) * 100}%` }}
          >
            <span className="absolute -top-[22px] right-0 rounded-md bg-surface/90 px-1.5 text-[11.5px] font-medium text-subtle tabular">
              prom. {avg.toFixed(1)} / {unit}
            </span>
          </motion.div>
        )}
        <div
          className="flex h-full touch-pan-y items-end gap-[3px] sm:gap-1.5"
          onMouseLeave={() => setHover(null)}
          // touch / pen only: the mouse keeps the per-bar hover below
          onPointerDown={(e) => e.pointerType !== "mouse" && setHover(pickBucket(e, data.length))}
          onPointerMove={(e) => e.pointerType !== "mouse" && setHover(pickBucket(e, data.length))}
        >
          {data.map((b, i) => {
            const h = b.value ? Math.max(0.05, b.value / max) : 0.025;
            const isPeak = !!peak && b.key === peak.key && b.value > 0;
            const active = hover === i;
            return (
              <button
                key={b.key}
                type="button"
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                aria-label={`${b.tip}: ${plural(b.value, "servicio", "servicios")}`}
                className="relative flex h-full min-w-0 flex-1 flex-col items-center justify-end outline-none"
              >
                <AnimatePresence>
                  {active && (
                    <motion.span
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 4 }}
                      transition={{ duration: 0.18 }}
                      className={cn(
                        "pointer-events-none absolute z-10 whitespace-nowrap rounded-[10px] bg-brand-deep px-2.5 py-1.5 text-[12px] text-white shadow-lift max-sm:hidden",
                        i < data.length / 3 ? "left-0" : i > (data.length * 2) / 3 ? "right-0" : "left-1/2 -translate-x-1/2",
                      )}
                      style={{ bottom: `calc(${h * 100}% + 8px)` }}
                    >
                      <span className="font-semibold tabular">{fmtNum(b.value)}</span> <span className="text-white/70">· {b.tip}</span>
                    </motion.span>
                  )}
                </AnimatePresence>
                <motion.span
                  initial={{ height: 0 }}
                  animate={{ height: `${h * 100}%` }}
                  transition={{ type: "spring", stiffness: 140, damping: 20, delay: 0.1 + i * (0.5 / data.length) }}
                  className={cn(
                    "block w-full max-w-[34px] rounded-full transition-colors duration-200",
                    !b.inPeriod
                      ? active
                        ? "bg-line-strong"
                        : "bg-well"
                      : isPeak
                        ? "bg-azure"
                        : b.isNow
                          ? "bg-brand-deep"
                          : active
                            ? "bg-blue-bar"
                            : "bg-blue-line",
                  )}
                />
              </button>
            );
          })}
        </div>
      </div>
      <div className="mt-2.5 flex gap-[3px] sm:gap-1.5" aria-hidden>
        {data.map((b, i) => (
          <span
            key={b.key}
            className={cn(
              "min-w-0 flex-1 overflow-visible whitespace-nowrap text-center text-[11px] tabular",
              hover === i || b.isNow ? "font-semibold text-ink" : b.inPeriod ? "text-subtle" : "text-ghost",
            )}
          >
            {i % every === 0 || b.isNow || hover === i ? b.label : ""}
          </span>
        ))}
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-hairline pt-4 text-[13px] text-subtle">
        <Legend className="bg-azure" label={peak && peak.value > 0 ? `Pico: ${plural(peak.value, "servicio", "servicios")} · ${peak.tip}` : "Sin cierres en el periodo"} />
        {data.some((b) => b.isNow) && <Legend className="bg-brand-deep" label={unit === "día" ? "Hoy" : unit === "semana" ? "Semana en curso" : "Mes en curso"} />}
        {padded && <Legend className="bg-well" label="Fuera del periodo (contexto)" />}
      </div>
    </Panel>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={cn("size-2.5 rounded-full", className)} />
      {label}
    </span>
  );
}
