"use client";

import { motion } from "motion/react";
import { Check, Phone } from "lucide-react";
import { cn } from "@/lib/utils";
import { jornadaMinutes } from "@/lib/domain";
import { fmtDay, fmtDuration, fmtHours, fmtNum, fmtPct, plural } from "@/lib/format";
import { AnimatedNumber } from "@/components/pk/bits";
import { EASE, rowVariants, staggerContainer } from "@/components/pk/motion";
import { StatusDot } from "@/components/pk/status";
import { fmtDiff, fmtWeekdayDay, jornadaPlanned, toHours } from "./orden-format";
import { useOrder } from "./order-context";
import { OrderTimeline } from "./order-timeline";
import { FeaturedCard } from "./featured-card";
import { CrewHistory, CrewPanel, SitePanel, SiteQuickCard } from "./side-panel";

/** Resumen: timeline + service breakdown + hours on the left; next-action card, site and crew on the right. Below lg a compact site card sits under the next-action card. */
export function SummaryTab() {
  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:grid-rows-[auto_1fr] lg:gap-x-0 lg:gap-y-9">
      <div className="min-w-0 lg:col-start-2 lg:row-start-1 lg:pl-10">
        <FeaturedCard />
        <SiteQuickCard className="mt-5" />
      </div>
      <div className="min-w-0 space-y-12 lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:border-r lg:border-hairline lg:pr-10">
        <OrderTimeline />
        <ServiceBreakdown />
        <HoursBreakdown />
      </div>
      <div className="min-w-0 space-y-9 lg:col-start-2 lg:row-start-2 lg:pl-10">
        <SitePanel />
        <CrewPanel />
        <CrewHistory />
      </div>
    </div>
  );
}

/* ───────────── Detalle del servicio (breakdown table) ───────────── */

function BreakdownRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <motion.div
      variants={rowVariants}
      className="grid gap-1.5 border-b border-hairline py-4 last:border-b-0 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-6"
    >
      <dt className="text-[14px] text-subtle">{label}</dt>
      <dd className="min-w-0 text-[14.5px] text-ink">{children}</dd>
    </motion.div>
  );
}

