"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { Camera, ChevronRight, MessageSquareWarning, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtPct, plural } from "@/lib/format";
import { toneDot, type Tone } from "@/lib/status";
import { AnimatedNumber, BarList, CornerLink, Insight } from "@/components/pk/bits";
import { EmptyState } from "@/components/pk/feedback";
import { EASE, rowVariants, staggerContainer } from "@/components/pk/motion";
import { useCanSeeRoute } from "@/components/shell/use-can-see-route";
import type { Indicators } from "./compute";
import type { PeriodWindow } from "./period";

/** §5 "Cumplimiento fotográfico": closures with ANTES and DESPUÉS on every executed jornada. */
export function ComplianceBlock({ ind, clientName }: { ind: Indicators; clientName: (id: string) => string }) {
  const canSee = useCanSeeRoute();
  // /evidencias is the supervisor's screen; the others read the same photos in the order's Evidencia tab.
  const gapHref = (folio: string) => (canSee("/evidencias") ? `/evidencias?orden=${folio}` : `/ordenes/${folio}?tab=evidencia`);
  const c = ind.compliance;
  const gaps = c.rows
    .filter((r) => !r.ev.complete)
    .map((r) => {
      const miss = r.ev.perJornada.find((x) => x.jornada.checkIn && (!x.antes || !x.despues));
      const what = r.order.closure?.exception
        ? "Excepción autorizada"
        : miss
          ? `Falta ${!miss.despues ? "DESPUÉS" : "ANTES"} · Jornada ${miss.jornada.dayIndex}`
          : "Jornada sin evidencia";
      return { order: r.order, what, exception: !!r.order.closure?.exception };
    })
    .slice(0, 4);

  return (
    <div>
      <div className="mb-1 flex items-start justify-between gap-4">
        <h2 className="text-[19px] font-medium tracking-[-0.01em] text-ink">Cumplimiento fotográfico</h2>
        {canSee("/evidencias") && <CornerLink href="/evidencias" label="Ver evidencias" />}
      </div>
      <p className="mb-6 text-[13.5px] text-subtle">Cierres del periodo con ANTES y DESPUÉS en cada jornada</p>
      {c.total === 0 ? (
        <EmptyState icon={<Camera />} title="Sin cierres en el periodo">
          El cumplimiento se mide sobre órdenes con cierre validado.
        </EmptyState>
      ) : (
        <>
          <div className="flex items-center gap-6">
            <Ring value={c.rate} />
            <div className="min-w-0 flex-1 space-y-2.5">
              <LegendRow tone="teal" label="Completas" value={c.compliant} />
              <LegendRow tone="amber" label="Falta ANTES" value={c.missingAntes} />
              <LegendRow tone="red" label="Falta DESPUÉS" value={c.missingDespues} />
              <LegendRow tone="violet" label="Excepción autorizada" value={c.withException} />
            </div>
          </div>
          {gaps.length > 0 ? (
            <motion.ul variants={staggerContainer(0.05, 0.3)} initial="hidden" animate="show" className="mt-6 border-t border-hairline">
              {gaps.map((g) => (
                <motion.li key={g.order.id} variants={rowVariants} className="border-b border-hairline">
                  <Link href={gapHref(g.order.folio)} className="group flex min-h-[56px] items-center gap-3 py-3">
                    <span className={cn("size-2 shrink-0 rounded-full", g.exception ? "bg-st-violet" : "bg-st-amber")} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-medium text-ink group-hover:text-link">
                        {g.order.folio} · {clientName(g.order.clientId)}
                      </span>
                      <span className="block text-[12.5px] text-subtle">{g.what}</span>
                    </span>
                    <ChevronRight className="size-4 text-ghost transition group-hover:translate-x-0.5 group-hover:text-ink" />
                  </Link>
                </motion.li>
              ))}
            </motion.ul>
          ) : (
            <Insight icon={<ShieldCheck />} className="mt-6">
              <b className="font-semibold">Impecable:</b> todos los cierres del periodo tienen fotos ANTES y DESPUÉS.
            </Insight>
          )}
        </>
      )}
    </div>
  );
}

