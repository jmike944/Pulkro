"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { parseISO } from "date-fns";
import { useAppStore, useJornadaBundle, useNow } from "@/lib/hooks";
import { fmtDay, plural } from "@/lib/format";
import { Eyebrow } from "@/components/pk/bits";
import { ModalCancel, ModalShell, firstMissing } from "@/components/pk/modal-shell";
import { ReasonField, reasonOk } from "@/components/pk/reason-field";
import { Button } from "@/components/ui/button";
import { dayKey, hm, longDay, pendingDaysWithMove, sameSet, toDayPlan, validatePlan, type PlanIssue } from "./agenda-model";
import { ConfirmCheck } from "./form-bits";
import { FOOTER_PRIMARY, useOpenSession } from "./modal-bits";
import { ScheduleRows, type PlanRow } from "./schedule-form";

type Bundle = NonNullable<ReturnType<typeof useJornadaBundle>>;

export type MoveState = { jornadaId: string; open: boolean } | null;

const MOVE_REASONS = ["Solicitud del cliente", "Acceso no disponible", "Clima", "Reasignación de personal"];

/**
 * Reschedule ONE jornada of an order (the "Reprogramar" button of the agenda's jornada sheet). Same row editor,
 * validation and reason rule as every scheduling form; phones get the full-screen flow, desktop a dialog.
 * It lives next to the sheet, not inside it: rescheduling replaces the jornada (new id), and the sheet re-targets itself.
 */
export function MoveDialog({
  state,
  onOpenChange,
  onMoved,
}: {
  state: MoveState;
  onOpenChange: (open: boolean) => void;
  /** the moved jornada has a new id: follow it */
  onMoved: (jornadaId: string, date: string) => void;
}) {
  const open = !!state?.open;
  const session = useOpenSession(open);
  if (!state || session === 0) return null;
  return <MoveForm key={session} jornadaId={state.jornadaId} open={open} onOpenChange={onOpenChange} onMoved={onMoved} />;
}

function MoveForm({ jornadaId, open, onOpenChange, onMoved }: { jornadaId: string; open: boolean; onOpenChange: (open: boolean) => void; onMoved: (id: string, date: string) => void }) {
  const live = useJornadaBundle(jornadaId);
  // frozen at open: saving replaces the jornada, and the form must not blink to "no disponible" while it closes
  const [b] = useState(live);
  if (!b) {
    return (
      <ModalShell open={open} onOpenChange={onOpenChange} title="Jornada no disponible" description="Es posible que se haya reprogramado o eliminado." size="sm" footer={<ModalCancel>Cerrar</ModalCancel>}>
        {null}
      </ModalShell>
    );
  }
  return <MoveEditor b={b} open={open} onOpenChange={onOpenChange} onMoved={onMoved} />;
}