function ServiceBreakdown() {
  const { d } = useOrder();
  const { order, serviceType, lk } = d;
  const phone = order.siteContact.phone;
  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between gap-4">
        <h2 className="text-[19px] font-medium tracking-[-0.01em] text-ink">Detalle del servicio</h2>
        <span className="text-[13px] text-subtle">{serviceType.name}</span>
      </div>
      <motion.dl variants={staggerContainer(0.05, 0.1)} initial="hidden" animate="show">
        <BreakdownRow label="Actividades">
          {order.activities.length ? (
            <ul className="space-y-1.5">
              {order.activities.map((a) => (
                <li key={a} className="flex gap-2.5">
                  <span className="mt-[3px] inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-[#e7f7f4] text-st-teal">
                    <Check className="size-2.5" strokeWidth={3.5} />
                  </span>
                  <span>{a}</span>
                </li>
              ))}
            </ul>
          ) : (
            <span className="text-subtle">Sin actividades registradas</span>
          )}
        </BreakdownRow>
        <BreakdownRow label="Materiales">
          {order.materials.length ? (
            <ul className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
              {order.materials.map((m) => {
                const mat = lk.materials.get(m.materialId);
                return (
                  <li key={m.materialId} className="flex items-baseline justify-between gap-3 border-b border-dashed border-hairline pb-1.5 sm:border-b-0 sm:pb-0">
                    <span className="min-w-0 truncate">{mat?.name ?? "Material"}</span>
                    <span className="shrink-0 font-semibold tabular">
                      {fmtNum(m.qty)} <span className="font-normal text-subtle">{mat?.unit}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <span className="text-subtle">Sin materiales</span>
          )}
        </BreakdownRow>
        <BreakdownRow label="Instrucciones especiales">
          {order.specialInstructions ? <p className="leading-relaxed">{order.specialInstructions}</p> : <span className="text-subtle">Sin instrucciones especiales</span>}
        </BreakdownRow>
        <BreakdownRow label="Contacto en sitio">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-medium">{order.siteContact.name || "—"}</span>
            {phone && (
              <a
                href={`tel:${phone.replace(/\s/g, "")}`}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-[10px] text-link tabular hover:underline sm:min-h-0"
              >
                <Phone className="size-3.5" /> {phone}
              </a>
            )}
          </div>
        </BreakdownRow>
        <BreakdownRow label="Programación">
          {plural(order.plannedDays, "jornada", "jornadas")} · {fmtDay(order.scheduledStart)}
          {order.plannedDays > 1 ? ` – ${fmtDay(order.scheduledEnd)}` : ""}
        </BreakdownRow>
      </motion.dl>
    </section>
  );
}

/* ───────────── Horas: planned vs real per jornada ───────────── */

function HoursBreakdown() {
  const { d } = useOrder();
  const { jornadas, now, realMinutes, plannedMinutes } = d;
  if (!jornadas.length) return null;
  const pct = plannedMinutes ? realMinutes / plannedMinutes : 0;
  const maxMinutes = Math.max(1, ...jornadas.map((j) => Math.max(jornadaPlanned(j), jornadaMinutes(j, now))));

  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between gap-4">
        <h2 className="text-[19px] font-medium tracking-[-0.01em] text-ink">Horas</h2>
        <span className="text-[13px] text-subtle">Σ (salida − entrada) por jornada</span>
      </div>
      <div className="hidden grid-cols-[minmax(0,1fr)_72px_96px_96px] gap-4 border-b border-hairline pb-3 pt-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-subtle sm:grid">
        <span>Jornada</span>
        <span className="text-right">Plan</span>
        <span className="text-right">Real</span>
        <span className="text-right">Diferencia</span>
      </div>
      <motion.ul variants={staggerContainer(0.06, 0.15)} initial="hidden" animate="show">
        {jornadas.map((j) => {
          const planned = jornadaPlanned(j);
          const real = jornadaMinutes(j, now);
          const live = j.status === "en_curso";
          const diff = real - planned;
          const diffText = j.checkOut ? fmtDiff(diff) : live ? "En curso" : "Pendiente";
          const diffTone = !j.checkOut ? "text-subtle" : diff > 30 ? "text-[#b86e00]" : diff < -30 ? "text-link" : "text-subtle";
          return (
            <motion.li
              key={j.id}
              variants={rowVariants}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 border-b border-hairline py-3.5 sm:grid-cols-[minmax(0,1fr)_72px_96px_96px]"
            >
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-[14.5px] font-medium text-ink">
                  Jornada {j.dayIndex}
                  <span className="font-normal text-subtle">· {fmtWeekdayDay(j.date)}</span>
                  {live && <StatusDot tone="blue" live />}
                </p>
                {/* planned vs real capsule */}
                <div className="relative mt-2 h-[6px] max-w-[260px] rounded-full bg-[#eef1f5]">
                  <motion.span
                    className="absolute inset-y-0 left-0 rounded-full bg-[#d6e6fb]"
                    initial={{ width: 0 }}
                    animate={{ width: `${(planned / maxMinutes) * 100}%` }}
                    transition={{ duration: 0.8, ease: EASE, delay: 0.2 }}
                  />
                  <motion.span
                    className={cn("absolute inset-y-0 left-0 rounded-full", live ? "bg-sky" : diff > 30 ? "bg-st-amber" : "bg-[#1667e0]")}
                    initial={{ width: 0 }}
                    animate={{ width: `${(real / maxMinutes) * 100}%` }}
                    transition={{ duration: 0.9, ease: EASE, delay: 0.35 }}
                  />
                </div>
              </div>
              <span className="hidden text-right text-[14px] text-subtle tabular sm:block">{fmtHours(planned)}</span>
              <span className="text-right text-[14.5px] font-semibold text-ink tabular">
                {j.checkIn ? fmtDuration(real) : <span className="font-normal text-[#98a2b3]">—</span>}
                <span className="block text-[12px] font-normal text-subtle sm:hidden">plan {fmtHours(planned)}</span>
                {/* phones have no Diferencia column: the signed difference goes under the plan */}
                <span className={cn("block text-[12px] font-medium sm:hidden", diffTone)}>{diffText}</span>
              </span>
              <span className={cn("hidden text-right text-[13px] tabular sm:block", diffTone)}>{diffText}</span>
            </motion.li>
          );
        })}
      </motion.ul>
      <div className="flex items-end justify-between gap-4 pt-5">
        <div>
          <p className="text-[15px] font-medium text-ink">Horas reales</p>
          <p className="mt-0.5 text-[13px] text-subtle">
            Plan {fmtHours(plannedMinutes)}
            {plannedMinutes > 0 && realMinutes > 0 ? ` · ${fmtPct(pct)} del plan` : ""}
            {d.live ? " · incluye jornada en curso" : ""}
          </p>
        </div>
        <p className="flex items-baseline gap-1.5">
          <AnimatedNumber value={toHours(realMinutes)} format={{ maximumFractionDigits: 1 }} className="text-[38px] font-medium leading-none tracking-[-0.035em] text-ink" />
          <span className="text-[17px] font-medium text-subtle">h</span>
        </p>
      </div>
    </section>
  );
}
