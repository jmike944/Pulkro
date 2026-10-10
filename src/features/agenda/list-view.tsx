"use client";

import { Fragment, useMemo } from "react";
import { motion } from "motion/react";
import { CalendarDays } from "lucide-react";
import { plural } from "@/lib/format";
import { DateBadge } from "@/components/pk/bits";
import { EmptyState } from "@/components/pk/feedback";
import { staggerContainer } from "@/components/pk/motion";
import { dayKey, longDay } from "./agenda-model";
import { JornadaRow } from "./jornada-block";
import { NowLine } from "./week-view";
import type { AgendaData } from "./use-agenda";

/** Lista: the week grouped by day, rows like the dashboard work list (cards on phones). */
export function ListView({
  data,
  now,
  onOpen,
  highlightOrderId,
}: {
  data: AgendaData;
  now: Date;
  onOpen: (jornadaId: string) => void;
  highlightOrderId?: string | null;
}) {
  const todayK = dayKey(now);
  const groups = useMemo(
    () =>
      data.days
        .map((d) => ({ d, k: dayKey(d), items: data.items.filter((i) => i.j.date === dayKey(d)) }))
        .filter((g) => g.items.length > 0 || g.k === todayK),
    [data.days, data.items, todayK],
  );

  if (data.items.length === 0) {
    return (
      <EmptyState icon={<CalendarDays />} title="Semana sin jornadas">
        No hay jornadas programadas en tu alcance para estos días.
      </EmptyState>
    );
  }

  return (
    <div className="space-y-9">
      {groups.map((g) => {
        const isToday = g.k === todayK;
        const people = new Set(g.items.flatMap((i) => i.j.workerIds)).size;
        const nowIdx = isToday ? g.items.filter((i) => i.start <= now).length : -1;
        return (
          <section key={g.k} aria-label={longDay(g.d)}>
            <header className="flex items-center gap-3.5 border-b border-hairline pb-3.5">
              <DateBadge date={g.d} tone={isToday ? "today" : undefined} />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-[16px] font-medium text-ink">
                  {longDay(g.d)}
                  {isToday && <span className="rounded-full bg-brand-deep px-2 py-0.5 text-[11px] font-semibold text-white">Hoy</span>}
                </p>
                <p className="mt-0.5 text-[13px] text-subtle">
                  {g.items.length ? `${plural(g.items.length, "jornada", "jornadas")} · ${plural(people, "persona", "personas")}` : "Sin jornadas"}
                </p>
              </div>
            </header>
            <motion.ul variants={staggerContainer(0.045, 0.05)} initial="hidden" animate="show">
              {g.items.map((it, idx) => (
                <Fragment key={it.j.id}>
                  {idx === nowIdx && (
                    <li className="py-1">
                      <NowLine now={now} />
                    </li>
                  )}
                  <JornadaRow item={it} onOpen={onOpen} showSupervisor={data.multiLane} highlight={highlightOrderId === it.order.id} />
                </Fragment>
              ))}
              {isToday && nowIdx === g.items.length && (
                <li className="py-2">
                  <NowLine now={now} />
                </li>
              )}
            </motion.ul>
          </section>
        );
      })}
    </div>
  );
}
