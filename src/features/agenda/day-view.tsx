"use client";

import { Fragment, useMemo } from "react";
import { isSameDay } from "date-fns";
import { motion } from "motion/react";
import { CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMediaQuery } from "@/lib/hooks";
import { fmtTime, plural } from "@/lib/format";
import { EmptyState } from "@/components/pk/feedback";
import { staggerContainer } from "@/components/pk/motion";
import { dayKey, hourRange, longDay, packColumns, type AgendaItem } from "./agenda-model";
import { JornadaBlock, JornadaRow } from "./jornada-block";
import { NowLine } from "./week-view";
import type { AgendaData } from "./use-agenda";

const HOUR_PX = 64;
const MIN_BLOCK = 46; // keeps every block tappable (≥ 40px)
const minutesOfDay = (d: Date) => d.getHours() * 60 + d.getMinutes();
const pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * Día: vertical timeline (06:00–22:00, widened for night work) with blocks positioned by time.
 * Phones can't fit side-by-side columns (a 5-way overlap leaves ~45px each), so when jornadas overlap
 * they become the same time-sorted rows as Lista, with place and supervisor in plain sight.
 */
export function DayView({
  data,
  day,
  now,
  onOpen,
  highlightOrderId,
}: {
  data: AgendaData;
  day: Date;
  now: Date;
  onOpen: (jornadaId: string) => void;
  highlightOrderId?: string | null;
}) {
  const k = dayKey(day);
  const items = useMemo(() => data.items.filter((i) => i.j.date === k), [data.items, k]);
  const isToday = isSameDay(day, now);
  const wide = useMediaQuery("(min-width: 768px)");
  const { from, to } = hourRange(items, day);
  const total = (to - from) * HOUR_PX;
  const startMin = from * 60;
  const people = new Set(items.flatMap((i) => i.j.workerIds)).size;

  const boxes = useMemo(
    () =>
      packColumns(
        items.map((it: AgendaItem) => {
          const s = isSameDay(it.start, day) ? minutesOfDay(it.start) : 0;
          const e = isSameDay(it.end, day) ? minutesOfDay(it.end) : 24 * 60;
          const top = ((s - startMin) / 60) * HOUR_PX;
          const bottom = Math.max(top + MIN_BLOCK, ((e - startMin) / 60) * HOUR_PX);
          return { it, top, bottom, continues: !isSameDay(it.end, day) };
        }),
      ),
    [items, day, startMin],
  );

  // supervisors merged (Dirección/Administración) need the name next to each block, so any overlap switches there
  const maxCols = boxes.reduce((m, b) => Math.max(m, b.cols), 1);
  const stacked = !wide && maxCols > (data.multiLane ? 1 : 2);

  const nowMin = minutesOfDay(now);
  const showNow = isToday && nowMin >= startMin && nowMin <= to * 60;
  const nowTop = ((nowMin - startMin) / 60) * HOUR_PX;
  const hours = Array.from({ length: to - from + 1 }, (_, i) => from + i);

  return (
    <div className="rounded-[22px] border border-hairline bg-white p-3 shadow-soft sm:p-5">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-1">
        <h3 className="flex items-center gap-2.5 text-[17px] font-medium text-ink">
          {longDay(day)}
          {isToday && <span className="rounded-full bg-brand-deep px-2 py-0.5 text-[11px] font-semibold text-white">Hoy</span>}
        </h3>
        <p className="text-[13px] text-subtle">
          {items.length ? (
            <>
              <b className="font-semibold text-ink">{plural(items.length, "jornada", "jornadas")}</b> · {plural(people, "persona", "personas")}
            </>
          ) : (
            "Sin jornadas"
          )}
        </p>
      </div>

      {items.length === 0 ? (
        <EmptyState icon={<CalendarDays />} title="Día libre" className="border-none py-10">
          No hay jornadas programadas este día en tu alcance.
        </EmptyState>
      ) : stacked ? (
        <DayStack items={items} now={now} isToday={isToday} multiLane={data.multiLane} onOpen={onOpen} highlightOrderId={highlightOrderId} />
      ) : (
        <div className="grid grid-cols-[42px_minmax(0,1fr)] gap-2 pt-2 sm:grid-cols-[52px_minmax(0,1fr)]">
          <div className="relative" style={{ height: total }} aria-hidden>
            {hours.map((h) => (
              <span key={h} className="absolute right-0 -translate-y-1/2 text-[11.5px] text-subtle tabular" style={{ top: (h - from) * HOUR_PX }}>
                {pad2(h % 24)}:00
              </span>
            ))}
          </div>
          <div className="relative" style={{ height: total }}>
            {hours.map((h) => (
              <div key={h} aria-hidden className="absolute inset-x-0 border-t border-hairline" style={{ top: (h - from) * HOUR_PX }} />
            ))}
            {hours.slice(0, -1).map((h) => (
              <div key={`half-${h}`} aria-hidden className="absolute inset-x-0 border-t border-dashed border-[#f0f2f5]" style={{ top: (h - from + 0.5) * HOUR_PX }} />
            ))}
            {isToday && (
              <div
                aria-hidden
                className="absolute inset-x-0 top-0 rounded-[10px] bg-[#f6f8fa]/80"
                style={{ height: Math.max(0, Math.min(total, nowTop)) }}
              />
            )}

            {boxes.map((b, i) => (
              <div
                key={b.it.j.id}
                className="absolute p-[3px]"
                style={{ top: b.top, height: b.bottom - b.top, left: `${(b.col / b.cols) * 100}%`, width: `${100 / b.cols}%` }}
              >
                <JornadaBlock
                  item={b.it}
                  variant="timeline"
                  heightPx={b.bottom - b.top - 6}
                  wave={i}
                  onOpen={onOpen}
                  showSupervisor={data.multiLane}
                  highlight={highlightOrderId === b.it.order.id}
                />
                {b.continues && (
                  <span className={cn("pointer-events-none absolute bottom-2 right-3 text-[10.5px] font-semibold", b.it.visual.live ? "text-white/70" : "text-subtle")}>
                    continúa →
                  </span>
                )}
              </div>
            ))}

            {showNow && (
              <motion.div
                className="pointer-events-none absolute -left-2 right-0 z-10 flex items-center"
                initial={false}
                animate={{ top: nowTop }}
                transition={{ type: "spring", stiffness: 120, damping: 20 }}
                style={{ top: nowTop }}
                role="separator"
                aria-label={`Ahora, ${fmtTime(now)}`}
              >
                <span className="relative inline-flex size-2.5 -translate-y-1/2">
                  <span className="absolute inset-0 animate-ping-soft rounded-full bg-st-red" />
                  <span className="relative size-2.5 rounded-full bg-st-red ring-2 ring-white" />
                </span>
                <span className="h-[2px] flex-1 -translate-y-1/2 bg-st-red/85" />
                <span className="-translate-y-1/2 rounded-full bg-st-red px-1.5 py-0.5 text-[10.5px] font-semibold text-white tabular">{fmtTime(now)}</span>
              </motion.div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Phones, overlapping day: rows by start time (like Lista) with the "now" line between them. */
function DayStack({
  items,
  now,
  isToday,
  multiLane,
  onOpen,
  highlightOrderId,
}: {
  items: AgendaItem[];
  now: Date;
  isToday: boolean;
  multiLane: boolean;
  onOpen: (jornadaId: string) => void;
  highlightOrderId?: string | null;
}) {
  const nowIdx = isToday ? items.filter((i) => i.start <= now).length : -1;
  return (
    <>
      <p className="px-1 pb-1 text-[12.5px] leading-snug text-subtle">Varias jornadas coinciden en horario: se listan por hora de inicio.</p>
      <motion.ul variants={staggerContainer(0.045, 0.05)} initial="hidden" animate="show" className="[&>li:last-child>button]:border-b-0">
        {items.map((it, idx) => (
          <Fragment key={it.j.id}>
            {idx === nowIdx && (
              <li className="py-1">
                <NowLine now={now} />
              </li>
            )}
            <JornadaRow item={it} onOpen={onOpen} showSupervisor={multiLane} highlight={highlightOrderId === it.order.id} />
          </Fragment>
        ))}
        {isToday && nowIdx === items.length && (
          <li className="py-2">
            <NowLine now={now} />
          </li>
        )}
      </motion.ul>
    </>
  );
}