function LegendRow({ tone, label, value }: { tone: Tone; label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-3 text-[14px]">
      <span className="flex min-w-0 items-center gap-2 text-subtle">
        <span className={cn("size-[7px] shrink-0 rounded-full", toneDot[tone])} />
        <span className="truncate">{label}</span>
      </span>
      <span className="font-semibold text-ink tabular">{value}</span>
    </div>
  );
}

/** Donut that fills to the compliance rate. */
function Ring({ value }: { value: number }) {
  const r = 46;
  return (
    <div className="relative size-[120px] shrink-0">
      <svg viewBox="0 0 120 120" className="size-full -rotate-90">
        <circle cx={60} cy={60} r={r} fill="none" className="stroke-well" strokeWidth={12} />
        <motion.circle
          cx={60}
          cy={60}
          r={r}
          fill="none"
          className="stroke-st-teal"
          strokeWidth={12}
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: Math.max(0.001, value) }}
          transition={{ duration: 1.2, ease: EASE, delay: 0.2 }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <AnimatedNumber value={Math.round(value * 100)} suffix="%" className="text-[26px] font-medium leading-none tracking-[-0.03em] text-ink" />
        <span className="mt-1 text-[11px] text-subtle">cumplen</span>
      </div>
    </div>
  );
}

/** §5 "Servicios con quejas": post-sale cases linked to services closed in the period. */
export function ComplaintsBlock({ ind, win }: { ind: Indicators; win: PeriodWindow }) {
  const c = ind.complaints;
  const closed = ind.closed.length;
  return (
    <div>
      <div className="mb-1 flex items-start justify-between gap-4">
        <h2 className="text-[19px] font-medium tracking-[-0.01em] text-ink">Servicios con quejas</h2>
        <CornerLink href="/postventa" label="Ver postventa" />
      </div>
      <p className="mb-6 text-[13.5px] text-subtle">Casos postventa vinculados a servicios terminados en {win.phrase}</p>
      {closed === 0 ? (
        <EmptyState icon={<MessageSquareWarning />} title="Sin servicios terminados">
          Las quejas se miden sobre los servicios con cierre validado.
        </EmptyState>
      ) : (
        <>
          <div className="grid grid-cols-3 divide-x divide-hairline">
            <div className="pr-3">
              <AnimatedNumber value={c.servicesWithComplaints} className="block text-[34px] font-medium leading-none tracking-[-0.04em] text-ink" />
              <p className="mt-1.5 text-[12.5px] text-subtle">servicios con queja</p>
            </div>
            <div className="px-3 sm:px-5">
              <p className="text-[34px] font-medium leading-none tracking-[-0.04em] text-ink tabular">{fmtPct(c.rate, c.rate < 0.1 && c.rate > 0 ? 1 : 0)}</p>
              <p className="mt-1.5 text-[12.5px] text-subtle">de {plural(closed, "terminado", "terminados")}</p>
            </div>
            <div className="pl-3 sm:pl-5">
              <AnimatedNumber value={c.open} className={cn("block text-[34px] font-medium leading-none tracking-[-0.04em]", c.open ? "text-red-fg" : "text-ink")} />
              <p className="mt-1.5 text-[12.5px] text-subtle">{c.open === 1 ? "caso abierto" : "casos abiertos"}</p>
            </div>
          </div>
          {ind.caseCategories.length > 0 ? (
            <div className="mt-7">
              <p className="mb-4 text-[12px] font-semibold uppercase tracking-[0.1em] text-subtle">Por categoría</p>
              <BarList showCount items={ind.caseCategories} />
            </div>
          ) : (
            <Insight icon={<ShieldCheck />} className="mt-7">
              <b className="font-semibold">Sin quejas</b> registradas para los servicios de {win.phrase}.
            </Insight>
          )}
        </>
      )}
    </div>
  );
}
