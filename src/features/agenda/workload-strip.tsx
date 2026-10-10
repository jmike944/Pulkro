"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, TriangleAlert } from "lucide-react";
import { parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { fmtTime, plural } from "@/lib/format";
import { PersonAvatar } from "@/components/pk/bits";
import { EASE } from "@/components/pk/motion";
import { useLookups } from "@/lib/hooks";
import { dowLetter, dowShort, type Conflict } from "./agenda-model";
import type { DayLoad } from "./use-agenda";

/**
 * Per-day workload: people assigned (all crews of the unit) vs available unit workers,
 * as tiny bars. Amber ≥ 85 %, red when over capacity; ⚠ marks double bookings.
 */
export function WorkloadStrip({
  loads,
  available,
  focusKey,
  todayKey,
  activeDay,
  scopeLabel,
  onPick,
}: {
  loads: DayLoad[];
  available: number;
  focusKey: string;
  todayKey: string;
  /** highlight the focused day (Día view) */
  activeDay: boolean;
  scopeLabel: string;
  onPick: (d: Date) => void;
}) {
  return (
    <div className="mb-5">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-subtle">Carga de personal</p>
        <p className="truncate text-[12.5px] text-subtle">
          asignadas / <b className="font-semibold text-ink tabular">{available}</b> disponibles · {scopeLabel}
        </p>
      </div>
      <div className="grid gap-1.5 sm:gap-2" style={{ gridTemplateColumns: `repeat(${loads.length}, minmax(0, 1fr))` }}>
        {loads.map((l, i) => {
          const pct = available ? l.assigned / available : 0;
          const over = l.assigned > available;
          const high = pct >= 0.85;
          const isToday = l.key === todayKey;
          const isActive = activeDay && l.key === focusKey;
          const doubles = new Set(l.conflicts.map((c) => c.workerId)).size;
          return (
            <motion.button
              key={l.key}
              type="button"
              onClick={() => onPick(l.date)}
              whileTap={{ scale: 0.96 }}
              aria-label={`${dowShort(l.date)} ${l.date.getDate()}: ${l.assigned} de ${available} personas asignadas${doubles ? `, ${doubles} con doble asignación` : ""}`}
              aria-pressed={isActive}
              className={cn(
                "relative flex min-h-[60px] flex-col items-center rounded-[14px] border px-1.5 py-2 text-center outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 sm:items-stretch sm:px-3 sm:text-left",
                isActive ? "border-ink bg-surface shadow-[0_6px_18px_-10px_rgb(16_24_40/0.35)]" : isToday ? "border-sky/70 bg-sky-soft/60 hover:bg-sky-soft" : "border-hairline bg-wash hover:bg-surface",
              )}
            >
              <span className="flex w-full items-baseline justify-center gap-1 sm:justify-between">
                <span className={cn("text-[11px] font-semibold uppercase tracking-[0.08em]", isToday ? "text-sky-fg" : "text-subtle")}>
                  <span className="sm:hidden">{dowLetter(l.date)}</span>
                  <span className="hidden sm:inline">{dowShort(l.date)}</span>
                </span>
                <span className="text-[13.5px] font-semibold text-ink tabular">{l.date.getDate()}</span>
              </span>
              <span className="mt-2 block h-[5px] w-full overflow-hidden rounded-full bg-track">
                <motion.span
                  className={cn("block h-full rounded-full", over ? "bg-st-red" : high ? "bg-st-amber" : isToday ? "bg-azure" : "bg-blue-bar")}
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(1, pct) * 100}%` }}
                  transition={{ duration: 0.8, ease: EASE, delay: 0.1 + i * 0.05 }}
                />
              </span>
              <span className="mt-1.5 flex w-full items-center justify-center gap-1 text-[11.5px] tabular sm:justify-between">
                <span>
                  <b className="font-semibold text-ink">{l.assigned}</b>
                  <span className="hidden text-subtle sm:inline">/{available}</span>
                </span>
                {doubles > 0 && (
                  <span className="inline-flex items-center gap-0.5 font-semibold text-amber-fg">
                    <TriangleAlert className="size-3" />
                    <span className="max-sm:sr-only">{doubles}</span>
                  </span>
                )}
              </span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

/** Expandable warning listing workers booked in two open jornadas the same day. */
export function ConflictsNote({ conflicts, onOpen, when = "esta semana" }: { conflicts: Conflict[]; onOpen: (jornadaId: string) => void; when?: string }) {
  const [open, setOpen] = useState(false);
  const [all, setAll] = useState(false);
  const lk = useLookups();
  const shown = all ? conflicts : conflicts.slice(0, 6);
  const people = new Set(conflicts.map((c) => c.workerId)).size;
  if (!conflicts.length) return null;
  return (
    <div className="mb-6 rounded-[18px] border border-amber-line bg-amber-wash">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-12 w-full items-center gap-3 px-4 py-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-amber-tint text-amber-fg">
          <TriangleAlert className="size-4" />
        </span>
        <span className="min-w-0 flex-1 text-[14px] text-ink">
          <b className="font-semibold">{plural(people, "persona", "personas")}</b> con doble asignación {when}
          <span className="hidden text-subtle sm:inline"> · misma persona en dos jornadas abiertas el mismo día</span>
        </span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.25 }}>
          <ChevronDown className="size-4 text-subtle" />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.ul
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: EASE }}
            className="overflow-hidden"
          >
            {shown.map((c) => {
              const w = lk.workers.get(c.workerId);
              return (
                <li key={`${c.dayKey}-${c.workerId}`} className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-amber-line px-4 py-3">
                  {w && <PersonAvatar name={w.name} initials={w.initials} hue={w.hue} size={28} />}
                  <span className="min-w-0 flex-1 text-[13.5px]">
                    <span className="block truncate font-medium text-ink">{w?.name ?? "Trabajador"}</span>
                    <span className="text-[12.5px] text-subtle">
                      {dowShort(parseISO(c.dayKey))} {parseISO(c.dayKey).getDate()} · {c.overlap ? "horarios traslapados" : "mismo día, sin traslape"}
                    </span>
                  </span>
                  <span className="flex flex-wrap gap-1.5">
                    {c.bookings.map((b) =>
                      b.visible ? (
                        <button
                          key={b.jornadaId}
                          type="button"
                          onClick={() => onOpen(b.jornadaId)}
                          className="inline-flex h-9 items-center rounded-[10px] border border-amber-line bg-surface px-2.5 text-[12.5px] font-medium text-ink tabular transition hover:border-amber-line-strong"
                        >
                          {b.folio} · {fmtTime(b.start)}
                        </button>
                      ) : (
                        <span key={b.jornadaId} className="inline-flex h-9 items-center rounded-[10px] bg-surface/60 px-2.5 text-[12.5px] text-subtle tabular">
                          Otra cuadrilla · {fmtTime(b.start)}
                        </span>
                      ),
                    )}
                  </span>
                </li>
              );
            })}
            {conflicts.length > shown.length && (
              <li className="border-t border-amber-line px-4 py-2">
                <button type="button" onClick={() => setAll(true)} className="h-10 text-[13.5px] font-semibold text-link">
                  Mostrar las {conflicts.length} dobles asignaciones
                </button>
              </li>
            )}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
