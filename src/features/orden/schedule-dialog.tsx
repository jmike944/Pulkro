"use client";

import { useState } from "react";
import { addMinutes, format, parseISO } from "date-fns";
import { toast } from "sonner";
import { useAppStore } from "@/lib/store";
import { useMediaQuery } from "@/lib/hooks";
import { fmtDay, plural } from "@/lib/format";
import { BigButton } from "@/components/pk/mobile";
import { MODAL_DESKTOP_QUERY, ModalShell, firstMissing } from "@/components/pk/modal-shell";
import { dayKey, dowShort, nextWorkingDay, toDayPlan } from "@/features/agenda/agenda-model";
import { useOpenSession } from "@/features/agenda/modal-bits";
import {
  ScheduleDone,
  ScheduleRows,
  StepActions,
  StepBar,
  StepPanel,
  planErrors,
  planSignature,
  planSummary,
  usePlanRows,
  useStepper,
  type KeptJornada,
  type PlanRow,
} from "@/features/agenda/schedule-form";
import { JORNADA_STATUS } from "./orden-format";
import { useOrder } from "./order-context";
import { ConfirmCheck, ReasonField, reasonOk } from "./ui";

type Mode = "reprogramar" | "agregar";

const STEPS = ["Fechas", "Motivo"] as const;
const REASONS: Record<Mode, string[]> = {
  agregar: ["Jornada adicional para trabajo de varios días", "Trabajo adicional solicitado"],
  reprogramar: ["Solicitud del cliente", "Acceso al sitio no disponible", "Falta de personal", "Condiciones climáticas"],
};

/**
 * Reprogramar / Agregar jornada. Both rewrite the pending jornadas through store.scheduleJornadas()
 * (executed jornadas are always kept). Reprogramar can flag the order as "Reprogramada" until the
 * client confirms the new dates. Same rows editor, validation and stepper as the agenda's "Programar orden":
 * phones get Fechas → Motivo (a FlowScreen ending in a success screen), desktop one dialog.
 */
export function ScheduleDialog({ open, onOpenChange, mode }: { open: boolean; onOpenChange: (v: boolean) => void; mode: Mode }) {
  // a fresh form on every open; it stays mounted while closing so the exit animation plays
  const session = useOpenSession(open);
  if (session === 0) return null;
  return <ScheduleForm key={session} open={open} onOpenChange={onOpenChange} mode={mode} />;
}

type Done = { title: string; message: string };

