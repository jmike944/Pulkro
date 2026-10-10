"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { ChevronRight, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtPct, plural } from "@/lib/format";
import { AnimatedNumber, CornerLink, Insight } from "@/components/pk/bits";
import { EASE } from "@/components/pk/motion";
import type { Indicators, SplitRow } from "./compute";
import type { PeriodWindow } from "./period";
import type { Drill } from "./drill-sheet";

const TONE: Record<SplitRow["tone"], { bar: string; dot: string }> = {
  navy: { bar: "bg-brand", dot: "bg-brand" },
  blue: { bar: "bg-[#5aa2f5]", dot: "bg-[#5aa2f5]" },
  slate: { bar: "bg-track-strong", dot: "bg-track-strong" },
};

/** "Dónde está el trabajo de octubre" — 3-segment bar + rows (§5: pendientes / en proceso / terminados). */
export function WorkSplit({ ind, win, onDrill }: { ind: Indicators; win: PeriodWindow; onDrill: (d: Drill) => void }) {
  const [hover, setHover] = useState<SplitRow["key"] | null>(null);
  const rows = ind.split;
  const total = ind.periodOrders.length;
  const visible = rows.filter((r) => r.orders.length > 0);

  return (
    <div>
      <div className="mb-1 flex items-start justify-between gap-4">
        <h2 className="text-[19px] font-medium tracking-[-0.01em] text-ink">Dónde está el trabajo de {win.phrase}</h2>
        <CornerLink href="/ordenes" label="Ver órdenes" />
      </div>
      <p className="mb-6 text-[13.5px] text-subtle">
        {plural(total, "orden programada", "órdenes programadas")} · {win.cutoffLabel}
      </p>

      {/* segmented bar */}
      <div className="relative flex h-[14px] gap-1 overflow-hidden rounded-full bg-tile" role="img" aria-label={rows.map((r) => `${r.label} ${fmtPct(r.pct)}`).join(", ")}>
        {visible.map((r, i) => (
          <motion.span
            key={r.key}
            initial={{ flexGrow: 0 }}
            animate={{ flexGrow: r.pct, opacity: hover && hover !== r.key ? 0.28 : 1 }}
            transition={{ flexGrow: { duration: 1, ease: EASE, delay: 0.2 + i * 0.12 }, opacity: { duration: 0.2 } }}
            style={{ flexBasis: 0 }}
            className={cn("h-full min-w-0 rounded-full", TONE[r.tone].bar)}
          />
        ))}
        {/* squeegee sheen: one clean wipe once the bar has filled */}
        <motion.span
          key={win.label}
          aria-hidden
          initial={{ x: "-130%" }}
          animate={{ x: "330%" }}
          transition={{ duration: 1.1, ease: [0.65, 0, 0.35, 1], delay: 1.25 }}
          className="pointer-events-none absolute inset-y-0 left-0 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/75 dark:via-white/25 to-transparent motion-reduce:hidden"
        />
      </div>

      <ul className="mt-5 -mx-3">
        {rows.map((r) => (
          <li key={r.key}>
            <button
              type="button"
              onMouseEnter={() => setHover(r.key)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(r.key)}
              onBlur={() => setHover(null)}
              onClick={() => onDrill({ title: r.label, description: `Programadas en ${win.phrase}`, orders: r.orders })}
              className={cn(
                "group grid min-h-[60px] w-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 rounded-[14px] px-3 py-3 text-left transition-colors sm:gap-5",
                hover === r.key ? "bg-soft" : "hover:bg-soft",
              )}
            >
              <span className="flex min-w-0 items-start gap-3">
                <span className={cn("mt-[7px] size-2 shrink-0 rounded-full", TONE[r.tone].dot)} />
                <span className="min-w-0">
                  <span className="block text-[15px] font-medium text-ink">{r.label}</span>
                  <span className="block truncate text-[13px] text-subtle">{r.sub}</span>
                </span>
              </span>
              <AnimatedNumber value={r.orders.length} className="text-[17px] font-semibold text-ink" />
              <span className="flex w-[58px] items-center justify-end gap-1 text-[14px] text-subtle tabular">
                {fmtPct(r.pct)}
                <ChevronRight className="size-4 -mr-1 text-ghost transition group-hover:translate-x-0.5 group-hover:text-ink" />
              </span>
            </button>
          </li>
        ))}
      </ul>

      <Insight icon={<Info />} className="mt-5">
        Una orden cuenta como <b className="font-semibold">terminada</b> cuando el supervisor valida el cierre.
        {win.isCurrent && ind.notStarted > 0 ? (
          <>
            {" "}
            Las {ind.notStarted} programadas después de hoy aparecen en <b className="font-semibold">En curso</b> como por iniciar.
          </>
        ) : (
          " Las canceladas no entran al embudo."
        )}
      </Insight>
    </div>
  );
}
