"use client";

import { useMemo, useState } from "react";
import { Check, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { useAppStore, useLookups, useMediaQuery, useOrderBundle, useScopedData } from "@/lib/hooks";
import { useUi } from "@/lib/ui-store";
import { fmtDay, fmtDuration, plural } from "@/lib/format";
import { CrewPicker } from "@/components/pk/crew-picker";
import { AvatarStack, KeyValues } from "@/components/pk/bits";
import { ClientMark } from "@/components/pk/client-mark";
import { BigButton } from "@/components/pk/mobile";
import { MODAL_DESKTOP_QUERY, ModalCancel, ModalShell, firstMissing } from "@/components/pk/modal-shell";
import { ReasonField, reasonOk } from "@/components/pk/reason-field";
import { OrderStatusPill } from "@/components/pk/status";
import { dayKey, dowShort, longDay, minutesOf, nextWorkingDay, sameSet, toDayPlan } from "./agenda-model";
import { ConfirmCheck } from "./form-bits";
import { useOpenSession } from "./modal-bits";
import {
  ScheduleDone,
  ScheduleRows,
  StepActions,
  StepBar,
  StepPanel,
  planErrors,
  planMinutes,
  planSignature,
  planSummary,
  usePlanRows,
  useStepper,
  type KeptJornada,
  type PlanRow,
} from "./schedule-form";

export type ScheduleState = { orderId: string; open: boolean } | null;

const STEPS = ["Fechas", "Cuadrilla", "Confirmar"] as const;
const REASONS_NEW = ["Programación inicial", "Cliente confirmó fechas", "Ajuste de disponibilidad"];
const REASONS_MOVED = ["Cliente confirmó nueva fecha", "Acceso confirmado", "Ajuste de disponibilidad"];
const KEPT_LABEL = { en_curso: "En curso", cerrada: "Cerrada", pendiente: "Pendiente" } as const;

/**
 * "Programar": jornada rows (dates/times) → CrewPicker → key-value summary with motivo and explicit
 * confirmation → scheduleJornadas + assignCrew (doc §3 steps 3–4). Phones: a FlowScreen stepper that ends in a
 * success screen; desktop: the same steps in a centered dialog that closes with a toast.
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
  const open = !!state?.open;
  // a fresh form on every open; it stays mounted while closing so the exit animation plays
  const session = useOpenSession(open);
  if (!state || session === 0) return null;
  return <ScheduleBody key={session} orderId={state.orderId} open={open} todayKey={todayKey} onOpenChange={onOpenChange} onDone={onDone} />;
}

function initialRows(b: NonNullable<ReturnType<typeof useOrderBundle>>, todayKey: string): PlanRow[] {
  const pending = b.jornadas.filter((j) => j.status === "pendiente");
  if (pending.length) {
    return pending.map((j) => {
      const p = toDayPlan(j);
      return {
        key: j.id,
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
  const rows: PlanRow[] = [];
  let d = dayKey(s) < todayKey ? parseISO(todayKey) : s;
  for (let i = 0; i < Math.max(1, b.order.plannedDays); i++) {
    rows.push({ key: `plan-${i}`, date: dayKey(d), start, end });
    d = nextWorkingDay(d);
  }
  return rows;
}

type Done = { title: string; firstDate: string; days: number; people: number; minutes: number };

function ScheduleBody({
  orderId,
  open,
  todayKey,
  onOpenChange,
  onDone,
}: {
  orderId: string;
  open: boolean;
  todayKey: string;
  onOpenChange: (open: boolean) => void;
  onDone: (orderId: string, firstDate: string) => void;
}) {
  const b = useOrderBundle(orderId);
  const lk = useLookups();
  const scheduleJornadas = useAppStore((s) => s.scheduleJornadas);
  const assignCrew = useAppStore((s) => s.assignCrew);
  const allJornadas = useAppStore((s) => s.jornadas);
  const allOrders = useAppStore((s) => s.orders);
  const { orderIds: visibleOrderIds } = useScopedData();
  const isPhone = !useMediaQuery(MODAL_DESKTOP_QUERY);

  const kept = useMemo<KeptJornada[]>(
    () => (b?.jornadas ?? []).filter((j) => j.status !== "pendiente").map((j) => ({ id: j.id, dayIndex: j.dayIndex, date: j.date, label: KEPT_LABEL[j.status] })),
    [b],
  );
  const keptDates = useMemo(() => kept.map((j) => j.date), [kept]);
  const keptSet = useMemo(() => new Set(keptDates), [keptDates]);

  // what the form looked like when it opened: the discard guard only fires once something differs
  const [seed] = useState(() => ({
    rows: b ? initialRows(b, todayKey) : [],
    crew: b?.order.crewHistory.at(-1)?.workerIds ?? [],
    motivo: b?.order.status === "borrador" ? REASONS_NEW[0] : "",
  }));
  const { rows, update, remove, add } = usePlanRows(() => seed.rows, { today: todayKey, keptDates, start: "08:00", end: "16:00" });
  const [crew, setCrew] = useState<string[]>(seed.crew);
  const [motivo, setMotivo] = useState(seed.motivo);
  const [ok, setOk] = useState(false);
  const [done, setDone] = useState<Done | null>(null);
  const { step, dir, go } = useStepper();

  const errors = useMemo(() => planErrors(rows, { today: todayKey, keptDates: keptSet }), [rows, todayKey, keptSet]);
  const crewDates = useMemo(() => rows.map((r) => r.date), [rows]);

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
      <ModalShell open={open} onOpenChange={onOpenChange} title="Orden no disponible" description="La orden ya no está en su alcance." size="sm" footer={<ModalCancel>Cerrar</ModalCancel>}>
        {null}
      </ModalShell>
    );
  }
  const { order, client, site } = b;
  const moved = order.status === "reprogramada";

  const rowsValid = rows.length > 0 && errors.size === 0;
  const crewReady = crew.length > 0;
  const reasonReady = reasonOk(motivo);
  const stepReady = [rowsValid, crewReady, rowsValid && crewReady && reasonReady && ok];
  const canGo = (i: number) => i <= step || stepReady.slice(0, i).every(Boolean);
  const last = step === STEPS.length - 1;
  const totalMin = planMinutes(rows);
  const people = crew.map((id) => lk.workers.get(id)).filter((w) => !!w);
  const sorted = [...rows].sort((a, c) => a.date.localeCompare(c.date));

  const dirty =
    !done && (planSignature(rows) !== planSignature(seed.rows) || !sameSet(crew, seed.crew) || motivo !== seed.motivo || ok);

  const hint =
    step === 0
      ? (firstMissing([rows.length === 0, "Agregue al menos una jornada"], [errors.size > 0, "Corrija las fechas marcadas"]) ?? planSummary(rows))
      : step === 1
        ? (firstMissing([!crewReady, "Seleccione al menos una persona"]) ?? plural(crew.length, "persona seleccionada", "personas seleccionadas"))
        : firstMissing([!reasonReady, "Indique el motivo (mínimo 5 caracteres)"], [!ok, "Marque la casilla de confirmación"]);

  const confirm = () => {
    if (!stepReady[2]) return;
    const days = sorted.map(({ date, start, end }) => ({ date, start, end }));
    const reason = motivo.trim();
    scheduleJornadas(order.id, days, reason);
    assignCrew(order.id, crew, reason);
    useUi.getState().fireCelebrate();
    if (isPhone) {
      setDone({
        title: moved ? "Fechas confirmadas" : "Orden programada",
        firstDate: days[0].date,
        days: days.length,
        people: crew.length,
        minutes: totalMin,
      });
      return;
    }
    toast.success(`${order.folio} programada`, {
      description: `${plural(days.length, "jornada", "jornadas")} · ${plural(crew.length, "persona", "personas")} · inicia ${fmtDay(days[0].date)}`,
    });
    onDone(order.id, days[0].date);
  };

  // closing the success screen (button, X or Esc) is how the agenda moves to the new dates
  const handleOpenChange = (v: boolean) => {
    if (!v && done) onDone(order.id, done.firstDate);
    else onOpenChange(v);
  };

  if (done) {
    return (
      <ModalShell
        open={open}
        onOpenChange={handleOpenChange}
        title={<span className="sr-only">{done.title}</span>}
        size="lg"
        phone="flow"
        footer={
          <BigButton variant="outline" onClick={() => handleOpenChange(false)}>
            Volver a la agenda
          </BigButton>
        }
      >
        <ScheduleDone
          title={done.title}
          message={`${order.folio} quedó con ${plural(done.days, "jornada", "jornadas")} y ${plural(done.people, "persona", "personas")}. Inicia el ${longDay(parseISO(done.firstDate)).toLowerCase()}.`}
          client={client}
          order={order}
          stat={{
            label: "Primera jornada",
            value: <span className="tabular">{`${dowShort(parseISO(done.firstDate))} ${fmtDay(done.firstDate)}`}</span>,
            sub: `${plural(done.days, "jornada", "jornadas")} · ${fmtDuration(done.minutes)} planeadas · ${plural(done.people, "persona", "personas")}.`,
          }}
        />
      </ModalShell>
    );
  }

  return (
    <ModalShell
      open={open}
      onOpenChange={handleOpenChange}
      title={moved ? "Confirmar fechas" : "Programar orden"}
      eyebrow={order.folio}
      description={
        <>
          <b>{client?.shortName}</b> · {order.title}
        </>
      }
      size="lg"
      phone="flow"
      dirty={dirty}
      footerHint={hint}
      footer={
        <StepActions
          step={step}
          last={last}
          ready={stepReady[step]}
          onBack={() => go(step - 1)}
          onNext={() => go(step + 1)}
          onSubmit={confirm}
          submitLabel={moved ? "Confirmar fechas" : "Programar"}
          submitIcon={<Check />}
        />
      }
    >
      <StepBar labels={STEPS} step={step} canGo={canGo} onGo={go} />

      <StepPanel step={step} dir={dir}>
        {step === 0 && (
          <>
            <div className="flex items-center gap-3 rounded-[18px] border border-hairline p-3.5">
              {client && <ClientMark name={client.name} hue={client.hue} size={40} />}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14.5px] font-semibold text-ink">{site?.name}</p>
                <p className="truncate text-[12.5px] text-subtle">{site?.address}</p>
              </div>
              <OrderStatusPill status={order.status} />
            </div>
            <p className="text-[13.5px] leading-snug text-subtle">
              Una jornada por día. Las órdenes de varios días conservan registros independientes y un único cierre.
            </p>
            <ScheduleRows rows={rows} errors={errors} today={todayKey} kept={kept} onUpdate={update} onRemove={remove} onAdd={add} />
          </>
        )}

        {step === 1 && (
          <>
            <p className="text-[13.5px] leading-snug text-subtle">
              Elija a quienes trabajarán {rows.length === 1 ? "la jornada" : `las ${rows.length} jornadas`} ({sorted.map((r) => fmtDay(r.date)).join(", ")}). Se marca a quien ya tiene otra jornada
              {rows.length === 1 ? " ese día" : " esos días"}.
            </p>
            <CrewPicker unitId={order.unitId} dates={crewDates} value={crew} onChange={setCrew} excludeOrderId={order.id} />
          </>
        )}

        {step === 2 && (
          <>
            <KeyValues
              rows={[
                { k: "Sitio", v: site?.name ?? "—" },
                {
                  k: "Jornadas",
                  v: (
                    <span className="flex flex-col items-end gap-0.5 tabular">
                      {sorted.map((r) => (
                        <span key={r.key}>
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
              className="rounded-[18px] border border-hairline p-4 sm:p-5"
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
            <ReasonField id="sched-motivo" value={motivo} onChange={setMotivo} suggestions={moved ? REASONS_MOVED : REASONS_NEW} />
            <ConfirmCheck id="sched-ok" checked={ok} onChange={setOk}>
              Confirmo {rows.length === 1 ? "la jornada" : `las ${rows.length} jornadas`} y la cuadrilla. La orden pasará a <b className="font-semibold">Programada</b> y el cambio queda en la bitácora.
            </ConfirmCheck>
          </>
        )}
      </StepPanel>
    </ModalShell>
  );
}
