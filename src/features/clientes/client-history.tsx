"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { isSameDay, parseISO } from "date-fns";
import { ClipboardList, Clock, History, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLookups } from "@/lib/hooks";
import { jornadaMinutes } from "@/lib/domain";
import { fmtDate, fmtDaysLeft, fmtHours, plural } from "@/lib/format";
import type { Jornada, Order, Photo, PostSaleCase, Survey } from "@/lib/types";
import { DateBadge, SectionHeader } from "@/components/pk/bits";
import { EmptyState } from "@/components/pk/feedback";
import { EASE, rowVariants, staggerContainer } from "@/components/pk/motion";
import { Segmented } from "@/components/pk/page";
import { PhotoImage } from "@/components/pk/scene-photo";
import { OrderStatusPill } from "@/components/pk/status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Stars } from "@/features/postventa/rating";
import { inputCls, outlineBtnCls } from "@/features/postventa/ui";
import type { ClientStats } from "./use-clients";

const minutesOf = (orderId: string, jornadas: Jornada[], now?: Date) =>
  jornadas.filter((j) => j.orderId === orderId).reduce((s, j) => s + jornadaMinutes(j, now), 0);

/** Phone-only duration chip: the md+ grids give hours their own column. */
function HoursChip({ minutes, suffix, className }: { minutes: number; suffix?: string; className?: string }) {
  if (minutes <= 0) return null;
  return (
    <span className={cn("inline-flex items-center gap-1 text-[13px] font-semibold text-ink tabular md:hidden", className)}>
      <Clock className="size-3.5 text-subtle" />
      {fmtHours(minutes)}
      {suffix && <span className="font-normal text-subtle">{suffix}</span>}
    </span>
  );
}

/** "N órdenes abiertas" — work in progress for this client. */
export function ClientOpenOrders({ orders, jornadas, now }: { orders: Order[]; jornadas: Jornada[]; now: Date }) {
  const lk = useLookups();
  const sorted = useMemo(() => [...orders].sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart)), [orders]);
  return (
    <section>
      <SectionHeader title={plural(orders.length, "orden abierta", "órdenes abiertas")} subtitle="Programadas, en ejecución o por cerrar" href="/ordenes" linkLabel="Ver en Órdenes" />
      {sorted.length === 0 ? (
        <EmptyState icon={<ClipboardList />} title="Sin órdenes abiertas">
          Todo lo programado para este cliente ya se cerró.
        </EmptyState>
      ) : (
        <motion.ul variants={staggerContainer(0.05, 0.15)} initial="hidden" animate="show">
          {sorted.map((o) => {
            const site = lk.sites.get(o.siteId);
            const minutes = minutesOf(o.id, jornadas, now);
            const today = isSameDay(parseISO(o.scheduledStart), now);
            return (
              <motion.li key={o.id} variants={rowVariants} className="border-b border-hairline last:border-0">
                <Link
                  href={`/ordenes/${o.folio}`}
                  className="group grid grid-cols-[52px_minmax(0,1fr)] items-center gap-x-4 gap-y-2 py-4 md:grid-cols-[64px_minmax(0,1fr)_170px_64px]"
                >
                  <DateBadge date={o.scheduledStart} tone={today ? "today" : undefined} />
                  <span className="min-w-0">
                    <span className="block truncate text-[15px] font-semibold text-ink group-hover:text-link">{o.title}</span>
                    <span className="mt-0.5 block truncate text-[13px] text-subtle">
                      <span className="tabular">{o.folio}</span> · {site?.name} · {o.plannedDays > 1 ? `${o.plannedDays} jornadas` : fmtDate(o.scheduledStart)}
                      {o.status === "programada" && <span className="font-medium text-ink/80"> · en {fmtDaysLeft(o.scheduledStart)}</span>}
                    </span>
                  </span>
                  <span className="col-start-2 flex flex-wrap items-center gap-x-3 gap-y-1 md:col-start-auto md:block">
                    <OrderStatusPill status={o.status} />
                    <HoursChip minutes={minutes} suffix="trabajadas" />
                  </span>
                  <span className="hidden text-right text-[15px] font-semibold text-ink tabular md:block">{minutes ? fmtHours(minutes) : "—"}</span>
                </Link>
              </motion.li>
            );
          })}
        </motion.ul>
      )}
    </section>
  );
}

type HistoryFilter = "todos" | "encuesta" | "queja";
const PAGE = 8;

