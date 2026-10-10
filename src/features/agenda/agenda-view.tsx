"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion, type Variants } from "motion/react";
import { addDays, parseISO, startOfDay } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore, useCan, useMediaQuery, useNow } from "@/lib/hooks";
import { fmtDay, plural } from "@/lib/format";
import { PageHeader, Segmented } from "@/components/pk/page";
import { EASE } from "@/components/pk/motion";
import { Button } from "@/components/ui/button";
import {
  VIEW_ITEMS,
  dayKey,
  longDay,
  parseFecha,
  rangeLabel,
  weekNumber,
  weekStartOf,
  type AgendaView as View,
} from "./agenda-model";
import { useAgendaData } from "./use-agenda";
import { WeekView } from "./week-view";
import { DayView } from "./day-view";
import { ListView } from "./list-view";
import { ConflictsNote, WorkloadStrip } from "./workload-strip";
import { UnassignedRail, UnassignedSection } from "./unassigned-panel";
import { JornadaSheet, type SheetState } from "./jornada-sheet";
import { ScheduleDialog, type ScheduleState } from "./schedule-dialog";

/** Week/day switch: slides in the direction of travel (custom = ±1). */
const viewSlide: Variants = {
  hidden: (d: number) => ({ opacity: 0, x: d * 36 }),
  show: { opacity: 1, x: 0, transition: { duration: 0.34, ease: EASE } },
  exit: (d: number) => ({ opacity: 0, x: d * -36, transition: { duration: 0.16, ease: EASE } }),
};

const labelSlide: Variants = {
  hidden: (d: number) => ({ opacity: 0, y: d * 8 }),
  show: { opacity: 1, y: 0, transition: { duration: 0.28, ease: EASE } },
  exit: (d: number) => ({ opacity: 0, y: d * -8, transition: { duration: 0.12 } }),
};

/**
 * Agenda y asignación (doc §7): the supervisor plans crews and dates; Dirección and
 * Administración consult. `?fecha=yyyy-MM-dd` anchors the week/day.
 */
