"use client";

import { LayoutGroup, motion } from "motion/react";
import { cn } from "@/lib/utils";
import type { Tone } from "@/lib/status";
import { AnimatedNumber } from "./bits";
import { EASE } from "./motion";
import { StatusDot } from "./status";

export type StatFilterItem<V extends string> = {
  value: V;
  label: string;
  tone: Tone;
  count: number;
  /** One line of context under the number ("3 inician hoy", "1 con retraso"). */
  sub: string;
  /** Pulse the dot (work happening now) while the count is above zero. */
  live?: boolean;
};

/**
 * Compact tray of counters that double as quick filters (Órdenes stages, Mapa statuses): not a hero — the aurora belongs
 * to Inicio. Tapping a counter filters by it, tapping it again clears the filter; the active one gets a springy shared
 * highlight. `id` scopes the highlight's layout animation to this tray.
 */
export function StatFilter<V extends string>({
  id,
  label,
  items,
  active,
  onSelect,
  className,
}: {
  id: string;
  /** Accessible name of the group ("Filtros rápidos por etapa"). */
  label: string;
  items: StatFilterItem<V>[];
  active: V | null;
  onSelect: (v: V | null) => void;
  className?: string;
}) {
  return (
    <LayoutGroup id={id}>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE, delay: 0.12 }}
        className={cn(
          "grid grid-cols-2 gap-1.5 rounded-[22px] border border-hairline bg-wash p-1.5 shadow-[0_1px_2px_rgb(16_24_40/0.04)] sm:grid-cols-4",
          className,
        )}
        role="group"
        aria-label={label}
      >
        {items.map((it) => {
          const on = active === it.value;
          return (
            <motion.button
              key={it.value}
              type="button"
              aria-pressed={on}
              onClick={() => onSelect(on ? null : it.value)}
              whileTap={{ scale: 0.97 }}
              className={cn(
                "group relative min-h-[84px] rounded-[17px] px-3.5 py-3 text-left outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 sm:px-4",
                !on && "hover:bg-surface",
              )}
            >
              {on && (
                <motion.span
                  layoutId={`${id}-highlight`}
                  className="absolute inset-0 rounded-[17px] bg-surface shadow-[0_1px_2px_rgb(16_24_40/0.06),0_10px_24px_-14px_rgb(2_58_99/0.35)] ring-1 ring-blue-mid"
                  transition={{ type: "spring", stiffness: 480, damping: 36 }}
                />
              )}
              <span className="relative flex min-w-0 items-center gap-2 text-[13px] text-subtle">
                <StatusDot tone={it.tone} live={it.live && it.count > 0} />
                <span className={cn("truncate", on && "font-medium text-ink")}>{it.label}</span>
              </span>
              {/* The «Filtro» badge rides on the number's row, which has room to spare: on the label's row it cut «Con incidencia»
                  short in the two-column phone layout. */}
              <span className="relative mt-1.5 flex items-center justify-between gap-2">
                <AnimatedNumber value={it.count} className="text-[26px] font-medium leading-none tracking-[-0.03em] text-ink" />
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
              <span className="relative mt-1 block truncate text-[12.5px] text-subtle">{it.sub}</span>
            </motion.button>
          );
        })}
      </motion.div>
    </LayoutGroup>
  );
}