function MoveEditor({ b, open, onOpenChange, onMoved }: { b: Bundle; open: boolean; onOpenChange: (open: boolean) => void; onMoved: (id: string, date: string) => void }) {
  const { jornada: j, order, client, jornadas } = b;
  const now = useNow(60_000);
  const scheduleJornadas = useAppStore((s) => s.scheduleJornadas);
  const assignCrew = useAppStore((s) => s.assignCrew);
  const todayK = dayKey(now);
  const current = toDayPlan(j);

  const [initialDate] = useState(() => (current.date < todayK ? todayK : current.date));
  const [date, setDate] = useState(initialDate);
  const [start, setStart] = useState(current.start);
  const [end, setEnd] = useState(current.end);
  const [motivo, setMotivo] = useState("");
  const [ok, setOk] = useState(false);

  const others = jornadas.filter((x) => x.id !== j.id);
  const lastExecuted = others
    .filter((x) => x.status !== "pendiente")
    .map((x) => x.date)
    .sort()
    .at(-1);
  let issue: PlanIssue | null = validatePlan({ date, start, end }, todayK);
  if (!issue && others.some((x) => x.date === date)) issue = { field: "date", message: "La orden ya tiene otra jornada ese día: elija otra fecha." };
  if (!issue && lastExecuted && date <= lastExecuted) issue = { field: "date", message: `Debe ser posterior al ${fmtDay(lastExecuted)}, la última jornada ejecutada.` };
  const unchanged = date === current.date && start === current.start && end === current.end && !current.clamped;
  const clampedOthers = others.filter((x) => x.status === "pendiente").map(toDayPlan).filter((p) => p.clamped);
  const valid = !issue && !unchanged && reasonOk(motivo) && ok;
  const hint = firstMissing(
    [!!issue, "Corrija la fecha o el horario"],
    [unchanged, "Sin cambios en la fecha ni el horario"],
    [!reasonOk(motivo), "Indique el motivo (mínimo 5 caracteres)"],
    [!ok, "Marque la casilla de confirmación"],
  );
  const dirty = date !== initialDate || start !== current.start || end !== current.end || motivo !== "" || ok;

  const row: PlanRow = { key: "mover", date, start, end };
  const patchRow = (_: string, patch: Partial<{ date: string; start: string; end: string }>) => {
    if (patch.date !== undefined) setDate(patch.date);
    if (patch.start !== undefined) setStart(patch.start);
    if (patch.end !== undefined) setEnd(patch.end);
  };

  const save = () => {
    if (!valid) return;
    const days = pendingDaysWithMove(jornadas, { jornadaId: j.id, date, start, end });
    scheduleJornadas(
      order.id,
      days.map(({ date: d, start: s, end: e }) => ({ date: d, start: s, end: e })),
      motivo.trim(),
    );
    // scheduleJornadas gives every fresh jornada the order's latest crew — keep each day's own crew.
    const fresh = useAppStore
      .getState()
      .jornadas.filter((x) => x.orderId === order.id && x.status === "pendiente")
      .sort((a, c) => a.date.localeCompare(c.date) || a.plannedStart.localeCompare(c.plannedStart));
    fresh.forEach((fj, i) => {
      const want = days[i]?.crew;
      if (want && want.length && !sameSet(want, fj.workerIds)) assignCrew(order.id, want, "Se conserva la cuadrilla de la jornada reprogramada", fj.id);
    });
    const moved = fresh.find((x) => x.date === date && hm(x.plannedStart) === start) ?? fresh.find((x) => x.date === date);
    toast.success("Jornada reprogramada", { description: `${order.folio} · ${longDay(parseISO(date))} · ${start}–${end}` });
    if (moved) onMoved(moved.id, date);
    onOpenChange(false);
  };

  return (
    <ModalShell
      open={open}
      onOpenChange={onOpenChange}
      title="Reprogramar jornada"
      eyebrow={order.folio}
      description={
        <>
          Jornada {j.dayIndex} de {Math.max(order.plannedDays, j.dayIndex)} · <b>{client?.shortName ?? order.title}</b>
        </>
      }
      size="md"
      phone="flow"
      dirty={dirty}
      footerHint={hint}
      footer={
        <>
          <ModalCancel className="max-lg:hidden" />
          <Button type="button" disabled={!valid} onClick={save} className={FOOTER_PRIMARY}>
            Reprogramar
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <ScheduleRows rows={[row]} errors={new Map(issue ? [[row.key, issue]] : [])} today={todayK} fixed firstIndex={j.dayIndex} onUpdate={patchRow} />
        {current.clamped && (
          <p className="-mt-2 text-[12.5px] leading-snug text-amber-fg">
            Esta jornada terminaba al día siguiente ({current.originalEnd}); las jornadas se registran dentro del mismo día.
          </p>
        )}

        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 rounded-[18px] border border-hairline p-4">
          <div className="min-w-0">
            <Eyebrow>Antes</Eyebrow>
            <p className="mt-1 truncate text-[14px] font-medium text-subtle line-through decoration-ghost">{fmtDay(current.date)}</p>
            <p className="text-[13px] text-subtle tabular">
              {current.start}–{current.clamped ? current.originalEnd : current.end}
            </p>
          </div>
          <motion.span aria-hidden animate={{ x: [0, 4, 0] }} transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }} className="text-subtle">
            <ArrowRight className="size-4" />
          </motion.span>
          <div className="min-w-0">
            <Eyebrow>Después</Eyebrow>
            <p className="mt-1 truncate text-[14px] font-semibold text-ink">{/^\d{4}-\d{2}-\d{2}$/.test(date) ? fmtDay(date) : "—"}</p>
            <p className="text-[13px] text-ink tabular">
              {start}–{end}
            </p>
          </div>
        </div>

        {clampedOthers.length > 0 && (
          <p className="rounded-[14px] bg-amber-soft px-4 py-3 text-[12.5px] leading-snug text-amber-ink">
            {plural(clampedOthers.length, "otra jornada nocturna", "otras jornadas nocturnas")} de la orden se registrará{clampedOthers.length > 1 ? "n" : ""} con término a las 23:59 del mismo día.
          </p>
        )}

        <ReasonField id="mv-motivo" value={motivo} onChange={setMotivo} suggestions={MOVE_REASONS} />
        <ConfirmCheck id="mv-ok" checked={ok} onChange={setOk}>
          Confirmo la nueva fecha y aviso al contacto en sitio por los medios habituales (la app no envía notificaciones). El cambio queda en la bitácora.
        </ConfirmCheck>
      </div>
    </ModalShell>
  );
}
