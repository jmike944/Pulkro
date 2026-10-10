"use client";

import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { AnimatedNumber, CornerLink } from "@/components/pk/bits";
import { EASE } from "@/components/pk/motion";
import { fmtDays, stageInsight, type Indicators } from "./compute";

/** "Cómo avanza el trabajo" — average elapsed days between lifecycle milestones; slowest stage = bottleneck. */
export function StageFlow({ ind }: { ind: Indicators }) {
  const { stages, totalDays, sum, bottleneck } = ind.stages;
  const max = Math.max(0.0001, ...stages.map((s) => s.days));
  const insight = stageInsight(stages, sum);
  const total = Math.round(totalDays * 10) / 10;

  return (
    <div>
      <div className="mb-1 flex items-start justify-between gap-4">
        <h2 className="text-[19px] font-medium tracking-[-0.01em] text-ink">Cómo avanza el trabajo</h2>
        <CornerLink href="/agenda" label="Abrir agenda" />
      </div>
      <p className="mb-6 text-[13.5px] text-subtle">Tiempo promedio entre etapas · órdenes del periodo</p>

      <ul className="space-y-5">
        {stages.map((s, i) => {
          const isBottleneck = s.key === bottleneck?.key && s.days > 0;
          return (
            <li key={s.key}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[14px] text-ink">
                  <span className="truncate">{s.label}</span>
                  {isBottleneck && (
                    <motion.span
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 1, duration: 0.4, ease: EASE }}
                      className="inline-flex h-5 items-center rounded-md bg-blue-tint px-1.5 text-[11px] font-semibold text-azure-fg"
                    >
                      Cuello de botella
                    </motion.span>
                  )}
                </span>
                <span className={cn("shrink-0 text-[14px] font-semibold tabular", isBottleneck ? "text-azure-fg" : "text-ink")}>{fmtDays(s.days)}</span>
              </div>
              <div className="mt-2 h-[5px] w-full overflow-hidden rounded-full bg-well">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${(s.days / max) * 100}%` }}
                  transition={{ duration: 0.9, ease: EASE, delay: 0.25 + i * 0.08 }}
                  className={cn("h-full rounded-full", isBottleneck ? "bg-azure" : "bg-blue-line")}
                />
              </div>
            </li>
          );
        })}
      </ul>

      <div className="mt-7 border-t border-hairline pt-5">
        <div className="flex items-end justify-between gap-4">
          <p className="pb-1 text-[14px] font-medium text-ink">Del alta al reporte</p>
          <p className="flex items-baseline gap-1.5 text-ink">
            {total > 0 ? (
              <>
                <AnimatedNumber value={total} format={{ minimumFractionDigits: 1, maximumFractionDigits: 1 }} className="text-[34px] font-medium leading-none tracking-[-0.04em]" />
                <span className="text-[15px] text-subtle">días</span>
              </>
            ) : (
              <span className="text-[34px] font-medium leading-none tracking-[-0.04em] text-subtle">—</span>
            )}
          </p>
        </div>
        <p className="mt-2 text-[13.5px] leading-relaxed text-subtle">
          {insight ?? "Aún no hay órdenes con reporte enviado en este periodo para medir el ciclo."}
        </p>
      </div>
    </div>
  );
}
