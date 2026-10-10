"use client";

import { LayoutGroup, motion } from "motion/react";
import { cn } from "@/lib/utils";
import { toneDot } from "@/lib/status";
import { AnimatedNumber } from "@/components/pk/bits";
import { EASE } from "@/components/pk/motion";
import { STAGES, type Stage } from "./order-rows";

export type StageStat = { count: number; sub: string };

/**
 * Compact strip of four stage counters (not a hero — the aurora belongs to Inicio).
 * Each counter is a quick filter; the active one gets a springy shared highlight.
 */
export function OrdersSummary({
  stats,
  active,
  onSelect,
}: {
  stats: Record<Stage, StageStat>;
  active: Stage | null;
  onSelect: (s: Stage | null) => void;
}) {
  return (
    <LayoutGroup id="orders-stage">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE, delay: 0.12 }}
        className="grid grid-cols-2 gap-1.5 rounded-[22px] border border-hairline bg-wash p-1.5 shadow-[0_1px_2px_rgb(16_24_40/0.04)] sm:grid-cols-4"
        role="group"
        aria-label="Filtros rápidos por etapa"
      >
        {STAGES.map((s) => {
          const on = active === s.value;
          const st = stats[s.value];
          return (
            <motion.button
              key={s.value}
              type="button"
              aria-pressed={on}
              onClick={() => onSelect(on ? null : s.value)}
              whileTap={{ scale: 0.97 }}
              className={cn(
                "group relative min-h-[84px] rounded-[17px] px-3.5 py-3 text-left outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 sm:px-4",
                !on && "hover:bg-surface",
              )}
            >
              {on && (
                <motion.span
                  layoutId="stage-highlight"
                  className="absolute inset-0 rounded-[17px] bg-surface shadow-[0_1px_2px_rgb(16_24_40/0.06),0_10px_24px_-14px_rgb(2_58_99/0.35)] ring-1 ring-blue-mid"
                  transition={{ type: "spring", stiffness: 480, damping: 36 }}
                />
              )}
              <span className="relative flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2 text-[13px] text-subtle">
                  <span className={cn("size-[7px] shrink-0 rounded-full", toneDot[s.tone])} />
                  <span className={cn("truncate", on && "font-medium text-ink")}>{s.label}</span>
                </span>
                {on && (
                  <motion.span
                    initial={{ opacity: 0, scale: 0.6 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="rounded-full bg-blue-soft px-1.5 text-[10.5px] font-semibold text-link"
                  >
                    Filtro
                  </motion.span>
                )}
              </span>
              <span className="relative mt-1.5 flex items-baseline gap-2">
                <AnimatedNumber value={st.count} className="text-[26px] font-medium leading-none tracking-[-0.03em] text-ink" />
              </span>
              <span className="relative mt-1 block truncate text-[12.5px] text-subtle">{st.sub}</span>
            </motion.button>
          );
        })}
      </motion.div>
    </LayoutGroup>
  );
}
