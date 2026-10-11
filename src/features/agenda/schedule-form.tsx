"use client";

/**
 * The one scheduling form of the app. "Programar orden" (agenda) and "Reprogramar / Agregar jornada" (orden) both
 * edit a list of jornada rows with the same editor, the same validation, the same stepper and the same success
 * screen; only the steps around the rows differ (crew and confirmation vs. motivo).
 */
import { useId, useRef, useState } from "react";
import { AnimatePresence, motion, type Variants } from "motion/react";
import { ArrowLeft, ArrowRight, CalendarPlus, Check, Lock, Trash2 } from "lucide-react";
import { isSunday, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { fmtDay, fmtDuration, fmtHours, plural } from "@/lib/format";
import type { Client, Order } from "@/lib/types";
import { ClientMark } from "@/components/pk/client-mark";
import { AuroraStat, ItemCard, SuccessHero } from "@/components/pk/mobile";
import { ModalCancel } from "@/components/pk/modal-shell";
import { EASE } from "@/components/pk/motion";
import { OrderStatusPill, SoftBadge } from "@/components/pk/status";
import { Button } from "@/components/ui/button";
import { dayKey, dowShort, minutesOf, nextWorkingDay, validatePlan, type DayPlan, type PlanIssue } from "./agenda-model";
import { DateTimeInput, FieldError, FieldLabel } from "./form-bits";
import { FOOTER_PRIMARY, FOOTER_SECONDARY } from "./modal-bits";

/* ───────────── rows + validation ───────────── */

export type PlanRow = DayPlan & {
  key: string;
  /** date the jornada had when the form opened: a past date that is left untouched is not an error */
  original?: string;
  /** overnight jornadas are clamped to 23:59 (the store keeps each jornada inside one day): say so until the row is edited */
  note?: string;
};

/** A jornada that already ran (or is running): it stays as it is and only blocks its day. */
export type KeptJornada = { id: string; dayIndex: number; date: string; label: string };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

const spanMinutes = (r: DayPlan) => (TIME_RE.test(r.start) && TIME_RE.test(r.end) ? Math.max(0, minutesOf(r.end) - minutesOf(r.start)) : 0);

export const planMinutes = (rows: PlanRow[]) => rows.reduce((sum, r) => sum + spanMinutes(r), 0);

/** Same rows ⇔ same signature (dates and times, in order). Used for "changed?" and for the discard guard. */
export const planSignature = (rows: PlanRow[]) => rows.map((r) => `${r.date}|${r.start}|${r.end}`).join(";");

/** "3 jornadas · 14 – 18 oct · 24 h": what the footer says once the rows are valid. */
export function planSummary(rows: PlanRow[]) {
  const dates = rows.map((r) => r.date).filter((x) => DATE_RE.test(x)).sort();
  const first = dates[0];
  const last = dates.at(-1);
  const range = first ? (last && last !== first ? `${fmtDay(first)} – ${fmtDay(last)}` : fmtDay(first)) : null;
  return [plural(rows.length, "jornada", "jornadas"), range, fmtHours(planMinutes(rows))].filter(Boolean).join(" · ");
}

/**
 * One issue per row key (a row with no entry is fine). The single rule for every scheduling surface:
 * a date, not in the past (unless left as it was), not a day that already has an executed jornada, not repeated,
 * and an end after the start on the same day.
 */
export function planErrors(rows: PlanRow[], { today, keptDates }: { today: string; keptDates?: ReadonlySet<string> }) {
  const errors = new Map<string, PlanIssue>();
  rows.forEach((r) => {
    // an overdue jornada that has not been touched keeps its past date
    const base = validatePlan(r.date < today && r.date === r.original ? { ...r, date: today } : r, today);
    if (base?.field === "date") errors.set(r.key, base);
    else if (keptDates?.has(r.date)) errors.set(r.key, { field: "date", message: "Ya hay una jornada ejecutada ese día: elija otra fecha." });
    else if (rows.some((o) => o.key !== r.key && o.date === r.date)) errors.set(r.key, { field: "date", message: "Ya hay otra jornada ese día: elija otra fecha." });
    else if (base) errors.set(r.key, base);
  });
  return errors;
}

/** Row state: edit a field, drop a row (never the last one), add the next working day after the latest date. */
export function usePlanRows(
  init: () => PlanRow[],
  { today, keptDates, start, end }: { today: string; keptDates: readonly string[]; start: string; end: string },
) {
  const [rows, setRows] = useState<PlanRow[]>(init);
  const added = useRef(0);

  const update = (key: string, patch: Partial<DayPlan>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch, note: undefined } : r)));
  const remove = (key: string) => setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.key !== key) : rs));
  const add = () => {
    added.current += 1;
    const key = `nueva-${added.current}`;
    setRows((rs) => {
      const latest = [today, ...keptDates, ...rs.map((r) => r.date).filter((x) => DATE_RE.test(x))].sort().at(-1) ?? today;
      const last = rs.at(-1);
      return [...rs, { key, date: dayKey(nextWorkingDay(parseISO(latest))), start: last?.start ?? start, end: last?.end ?? end }];
    });
  };
  return { rows, update, remove, add };
}