function ScheduleForm({ open, onOpenChange, mode }: { open: boolean; onOpenChange: (v: boolean) => void; mode: Mode }) {
  const { d } = useOrder();
  const { order, client, jornadas, pendingJornadas, serviceType, now } = d;
  const scheduleJornadas = useAppStore((s) => s.scheduleJornadas);
  const setOrderStatus = useAppStore((s) => s.setOrderStatus);
  const stepped = !useMediaQuery(MODAL_DESKTOP_QUERY);

  const kept: KeptJornada[] = jornadas
    .filter((j) => j.status !== "pendiente")
    .map((j) => ({ id: j.id, dayIndex: j.dayIndex, date: j.date, label: JORNADA_STATUS[j.status].label }));
  const keptDates = kept.map((j) => j.date);
  const today = format(now, "yyyy-MM-dd");
  const template = pendingJornadas[0] ?? jornadas.at(-1);
  const defaults = template ? toDayPlan(template) : null;
  const defStart = defaults?.start ?? "08:00";
  const defEnd = defaults?.end ?? format(addMinutes(parseISO(`${today}T08:00:00`), serviceType.defaultHoursPerDay * 60), "HH:mm");
  const nextWorkday = (after: string) => dayKey(nextWorkingDay(parseISO(after)));

  const canFlag = mode === "reprogramar" && (order.status === "programada" || order.status === "jornada_cerrada");
  const [seed] = useState(() => {
    const existing: PlanRow[] = pendingJornadas.map((j) => {
      const p = toDayPlan(j);
      return {
        key: j.id,
        date: p.date,
        start: p.start,
        end: p.end,
        original: j.date,
        note: p.clamped ? `Terminaba al día siguiente (${p.originalEnd}); ajustado al mismo día.` : undefined,
      };
    });
    const last = [today, ...jornadas.map((j) => j.date)].sort().at(-1) ?? today;
    const fresh: PlanRow = { key: "nueva-0", date: nextWorkday(last < today ? today : last), start: defStart, end: defEnd };
    const rows = mode === "agregar" ? [...existing, fresh] : existing.length ? existing : [{ ...fresh, date: nextWorkday(today) }];
    return { existing, rows, reason: mode === "agregar" ? "Jornada adicional para trabajo de varios días" : "", flag: canFlag };
  });
  const { rows, update, remove, add } = usePlanRows(() => seed.rows, { today, keptDates, start: defStart, end: defEnd });
  const [reason, setReason] = useState(seed.reason);
  const [flag, setFlag] = useState(seed.flag);
  const [done, setDone] = useState<Done | null>(null);
  const { step, dir, go } = useStepper();

  const errors = planErrors(rows, { today, keptDates: new Set(keptDates) });
  // an overnight jornada that was clamped to 23:59 counts as a change: saving is how the clamp gets stored
  const unchanged = mode === "reprogramar" && planSignature(rows) === planSignature(seed.existing) && !seed.existing.some((r) => r.note);
  const reasonReady = reasonOk(reason);
  const datesMissing = firstMissing(
    [rows.length === 0, "Agregue al menos una jornada"],
    [mode === "agregar" && rows.length <= pendingJornadas.length, "Agregue la jornada nueva"],
    [errors.size > 0, "Corrija las fechas marcadas"],
    [unchanged, "Sin cambios en las fechas"],
  );
  const datesReady = !datesMissing;
  const valid = datesReady && reasonReady;
  const reasonMissing = firstMissing([!reasonReady, "Indique el motivo (mínimo 5 caracteres)"]);

  // desktop shows both parts at once; phones walk through them
  const showDates = !stepped || step === 0;
  const showReason = !stepped || step === 1;
  const last = !stepped || step === STEPS.length - 1;
  const ready = last ? valid : datesReady;
  const summary = planSummary(rows);
  const hint = (stepped ? (step === 0 ? datesMissing : reasonMissing) : (datesMissing ?? reasonMissing)) ?? summary;
  const sorted = [...rows].sort((a, c) => a.date.localeCompare(c.date));
  const dirty = !done && (planSignature(rows) !== planSignature(seed.rows) || reason !== seed.reason || flag !== seed.flag);

  const save = () => {
    if (!valid) return;
    const r = reason.trim();
    scheduleJornadas(order.id, rows.map(({ date, start, end }) => ({ date, start, end })), r);
    if (flag && canFlag) setOrderStatus(order.id, "reprogramada", r);
    const title = mode === "agregar" ? "Jornada agregada" : "Jornadas reprogramadas";
    const message = flag && canFlag ? "La orden quedó Reprogramada hasta confirmar con el cliente." : `${plural(kept.length + rows.length, "jornada", "jornadas")} en total.`;
    if (stepped) setDone({ title, message });
    else {
      toast.success(title, { description: message });
      onOpenChange(false);
    }
  };

  if (done) {
    return (
      <ModalShell
        open={open}
        onOpenChange={onOpenChange}
        title={<span className="sr-only">{done.title}</span>}
        size="md"
        phone="flow"
        footer={
          <BigButton variant="outline" onClick={() => onOpenChange(false)}>
            Volver a la orden
          </BigButton>
        }
      >
        <ScheduleDone title={done.title} message={done.message} client={client} order={order} />
      </ModalShell>
    );
  }

  return (
    <ModalShell
      open={open}
      onOpenChange={onOpenChange}
      eyebrow={order.folio}
      title={mode === "agregar" ? "Agregar jornada" : "Reprogramar jornadas"}
      description={
        mode === "agregar"
          ? "Para trabajos de varios días. Cada jornada guarda su propia entrada, salida, fotos y bitácora; el cierre y el reporte siguen siendo únicos."
          : "Mueva las fechas u horarios de las jornadas pendientes. Las jornadas ya ejecutadas se conservan sin cambios."
      }
      size="md"
      phone="flow"
      dirty={dirty}
      footerHint={hint}
      footer={
        <StepActions
          step={stepped ? step : 0}
          last={last}
          ready={ready}
          onBack={() => go(step - 1)}
          onNext={() => go(step + 1)}
          onSubmit={save}
          submitLabel={mode === "agregar" ? "Agregar jornada" : "Guardar fechas"}
        />
      }
    >
      {stepped && <StepBar labels={STEPS} step={step} canGo={(i) => i <= step || datesReady} onGo={go} />}

      <StepPanel step={stepped ? step : 0} dir={dir}>
        {showDates && (
          <>
            <ScheduleRows rows={rows} errors={errors} today={today} kept={kept} showNew onUpdate={update} onRemove={remove} onAdd={add} />
            <p className="text-[12.5px] leading-relaxed text-subtle">
              Las jornadas se numeran por fecha. La cuadrilla de las jornadas pendientes será la última asignada; puede cambiarla después por jornada.
            </p>
          </>
        )}

        {showReason && (
          <>
            {stepped && (
              <div className="rounded-[18px] border border-hairline p-4">
                <p className="mb-2.5 text-[13px] font-semibold text-ink">Quedará así</p>
                <ul className="space-y-2 text-[14px]">
                  {sorted.map((r, i) => (
                    <li key={r.key} className="flex items-baseline justify-between gap-3">
                      <span className="font-medium text-ink">Jornada {kept.length + i + 1}</span>
                      <span className="text-right text-subtle tabular">
                        {dowShort(parseISO(r.date))} {fmtDay(r.date)} · {r.start}–{r.end}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <ReasonField value={reason} onChange={setReason} id="schedule-reason" suggestions={REASONS[mode]} />
            {canFlag && (
              <ConfirmCheck checked={flag} onChange={setFlag}>
                <span className="font-semibold">Marcar como Reprogramada</span> hasta confirmar las nuevas fechas con el cliente. Podrá confirmarlas desde la pestaña Jornadas.
              </ConfirmCheck>
            )}
          </>
        )}
      </StepPanel>
    </ModalShell>
  );
}
