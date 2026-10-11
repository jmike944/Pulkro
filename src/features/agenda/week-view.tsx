"use client";

import { Fragment, useEffect, useMemo, useRef } from "react";
import { motion } from "motion/react";
import { CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtTime, plural } from "@/lib/format";
import { PersonAvatar } from "@/components/pk/bits";
import { EmptyState } from "@/components/pk/feedback";
import { staggerContainer } from "@/components/pk/motion";
import { ReasonTip } from "@/components/pk/reason-tip";
import { dayKey, dowShort, type AgendaItem } from "./agenda-model";
import { JornadaBlock } from "./jornada-block";
import type { AgendaData, Lane } from "./use-agenda";

type Props = {
  data: AgendaData;
  now: Date;
  focusKey: string;
  onOpen: (jornadaId: string) => void;
  onPickDay: (d: Date) => void;
  highlightOrderId?: string | null;
};

/**
 * Semana: day columns (lun–sáb, + dom when there is work) × supervisor lanes.
 * Today is tinted sky with a "Hoy" pill and a live red "now" line between jornadas.
 * Phones get a swipeable column per day instead of the grid.
 */
export function WeekView(props: Props) {
  const { data } = props;
  if (data.items.length === 0) {
    return (
      <EmptyState icon={<CalendarDays />} title="Semana sin jornadas">
        No hay jornadas programadas en su alcance para estos días. Use las flechas para ver otra semana
        {data.unassigned.length ? " o programe las órdenes pendientes." : "."}
      </EmptyState>
    );
  }
  return (
    <>
      <WeekGrid {...props} />
      <WeekSwipe {...props} />
    </>
  );
}

function useCells(items: AgendaItem[]) {
  return useMemo(() => {
    const m = new Map<string, AgendaItem[]>();
    items.forEach((it) => {
      const k = `${it.order.supervisorId}|${it.j.date}`;
      const list = m.get(k) ?? [];
      list.push(it);
      m.set(k, list);
    });
    return m;
  }, [items]);
}

const minutesOfDay = (d: Date) => d.getHours() * 60 + d.getMinutes();

/* ───────────── desktop grid ───────────── */

