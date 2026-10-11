"use client";

import { useMemo, useState } from "react";
import { LayoutGroup, motion } from "motion/react";
import { Award, CalendarDays, ChevronRight, Info, Star, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtNum, plural } from "@/lib/format";
import type { Role, Unit } from "@/lib/types";
import { AuroraFrame } from "@/components/pk/aurora";
import { AnimatedNumber, Insight, MiniStat, PersonAvatar } from "@/components/pk/bits";
import { Segmented } from "@/components/pk/page";
import { EmptyState } from "@/components/pk/feedback";
import { MobileRow } from "@/components/pk/mobile";
import { EASE } from "@/components/pk/motion";
import { useCanSeeRoute } from "@/components/shell/use-can-see-route";
import type { Indicators } from "./compute";
import type { PeriodWindow } from "./period";
import { Stars } from "./bits";
import type { Drill } from "./drill-sheet";

type SortKey = "closed" | "hours" | "csat";
type Row = Indicators["productivity"][number];

const SORTS: { value: SortKey; label: string }[] = [
  { value: "closed", label: "Cerradas" },
  { value: "hours", label: "Horas" },
  { value: "csat", label: "Satisfacción" },
];

/** §5 "Productividad por supervisor": cerradas, abiertas, horas reales, h/servicio y satisfacción. */
export function PersonalTab({
  ind,
  win,
  role,
  units,
  onDrill,
}: {
  ind: Indicators;
  win: PeriodWindow;
  role: Role;
  units: Map<string, Unit>;
  onDrill: (d: Drill) => void;
}) {
  const canSee = useCanSeeRoute();
  const [sort, setSort] = useState<SortKey>("closed");
  const rows = useMemo(() => {
    const xs = [...ind.productivity];
    const by: Record<SortKey, (r: Row) => number> = { closed: (r) => r.closed, hours: (r) => r.hours, csat: (r) => r.csat };
    return xs.sort((a, b) => by[sort](b) - by[sort](a) || b.closed - a.closed);
  }, [ind.productivity, sort]);

  const totals = useMemo(() => {
    const closed = rows.reduce((a, r) => a + r.closed, 0);
    const open = rows.reduce((a, r) => a + r.open, 0);
    const hours = rows.reduce((a, r) => a + r.hours, 0);
    // Same denominator as the rows: real hours of closed orders ÷ closed orders.
    return { closed, open, hours, hps: ind.hours.avgMinutes / 60 };
  }, [rows, ind.hours.avgMinutes]);

  const best = useMemo(() => [...ind.productivity].filter((r) => r.csat > 0).sort((a, b) => b.csat - a.csat || b.surveys - a.surveys)[0], [ind.productivity]);
  const busiest = useMemo(() => [...ind.productivity].sort((a, b) => b.open - a.open)[0], [ind.productivity]);
  const openDrill = (r: Row) =>
    onDrill({
      title: r.user.name,
      description: `Cerradas en ${win.phrase} y abiertas del periodo`,
      orders: ind.prodOrders.filter((o) => o.supervisorId === r.user.id),
    });
  // Dirección in "todas las unidades": the phone rows need the unit to tell supervisors apart (the table has a column for it).
  const multiUnit = useMemo(() => new Set(ind.productivity.map((r) => r.user.unitId)).size > 1, [ind.productivity]);
  const maxClosed = Math.max(1, ...rows.map((r) => r.closed));
  const maxHours = Math.max(1, ...rows.map((r) => r.hours));

  if (rows.length === 0) {
    return (
      <EmptyState icon={<Users />} title="Sin supervisores en el alcance">
        No hay supervisores activos en la unidad seleccionada.
      </EmptyState>
    );
  }

  return (
    <section className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_320px] xl:gap-0">
      <div className="min-w-0 xl:border-r xl:border-hairline xl:pr-10">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-[19px] font-medium tracking-[-0.01em] text-ink">Productividad por supervisor</h2>
            <p className="mt-1 text-[13.5px] text-subtle">
              Cerradas en {win.phrase} y abiertas del periodo · {win.cutoffLabel}
            </p>
          </div>
          {rows.length > 1 && (
            <Segmented id="sort-sup" items={SORTS} value={sort} onChange={setSort} className="print:hidden [&>button]:min-h-9" />
          )}
        </div>

        <div className="mb-7 grid grid-cols-2 gap-x-4 gap-y-5 rounded-[18px] bg-soft p-4 sm:grid-cols-4 sm:p-5">
          <MiniStat tone="navy" label="Cerradas" value={<AnimatedNumber value={totals.closed} />} />
          <MiniStat tone="blue" label="Abiertas" value={<AnimatedNumber value={totals.open} />} />
          <MiniStat tone="teal" label="Horas reales" value={<AnimatedNumber value={Math.round(totals.hours)} />} sub="h" />
          <MiniStat tone="violet" label="Horas / servicio" value={<AnimatedNumber value={Math.round(totals.hps * 10) / 10} format={{ maximumFractionDigits: 1 }} />} sub="h" />
        </div>

        {/* desktop table */}
        <div className="hidden lg:block print:block">
          <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_56px_minmax(0,0.9fr)_60px_68px] gap-4 border-b border-hairline pb-3 text-[12px] font-semibold uppercase tracking-[0.1em] text-subtle">
            <span>Supervisor</span>
            <span>Cerradas</span>
            <span className="text-right">Abiertas</span>
            <span>Horas reales</span>
            <span className="text-right">h/serv.</span>
            <span className="text-right">CSAT</span>
          </div>
          <LayoutGroup id="sup-table">
            <ul>
              {rows.map((r, i) => (
                <motion.li
                  key={r.user.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ layout: { type: "spring", stiffness: 420, damping: 36 }, duration: 0.4, ease: EASE, delay: i * 0.04 }}
                  className="border-b border-hairline"
                >
                  <button
                    type="button"
                    onClick={() => openDrill(r)}
                    aria-label={`Ver órdenes de ${r.user.name}`}
                    className="-mx-3 grid w-[calc(100%+24px)] grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_56px_minmax(0,0.9fr)_60px_68px] items-center gap-4 rounded-[14px] px-3 py-4 text-left transition-colors hover:bg-soft"
                  >
                    <SupervisorCell row={r} unit={units.get(r.user.unitId)} />
                    <BarCell value={r.closed} max={maxClosed} strong={sort === "closed" && i === 0} label={fmtNum(r.closed)} />
                    <span className="text-right text-[15px] text-ink tabular">{r.open}</span>
                    <BarCell value={r.hours} max={maxHours} strong={sort === "hours" && i === 0} label={`${fmtNum(Math.round(r.hours))} h`} />
                    <span className="text-right text-[15px] font-semibold text-ink tabular">{r.hoursPerService ? r.hoursPerService.toFixed(1) : "—"}</span>
                    <CsatCell value={r.csat} n={r.surveys} />
                  </button>
                </motion.li>
              ))}
            </ul>
          </LayoutGroup>
        </div>

        {/* phones & tablets: list rows */}
        <LayoutGroup id="sup-rows">
          <ul className="lg:hidden print:hidden">
            {rows.map((r, i) => (
              <motion.li
                key={r.user.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ layout: { type: "spring", stiffness: 420, damping: 36 }, duration: 0.4, ease: EASE, delay: i * 0.04 }}
                className="border-b border-hairline last:border-0"
              >
                <MobileRow
                  onClick={() => openDrill(r)}
                  className="min-h-[72px] border-0"
                  leading={<PersonAvatar name={r.user.name} initials={r.user.initials} hue={r.user.hue} size={44} />}
                  title={
                    multiUnit ? (
                      <>
                        {r.user.name}
                        <span className="block text-[13px] font-normal text-subtle">{units.get(r.user.unitId)?.name}</span>
                      </>
                    ) : (
                      r.user.name
                    )
                  }
                  meta={
                    <>
                      {plural(r.closed, "cerrada", "cerradas")} · {plural(r.open, "abierta", "abiertas")}
                    </>
                  }
                  status={{
                    tone: sort === "hours" && i === 0 ? "blue" : "teal",
                    label: `${fmtNum(Math.round(r.hours))} h reales${r.hoursPerService ? ` · ${r.hoursPerService.toFixed(1)} h/servicio` : ""}`,
                  }}
                  trailing={
                    <span className="flex shrink-0 items-center gap-2">
                      <CsatCell value={r.csat} n={r.surveys} />
                      <ChevronRight className="size-[18px] text-faint" />
                    </span>
                  }
                />
              </motion.li>
            ))}
          </ul>
        </LayoutGroup>

        <div className="mt-6 flex gap-3 rounded-[16px] border border-dashed border-amber-line-strong bg-amber-wash p-4 text-[13.5px] leading-relaxed text-ink">
          <Info className="mt-0.5 size-4 shrink-0 text-amber-fg" />
          <p>
            <b className="font-semibold">Definir denominador (PENDIENTE §5).</b> Las horas por servicio se calculan sobre órdenes con cierre validado. Falta
            acordar si la productividad se mide por servicio, por jornada o por hora-persona.
          </p>
        </div>
      </div>

      <div className="grid min-w-0 content-start gap-6 md:grid-cols-2 xl:grid-cols-1 xl:pl-10 print:hidden">
        {best ? (
          <AuroraFrame innerClassName="p-5 sm:p-6">
            <p className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-subtle">
              <Award className="size-4 text-azure-fg" /> Mejor calificación
            </p>
            <div className="mt-4 flex items-center gap-3">
              <PersonAvatar name={best.user.name} initials={best.user.initials} hue={best.user.hue} size={48} />
              <div className="min-w-0">
                <p className="truncate text-[17px] font-semibold text-ink">{best.user.name}</p>
                <p className="truncate text-[13px] text-subtle">{units.get(best.user.unitId)?.name}</p>
              </div>
            </div>
            <div className="mt-5 flex items-end gap-2">
              <AnimatedNumber value={Math.round(best.csat * 10) / 10} format={{ minimumFractionDigits: 1, maximumFractionDigits: 1 }} className="text-[48px] font-medium leading-none tracking-[-0.045em] text-ink" />
              <span className="mb-1 text-[14px] text-subtle">/ 5</span>
            </div>
            <Stars value={best.csat} className="mt-2" />
            <p className="mt-2 text-[13px] text-subtle">
              {plural(best.surveys, "encuesta respondida", "encuestas respondidas")} · {plural(best.closed, "servicio cerrado", "servicios cerrados")}
            </p>
          </AuroraFrame>
        ) : (
          <EmptyState icon={<Star />} title="Sin calificaciones">
            Aún no hay encuestas respondidas para este periodo.
          </EmptyState>
        )}
        {busiest && busiest.open > 0 && totals.open > 0 && role !== "supervisor" && (
          // Supervisors' own agenda is theirs: Dirección and Administración review the load in Equipo.
          <Insight icon={<CalendarDays />} href={canSee("/agenda") ? "/agenda" : "/equipo"} linkLabel={canSee("/agenda") ? "Revisar agenda" : "Ver equipo"}>
            <b className="font-semibold">{busiest.user.name.split(" ")[0]}</b> tiene {plural(busiest.open, "orden abierta", "órdenes abiertas")}: el{" "}
            {Math.round((busiest.open / totals.open) * 100)}% de la carga pendiente del equipo.
          </Insight>
        )}
        {role === "supervisor" && (
          <Insight icon={<Info />}>Solo ve su propia productividad. Dirección y Administración comparan entre supervisores.</Insight>
        )}
      </div>
    </section>
  );
}