/* ───────────── rows editor ───────────── */

export function ScheduleRows({
  rows,
  errors,
  today,
  kept = [],
  showNew = false,
  fixed = false,
  firstIndex,
  onUpdate,
  onRemove,
  onAdd,
}: {
  rows: PlanRow[];
  errors: Map<string, PlanIssue>;
  today: string;
  kept?: KeptJornada[];
  /** tag the rows that have no original jornada ("Nueva") */
  showNew?: boolean;
  /** a fixed set of rows (moving one jornada): no remove, no add */
  fixed?: boolean;
  /** number of the first row (default: right after the kept jornadas) */
  firstIndex?: number;
  onUpdate: (key: string, patch: Partial<DayPlan>) => void;
  onRemove?: (key: string) => void;
  onAdd?: () => void;
}) {
  const uid = useId();
  const canRemove = !fixed && rows.length > 1;
  const first = firstIndex ?? kept.length + 1;

  return (
    <div>
      {kept.length > 0 && (
        <ul className="mb-4 space-y-1.5">
          {kept.map((j) => (
            <li key={j.id} className="flex items-center gap-3 rounded-[14px] bg-soft px-3.5 py-2.5 text-[13.5px]">
              <Lock className="size-3.5 shrink-0 text-subtle" aria-hidden />
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium text-ink">Jornada {j.dayIndex}</span>
                <span className="text-subtle"> · {dowShort(parseISO(j.date))} {fmtDay(j.date)}</span>
              </span>
              <span className="shrink-0 text-[12.5px] text-subtle">{j.label} · se conserva</span>
            </li>
          ))}
        </ul>
      )}

      <ul className="space-y-3">
        <AnimatePresence initial={false}>
          {rows.map((r, i) => {
            const err = errors.get(r.key);
            const valid = DATE_RE.test(r.date);
            const minutes = spanMinutes(r);
            const isNew = showNew && !r.original;
            // the issue says which field to mark: the date, or the times
            const dateBad = err?.field === "date";
            const timeBad = err?.field === "time";
            const id = `${uid}-${r.key}`;
            // the message is the reason behind aria-invalid: the marked inputs are described by it
            const errId = err ? `${id}-error` : undefined;
            return (
              <motion.li
                key={r.key}
                layout
                initial={{ opacity: 0, y: -6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, x: 20, transition: { duration: 0.18 } }}
                transition={{ type: "spring", stiffness: 420, damping: 32 }}
                className={cn("rounded-[18px] border p-3.5", err ? "border-red-line bg-red-wash" : isNew ? "border-blue-line bg-blue-wash" : "border-hairline bg-surface")}
              >
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-[14px] font-semibold text-ink">
                      Jornada {first + i}
                      {isNew && <SoftBadge tone="blue">Nueva</SoftBadge>}
                    </p>
                    <p className="mt-0.5 truncate text-[12.5px] text-subtle tabular">
                      {valid
                        ? `${dowShort(parseISO(r.date))} ${fmtDay(r.date)}${isSunday(parseISO(r.date)) ? " · domingo" : ""}${minutes > 0 ? ` · ${fmtDuration(minutes)}` : ""}`
                        : "Sin fecha"}
                    </p>
                  </div>
                  {canRemove && (
                    <button
                      type="button"
                      onClick={() => onRemove?.(r.key)}
                      aria-label={`Quitar jornada ${first + i}`}
                      className="-mr-1.5 -mt-1.5 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-subtle outline-none transition hover:bg-red-soft hover:text-red-fg focus-visible:ring-3 focus-visible:ring-ring/50 lg:size-10"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)]">
                  <div className="col-span-2 sm:col-span-1">
                    <FieldLabel htmlFor={`${id}-date`}>Fecha</FieldLabel>
                    <DateTimeInput id={`${id}-date`} type="date" min={today} value={r.date} onChange={(e) => onUpdate(r.key, { date: e.target.value })} invalid={dateBad} aria-describedby={dateBad ? errId : undefined} />
                  </div>
                  <div>
                    <FieldLabel htmlFor={`${id}-start`}>Inicio</FieldLabel>
                    <DateTimeInput id={`${id}-start`} type="time" step={900} value={r.start} onChange={(e) => onUpdate(r.key, { start: e.target.value })} invalid={timeBad} aria-describedby={timeBad ? errId : undefined} />
                  </div>
                  <div>
                    <FieldLabel htmlFor={`${id}-end`}>Término</FieldLabel>
                    <DateTimeInput id={`${id}-end`} type="time" step={900} value={r.end} onChange={(e) => onUpdate(r.key, { end: e.target.value })} invalid={timeBad} aria-describedby={timeBad ? errId : undefined} />
                  </div>
                </div>
                <FieldError id={errId}>{err?.message}</FieldError>
                {r.note && !err && <p className="mt-2 text-[12.5px] leading-snug text-amber-fg">{r.note}</p>}
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>

      {!fixed && (
        <Button type="button" variant="outline" onClick={onAdd} className="mt-3 h-11 w-full rounded-[14px] border-dashed border-line-heavy text-[14px] font-semibold text-ink">
          <CalendarPlus /> Agregar otro día
        </Button>
      )}
    </div>
  );
}

/* ───────────── steps ───────────── */

/** Step index plus the direction of travel (+1 forward, −1 back) for the slide. */
export function useStepper() {
  const [at, setAt] = useState({ step: 0, dir: 1 });
  const go = (n: number) => setAt((s) => ({ step: n, dir: n >= s.step ? 1 : -1 }));
  return { step: at.step, dir: at.dir, go };
}

const slide: Variants = {
  enter: (d: number) => ({ opacity: 0, x: d * 28 }),
  center: { opacity: 1, x: 0, transition: { duration: 0.24, ease: EASE } },
  exit: (d: number) => ({ opacity: 0, x: d * -28, transition: { duration: 0.16, ease: EASE } }),
};

/** Direction-aware step transition. */
export function StepPanel({ step, dir, children }: { step: number; dir: number; children: React.ReactNode }) {
  return (
    <AnimatePresence mode="wait" initial={false} custom={dir}>
      <motion.div key={step} custom={dir} variants={slide} initial="enter" animate="center" exit="exit" className="space-y-5">
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

/** Progress bars with numbered labels; a finished step can be revisited, a later one only when everything before it is ready. */
export function StepBar({ labels, step, canGo, onGo }: { labels: readonly string[]; step: number; canGo: (i: number) => boolean; onGo: (i: number) => void }) {
  return (
    <ol className="mb-5 flex gap-1.5" aria-label="Pasos">
      {labels.map((label, i) => {
        const done = i < step;
        const active = i === step;
        return (
          <li key={label} className="flex-1">
            <button
              type="button"
              disabled={!canGo(i)}
              onClick={() => onGo(i)}
              aria-current={active ? "step" : undefined}
              className="group flex min-h-11 w-full flex-col justify-center gap-1.5 rounded-[8px] text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed lg:min-h-0 lg:justify-start"
            >
              <span className="relative h-1 overflow-hidden rounded-full bg-press">
                {(done || active) && (
                  <motion.span
                    initial={{ width: 0 }}
                    animate={{ width: "100%" }}
                    transition={{ duration: 0.45, ease: EASE }}
                    className={cn("absolute inset-y-0 left-0 rounded-full", done ? "bg-st-teal" : "bg-brand-deep")}
                  />
                )}
              </span>
              <span className={cn("flex items-center gap-1 text-[12.5px]", active ? "font-semibold text-ink" : "text-subtle")}>
                {done && <Check className="size-3.5 text-teal-fg" strokeWidth={3} aria-hidden />}
                {i + 1}. {label}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Footer actions of a stepped modal. Phones: the primary button is full width and "Volver" is a 54px arrow beside it
 * (the X closes, so no "Cancelar"). From lg: "Cancelar" (or "Volver") on the left of the primary, as in every dialog.
 */
export function StepActions({
  step,
  last,
  ready,
  onBack,
  onNext,
  onSubmit,
  submitLabel,
  submitIcon,
}: {
  step: number;
  last: boolean;
  ready: boolean;
  onBack: () => void;
  onNext: () => void;
  onSubmit: () => void;
  submitLabel: string;
  submitIcon?: React.ReactNode;
}) {
  return (
    <div className="flex w-full gap-2 lg:w-auto">
      {step > 0 ? (
        <Button type="button" variant="outline" onClick={onBack} aria-label="Volver al paso anterior" className={cn(FOOTER_SECONDARY, "max-lg:w-[54px] max-lg:px-0")}>
          <ArrowLeft />
          <span className="max-lg:sr-only">Volver</span>
        </Button>
      ) : (
        <ModalCancel className="max-lg:hidden" />
      )}
      <Button type="button" disabled={!ready} onClick={last ? onSubmit : onNext} className={cn(FOOTER_PRIMARY, "max-lg:flex-1")}>
        {last ? (
          <>
            {submitIcon} {submitLabel}
          </>
        ) : (
          <>
            Continuar <ArrowRight />
          </>
        )}
      </Button>
    </div>
  );
}

/* ───────────── success (phones) ───────────── */

/** Success screen of a scheduling flow: blue check, serif title, the order as a card and an optional headline stat. */
export function ScheduleDone({
  title,
  message,
  client,
  order,
  stat,
}: {
  title: string;
  message: React.ReactNode;
  client?: Pick<Client, "name" | "shortName" | "hue">;
  order: Pick<Order, "title" | "folio" | "status">;
  stat?: { label: React.ReactNode; value: React.ReactNode; sub?: React.ReactNode };
}) {
  return (
    <div className="pb-2">
      <SuccessHero title={title}>{message}</SuccessHero>
      <ItemCard
        className="mt-8"
        leading={client && <ClientMark name={client.name} hue={client.hue} size={44} />}
        title={order.title}
        sub={client ? `${order.folio} · ${client.shortName}` : order.folio}
        status={<OrderStatusPill status={order.status} />}
      />
      {stat && <AuroraStat className="mt-4" label={stat.label} value={stat.value} sub={stat.sub} />}
    </div>
  );
}
