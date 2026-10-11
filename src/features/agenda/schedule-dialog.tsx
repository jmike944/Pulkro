"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion, type Variants } from "motion/react";
import { ArrowLeft, ArrowRight, Check, Plus, TriangleAlert, X } from "lucide-react";
import { toast } from "sonner";
import { format, isSunday, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { useAppStore, useLookups, useOrderBundle, useScopedData } from "@/lib/hooks";
import { useUi } from "@/lib/ui-store";
import { fmtDay, fmtDuration, plural } from "@/lib/format";
import { CrewPicker } from "@/components/pk/crew-picker";
import { AvatarStack, KeyValues } from "@/components/pk/bits";
import { ClientMark } from "@/components/pk/client-mark";
import { OrderStatusPill } from "@/components/pk/status";
import { EASE } from "@/components/pk/motion";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { dayKey, dowShort, minutesOf, nextWorkingDay, toDayPlan, validatePlan, type DayPlan } from "./agenda-model";
import { ConfirmCheck, DateTimeInput, FieldError, MotivoField } from "./form-bits";

type Row = DayPlan & { k: number; note?: string };

/** Direction-aware step transition (custom = +1 forward, −1 back). */
const slide: Variants = {
  enter: (d: number) => ({ opacity: 0, x: d * 28 }),
  center: { opacity: 1, x: 0, transition: { duration: 0.24, ease: EASE } },
  exit: (d: number) => ({ opacity: 0, x: d * -28, transition: { duration: 0.16, ease: EASE } }),
};

export type ScheduleState = { orderId: string; open: boolean } | null;

const STEPS = ["Fechas", "Cuadrilla", "Confirmar"] as const;
const REASONS_NEW = ["Programación inicial", "Cliente confirmó fechas", "Ajuste de disponibilidad"];
const REASONS_MOVED = ["Cliente confirmó nueva fecha", "Acceso confirmado", "Ajuste de disponibilidad"];

/**
 * "Programar": jornadas builder (dates/times) → CrewPicker → key-value summary with motivo and
 * explicit confirmation → scheduleJornadas + assignCrew (doc §3 steps 3–4).
 */
export function ScheduleDialog({
  state,
  todayKey,
  onOpenChange,
  onDone,
}: {
  state: ScheduleState;
  todayKey: string;
  onOpenChange: (open: boolean) => void;
  onDone: (orderId: string, firstDate: string) => void;
}) {
  return (
    <Dialog open={!!state?.open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92dvh] flex-col gap-0 overflow-hidden rounded-[24px] p-0 sm:max-w-[600px]">
        {state ? (
          <ScheduleBody key={state.orderId} orderId={state.orderId} todayKey={todayKey} onClose={() => onOpenChange(false)} onDone={onDone} />
        ) : (
          <DialogTitle className="sr-only">Programar</DialogTitle>
        )}
      </DialogContent>
    </Dialog>
  );
}

function initialRows(b: ReturnType<typeof useOrderBundle>, todayKey: string): Row[] {
  if (!b) return [];
  const pending = b.jornadas.filter((j) => j.status === "pendiente");
  if (pending.length) {
    return pending.map((j, i) => {
      const p = toDayPlan(j);
      return {
        k: i,
        date: p.date < todayKey ? todayKey : p.date,
        start: p.start,
        end: p.end,
        note: p.clamped ? `Terminaba al día siguiente (${p.originalEnd}); ajustado al mismo día.` : undefined,
      };
    });
  }
  // No jornadas yet: derive from the order's planned window.
  const s = parseISO(b.order.scheduledStart);
  const hours = b.serviceType?.defaultHoursPerDay ?? 8;
  const start = format(s, "HH:mm");
  const endMin = Math.min(23 * 60 + 59, minutesOf(start) + hours * 60);
  const end = `${String(Math.floor(endMin / 60)).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`;
  const rows: Row[] = [];
  let d = dayKey(s) < todayKey ? parseISO(todayKey) : s;
  for (let i = 0; i < Math.max(1, b.order.plannedDays); i++) {
    rows.push({ k: i, date: dayKey(d), start, end });
    d = nextWorkingDay(d);
  }
  return rows;
}

function ScheduleBody({
  orderId,
  todayKey,
  onClose,
  onDone,
}: {
  orderId: string;
  todayKey: string;
  onClose: () => void;
  onDone: (orderId: string, firstDate: string) => void;
}) {
  const b = useOrderBundle(orderId);
  const lk = useLookups();
  const scheduleJornadas = useAppStore((s) => s.scheduleJornadas);
  const assignCrew = useAppStore((s) => s.assignCrew);
  const allJornadas = useAppStore((s) => s.jornadas);
  const allOrders = useAppStore((s) => s.orders);
  const { orderIds: visibleOrderIds } = useScopedData();

  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [rows, setRows] = useState<Row[]>(() => initialRows(b, todayKey));
  const [crew, setCrew] = useState<string[]>(() => b?.order.crewHistory.at(-1)?.workerIds ?? []);
  const [motivo, setMotivo] = useState(b?.order.status === "borrador" ? REASONS_NEW[0] : "");
  const [ok, setOk] = useState(false);

  const errors = useMemo(() => {
    const seen = new Set<string>();
    return rows.map((r) => {
      const e = validatePlan(r, todayKey);
      if (e) return e;
      if (seen.has(r.date)) return "Ya hay otra jornada ese día.";
      seen.add(r.date);
      return null;
    });
  }, [rows, todayKey]);

  // Workers already booked on these dates in other open jornadas (for the summary warning). The conflict is always flagged;
  // the folio is only named for orders in the role's scope (doc §2), otherwise "Otra cuadrilla".
  const busy = useMemo(() => {
    const dates = new Set(rows.map((r) => r.date));
    const folios = new Map(allOrders.map((o) => [o.id, o] as const));
    const out = new Map<string, string[]>();
    allJornadas.forEach((j) => {
      if (j.orderId === orderId || j.status === "cerrada" || !dates.has(j.date)) return;
      const o = folios.get(j.orderId);
      if (!o || o.status === "cancelada") return;
      const where = visibleOrderIds.has(o.id) ? o.folio : "Otra cuadrilla";
      j.workerIds.forEach((w) => {
        if (!crew.includes(w)) return;
        out.set(w, [...(out.get(w) ?? []), `${where} · ${fmtDay(j.date)}`]);
      });
    });
    return out;
  }, [rows, crew, allJornadas, allOrders, visibleOrderIds, orderId]);

  if (!b) {
    return (
      <DialogHeader className="p-6">
        <DialogTitle className="font-serif text-[24px] font-medium">Orden no disponible</DialogTitle>
        <DialogDescription>La orden ya no está en tu alcance.</DialogDescription>
      </DialogHeader>
    );
  }
  const { order, client, site } = b;
  const moved = order.status === "reprogramada";
  const rowsValid = rows.length > 0 && errors.every((e) => !e);
  const canNext = step === 0 ? rowsValid : step === 1 ? crew.length > 0 : rowsValid && crew.length > 0 && motivo.trim().length >= 4 && ok;
  const totalMin = rows.reduce((s, r) => s + Math.max(0, minutesOf(r.end) - minutesOf(r.start)), 0);
  const people = crew.map((id) => lk.workers.get(id)).filter((w) => !!w);

  const go = (n: number) => {
    setDir(n > step ? 1 : -1);
    setStep(n);
  };
  const update = (k: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.k === k ? { ...r, ...patch, note: undefined } : r)));
  const addRow = () =>
    setRows((rs) => {
      const last = rs.at(-1);
      const base = last && /^\d{4}-\d{2}-\d{2}$/.test(last.date) ? nextWorkingDay(parseISO(last.date)) : parseISO(todayKey);
      const k = rs.reduce((m, r) => Math.max(m, r.k), -1) + 1;
      return [...rs, { k, date: dayKey(base), start: last?.start ?? "08:00", end: last?.end ?? "16:00" }];
    });
  const removeRow = (k: number) => setRows((rs) => rs.filter((r) => r.k !== k));

  const confirm = () => {
    if (!canNext) return;
    const days = [...rows].sort((a, c) => a.date.localeCompare(c.date)).map(({ date, start, end }) => ({ date, start, end }));
    const reason = motivo.trim();
    scheduleJornadas(order.id, days, reason);
    assignCrew(order.id, crew, reason);
    useUi.getState().fireCelebrate();
    toast.success(`${order.folio} programada`, {
      description: `${plural(days.length, "jornada", "jornadas")} · ${plural(crew.length, "persona", "personas")} · inicia ${fmtDay(days[0].date)}`,
    });
    onDone(order.id, days[0].date);
  };

  return (
    <>
      <DialogHeader className="border-b border-hairline p-5 pr-12 sm:p-6 sm:pr-14">
        <DialogTitle className="font-serif text-[26px] font-medium leading-tight">{moved ? "Confirmar fechas" : "Programar orden"}</DialogTitle>
        <DialogDescription className="text-[14px]">
          {order.folio} · {client?.shortName} · {order.title}
        </DialogDescription>
        <ol className="mt-4 flex gap-1.5" aria-label="Pasos">
            {STEPS.map((label, i) => {
              const done = i < step;
              const active = i === step;
              return (
                <li key={label} className="flex-1">
                  <button
                    type="button"
                    disabled={i > step && !(i === 1 ? rowsValid : rowsValid && crew.length > 0)}
                    onClick={() => go(i)}
                    aria-current={active ? "step" : undefined}
                    className="group flex w-full flex-col gap-1.5 text-left disabled:cursor-not-allowed"
                  >
                    <span className="relative h-[4px] overflow-hidden rounded-full bg-press">
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
                      {done && <Check className="size-3.5 text-teal-fg" strokeWidth={3} />}
                      {i + 1}. {label}
                    </span>
                  </button>
                </li>
              );
            })}
        </ol>
      </DialogHeader>

      <div className="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        <AnimatePresence mode="wait" initial={false} custom={dir}>
          <motion.div
            key={step}
            custom={dir}
            variants={slide}
            initial="enter"
            animate="center"
            exit="exit"
            className="space-y-5 p-5 sm:p-6"
          >
            {step === 0 && (
              <>
                <div className="flex items-start gap-3 rounded-[18px] border border-hairline p-4">
                  {client && <ClientMark name={client.name} hue={client.hue} size={40} />}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14.5px] font-semibold text-ink">{site?.name}</p>
                    <p className="truncate text-[12.5px] text-subtle">{site?.address}</p>
                  </div>
                  <OrderStatusPill status={order.status} />
                </div>

                <div>
                  <p className="mb-2 text-[13px] text-subtle">
                    Jornadas · una por día. Las órdenes multidía conservan registros independientes y un único cierre.
                  </p>
                  <motion.ul layout className="space-y-2.5">
                    <AnimatePresence initial={false}>
                      {rows.map((r, i) => {
                        const err = errors[i];
                        const valid = /^\d{4}-\d{2}-\d{2}$/.test(r.date);
                        const dur = minutesOf(r.end) - minutesOf(r.start);
                        return (
                          <motion.li
                            key={r.k}
                            layout
                            initial={{ opacity: 0, y: -6, scale: 0.98 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, x: 20, transition: { duration: 0.18 } }}
                            transition={{ type: "spring", stiffness: 420, damping: 32 }}
                            className={cn("rounded-[16px] border p-3", err ? "border-red-line bg-red-wash" : "border-hairline bg-wash")}
                          >
                            <div className="grid grid-cols-[auto_minmax(0,1fr)_40px] items-center gap-2 sm:grid-cols-[auto_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_40px]">
                              <span className="inline-flex h-11 min-w-11 items-center justify-center rounded-[12px] bg-surface px-2 text-[13px] font-semibold text-ink shadow-[0_1px_2px_rgb(16_24_40/0.06)] tabular">
                                J{i + 1}
                              </span>
                              <DateTimeInput type="date" aria-label={`Fecha jornada ${i + 1}`} min={todayKey} value={r.date} onChange={(e) => update(r.k, { date: e.target.value })} invalid={!!err && /fecha|día|pasó/i.test(err)} />
                              <button
                                type="button"
                                onClick={() => removeRow(r.k)}
                                disabled={rows.length === 1}
                                aria-label={`Quitar jornada ${i + 1}`}
                                className="inline-flex size-10 items-center justify-center rounded-[12px] text-subtle transition hover:bg-surface hover:text-red-fg disabled:opacity-30 sm:order-last"
                              >
                                <X className="size-4" />
                              </button>
                              <div className="col-span-3 grid grid-cols-2 gap-2 sm:col-span-2">
                                <DateTimeInput type="time" step={900} aria-label={`Inicio jornada ${i + 1}`} value={r.start} onChange={(e) => update(r.k, { start: e.target.value })} />
                                <DateTimeInput type="time" step={900} aria-label={`Término jornada ${i + 1}`} value={r.end} onChange={(e) => update(r.k, { end: e.target.value })} />
                              </div>
                            </div>
                            <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 px-1 text-[12px] text-subtle">
                              <span className="tabular">
                                {valid ? `${dowShort(parseISO(r.date))} ${fmtDay(r.date)}` : "—"}
                                {valid && isSunday(parseISO(r.date)) ? " · domingo" : ""}
                                {dur > 0 ? ` · ${fmtDuration(dur)}` : ""}
                              </span>
                              {r.note && !err && <span className="text-amber-fg">{r.note}</span>}
                            </div>
                            <FieldError>{err}</FieldError>
                          </motion.li>
                        );
                      })}
                    </AnimatePresence>
                  </motion.ul>
                  <Button variant="outline" onClick={addRow} className="mt-3 h-10 rounded-[12px] border-dashed font-semibold">
                    <Plus className="size-4" /> Agregar jornada
                  </Button>
                </div>
              </>
            )}

            {step === 1 && (
              <div className="flex flex-col">
                <p className="mb-3 text-[13px] text-subtle">
                  Cuadrilla variable para {rows.length === 1 ? "la jornada" : `las ${rows.length} jornadas`} ({rows.map((r) => fmtDay(r.date)).join(", ")}). Marcamos a quien ya tiene otra jornada
                  {rows.length === 1 ? " ese día" : " esos días"}.
                </p>
                <CrewPicker unitId={order.unitId} dates={rows.map((r) => r.date)} value={crew} onChange={setCrew} excludeOrderId={order.id} className="h-[min(48dvh,400px)]" />
              </div>
            )}

            {step === 2 && (
              <>
                <KeyValues
                  rows={[
                    { k: "Orden", v: `${order.folio} · ${client?.shortName ?? ""}` },
                    { k: "Sitio", v: site?.name ?? "—" },
                    {
                      k: "Jornadas",
                      v: (
                        <span className="flex flex-col items-end gap-0.5 tabular">
                          {[...rows]
                            .sort((a, c) => a.date.localeCompare(c.date))
                            .map((r) => (
                              <span key={r.k}>
                                {dowShort(parseISO(r.date))} {fmtDay(r.date)} · {r.start}–{r.end}
                              </span>
                            ))}
                        </span>
                      ),
                    },
                    { k: "Horas planeadas", v: <span className="tabular">{fmtDuration(totalMin)}</span> },
                    {
                      k: "Cuadrilla",
                      v: (
                        <span className="inline-flex items-center gap-2">
                          <AvatarStack people={people} size={24} max={5} /> {plural(crew.length, "persona", "personas")}
                        </span>
                      ),
                    },
                  ]}
                  className="rounded-[18px] border border-hairline p-5"
                />
                {busy.size > 0 && (
                  <div className="flex gap-3 rounded-[16px] bg-amber-soft p-4 text-[13px] leading-snug text-amber-deep">
                    <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-fg" />
                    <span>
                      <b className="font-semibold">{plural(busy.size, "persona tiene", "personas tienen")} otra jornada</b> {rows.length === 1 ? "ese día" : "esos días"}:{" "}
                      {[...busy.entries()]
                        .slice(0, 3)
                        .map(([w, where]) => `${lk.workers.get(w)?.name.split(" ")[0] ?? "—"} (${where[0]})`)
                        .join(", ")}
                      {busy.size > 3 ? "…" : "."} Puede continuar, pero quedará como doble asignación.
                    </span>
                  </div>
                )}
                <MotivoField id="sched-motivo" value={motivo} onChange={setMotivo} suggestions={moved ? REASONS_MOVED : REASONS_NEW} />
                <ConfirmCheck id="sched-ok" checked={ok} onChange={setOk}>
                  Confirmo {rows.length === 1 ? "la jornada" : `las ${rows.length} jornadas`} y la cuadrilla. La orden pasará a <b className="font-semibold">Programada</b> y el cambio queda en la
                  bitácora.
                </ConfirmCheck>
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-hairline bg-wash p-4">
        {step > 0 ? (
          <Button variant="outline" onClick={() => go(step - 1)} className="h-11 rounded-[12px] px-4">
            <ArrowLeft className="size-4" /> Atrás
          </Button>
        ) : (
          <Button variant="outline" onClick={onClose} className="h-11 rounded-[12px] px-4">
            Cancelar
          </Button>
        )}
        {step < 2 ? (
          <Button onClick={() => canNext && go(step + 1)} disabled={!canNext} className="h-11 rounded-[12px] px-5 font-semibold">
            Continuar <ArrowRight className="size-4" />
          </Button>
        ) : (
          <Button onClick={confirm} disabled={!canNext} className="h-11 rounded-[12px] px-5 font-semibold">
            <Check className="size-4" /> {moved ? "Confirmar fechas" : "Programar"}
          </Button>
        )}
      </div>
    </>
  );
}
