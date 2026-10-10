"use client";

import { motion } from "motion/react";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtHours, fmtNum, fmtPct, plural } from "@/lib/format";
import { AnimatedNumber, Panel } from "@/components/pk/bits";
import { EmptyState } from "@/components/pk/feedback";
import { EASE } from "@/components/pk/motion";
import type { Indicators } from "./compute";
import { CardHead, DeltaChip } from "./bits";

/** §5 "Horas reales por servicio": Σ(salida − entrada) per jornada, averaged per closed order, vs plan. */
export function HoursCard({ ind }: { ind: Indicators }) {
  const { avgMinutes, avgPlannedMinutes, totalMinutes, delta, services, rows } = ind.hours;
  const scale = Math.max(1, ...rows.flatMap((r) => [r.avgReal, r.avgPlanned])) * 1.06;
  const avgHours = Math.round((avgMinutes / 60) * 10) / 10;

  return (
    <Panel className="flex flex-col print:break-inside-avoid">
      <CardHead title="Horas reales por servicio" subtitle="Entrada a salida de cada jornada · servicios terminados" href="/ordenes" linkLabel="Ver órdenes" />
      {services === 0 ? (
        <EmptyState icon={<Clock />} title="Sin horas registradas" className="flex-1">
          No hay servicios terminados con entrada y salida en este periodo.
        </EmptyState>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
            <p className="flex items-baseline gap-1.5">
              <AnimatedNumber value={avgHours} format={{ minimumFractionDigits: 1, maximumFractionDigits: 1 }} className="text-[40px] font-medium leading-none tracking-[-0.04em] text-ink" />
              <span className="text-[15px] text-subtle">h promedio</span>
            </p>
            <DeltaChip delta={delta} inverse tolerance={0.05} label="vs plan" className="mb-1" />
          </div>
          <p className="mt-2 text-[13.5px] text-subtle">
            Plan {fmtHours(avgPlannedMinutes)} · {fmtNum(Math.round(totalMinutes / 60))} h reales en {plural(services, "servicio", "servicios")}
          </p>

          <ul className="mt-6 space-y-[18px]">
            {rows.slice(0, 6).map((r, i) => {
              const over = r.delta > 0.05;
              const under = r.delta < -0.05;
              return (
                <li key={r.serviceType.id}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 text-[14px] text-ink">
                      <span className="block truncate">
                        {r.serviceType.name} <span className="text-subtle">· {r.services}</span>
                      </span>
                      {/* the plan marker's value is title-only (no hover on touch) */}
                      <span className="block text-[12px] text-subtle tabular lg:hidden">Plan {fmtHours(r.avgPlanned)}</span>
                    </span>
                    <span className="flex shrink-0 items-baseline gap-2">
                      <span className="text-[14px] font-semibold text-ink tabular">{fmtHours(r.avgReal)}</span>
                      <span
                        className={cn(
                          "w-[46px] text-right text-[12px] font-semibold tabular",
                          over ? "text-[#b86e00]" : under ? "text-st-teal" : "text-subtle",
                        )}
                      >
                        {Math.abs(r.delta) < 0.005 ? "en plan" : `${r.delta > 0 ? "+" : "−"}${fmtPct(Math.abs(r.delta))}`}
                      </span>
                    </span>
                  </div>
                  <div className="relative mt-2 h-[7px] w-full rounded-full bg-[#eef1f5]">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${(r.avgReal / scale) * 100}%` }}
                      transition={{ duration: 0.9, ease: EASE, delay: 0.2 + i * 0.07 }}
                      className={cn("h-full rounded-full", i === 0 ? "bg-[#1667e0]" : "bg-[#b9d8fb]")}
                    />
                    <motion.span
                      initial={{ opacity: 0, scaleY: 0 }}
                      animate={{ opacity: 1, scaleY: 1 }}
                      transition={{ delay: 0.8 + i * 0.07, duration: 0.3 }}
                      title={`Plan ${fmtHours(r.avgPlanned)}`}
                      className="absolute -top-[4px] h-[15px] w-[2.5px] -translate-x-1/2 rounded-full bg-ink/70"
                      style={{ left: `${(r.avgPlanned / scale) * 100}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="mt-5 flex items-center gap-2 text-[12.5px] text-subtle">
            <span className="inline-block h-[13px] w-[2.5px] rounded-full bg-ink/70" /> Marca = horas planeadas por jornada
          </p>
        </>
      )}
    </Panel>
  );
}
