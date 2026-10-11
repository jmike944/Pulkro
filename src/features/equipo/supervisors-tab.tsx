"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { CalendarDays, ClipboardList, Mail, Phone, Scale, Star } from "lucide-react";
import { parseISO, startOfYear, subDays } from "date-fns";
import { cn } from "@/lib/utils";
import { useNow, useScopedData } from "@/lib/hooks";
import { supervisorProductivity } from "@/lib/metrics";
import { OPEN_STATUSES } from "@/lib/status";
import { fmtNum } from "@/lib/format";
import { AnimatedNumber, PersonAvatar } from "@/components/pk/bits";
import { EmptyState } from "@/components/pk/feedback";
import { Segmented } from "@/components/pk/page";
import { SoftBadge, TonePill } from "@/components/pk/status";
import { EASE, fadeUp, staggerContainer } from "@/components/pk/motion";
import type { TeamData } from "./use-team";

type Period = "30d" | "90d" | "anio";

const PERIODS: { value: Period; label: string }[] = [
  { value: "30d", label: "30 días" },
  { value: "90d", label: "Trimestre" },
  { value: "anio", label: "Año" },
];

/** Supervisores: productivity per supervisor (doc §5) with today's field status. */
export function SupervisorsTab({ data }: { data: TeamData }) {
  const { orders, jornadas, surveys } = useScopedData();
  const now = useNow(60_000);
  const [period, setPeriod] = useState<Period>("30d");
  const hourStamp = Math.floor(now.getTime() / 3_600_000);

  const rows = useMemo(() => {
    const ref = new Date(hourStamp * 3_600_000);
    const from = period === "30d" ? subDays(ref, 30) : period === "90d" ? subDays(ref, 90) : startOfYear(ref);
    // Closed in the period + everything still open (open count is always "now").
    const inPeriod = orders.filter((o) => (o.closure && parseISO(o.closure.validatedAt) >= from) || OPEN_STATUSES.includes(o.status));
    return supervisorProductivity(inPeriod, jornadas, data.supervisors, surveys);
  }, [orders, jornadas, surveys, data.supervisors, period, hourStamp]);

  const max = useMemo(
    () => ({
      closed: Math.max(1, ...rows.map((r) => r.closed)),
      open: Math.max(1, ...rows.map((r) => r.open)),
      hours: Math.max(1, ...rows.map((r) => r.hours)),
      hps: Math.max(1, ...rows.map((r) => r.hoursPerService)),
    }),
    [rows],
  );

  return (
    <div>
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex max-w-2xl items-start gap-3 rounded-[16px] bg-amber-soft px-4 py-3 text-[13px] leading-snug text-amber-deep">
          <Scale className="mt-0.5 size-4 shrink-0 text-amber-fg" />
          <span>
            <SoftBadge tone="amber" className="mr-1.5 align-[1px]">
              PENDIENTE
            </SoftBadge>
            Denominador de productividad por definir (doc §5). Mientras tanto: <b className="font-semibold">horas por servicio = horas reales (entrada → salida) ÷ órdenes cerradas</b> en el
            periodo.
          </span>
        </div>
        <Segmented id="sup-period" items={PERIODS} value={period} onChange={setPeriod} className="self-start [&>button]:min-h-10 sm:[&>button]:min-h-0" />
      </div>

      {rows.length === 0 ? (
        <EmptyState title="Sin supervisores" icon={<CalendarDays />}>
          No hay supervisores activos en tu alcance.
        </EmptyState>
      ) : (
        <motion.div key={period} variants={staggerContainer(0.07, 0.05)} initial="hidden" animate="show" className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {rows.map((r) => {
            const u = r.user;
            const today = data.supervisorToday.get(u.id);
            return (
              <motion.article key={u.id} variants={fadeUp} className="flex flex-col rounded-[22px] border border-hairline bg-surface p-5 shadow-soft sm:p-6">
                <div className="flex items-start gap-3">
                  <PersonAvatar name={u.name} initials={u.initials} hue={u.hue} size={46} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[16px] font-semibold text-ink">{u.name}</p>
                    <p className="truncate text-[13px] text-subtle">{u.title}</p>
                  </div>
                </div>
                {today && (
                  <div className="mt-3">
                    {today.href ? (
                      <Link href={today.href} className="inline-flex">
                        <TonePill tone={today.tone} live={today.live} className="transition hover:bg-press">
                          {today.label}
                        </TonePill>
                      </Link>
                    ) : (
                      <TonePill tone={today.tone} live={today.live}>
                        {today.label}
                      </TonePill>
                    )}
                  </div>
                )}

                <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-5">
                  <Metric label="Órdenes cerradas" value={r.closed} pct={r.closed / max.closed} bar="bg-azure" />
                  <Metric label="Abiertas" value={r.open} pct={r.open / max.open} bar="bg-st-amber" />
                  <Metric label="Horas reales" value={Math.round(r.hours)} suffix=" h" pct={r.hours / max.hours} bar="bg-st-teal" />
                  <Metric label="h / servicio" value={Number(r.hoursPerService.toFixed(1))} suffix=" h" pct={r.hoursPerService / max.hps} bar="bg-st-violet" decimals />
                </dl>

                <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-4">
                  <Csat value={r.csat} />
                  <div className="flex items-center gap-1.5">
                    <a href={`tel:${u.phone.replace(/\s/g, "")}`} aria-label={`Llamar a ${u.name}`} className="inline-flex size-10 items-center justify-center rounded-[12px] border border-hairline text-ink transition hover:bg-muted">
                      <Phone className="size-4" />
                    </a>
                    <a href={`mailto:${u.email}`} aria-label={`Escribir a ${u.name}`} className="inline-flex size-10 items-center justify-center rounded-[12px] border border-hairline text-ink transition hover:bg-muted">
                      <Mail className="size-4" />
                    </a>
                    {/* the agenda is the supervisor's own screen: here, their orders */}
                    <Link href={`/ordenes?sup=${u.id}`} aria-label={`Ver órdenes de ${u.name}`} className="inline-flex size-10 items-center justify-center rounded-[12px] border border-hairline text-ink transition hover:bg-muted">
                      <ClipboardList className="size-4" />
                    </Link>
                  </div>
                </div>
              </motion.article>
            );
          })}
        </motion.div>
      )}
      <p className="mt-5 text-[12.5px] text-subtle">
        Fuente: órdenes con cierre validado en el periodo y abiertas hoy · horas reales = Σ(salida − entrada) de las jornadas · CSAT = promedio de la calificación general de las
        encuestas respondidas (1–5).
      </p>
    </div>
  );
}