function WeekGrid({ data, now, onOpen, onPickDay, highlightOrderId }: Props) {
  const { days, lanes, items, multiLane } = data;
  const cells = useCells(items);
  const todayK = dayKey(now);
  // Lane column: avatar only on narrow desktops, avatar + name from xl.
  const cols = multiLane ? `var(--lane) repeat(${days.length}, minmax(0, 1fr))` : `repeat(${days.length}, minmax(0, 1fr))`;
  const dayPct = Math.max(0, Math.min(1, (minutesOfDay(now) - 360) / 960));

  return (
    <div className="hidden overflow-hidden rounded-[22px] border border-hairline bg-surface shadow-soft [--lane:56px] md:block xl:[--lane:132px]">
      <motion.div variants={staggerContainer(0, 0.05)} initial="hidden" animate="show" className="grid" style={{ gridTemplateColumns: cols }}>
        {multiLane && (
          <div className="flex items-end border-b border-hairline bg-wash px-3 pb-3 text-[12px] font-semibold uppercase tracking-[0.1em] text-subtle xl:px-4">
            <span className="hidden xl:inline">Supervisor</span>
          </div>
        )}
        {days.map((d, di) => {
          const k = dayKey(d);
          const isToday = k === todayK;
          const count = items.filter((i) => i.j.date === k).length;
          return (
            <button
              key={k}
              type="button"
              onClick={() => onPickDay(d)}
              aria-label={`Ver ${dowShort(d)} ${d.getDate()} en vista de día`}
              className={cn(
                "group relative border-b border-hairline px-3 pb-3 pt-3.5 text-left outline-none transition-colors hover:bg-soft focus-visible:bg-soft",
                (multiLane || di > 0) && "border-l",
                isToday ? "bg-sky-soft/70 hover:bg-sky-soft" : "bg-wash",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className={cn("text-[11.5px] font-semibold uppercase tracking-[0.1em]", isToday ? "text-sky-fg" : "text-subtle")}>{dowShort(d)}</span>
                {isToday && (
                  <span className="rounded-full bg-brand-deep px-2 py-0.5 text-[10.5px] font-semibold tracking-wide text-white">Hoy</span>
                )}
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-[22px] font-medium leading-none tracking-[-0.02em] text-ink tabular">{d.getDate()}</span>
                <span className="truncate text-[12px] text-subtle">{count ? plural(count, "jornada", "jornadas") : "Libre"}</span>
              </div>
              {isToday && (
                <div className="relative mt-2.5 h-[3px] rounded-full bg-surface" aria-hidden>
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${dayPct * 100}%` }}
                    transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
                    className="h-full rounded-full bg-sky"
                  />
                  <motion.span
                    initial={{ left: 0 }}
                    animate={{ left: `${dayPct * 100}%` }}
                    transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
                    className="absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-st-red ring-2 ring-surface"
                  />
                </div>
              )}
            </button>
          );
        })}

        {lanes.map((lane, li) => (
          <Fragment key={lane.id}>
            {multiLane && <LaneLabel lane={lane} last={li === lanes.length - 1} />}
            {days.map((d, di) => {
              const k = dayKey(d);
              return (
                <Cell
                  key={k}
                  items={cells.get(`${lane.id}|${k}`) ?? []}
                  isToday={k === todayK}
                  now={now}
                  wave={di + li}
                  bordered={multiLane || di > 0}
                  last={li === lanes.length - 1}
                  showNowLabel={li === 0}
                  onOpen={onOpen}
                  highlightOrderId={highlightOrderId}
                />
              );
            })}
          </Fragment>
        ))}
      </motion.div>
    </div>
  );
}

function LaneLabel({ lane, last }: { lane: Lane; last: boolean }) {
  const u = lane.user;
  // below xl only the avatar fits: hover shows the tooltip, a tap on touch tablets opens the same text
  return (
    <ReasonTip reason={u ? `${u.name} · ${plural(lane.items, "jornada", "jornadas")}` : undefined} side="right" icon={null} contentClassName="max-w-[260px] text-[12.5px]">
      <div tabIndex={u ? 0 : undefined} className={cn("flex items-start gap-2.5 px-3 py-3 outline-none focus-visible:bg-soft xl:px-4", !last && "border-b border-hairline")}>
        {u && <PersonAvatar initials={u.initials} hue={u.hue} size={30} />}
        <div className="hidden min-w-0 xl:block">
          <p className="truncate text-[13.5px] font-semibold leading-tight text-ink">{u ? u.name.split(" ").slice(0, 2).join(" ") : "Sin supervisor"}</p>
          <p className="mt-0.5 text-[12px] text-subtle">{plural(lane.items, "jornada", "jornadas")}</p>
        </div>
      </div>
    </ReasonTip>
  );
}

function Cell({
  items,
  isToday,
  now,
  wave,
  bordered,
  last,
  showNowLabel,
  onOpen,
  highlightOrderId,
}: {
  items: AgendaItem[];
  isToday: boolean;
  now: Date;
  wave: number;
  bordered: boolean;
  last: boolean;
  showNowLabel: boolean;
  onOpen: (id: string) => void;
  highlightOrderId?: string | null;
}) {
  // "now" sits after every jornada that already started.
  const nowIdx = isToday ? items.filter((i) => i.start <= now).length : -1;
  return (
    <div className={cn("relative min-h-[108px] space-y-1.5 p-1.5", bordered && "border-l border-hairline", !last && "border-b border-hairline", isToday && "bg-sky-soft/45")}>
      {items.map((it, k) => (
        <Fragment key={it.j.id}>
          {k === nowIdx && <NowLine now={now} label={showNowLabel} />}
          <JornadaBlock item={it} onOpen={onOpen} wave={wave + k * 0.6} highlight={highlightOrderId === it.order.id} />
        </Fragment>
      ))}
      {isToday && nowIdx === items.length && <NowLine now={now} label={showNowLabel} />}
    </div>
  );
}

export function NowLine({ now, label = true, className }: { now: Date; label?: boolean; className?: string }) {
  return (
    <motion.div layout="position" className={cn("relative flex items-center gap-1.5 py-0.5", className)} role="separator" aria-label={`Ahora, ${fmtTime(now)}`}>
      <span className="relative inline-flex size-2 shrink-0">
        <span className="absolute inset-0 animate-ping-soft rounded-full bg-st-red" />
        <span className="relative size-2 rounded-full bg-st-red" />
      </span>
      <span className="h-[1.5px] flex-1 rounded-full bg-st-red/80" />
      {label && <span className="text-[10.5px] font-semibold text-red-fg tabular">{fmtTime(now)}</span>}
    </motion.div>
  );
}

/* ───────────── phones: one swipeable column per day ───────────── */

function WeekSwipe({ data, now, focusKey, onOpen, onPickDay, highlightOrderId }: Props) {
  const { days, items, multiLane } = data;
  const todayK = dayKey(now);
  const ref = useRef<HTMLDivElement>(null);

  // Bring the focused day (today by default) into view when the week changes.
  useEffect(() => {
    const scroller = ref.current;
    if (!scroller) return;
    const el = scroller.querySelector<HTMLElement>(`[data-day="${focusKey}"]`);
    if (!el) return;
    const pad = parseFloat(getComputedStyle(scroller).paddingLeft) || 0;
    scroller.scrollTo({ left: Math.max(0, el.offsetLeft - pad) });
  }, [focusKey]);

  return (
    <div
      ref={ref}
      className="scrollbar-none relative -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:-mx-7 sm:px-7 md:hidden"
      aria-label="Jornadas de la semana, deslice para ver más días"
    >
      {days.map((d, di) => {
        const k = dayKey(d);
        const isToday = k === todayK;
        const list = items.filter((i) => i.j.date === k);
        const nowIdx = isToday ? list.filter((i) => i.start <= now).length : -1;
        return (
          <section
            key={k}
            data-day={k}
            className={cn(
              "w-[82%] max-w-[330px] shrink-0 snap-start rounded-[20px] border p-3",
              isToday ? "border-sky/70 bg-sky-soft/50" : "border-hairline bg-wash",
            )}
          >
            <button type="button" onClick={() => onPickDay(d)} className="mb-3 flex w-full min-h-10 items-center justify-between gap-2 px-1 text-left">
              <span className="flex items-baseline gap-2">
                <span className={cn("text-[12px] font-semibold uppercase tracking-[0.1em]", isToday ? "text-sky-fg" : "text-subtle")}>{dowShort(d)}</span>
                <span className="text-[22px] font-medium leading-none text-ink tabular">{d.getDate()}</span>
              </span>
              <span className="flex items-center gap-2 text-[12.5px] text-subtle">
                {list.length ? plural(list.length, "jornada", "jornadas") : "Libre"}
                {isToday && <span className="rounded-full bg-brand-deep px-2 py-0.5 text-[10.5px] font-semibold text-white">Hoy</span>}
              </span>
            </button>
            <div className="space-y-2">
              {list.length === 0 && !isToday && <p className="rounded-[14px] border border-dashed border-line-strong px-3 py-6 text-center text-[13px] text-subtle">Sin jornadas</p>}
              {list.map((it, idx) => (
                <Fragment key={it.j.id}>
                  {idx === nowIdx && <NowLine now={now} />}
                  <JornadaBlock item={it} onOpen={onOpen} wave={di * 0.4 + idx} showSupervisor={multiLane} highlight={highlightOrderId === it.order.id} />
                </Fragment>
              ))}
              {isToday && nowIdx === list.length && <NowLine now={now} />}
            </div>
          </section>
        );
      })}
    </div>
  );
}
