"use client";

import { useMemo } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { parseISO } from "date-fns";
import { CalendarPlus, Info, Trash, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore, useLookups } from "@/lib/hooks";
import { fmtDay, fmtDuration, fmtLongDay, plural } from "@/lib/format";
import { OPEN_STATUSES } from "@/lib/status";
import type { Order, User } from "@/lib/types";
import { AnimatedNumber, DateBadge, PersonAvatar } from "@/components/pk/bits";
import { CrewPicker } from "@/components/pk/crew-picker";
import { EASE } from "@/components/pk/motion";
import { ReasonTip } from "@/components/pk/reason-tip";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { MAX_DAYS, dateKey, dayId, dayMinutes, nextWorkingDay, workingDaysFrom, type DraftDay } from "./draft";
import { FieldLabel, FieldMessage, FormSection } from "./form-bits";
import type { StepProps } from "./step-types";

const QUICK_DAYS = [1, 2, 3, 5];

const timeInput =
  "h-11 w-full min-w-0 rounded-[12px] border border-hairline bg-surface px-3 text-[15px] tabular text-ink shadow-[0_1px_2px_rgb(16_24_40/0.03)] outline-none transition hover:border-line-strong focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-st-red md:text-[14.5px]";

export function StepSchedule({
  draft,
  setDraft,
  issues,
  errorOf,
  user,
  canAssign,
  supervisors,
  orders,
  today,
}: StepProps & { user: User; canAssign: boolean; supervisors: User[]; orders: Order[]; today: string }) {
  const lk = useLookups();
  const jornadas = useAppStore((s) => s.jornadas);
  const client = lk.clients.get(draft.clientId);
  const dates = useMemo(() => draft.days.map((d) => d.date).filter(Boolean), [draft.days]);
  const totalMinutes = draft.days.reduce((s, d) => s + dayMinutes(d), 0);
  const isSupervisor = user.role === "supervisor";

  /* supervisor load: open orders + jornadas already on the chosen dates */
  const load = useMemo(() => {
    const dateSet = new Set(dates);
    const orderSup = new Map(orders.map((o) => [o.id, o.supervisorId]));
    const m = new Map<string, { open: number; sameDays: number }>();
    for (const s of supervisors) m.set(s.id, { open: 0, sameDays: 0 });
    for (const o of orders) if (OPEN_STATUSES.includes(o.status) && m.has(o.supervisorId)) m.get(o.supervisorId)!.open++;
    for (const j of jornadas) {
      if (j.status === "cerrada" || !dateSet.has(j.date)) continue;
      const sup = orderSup.get(j.orderId);
      if (sup && m.has(sup)) m.get(sup)!.sameDays++;
    }
    return m;
  }, [orders, jornadas, supervisors, dates]);

  /* selected workers already booked on those dates */
  const conflicts = useMemo(() => {
    const dateSet = new Set(dates);
    const busy = new Set<string>();
    for (const j of jornadas) if (j.status !== "cerrada" && dateSet.has(j.date)) j.workerIds.forEach((w) => busy.add(w));
    return draft.workerIds.filter((w) => busy.has(w)).length;
  }, [jornadas, dates, draft.workerIds]);

  const updateDay = (id: string, patch: Partial<DraftDay>, times = false) =>
    setDraft((d) => ({ ...d, timesEdited: d.timesEdited || times, days: d.days.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));

  const removeDay = (id: string) => setDraft((d) => ({ ...d, days: d.days.filter((x) => x.id !== id) }));

  const addDay = () =>
    setDraft((d) => {
      if (d.days.length >= MAX_DAYS) return d;
      const last = d.days.at(-1);
      const base = last?.date ? parseISO(last.date) : parseISO(today);
      const date = dateKey(last?.date ? nextWorkingDay(base) : nextWorkingDay(new Date()));
      return { ...d, days: [...d.days, { id: dayId(), date, start: last?.start ?? "08:00", end: last?.end ?? "16:00" }] };
    });

  const setDuration = (n: number) =>
    setDraft((d) => {
      const first = d.days[0] ?? { id: dayId(), date: dateKey(nextWorkingDay(new Date())), start: "08:00", end: "16:00" };
      const list = workingDaysFrom(first.date || dateKey(nextWorkingDay(new Date())), n);
      return {
        ...d,
        days: list.map((date, i) => ({ id: d.days[i]?.id ?? dayId(), date, start: d.days[i]?.start ?? first.start, end: d.days[i]?.end ?? first.end })),
      };
    });

  const supervisor = lk.users.get(draft.supervisorId);

  return (
    <div>
      <FormSection title="Supervisor" description="Responsable de la cuadrilla, la captura en campo y el cierre.">
        <SupervisorField
          value={draft.supervisorId}
          onChange={(id) => setDraft((d) => ({ ...d, supervisorId: id }))}
          supervisors={supervisors}
          load={load}
          self={isSupervisor ? user : undefined}
        />
        <FieldMessage
          error={errorOf("supervisor")}
          warning={
            isSupervisor && draft.supervisorId && draft.supervisorId !== user.id
              ? `La orden quedará a cargo de ${supervisor?.name.split(" ")[0] ?? "otro supervisor"} y dejará de aparecer en sus órdenes.`
              : undefined
          }
        />
      </FormSection>

      <FormSection
        title="Jornadas"
        description="Cada jornada conserva su propio registro de entrada, salida y evidencia; el cierre es uno solo."
        aside={
          <div className="shrink-0 text-right">
            <p className="text-[22px] font-medium leading-none tracking-[-0.02em] text-ink">
              <AnimatedNumber value={Math.round((totalMinutes / 60) * 10) / 10} format={{ maximumFractionDigits: 1 }} />
              <span className="ml-1 text-[14px] text-subtle">h</span>
            </p>
            <p className="mt-1 text-[12.5px] text-subtle">{plural(draft.days.length, "jornada", "jornadas")}</p>
          </div>
        }
      >
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="mr-1 text-[13px] text-subtle">Duración:</span>
          <LayoutGroup id="quick-days">
            {QUICK_DAYS.map((n) => {
              const on = draft.days.length === n;
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => setDuration(n)}
                  aria-pressed={on}
                  className={cn("relative h-11 rounded-[12px] px-3.5 text-[13.5px] font-medium transition-colors md:h-10", on ? "text-white" : "bg-tile text-ink hover:bg-press")}
                >
                  {on && <motion.span layoutId="quick-days-pill" className="absolute inset-0 rounded-[12px] bg-brand-deep" transition={{ type: "spring", stiffness: 500, damping: 36 }} />}
                  <span className="relative">{plural(n, "día", "días")}</span>
                </button>
              );
            })}
          </LayoutGroup>
          <span className="text-[12px] text-subtle">· sin domingos</span>
        </div>

        <ul className="space-y-2.5">
          <AnimatePresence initial={false}>
            {draft.days.map((day, i) => {
              const err = issues.errors[`day:${day.id}`];
              const warn = issues.warnings[`day:${day.id}`];
              return (
                <motion.li
                  key={day.id}
                  layout
                  initial={{ opacity: 0, y: -8, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, x: 24, transition: { duration: 0.2 } }}
                  transition={{ duration: 0.35, ease: EASE }}
                  className={cn("rounded-[18px] border bg-surface p-3 sm:p-3.5", err ? "border-red-line" : "border-hairline")}
                >
                  <div className="flex items-center gap-3">
                    {day.date ? (
                      <DateBadge date={day.date} tone={day.date === today ? "today" : day.date < today ? "late" : undefined} />
                    ) : (
                      <span className="flex size-[52px] items-center justify-center rounded-[14px] border border-dashed border-line-heavy text-[11px] text-subtle">—</span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-[14.5px] font-semibold text-ink">Jornada {i + 1}</p>
                      <p className="truncate text-[12.5px] text-subtle first-letter:uppercase">
                        {day.date ? fmtLongDay(day.date) : "Sin fecha"} · {fmtDuration(dayMinutes(day))}
                      </p>
                    </div>
                    <ReasonTip reason={draft.days.length === 1 ? "La orden necesita al menos una jornada" : null}>
                      <span>
                        <button
                          type="button"
                          onClick={() => removeDay(day.id)}
                          disabled={draft.days.length === 1}
                          aria-label={`Quitar jornada ${i + 1}`}
                          className="inline-flex size-10 items-center justify-center rounded-[12px] text-subtle transition hover:bg-red-soft hover:text-red-fg disabled:pointer-events-none disabled:opacity-40"
                        >
                          <Trash className="size-4" />
                        </button>
                      </span>
                    </ReasonTip>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_minmax(0,1fr)]">
                    <label className="col-span-2 block sm:col-span-1">
                      <span className="mb-1 block text-[11.5px] font-semibold uppercase tracking-[0.08em] text-subtle">Fecha</span>
                      <input
                        type="date"
                        min={today}
                        value={day.date}
                        onChange={(e) => updateDay(day.id, { date: e.target.value })}
                        aria-invalid={!!err}
                        className={timeInput}
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-[11.5px] font-semibold uppercase tracking-[0.08em] text-subtle">Entrada</span>
                      <input type="time" step={900} value={day.start} onChange={(e) => updateDay(day.id, { start: e.target.value }, true)} aria-invalid={!!err} className={timeInput} />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-[11.5px] font-semibold uppercase tracking-[0.08em] text-subtle">Salida</span>
                      <input type="time" step={900} value={day.end} onChange={(e) => updateDay(day.id, { end: e.target.value }, true)} aria-invalid={!!err} className={timeInput} />
                    </label>
                  </div>
                  <FieldMessage error={err} warning={warn} />
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>

        <ReasonTip reason={draft.days.length >= MAX_DAYS ? `Máximo ${MAX_DAYS} jornadas por orden` : null}>
          <span className="mt-3 block">
            <motion.button
              type="button"
              whileTap={{ scale: 0.985 }}
              onClick={addDay}
              disabled={draft.days.length >= MAX_DAYS}
              className="group flex h-12 w-full items-center justify-center gap-2 rounded-[16px] border border-dashed border-line-heavy text-[14px] font-semibold text-ink transition hover:border-azure hover:bg-blue-wash hover:text-link disabled:pointer-events-none disabled:opacity-50"
            >
              <CalendarPlus className="size-[18px] transition-transform group-hover:-rotate-6 group-hover:scale-110" />
              Agregar jornada
              {draft.days.at(-1)?.date && <span className="font-normal text-subtle">· {fmtDay(dateKey(nextWorkingDay(parseISO(draft.days.at(-1)!.date))))}</span>}
            </motion.button>
          </span>
        </ReasonTip>
        <FieldMessage error={issues.errors.days} />
      </FormSection>

      <FormSection
        title="Cuadrilla"
        description="Personal variable por servicio. Se marca a quien ya tiene jornada esos días."
        aside={
          canAssign ? (
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-tile px-2 py-1 text-[12.5px] font-semibold text-ink tabular">
              <Users className="size-3.5" />
              {draft.workerIds.length}
            </span>
          ) : undefined
        }
      >
        {canAssign && client ? (
          <>
            <div className="rounded-[18px] border border-hairline bg-surface p-3">
              <CrewPicker
                unitId={client.unitId}
                dates={dates}
                value={draft.workerIds}
                onChange={(ids) => setDraft((d) => ({ ...d, workerIds: ids }))}
                className="max-h-[420px]"
              />
            </div>
            <FieldMessage
              warning={conflicts > 0 ? `${plural(conflicts, "persona seleccionada ya tiene", "personas seleccionadas ya tienen")} otra jornada en esas fechas.` : undefined}
              hint={
                draft.workerIds.length === 0
                  ? "Sin cuadrilla la orden se guarda como Borrador; podrá asignarla después desde la orden."
                  : "Con cuadrilla la orden se guarda como Programada y aparece en la agenda."
              }
            />
          </>
        ) : (
          <div className="flex gap-4 rounded-[20px] bg-blue-wash p-5">
            <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-blue-mid text-azure-fg">
              <Info className="size-5" />
            </span>
            <div className="text-[14px] leading-relaxed text-ink">
              <p className="font-semibold">La cuadrilla la asigna el supervisor</p>
              <p className="mt-1 text-subtle">
                La orden se guardará como <b className="font-semibold text-ink">Borrador</b>. {supervisor ? supervisor.name.split(" ")[0] : "El supervisor"} elegirá al personal y confirmará las
                jornadas desde la orden; entonces pasará a Programada.
              </p>
            </div>
          </div>
        )}
      </FormSection>
    </div>
  );
}

function SupervisorField({
  value,
  onChange,
  supervisors,
  load,
  self,
}: {
  value: string;
  onChange: (id: string) => void;
  supervisors: User[];
  load: Map<string, { open: number; sameDays: number }>;
  /** current user when they are a supervisor (load is only known for their own orders) */
  self?: User;
}) {
  const current = supervisors.find((s) => s.id === value);
  const info = (u: User) => {
    const l = load.get(u.id);
    if (!l || (self && u.id !== self.id)) return u.title;
    return `${plural(l.open, "abierta", "abiertas")}${l.sameDays ? ` · ${plural(l.sameDays, "jornada", "jornadas")} esos días` : ""}`;
  };

  return (
    <div>
      <FieldLabel>Supervisor asignado</FieldLabel>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger
          aria-label="Supervisor"
          className="w-full rounded-[14px] border-hairline bg-surface px-3 text-left shadow-[0_1px_2px_rgb(16_24_40/0.03)] transition hover:border-line-strong data-[size=default]:h-14"
        >
          {current ? (
            <span className="flex min-w-0 items-center gap-3">
              <PersonAvatar name={current.name} initials={current.initials} hue={current.hue} size={34} />
              <span className="min-w-0">
                <span className="block truncate text-[14.5px] font-semibold text-ink">
                  {current.name}
                  {self?.id === current.id && <span className="ml-1.5 font-normal text-subtle">(usted)</span>}
                </span>
                <span className="block truncate text-[12.5px] text-subtle">{info(current)}</span>
              </span>
            </span>
          ) : (
            <span className="text-[14.5px] text-subtle">Elija al supervisor</span>
          )}
        </SelectTrigger>
        <SelectContent position="popper" align="start" className="w-(--radix-select-trigger-width) rounded-[14px] p-1">
          {supervisors.map((s) => (
            <SelectItem key={s.id} value={s.id} className="rounded-[10px] py-2">
              <span className="flex items-center gap-2.5">
                <PersonAvatar name={s.name} initials={s.initials} hue={s.hue} size={28} />
                <span>
                  <span className="block text-[14px] font-medium text-ink">
                    {s.name}
                    {self?.id === s.id && <span className="ml-1 font-normal text-subtle">(usted)</span>}
                  </span>
                  <span className="block text-[12px] text-subtle">{info(s)}</span>
                </span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