function SupervisorCell({ row, unit }: { row: Row; unit?: Unit }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <PersonAvatar name={row.user.name} initials={row.user.initials} hue={row.user.hue} size={36} />
      <div className="min-w-0">
        <p className="truncate text-[15px] font-semibold text-ink">{row.user.name}</p>
        <p className="truncate text-[12.5px] text-subtle">{unit?.name ?? "—"}</p>
      </div>
    </div>
  );
}

function BarCell({ value, max, label, strong }: { value: number; max: number; label: string; strong?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="w-[44px] shrink-0 text-[15px] font-semibold text-ink tabular">{label}</span>
      <span className="h-[6px] min-w-0 flex-1 overflow-hidden rounded-full bg-well">
        <motion.span
          initial={{ width: 0 }}
          animate={{ width: `${(value / max) * 100}%` }}
          transition={{ duration: 0.9, ease: EASE, delay: 0.2 }}
          className={cn("block h-full rounded-full transition-colors", strong ? "bg-azure" : "bg-blue-line")}
        />
      </span>
    </div>
  );
}

function CsatCell({ value, n }: { value: number; n: number }) {
  if (!value) return <span className="text-right text-[14px] text-subtle">—</span>;
  return (
    <span className="flex flex-col items-end" title={plural(n, "encuesta", "encuestas")}>
      <span className={cn("inline-flex items-center gap-1 text-[15px] font-semibold tabular", value < 4 ? "text-amber-fg" : "text-ink")}>
        {value.toFixed(1)}
        <Star className="size-3.5 text-st-amber" fill="currentColor" strokeWidth={0} />
      </span>
      <span className="text-[11.5px] text-subtle tabular">{n} resp.</span>
    </span>
  );
}