export function AgendaView() {
  const searchParams = useSearchParams();
  const now = useNow(60_000);
  const todayK = dayKey(now);
  const focus = parseFecha(searchParams.get("fecha"), now);
  const focusKey = dayKey(focus);
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const canPlan = useCan("crew.assign");

  const [viewChoice, setViewChoice] = useState<View | null>(null);
  const view: View = viewChoice ?? (isDesktop ? "semana" : "lista");
  const [dir, setDir] = useState(1);
  const [sheet, setSheet] = useState<SheetState>(null);
  const [sched, setSched] = useState<ScheduleState>(null);
  const [highlight, setHighlight] = useState<string | null>(null);

  const data = useAgendaData(focusKey, now);
  const weekKey = dayKey(weekStartOf(focus));
  const isThisWeek = weekKey === dayKey(weekStartOf(now));

  // Activity keeps this route alive in the background: drop transient overlays when it hides.
  useLayoutEffect(
    () => () => {
      setSheet(null);
      setSched(null);
    },
    [],
  );

  const setFecha = (d: Date) => {
    const k = dayKey(d);
    const params = new URLSearchParams(window.location.search);
    if (k === todayK) params.delete("fecha");
    else params.set("fecha", k);
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
  };
  const go = (d: Date) => {
    setDir(dayKey(d) >= focusKey ? 1 : -1);
    setFecha(d);
  };
  const step = (n: number) => go(addDays(focus, n * (view === "dia" ? 1 : 7)));
  const goToday = () => go(startOfDay(now));
  const pickDay = (d: Date) => {
    setViewChoice("dia");
    go(d);
  };
  const flash = (orderId: string) => {
    setHighlight(orderId);
    window.setTimeout(() => setHighlight((h) => (h === orderId ? null : h)), 2600);
  };

  // ← → move through weeks/days, T jumps to today (when no overlay or field has focus).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (sheet?.open || sched?.open || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, select, [contenteditable='true'], [role='dialog'], [role='menu']")) return;
      if (e.key === "ArrowLeft") step(-1);
      else if (e.key === "ArrowRight") step(1);
      else if (e.key === "t" || e.key === "T") goToday();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const openJornada = (id: string) => setSheet({ id, open: true });

  const noCrew = data.unassigned.filter((o) => o.status === "borrador").length;
  const toConfirm = data.unassigned.filter((o) => o.status === "reprogramada").length;
  const description = (
    <>
      {isThisWeek ? "Esta semana" : `Semana del ${fmtDay(data.days[0])}`}: <b>{plural(data.stats.jornadas, "jornada", "jornadas")}</b> con{" "}
      <b>{plural(data.stats.people, "persona", "personas")}</b> {data.stats.people === 1 ? "asignada" : "asignadas"}.{" "}
      {noCrew > 0 && (
        <>
          <b>{plural(noCrew, "orden", "órdenes")}</b> sin cuadrilla
        </>
      )}
      {noCrew > 0 && toConfirm > 0 && " y "}
      {toConfirm > 0 && (
        <>
          <b>{toConfirm}</b> por confirmar fecha
        </>
      )}
      {noCrew + toConfirm > 0 ? "." : "Todo asignado."}
      {isThisWeek && data.stats.live > 0 && (
        <>
          {" "}
          <b>{data.stats.live}</b> en curso ahora.
        </>
      )}
    </>
  );

  const label = view === "dia" ? longDay(focus) : rangeLabel(data.days);
  const animKey = `${view}-${view === "dia" ? focusKey : weekKey}`;
  const unassignedProps = { orders: data.unassigned, reasons: data.reasons, canPlan, onSchedule: (orderId: string) => setSched({ orderId, open: true }) };

  return (
    <div>
      <PageHeader
        title="Agenda"
        description={description}
        actions={
          <>
            <Button variant="outline" onClick={goToday} className="h-10 rounded-[12px] border-[#dfe3ea] px-4 text-[14px] font-semibold shadow-[0_1px_2px_rgb(16_24_40/0.05)]">
              Hoy
            </Button>
            <div className="flex items-center rounded-[12px] border border-[#dfe3ea] bg-white p-0.5 shadow-[0_1px_2px_rgb(16_24_40/0.05)]">
              <button
                type="button"
                onClick={() => step(-1)}
                aria-label={view === "dia" ? "Día anterior" : "Semana anterior"}
                className="inline-flex size-10 items-center justify-center rounded-[10px] text-ink transition hover:bg-muted active:scale-95"
              >
                <ChevronLeft className="size-[18px]" />
              </button>
              <span className="h-5 w-px bg-hairline" />
              <button
                type="button"
                onClick={() => step(1)}
                aria-label={view === "dia" ? "Día siguiente" : "Semana siguiente"}
                className="inline-flex size-10 items-center justify-center rounded-[10px] text-ink transition hover:bg-muted active:scale-95"
              >
                <ChevronRight className="size-[18px]" />
              </button>
            </div>
          </>
        }
      />

      {/* The rail appears once the week grid keeps ≥ 105 px per day (later for supervisor lanes). */}
      <div
        className={cn(
          data.multiLane
            ? "2xl:grid 2xl:grid-cols-[minmax(0,1fr)_300px] 2xl:items-start 2xl:gap-8"
            : "min-[1400px]:grid min-[1400px]:grid-cols-[minmax(0,1fr)_300px] min-[1400px]:items-start min-[1400px]:gap-8",
        )}
      >
        <div className="min-w-0">
          <div className={cn("mb-6", data.multiLane ? "2xl:hidden" : "min-[1400px]:hidden")}>
            <UnassignedSection {...unassignedProps} />
          </div>

          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <AnimatePresence mode="wait" initial={false} custom={dir}>
                <motion.h2
                  key={label}
                  custom={dir}
                  variants={labelSlide}
                  initial="hidden"
                  animate="show"
                  exit="exit"
                  className="text-[22px] font-medium tracking-[-0.02em] text-ink sm:text-[24px]"
                >
                  {label}
                </motion.h2>
              </AnimatePresence>
              <p className="mt-0.5 text-[13px] text-subtle">
                Semana {weekNumber(focus)} · {data.scopeLabel}
                {data.multiLane ? ` · ${plural(data.lanes.length, "supervisor", "supervisores")}` : ""}
              </p>
            </div>
            <Segmented id="agenda-view" items={VIEW_ITEMS} value={view} onChange={setViewChoice} className="[&>button]:min-h-10 sm:[&>button]:min-h-0" />
          </div>

          <WorkloadStrip
            loads={data.loads}
            available={data.available}
            focusKey={focusKey}
            todayKey={todayK}
            activeDay={view === "dia"}
            scopeLabel={data.scopeLabel}
            onPick={pickDay}
          />
          <ConflictsNote conflicts={data.conflicts} onOpen={openJornada} when={isThisWeek ? "esta semana" : `la semana del ${fmtDay(data.days[0])}`} />

          <div className="-mx-4 overflow-x-clip px-4 pb-2 sm:-mx-7 sm:px-7 md:mx-0 md:px-0">
            <AnimatePresence mode="wait" custom={dir}>
              <motion.div key={animKey} custom={dir} variants={viewSlide} initial="hidden" animate="show" exit="exit">
                {view === "semana" && <WeekView data={data} now={now} focusKey={focusKey} onOpen={openJornada} onPickDay={pickDay} highlightOrderId={highlight} />}
                {view === "dia" && <DayView data={data} day={focus} now={now} onOpen={openJornada} highlightOrderId={highlight} />}
                {view === "lista" && <ListView data={data} now={now} onOpen={openJornada} highlightOrderId={highlight} />}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        <aside
          className={cn("hidden", data.multiLane ? "2xl:sticky 2xl:top-6 2xl:block" : "min-[1400px]:sticky min-[1400px]:top-6 min-[1400px]:block")}
          aria-label="Órdenes por asignar"
        >
          <UnassignedRail {...unassignedProps} />
        </aside>
      </div>

      <JornadaSheet
        state={sheet}
        onOpenChange={(open) => setSheet((s) => (s ? { ...s, open } : s))}
        onSelect={(id) => setSheet({ id, open: true })}
        onMoved={(id, date) => {
          setSheet({ id, open: true });
          const orderId = useAppStore.getState().jornadas.find((j) => j.id === id)?.orderId;
          if (orderId) flash(orderId);
          go(parseISO(date));
        }}
      />
      <ScheduleDialog
        state={sched}
        todayKey={todayK}
        onOpenChange={(open) => setSched((s) => (s ? { ...s, open } : s))}
        onDone={(orderId, firstDate) => {
          setSched((s) => (s ? { ...s, open: false } : s));
          flash(orderId);
          go(parseISO(firstDate));
        }}
      />
    </div>
  );
}
