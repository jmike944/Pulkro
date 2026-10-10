"use client";

import { motion } from "motion/react";
import { ArrowRight, Sparkles, Workflow } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtNum, plural } from "@/lib/format";
import { AuroraPanel, GlassCard } from "@/components/pk/aurora";
import { CapsuleMeter } from "@/components/pk/pill-bars";
import { AnimatedNumber } from "@/components/pk/bits";
import { EASE } from "@/components/pk/motion";
import type { FunnelStage, Indicators } from "./compute";
import type { PeriodWindow } from "./period";
import type { Drill } from "./drill-sheet";

const STAGE_HINT: Record<string, string> = {
  programadas: "Con cuadrilla y fechas asignadas",
  ejecutadas: "Al menos una entrada registrada",
  finalizadas: "Cierre validado por el supervisor",
  enviadas: "Envío manual iniciado (sin confirmar entrega)",
  calificadas: "El cliente respondió la encuesta",
};

/**
 * Pipeline from the "Recovery" reference: Programadas → En ejecución → Finalizadas →
 * Reporte enviado → Calificadas, with capsule meters and conversion chips.
 */
export function FunnelHero({ ind, win, onDrill }: { ind: Indicators; win: PeriodWindow; onDrill: (d: Drill) => void }) {
  const f = ind.funnel;
  const max = Math.max(1, f[0]?.count ?? 0);
  const first = f[0]?.count ?? 0;
  const last = f[f.length - 1]?.count ?? 0;
  const fullCycle = first ? Math.round((last / first) * 100) : 0;

  return (
    <AuroraPanel className="p-3 sm:p-6 lg:p-8 print:break-inside-avoid">
      <div className="flex flex-col gap-4 px-2 pt-2 sm:flex-row sm:items-start sm:justify-between sm:px-0 sm:pt-0">
        <div className="min-w-0">
          <p className="flex items-center gap-2.5 text-[15px] font-medium text-ink">
            <span className="inline-flex size-8 items-center justify-center rounded-[10px] bg-surface/70 text-azure-fg shadow-[inset_0_1px_0_var(--hl)] [&_svg]:size-[17px]">
              <Workflow />
            </span>
            Del plan al cliente
          </p>
          <p className="mt-2 max-w-md text-[14px] leading-relaxed text-ink/65">
            Órdenes programadas en {win.phrase} y hasta dónde llegaron · {win.cutoffLabel}
          </p>
        </div>
        <GlassCard className="flex shrink-0 items-center gap-5 self-start px-5 py-3.5">
          <div>
            <p className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-subtle">Ciclo completo</p>
            <p className="mt-0.5 text-[26px] font-medium leading-none tracking-[-0.03em] text-ink">
              <AnimatedNumber value={fullCycle} suffix="%" />
            </p>
          </div>
          <span className="h-9 w-px bg-hairline" />
          <div>
            <p className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-subtle">{win.isCurrent ? "Por iniciar" : "Borradores"}</p>
            <p className="mt-0.5 text-[26px] font-medium leading-none tracking-[-0.03em] text-ink">
              <AnimatedNumber value={win.isCurrent ? ind.notStarted : ind.drafts} />
            </p>
          </div>
        </GlassCard>
      </div>

      {/* container query: go fluid only when the panel itself is wide enough (independent of the sidebar) */}
      <div className="@container mt-7">
        <div
          className={cn(
            "scrollbar-none -mx-3 flex snap-x snap-mandatory overflow-x-auto px-3 pb-2 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8",
            "[mask-image:linear-gradient(to_right,black_82%,transparent)]",
            "@3xl:mx-0 @3xl:snap-none @3xl:overflow-visible @3xl:px-0 @3xl:[mask-image:none]",
            "print:mx-0 print:overflow-visible print:px-0 print:[mask-image:none]",
          )}
          role="list"
          aria-label="Embudo de órdenes del periodo"
        >
          {f.map((st, i) => (
            <FunnelColumn
              key={st.key}
              stage={st}
              index={i}
              max={max}
              first={first}
              next={f[i + 1]?.count}
              onOpen={() =>
                onDrill({
                  title: st.label,
                  description: `${STAGE_HINT[st.key] ?? ""} · programadas en ${win.phrase}`,
                  orders: st.orders,
                })
              }
            />
          ))}
        </div>
      </div>
    </AuroraPanel>
  );
}