/** Full service history for the client (doc §4.4 "historial de servicios por cliente"). */
export function ClientHistory({
  stats,
  jornadas,
  surveys,
  cases,
  photos,
}: {
  stats: ClientStats;
  jornadas: Jornada[];
  surveys: Survey[];
  cases: PostSaleCase[];
  photos: Photo[];
}) {
  const lk = useLookups();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<HistoryFilter>("todos");
  const [limit, setLimit] = useState(PAGE);

  const rows = useMemo(() => {
    const surveyBy = new Map<string, Survey>();
    surveys.forEach((s) => {
      if (s.answers || !surveyBy.has(s.orderId)) surveyBy.set(s.orderId, s);
    });
    const caseBy = new Map<string, PostSaleCase>();
    cases.forEach((c) => caseBy.set(c.orderId, c));
    const coverBy = new Map<string, Photo>();
    photos.forEach((p) => {
      if (p.kind === "despues" && (!coverBy.has(p.orderId) || p.selectedForReport)) coverBy.set(p.orderId, p);
    });
    return stats.orders
      .filter((o) => o.closure)
      .sort((a, b) => b.closure!.validatedAt.localeCompare(a.closure!.validatedAt))
      .map((o) => ({ o, survey: surveyBy.get(o.id), kase: caseBy.get(o.id), cover: coverBy.get(o.id), minutes: minutesOf(o.id, jornadas) }));
  }, [stats.orders, surveys, cases, photos, jornadas]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === "encuesta" && !r.survey?.answers) return false;
      if (filter === "queja" && !r.kase) return false;
      if (!q) return true;
      const site = lk.sites.get(r.o.siteId);
      const st = lk.serviceTypes.get(r.o.serviceTypeId);
      return [r.o.folio, r.o.title, site?.name, st?.name, r.survey?.answers?.comment].some((x) => x?.toLowerCase().includes(q));
    });
  }, [rows, query, filter, lk]);

  const totalHours = rows.reduce((s, r) => s + r.minutes, 0);

  return (
    <section>
      <SectionHeader title="Historial de servicios" subtitle={`${plural(rows.length, "servicio terminado", "servicios terminados")} · ${fmtHours(totalHours)} reales`} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-[320px]">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-subtle" />
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(PAGE);
            }}
            placeholder="Buscar folio, sitio o servicio"
            aria-label="Buscar en el historial"
            className={cn(inputCls, "pl-10")}
          />
        </div>
        <Segmented
          id="hist-filter"
          items={[
            { value: "todos", label: "Todos" },
            { value: "encuesta", label: "Calificados" },
            { value: "queja", label: "Con queja" },
          ]}
          value={filter}
          onChange={(v) => {
            setFilter(v);
            setLimit(PAGE);
          }}
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={<History />} title={rows.length ? "Sin coincidencias" : "Aún sin servicios"} className="mt-5">
          {rows.length ? "Pruebe con otro folio o filtro." : "Aquí aparecerá cada servicio con cierre validado."}
        </EmptyState>
      ) : (
        <ul className="mt-3">
          <AnimatePresence initial={false} mode="popLayout">
            {filtered.slice(0, limit).map((r, i) => {
              const site = lk.sites.get(r.o.siteId);
              const st = lk.serviceTypes.get(r.o.serviceTypeId);
              return (
                <motion.li
                  key={r.o.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE, delay: Math.min(i, 8) * 0.035 } }}
                  exit={{ opacity: 0, transition: { duration: 0.15 } }}
                  className="border-b border-hairline last:border-0"
                >
                  <Link
                    href={`/ordenes/${r.o.folio}`}
                    className="group grid grid-cols-[52px_minmax(0,1fr)] items-center gap-x-4 gap-y-2 py-4 md:grid-cols-[64px_56px_minmax(0,1fr)_120px_64px]"
                  >
                    <DateBadge date={r.o.closure!.validatedAt} />
                    <span className="hidden aspect-[4/3] w-14 overflow-hidden rounded-[10px] bg-[#eef1f5] ring-1 ring-black/5 md:block">
                      {r.cover && <PhotoImage photo={r.cover} />}
                    </span>
                    {/* phones: the "después" cover goes under the date, beside the status row */}
                    {r.cover && (
                      <span aria-hidden className="col-start-1 row-start-2 aspect-[4/3] w-[52px] overflow-hidden rounded-[10px] bg-[#eef1f5] ring-1 ring-black/5 md:hidden">
                        <PhotoImage photo={r.cover} />
                      </span>
                    )}
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] font-semibold text-ink group-hover:text-link">{r.o.title}</span>
                      <span className="mt-0.5 block truncate text-[13px] text-subtle">
                        <span className="tabular">{r.o.folio}</span> · {site?.name} · {st?.short ?? st?.name}
                      </span>
                      {r.survey?.answers?.comment && (
                        <span className="mt-1 line-clamp-1 block font-serif text-[14px] italic text-ink/75">“{r.survey.answers.comment}”</span>
                      )}
                    </span>
                    <span className="col-start-2 flex flex-wrap items-center gap-2 md:col-start-auto md:flex-col md:items-start md:gap-1">
                      {r.survey?.answers ? (
                        <Stars value={r.survey.answers.overall} size={13} />
                      ) : (
                        <span className="text-[12.5px] text-subtle">{r.survey ? "Encuesta pendiente" : "Sin encuesta"}</span>
                      )}
                      {r.kase && (
                        <span className="inline-flex h-[22px] items-center rounded-md bg-[#fdeeee] px-2 text-[11.5px] font-semibold text-st-red">Queja {r.kase.folio}</span>
                      )}
                      <HoursChip minutes={r.minutes} className="ml-auto" />
                    </span>
                    <span className="hidden text-right text-[15px] font-semibold text-ink tabular md:block">{r.minutes ? fmtHours(r.minutes) : "—"}</span>
                  </Link>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}
      {filtered.length > limit && (
        <div className="mt-5 flex justify-center">
          <Button variant="outline" className={outlineBtnCls} onClick={() => setLimit((l) => l + PAGE)}>
            Ver más · quedan {filtered.length - limit}
          </Button>
        </div>
      )}
    </section>
  );
}
