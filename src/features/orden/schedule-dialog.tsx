"use client";

import { useRef, useState } from "react";
import { addDays, addMinutes, format, isSunday, parseISO } from "date-fns";
import { AnimatePresence, motion } from "motion/react";
import { CalendarPlus, Lock, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/lib/store";
import { fmtDay, fmtHours, plural } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { JORNADA_STATUS, fmtWeekdayDay, toTimeInput } from "./orden-format";
import { useOrder } from "./order-context";
import { ConfirmCheck, DialogActions, OrderDialog, ReasonField, inputClass } from "./ui";

type Mode = "reprogramar" | "agregar";
type Row = { key: string; date: string; start: string; end: string; original?: string };

const toMin = (hm: string) => {
  const [h, m] = hm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

/**
 * Reprogramar / Agregar jornada. Both rewrite the pending jornadas through store.scheduleJornadas()
 * (executed jornadas are always kept). Reprogramar can flag the order as "Reprogramada" until the
 * client confirms the new dates.
 */
export function ScheduleDialog({ open, onOpenChange, mode }: { open: boolean; onOpenChange: (v: boolean) => void; mode: Mode }) {
  const { d } = useOrder();
  return (
    <OrderDialog
      open={open}
      onOpenChange={onOpenChange}
      eyebrow={d.order.folio}
      title={mode === "agregar" ? "Agregar jornada" : "Reprogramar jornadas"}
      description={
        mode === "agregar"
          ? "Para trabajos de varios días. Cada jornada guarda su propia entrada, salida, fotos y bitácora; el cierre y el reporte siguen siendo únicos."
          : "Mueva las fechas u horarios de las jornadas pendientes. Las jornadas ya ejecutadas se conservan sin cambios."
      }
    >
      <ScheduleForm mode={mode} onDone={() => onOpenChange(false)} />
    </OrderDialog>
  );
}

function ScheduleForm({ mode, onDone }: { mode: Mode; onDone: () => void }) {
  const { d } = useOrder();
  const { order, jornadas, pendingJornadas, serviceType, now } = d;
  const scheduleJornadas = useAppStore((s) => s.scheduleJornadas);
  const setOrderStatus = useAppStore((s) => s.setOrderStatus);

  const kept = jornadas.filter((j) => j.status !== "pendiente");
  const today = format(now, "yyyy-MM-dd");
  const template = pendingJornadas[0] ?? jornadas.at(-1);
  const defStart = template ? toTimeInput(template.plannedStart) : "08:00";
  const defEnd = template ? toTimeInput(template.plannedEnd) : format(addMinutes(parseISO(`${today}T08:00:00`), serviceType.defaultHoursPerDay * 60), "HH:mm");
  const nextWorkday = (after: string) => {
    let dt = addDays(parseISO(after), 1);
    if (isSunday(dt)) dt = addDays(dt, 1);
    return format(dt, "yyyy-MM-dd");
  };

  const counter = useRef(0);
  const [rows, setRows] = useState<Row[]>(() => {
    const existing = pendingJornadas.map((j) => ({ key: j.id, date: j.date, start: toTimeInput(j.plannedStart), end: toTimeInput(j.plannedEnd), original: j.date }));
    const last = [today, ...jornadas.map((j) => j.date)].sort().at(-1) ?? today;
    const fresh = { key: "nueva-0", date: nextWorkday(last < today ? today : last), start: defStart, end: defEnd };
    if (mode === "agregar") return [...existing, fresh];
    return existing.length ? existing : [{ ...fresh, date: nextWorkday(today) }];
  });
  const [reason, setReason] = useState(mode === "agregar" ? "Jornada adicional para trabajo de varios días" : "");
  const canFlag = mode === "reprogramar" && (order.status === "programada" || order.status === "jornada_cerrada");
  const [flag, setFlag] = useState(canFlag);

  const update = (key: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const remove = (key: string) => setRows((rs) => rs.filter((r) => r.key !== key));
  const add = () => {
    counter.current += 1;
    const last = [today, ...kept.map((j) => j.date), ...rows.map((r) => r.date)].sort().at(-1) ?? today;
    setRows((rs) => [...rs, { key: `nueva-${counter.current}`, date: nextWorkday(last), start: defStart, end: defEnd }]);
  };

  // validation
  const keptDates = new Set(kept.map((j) => j.date));
  const errors = new Map<string, string>();
  rows.forEach((r) => {
    if (!r.date) errors.set(r.key, "Elija la fecha");
    else if (r.date < today && r.date !== r.original) errors.set(r.key, "La fecha ya pasó");
    else if (keptDates.has(r.date)) errors.set(r.key, "Ya hay una jornada ejecutada ese día");
    else if (rows.some((o) => o.key !== r.key && o.date === r.date)) errors.set(r.key, "Fecha repetida");
    else if (!r.start || !r.end || toMin(r.end) <= toMin(r.start)) errors.set(r.key, "La salida debe ser después de la entrada");
  });
  const unchanged =
    mode === "reprogramar" &&
    rows.length === pendingJornadas.length &&
    rows.every((r) => {
      const j = pendingJornadas.find((x) => x.id === r.key);
      return j && j.date === r.date && toTimeInput(j.plannedStart) === r.start && toTimeInput(j.plannedEnd) === r.end;
    });
  const reasonOk = reason.trim().length >= 5;
  const valid = rows.length > 0 && errors.size === 0 && reasonOk && !unchanged && (mode === "reprogramar" || rows.length > pendingJornadas.length);
  const totalMin = rows.reduce((s, r) => s + Math.max(0, toMin(r.end) - toMin(r.start)), 0);
  const sortedDates = rows.map((r) => r.date).filter(Boolean).sort();
  const hint = rows.length === 0
    ? "Agregue al menos una jornada"
    : errors.size
      ? "Revise las fechas marcadas"
      : unchanged
        ? "Sin cambios en las fechas"
        : !reasonOk
          ? "Indique el motivo"
          : `${plural(rows.length, "jornada", "jornadas")} · ${fmtDay(sortedDates[0])}${sortedDates.length > 1 ? ` – ${fmtDay(sortedDates.at(-1)!)}` : ""} · ${fmtHours(totalMin)}`;

  const save = () => {
    if (!valid) return;
    const r = reason.trim();
    scheduleJornadas(order.id, rows.map(({ date, start, end }) => ({ date, start, end })), r);
    if (flag && canFlag) setOrderStatus(order.id, "reprogramada", r);
    toast.success(mode === "agregar" ? "Jornada agregada" : "Jornadas reprogramadas", {
      description: flag && canFlag ? "La orden quedó Reprogramada hasta confirmar con el cliente." : `${plural(kept.length + rows.length, "jornada", "jornadas")} en total.`,
    });
    onDone();
  };

  return (
    <div className="space-y-5">
      {kept.length > 0 && (
        <ul className="space-y-1.5">
          {kept.map((j) => (
            <li key={j.id} className="flex items-center gap-3 rounded-[14px] bg-soft px-3.5 py-2.5 text-[13.5px]">
              <Lock className="size-3.5 shrink-0 text-subtle" />
              <span className="font-medium text-ink">Jornada {j.dayIndex}</span>
              <span className="text-subtle">· {fmtWeekdayDay(j.date)}</span>
              <span className="ml-auto text-[12.5px] text-subtle">{JORNADA_STATUS[j.status].label} · se conserva</span>
            </li>
          ))}
        </ul>
      )}

      <ul className="space-y-3">
        <AnimatePresence initial={false}>
          {rows.map((r, i) => {
            const err = errors.get(r.key);
            const isNew = !r.original;
            return (
              <motion.li
                key={r.key}
                layout
                initial={{ opacity: 0, y: 8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, x: -16, transition: { duration: 0.18 } }}
                className={cn("rounded-[18px] border p-3.5", err ? "border-amber-line-strong bg-amber-wash" : isNew ? "border-blue-line bg-blue-wash" : "border-hairline bg-surface")}
              >
                <div className="mb-2.5 flex items-center justify-between gap-3">
                  <p className="text-[13px] font-semibold text-ink">
                    Jornada {kept.length + i + 1}
                    {isNew && <span className="ml-2 rounded-md bg-blue-tint px-1.5 py-0.5 text-[11px] font-bold tracking-[0.06em] text-azure-fg">NUEVA</span>}
                    {r.date && <span className="ml-2 font-normal text-subtle">{fmtWeekdayDay(r.date)}</span>}
                  </p>
                  <button
                    type="button"
                    onClick={() => remove(r.key)}
                    aria-label={`Quitar jornada ${kept.length + i + 1}`}
                    className="-mr-1 inline-flex size-10 items-center justify-center rounded-full text-subtle transition hover:bg-red-soft hover:text-red-fg"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
                  <label className="col-span-2 sm:col-span-1">
                    <span className="sr-only">Fecha</span>
                    <input type="date" value={r.date} min={today} onChange={(e) => update(r.key, { date: e.target.value })} className={cn(inputClass, "tabular")} />
                  </label>
                  <label>
                    <span className="mb-1 block text-[11.5px] text-subtle sm:sr-only">Entrada</span>
                    <input type="time" value={r.start} onChange={(e) => update(r.key, { start: e.target.value })} className={cn(inputClass, "tabular")} aria-label="Hora de entrada" />
                  </label>
                  <label>
                    <span className="mb-1 block text-[11.5px] text-subtle sm:sr-only">Salida</span>
                    <input type="time" value={r.end} onChange={(e) => update(r.key, { end: e.target.value })} className={cn(inputClass, "tabular")} aria-label="Hora de salida" />
                  </label>
                </div>
                {err && <p className="mt-2 text-[12.5px] font-medium text-amber-fg">{err}</p>}
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>

      <Button variant="outline" onClick={add} className="h-11 w-full rounded-[14px] border-dashed border-line-heavy font-semibold text-ink">
        <CalendarPlus className="size-4" /> Agregar otro día
      </Button>

      <p className="text-[12.5px] leading-relaxed text-subtle">
        Las jornadas se numeran por fecha. La cuadrilla de las jornadas pendientes será la última asignada; puede cambiarla después por jornada.
      </p>

      <ReasonField
        value={reason}
        onChange={setReason}
        id="schedule-reason"
        suggestions={mode === "agregar" ? ["Jornada adicional para trabajo de varios días", "Trabajo adicional solicitado"] : ["Solicitud del cliente", "Acceso al sitio no disponible", "Falta de personal", "Condiciones climáticas"]}
      />

      {canFlag && (
        <ConfirmCheck checked={flag} onChange={setFlag}>
          <span className="font-semibold">Marcar como Reprogramada</span> hasta confirmar las nuevas fechas con el cliente. Podrá confirmarlas desde la pestaña Jornadas.
        </ConfirmCheck>
      )}

      <DialogActions hint={hint}>
        <Button variant="outline" onClick={onDone} className="h-11 rounded-[12px] border-line px-5 font-semibold">
          Cancelar
        </Button>
        <Button onClick={save} disabled={!valid} className="h-11 rounded-[12px] px-5 font-semibold">
          {mode === "agregar" ? "Agregar jornada" : "Guardar fechas"}
        </Button>
      </DialogActions>
    </div>
  );
}