function FunnelColumn({
  stage,
  index,
  max,
  first,
  next,
  onOpen,
}: {
  stage: FunnelStage;
  index: number;
  max: number;
  first: number;
  /** count of the following stage; undefined on the last column */
  next?: number;
  onOpen: () => void;
}) {
  const last = next === undefined;
  const sub = index === 0 ? plural(stage.count, "orden", "órdenes") : first ? `${Math.round((stage.count / first) * 100)}% del total` : "—";
  return (
    <div
      role="listitem"
      className={cn(
        "relative shrink-0 snap-start",
        last ? "w-[112px] @3xl:w-[136px] print:w-[100px]" : "w-[150px] sm:w-[168px] @3xl:w-auto @3xl:min-w-0 @3xl:flex-1 print:w-auto print:min-w-0 print:flex-1",
      )}
    >
      <motion.button
        type="button"
        onClick={onOpen}
        whileHover={{ y: -3 }}
        whileTap={{ scale: 0.985 }}
        transition={{ type: "spring", stiffness: 420, damping: 30 }}
        aria-label={`${stage.label}: ${fmtNum(stage.count)}. Ver órdenes`}
        className="group flex flex-col items-start rounded-[20px] p-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-white"
      >
        <span className="flex items-center gap-1.5 whitespace-nowrap text-[13.5px] font-medium text-ink/70 transition-colors group-hover:text-ink">
          {stage.label}
          {last && stage.count > 0 && (
            <motion.span
              initial={{ opacity: 0, scale: 0.4, rotate: -30 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 260, damping: 14, delay: 1.3 }}
              className="text-azure-fg"
            >
              <Sparkles className="size-3.5" />
            </motion.span>
          )}
        </span>
        <AnimatedNumber value={stage.count} className="mt-1.5 text-[38px] font-medium leading-none tracking-[-0.04em] text-ink sm:text-[44px]" />
        <span className="mt-1.5 whitespace-nowrap text-[12.5px] text-ink/60">{sub}</span>
        <CapsuleMeter
          value={stage.count}
          max={max}
          delay={0.2 + index * 0.12}
          className="mt-5 h-[160px] w-[56px] transition-shadow duration-300 group-hover:shadow-[inset_0_1px_0_rgb(255_255_255/0.8),0_14px_30px_-14px_rgb(2_58_99/0.45)] sm:h-[200px] sm:w-[64px]"
        />
      </motion.button>
      {!last && <ConversionChip from={stage.count} to={next} delay={0.55 + index * 0.12} />}
    </div>
  );
}

/** White pill centered between this capsule and the next one, at capsule mid-height. */
function ConversionChip({ from, to, delay }: { from: number; to: number; delay: number }) {
  const pct = from ? Math.round((to / from) * 100) : null;
  return (
    <div className="pointer-events-none absolute bottom-[74px] left-[64px] right-0 flex justify-center sm:bottom-[94px] sm:left-[72px]" aria-hidden>
      <motion.span
        initial={{ opacity: 0, scale: 0.6, x: -6 }}
        animate={{ opacity: 1, scale: 1, x: 0 }}
        transition={{ duration: 0.5, ease: EASE, delay }}
        className="inline-flex h-7 items-center gap-1 whitespace-nowrap rounded-full bg-surface px-2.5 text-[12.5px] font-semibold text-ink shadow-[0_6px_18px_-8px_rgb(2_58_99/0.45)] tabular print:px-2"
      >
        <ArrowRight className="size-3.5 text-azure-fg" />
        {pct === null ? "—" : `${pct}%`}
      </motion.span>
    </div>
  );
}
