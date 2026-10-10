"use client";

import Link from "next/link";
import { useId, useMemo, useState } from "react";
import { motion } from "motion/react";
import { ArrowUpRight, Camera, ShieldCheck, Sparkles } from "lucide-react";
import { startOfMonth, startOfYear, subDays } from "date-fns";
import { cn } from "@/lib/utils";
import { useLookups } from "@/lib/hooks";
import { closedAt, photoCompliance } from "@/lib/metrics";
import { fmtNum, fmtPct, plural } from "@/lib/format";
import type { Jornada, Order, Photo } from "@/lib/types";
import { AuroraFrame } from "@/components/pk/aurora";
import { AnimatedNumber, DateBadge, Insight, MiniStat, PersonAvatar, SectionHeader } from "@/components/pk/bits";
import { Segmented } from "@/components/pk/page";
import { EmptyState } from "@/components/pk/feedback";
import { EASE, rowVariants, staggerContainer } from "@/components/pk/motion";
import { Button } from "@/components/ui/button";
import { SparkleGlyph } from "./squeegee";

type Period = "mes" | "trimestre" | "anio";
const PERIOD_LABEL: Record<Period, string> = { mes: "este mes", trimestre: "los últimos 90 días", anio: "este año" };

export function ComplianceTab({
  orders,
  jornadas,
  photos,
  now,
  onOpenOrder,
}: {
  orders: Order[];
  jornadas: Jornada[];
  photos: Photo[];
  now: Date;
  onOpenOrder: (folio: string) => void;
}) {
  const lk = useLookups();
  const [period, setPeriod] = useState<Period>("anio");

  const data = useMemo(() => {
    const start = period === "mes" ? startOfMonth(now) : period === "trimestre" ? subDays(now, 90) : startOfYear(now);
    const closed = orders.filter((o) => {
      const c = closedAt(o);
      return c && c >= start && c <= now;
    });
    const comp = photoCompliance(closed, jornadas, photos);
    const exceptions = closed
      .filter((o) => o.closure?.exception)
      .sort((a, b) => b.closure!.validatedAt.localeCompare(a.closure!.validatedAt));
    const missing = comp.rows
      .filter((r) => !r.ev.complete && !r.order.closure?.exception)
      .sort((a, b) => b.order.closure!.validatedAt.localeCompare(a.order.closure!.validatedAt));
    const bySup = new Map<string, { total: number; ok: number; exc: number }>();
    comp.rows.forEach((r) => {
      const cur = bySup.get(r.order.supervisorId) ?? { total: 0, ok: 0, exc: 0 };
      cur.total++;
      if (r.ev.complete) cur.ok++;
      if (r.order.closure?.exception) cur.exc++;
      bySup.set(r.order.supervisorId, cur);
    });
    const supervisors = Array.from(bySup.entries())
      .map(([id, v]) => ({ id, ...v, rate: v.total ? v.ok / v.total : 0 }))
      .sort((a, b) => b.rate - a.rate || b.total - a.total);
    return { comp, exceptions, missing, supervisors };
  }, [orders, jornadas, photos, period, now]);

  const { comp, exceptions, missing, supervisors } = data;
  const worst = comp.missingDespues >= comp.missingAntes ? { kind: "DESPUÉS", n: comp.missingDespues } : { kind: "ANTES", n: comp.missingAntes };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-[19px] font-medium tracking-[-0.01em] text-ink">Cumplimiento fotográfico</h2>
          <p className="mt-1 text-[13.5px] text-subtle">Cierres validados con ANTES y DESPUÉS en cada jornada · {PERIOD_LABEL[period]}</p>
        </div>
        <Segmented
          id="comp-period"
          items={[
            { value: "mes", label: "Mes" },
            { value: "trimestre", label: "90 días" },
            { value: "anio", label: "Año" },
          ]}
          value={period}
          onChange={setPeriod}
        />
      </div>

      <section className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] lg:gap-0">
        <div className="min-w-0 lg:border-r lg:border-hairline lg:pr-10">
          <AuroraFrame innerClassName="p-5 sm:p-7">
            <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:gap-8">
              <ComplianceRing value={comp.rate} />
              <div className="w-full min-w-0 flex-1">
                <p className="text-[15px] font-medium text-ink">
                  <b className="font-semibold tabular">{fmtNum(comp.compliant)}</b> de {plural(comp.total, "cierre", "cierres")} con evidencia completa
                </p>
                <div className="mt-5 grid grid-cols-3 divide-x divide-hairline border-t border-hairline pt-4 sm:grid-cols-1 sm:divide-x-0 sm:divide-y sm:border-t-0 sm:pt-0">
                  <MiniStat tone="teal" label="Completos" value={<AnimatedNumber value={comp.compliant} />} className="pr-3 sm:py-2.5 sm:pr-0" />
                  <MiniStat tone="violet" label="Con excepción" value={<AnimatedNumber value={comp.withException} />} className="px-3 sm:px-0 sm:py-2.5" />
                  <MiniStat tone="red" label="Sin evidencia" value={<AnimatedNumber value={missing.length} />} className="pl-3 sm:py-2.5 sm:pl-0" />
                </div>
              </div>
            </div>
          </AuroraFrame>
          <Insight icon={comp.total && worst.n === 0 ? <Sparkles /> : <Camera />} className="mt-6">
            {comp.total === 0 ? (
              <>Aún no hay cierres validados en {PERIOD_LABEL[period]}.</>
            ) : worst.n === 0 ? (
              <>Todos los cierres de {PERIOD_LABEL[period]} tienen fotos ANTES y DESPUÉS en cada jornada. ¡Impecable!</>
            ) : (
              <>
                La foto que más falta al cerrar es <b className="font-semibold">{worst.kind}</b>: {worst.n} de {fmtNum(comp.total)} cierres.
                {worst.kind === "DESPUÉS" ? " Tomarla antes de registrar la salida evita excepciones." : " Tomarla al llegar, antes de intervenir, evita excepciones."}
              </>
            )}
          </Insight>
        </div>

        <div className="min-w-0 lg:pl-10">
          <SectionHeader title="Por supervisor" subtitle="Cierres con ANTES y DESPUÉS completos" />
          {supervisors.length === 0 ? (
            <EmptyState icon={<ShieldCheck />} title="Sin cierres en el periodo" className="py-10" />
          ) : (
            <motion.ul variants={staggerContainer(0.05, 0.15)} initial="hidden" animate="show" className="divide-y divide-hairline">
              {supervisors.map((s, i) => {
                const u = lk.users.get(s.id);
                const color = s.rate >= 0.95 ? "bg-azure" : s.rate >= 0.85 ? "bg-st-amber" : "bg-st-red";
                return (
                  <motion.li key={s.id} variants={rowVariants} className="grid grid-cols-[minmax(0,1fr)_56px] items-center gap-x-4 gap-y-2 py-3.5 sm:grid-cols-[minmax(0,200px)_minmax(0,1fr)_56px]">
                    <span className="flex min-w-0 items-center gap-3">
                      {u && <PersonAvatar name={u.name} initials={u.initials} hue={u.hue} size={32} />}
                      <span className="min-w-0">
                        <span className="block truncate text-[14px] font-medium text-ink">{u?.name.split(" ").slice(0, 2).join(" ") ?? "Supervisor"}</span>
                        <span className="block text-[12.5px] text-subtle tabular">
                          {s.ok}/{s.total} cierres{s.exc ? ` · ${s.exc} exc.` : ""}
                        </span>
                      </span>
                    </span>
                    <span className="col-span-2 row-start-2 h-[7px] overflow-hidden rounded-full bg-well sm:col-span-1 sm:row-start-auto">
                      <motion.span
                        initial={{ width: 0 }}
                        animate={{ width: `${s.rate * 100}%` }}
                        transition={{ duration: 0.9, ease: EASE, delay: 0.2 + i * 0.06 }}
                        className={cn("block h-full rounded-full", color)}
                      />
                    </span>
                    <span className="col-start-2 row-start-1 text-right text-[14px] font-semibold text-ink tabular sm:col-start-auto sm:row-start-auto">
                      {fmtPct(s.rate)}
                    </span>
                  </motion.li>
                );
              })}
            </motion.ul>
          )}
        </div>
      </section>

      <section className="mt-12 grid gap-10 lg:grid-cols-2 lg:gap-0">
        <div className="min-w-0 lg:border-r lg:border-hairline lg:pr-10">
          <SectionHeader title={`Excepciones autorizadas · ${exceptions.length}`} subtitle="Cierres sin alguna foto, con motivo y autorización" />
          {exceptions.length === 0 ? (
            <EmptyState icon={<ShieldCheck />} title="Sin excepciones" className="py-10">
              Ningún cierre de {PERIOD_LABEL[period]} requirió excepción.
            </EmptyState>
          ) : (
            <motion.ul variants={staggerContainer(0.04, 0.1)} initial="hidden" animate="show">
              {exceptions.slice(0, 12).map((o) => {
                const exc = o.closure!.exception!;
                const by = lk.users.get(exc.authorizedBy);
                const client = lk.clients.get(o.clientId);
                return (
                  <motion.li key={o.id} variants={rowVariants} className="border-b border-hairline last:border-0">
                    <Link href={`/ordenes/${o.folio}`} className="group flex gap-4 py-4">
                      <DateBadge date={o.closure!.validatedAt} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-3">
                          <span className="truncate text-[14.5px] font-semibold text-ink group-hover:text-link">
                            {o.folio} · {client?.shortName}
                          </span>
                          <ArrowUpRight className="size-4 shrink-0 text-faint transition group-hover:text-ink" />
                        </span>
                        <span className="mt-1 line-clamp-2 text-[13.5px] leading-relaxed text-subtle">{exc.reason}</span>
                        {by && (
                          <span className="mt-2 inline-flex items-center gap-2 text-[12.5px] text-ink/80">
                            <PersonAvatar name={by.name} initials={by.initials} hue={by.hue} size={20} />
                            Autorizó {by.name.split(" ").slice(0, 2).join(" ")}
                          </span>
                        )}
                      </span>
                    </Link>
                  </motion.li>
                );
              })}
            </motion.ul>
          )}
          {exceptions.length > 12 && <p className="mt-3 text-[12.5px] text-subtle">Mostrando las 12 más recientes de {exceptions.length}.</p>}
        </div>

        <div className="min-w-0 lg:pl-10">
          <SectionHeader title={`Cierres sin evidencia completa · ${missing.length}`} subtitle="Validados sin ANTES o DESPUÉS y sin excepción registrada" />
          {missing.length === 0 ? (
            <EmptyState icon={<Sparkles />} title="Sin cierres incompletos" className="py-10">
              Ningún cierre se validó sin sus fotos.
            </EmptyState>
          ) : (
            <motion.ul variants={staggerContainer(0.04, 0.1)} initial="hidden" animate="show">
              {missing.map(({ order: o, ev }) => {
                const client = lk.clients.get(o.clientId);
                const gaps = ev.perJornada
                  .filter((x) => x.jornada.checkIn)
                  .flatMap((x) => [!x.antes && `ANTES · J${x.jornada.dayIndex}`, !x.despues && `DESPUÉS · J${x.jornada.dayIndex}`])
                  .filter((x): x is string => !!x);
                const unexecuted = ev.perJornada.filter((x) => !x.jornada.checkIn).length;
                return (
                  <motion.li key={o.id} variants={rowVariants} className="flex items-center gap-4 border-b border-hairline py-4 last:border-0">
                    <DateBadge date={o.closure!.validatedAt} tone="late" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14.5px] font-semibold text-ink">
                        {o.folio} · {client?.shortName}
                      </span>
                      <span className="mt-1.5 flex flex-wrap gap-1.5">
                        {gaps.map((g) => (
                          <span key={g} className="rounded-md bg-red-soft px-1.5 py-0.5 text-[11px] font-bold tracking-[0.04em] text-red-fg">
                            Falta {g}
                          </span>
                        ))}
                        {unexecuted > 0 && (
                          <span className="rounded-md bg-tile px-1.5 py-0.5 text-[11px] font-bold tracking-[0.04em] text-subtle">
                            {plural(unexecuted, "jornada sin entrada", "jornadas sin entrada")}
                          </span>
                        )}
                      </span>
                    </span>
                    {gaps.length > 0 ? (
                      <Button
                        variant="outline"
                        onClick={() => onOpenOrder(o.folio)}
                        className="h-11 shrink-0 rounded-[12px] border-line px-4 font-semibold lg:h-10"
                      >
                        Ver solicitud
                      </Button>
                    ) : (
                      <Button asChild variant="outline" className="h-11 shrink-0 rounded-[12px] border-line px-4 font-semibold lg:h-10">
                        <Link href={`/ordenes/${o.folio}?tab=jornadas`}>Ver orden</Link>
                      </Button>
                    )}
                  </motion.li>
                );
              })}
            </motion.ul>
          )}
        </div>
      </section>
    </div>
  );
}