function Metric({ label, value, pct, bar, suffix, decimals }: { label: string; value: number; pct: number; bar: string; suffix?: string; decimals?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[12.5px] text-subtle">{label}</dt>
      <dd className="mt-1">
        <AnimatedNumber
          value={value}
          suffix={suffix}
          format={decimals ? { minimumFractionDigits: 1, maximumFractionDigits: 1 } : undefined}
          className="text-[24px] font-medium leading-none tracking-[-0.03em] text-ink"
        />
        <div className="mt-2.5 h-[6px] overflow-hidden rounded-full bg-well">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${Math.max(0.04, Math.min(1, pct)) * 100}%` }}
            transition={{ duration: 0.9, ease: EASE, delay: 0.2 }}
            className={cn("h-full rounded-full", bar)}
          />
        </div>
      </dd>
    </div>
  );
}

function Csat({ value }: { value: number }) {
  if (!value) return <span className="text-[13px] text-subtle">Sin encuestas respondidas</span>;
  return (
    <span className="flex items-center gap-2" aria-label={`Satisfacción ${fmtNum(Number(value.toFixed(1)))} de 5`}>
      <span className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((i) => {
          const fill = Math.max(0, Math.min(1, value - (i - 1)));
          return (
            <span key={i} className="relative inline-flex size-4">
              <Star className="absolute inset-0 size-4 text-track" fill="currentColor" strokeWidth={0} />
              <motion.span
                className="absolute inset-0 overflow-hidden"
                initial={{ width: 0 }}
                animate={{ width: `${fill * 100}%` }}
                transition={{ duration: 0.5, ease: EASE, delay: 0.3 + i * 0.06 }}
              >
                <Star className="size-4 text-st-amber" fill="currentColor" strokeWidth={0} />
              </motion.span>
            </span>
          );
        })}
      </span>
      <span className="text-[14px] font-semibold text-ink tabular">{value.toFixed(1)}</span>
      <span className="text-[12.5px] text-subtle">CSAT</span>
    </span>
  );
}