/** Animated compliance ring with a gradient stroke and soap-bubble accents. */
function ComplianceRing({ value }: { value: number }) {
  const gid = `ring${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <div className="relative size-[176px] shrink-0">
      <span aria-hidden className="absolute -right-1 top-3 size-4 rounded-full border border-sky/60 bg-sky-soft animate-float motion-reduce:animate-none" />
      <span aria-hidden className="absolute -left-2 bottom-6 size-2.5 rounded-full border border-sky/60 bg-sky-soft animate-float [animation-delay:1.4s] motion-reduce:animate-none" />
      <svg viewBox="0 0 200 200" className="size-full -rotate-90" role="img" aria-label={`Cumplimiento ${fmtPct(value)}`}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" style={{ stopColor: "var(--sky)" }} />
            <stop offset="1" style={{ stopColor: "var(--azure)" }} />
          </linearGradient>
        </defs>
        <circle cx="100" cy="100" r="80" fill="none" className="stroke-well" strokeWidth="16" />
        <motion.circle
          cx="100"
          cy="100"
          r="80"
          fill="none"
          stroke={`url(#${gid})`}
          strokeWidth="16"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: Math.max(0.001, value) }}
          transition={{ duration: 1.4, ease: EASE, delay: 0.25 }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="flex items-start">
          <AnimatedNumber value={Math.round(value * 100)} className="text-[44px] font-medium leading-none tracking-[-0.045em] text-ink" />
          <span className="mt-1 text-[18px] font-medium text-subtle">%</span>
        </span>
        <span className="mt-1.5 inline-flex items-center gap-1 text-[12px] font-medium text-subtle">
          <SparkleGlyph className="size-2.5 text-sky" /> cumplimiento
        </span>
      </div>
    </div>
  );
}
