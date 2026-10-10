"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useAppStore } from "@/lib/store";
import { plural } from "@/lib/format";
import { CrewPicker } from "@/components/pk/crew-picker";
import { Button } from "@/components/ui/button";
import { jornadaTitle } from "./orden-format";
import { useOrder } from "./order-context";
import { DialogActions, OrderDialog, ReasonField } from "./ui";

/**
 * Variable crew per service (doc §4.1). Without a jornada it applies to every pending jornada
 * (or the one in progress when nothing is pending); with one, only to that jornada.
 */
export function CrewDialog({ open, onOpenChange, jornadaId }: { open: boolean; onOpenChange: (v: boolean) => void; jornadaId?: string }) {
  const { d } = useOrder();
  const target = jornadaId ? d.jornadas.find((j) => j.id === jornadaId) : undefined;
  const scope = target
    ? `${jornadaTitle(target)} · solo esta jornada`
    : d.pendingJornadas.length
      ? `Se aplica a ${plural(d.pendingJornadas.length, "jornada pendiente", "jornadas pendientes")}`
      : d.live
        ? `Se aplica a la jornada ${d.live.dayIndex}, en curso`
        : "Se usará en las próximas jornadas que programe";
  return (
    <OrderDialog
      open={open}
      onOpenChange={onOpenChange}
      eyebrow={d.order.folio}
      title={target ? `Cuadrilla de la jornada ${target.dayIndex}` : "Cambiar cuadrilla"}
      description={scope}
    >
      <CrewForm jornadaId={jornadaId} scope={scope} onDone={() => onOpenChange(false)} />
    </OrderDialog>
  );
}

function CrewForm({ jornadaId, scope, onDone }: { jornadaId?: string; scope: string; onDone: () => void }) {
  const { d } = useOrder();
  const { order, jornadas, pendingJornadas, live, currentCrew } = d;
  const assignCrew = useAppStore((s) => s.assignCrew);

  const target = jornadaId ? jornadas.find((j) => j.id === jornadaId) : undefined;
  const affected = target ? [target] : pendingJornadas.length ? pendingJornadas : live ? [live] : [];
  // assignCrew() without a jornada id updates every pending jornada.
  const applyTo = target?.id ?? (pendingJornadas.length ? undefined : live?.id);
  const initial = affected[0]?.workerIds ?? currentCrew.map((w) => w.id);

  const [value, setValue] = useState<string[]>(initial);
  const [reason, setReason] = useState(order.crewHistory.length ? "" : "Asignación inicial");

  const changed = value.length !== initial.length || value.some((id) => !initial.includes(id));
  const valid = changed && value.length > 0 && reason.trim().length >= 5;
  const hint = !changed ? "Sin cambios en la cuadrilla" : value.length === 0 ? "Seleccione al menos una persona" : reason.trim().length < 5 ? "Indique el motivo" : `${plural(value.length, "persona", "personas")}`;

  const save = () => {
    if (!valid) return;
    assignCrew(order.id, value, reason.trim(), applyTo);
    toast.success("Cuadrilla actualizada", { description: `${plural(value.length, "persona", "personas")} · ${scope.toLowerCase()}` });
    onDone();
  };

  return (
    <div className="space-y-5">
      <CrewPicker
        unitId={order.unitId}
        dates={affected.map((j) => j.date)}
        value={value}
        onChange={setValue}
        excludeOrderId={order.id}
        className="h-[min(44dvh,360px)]"
      />
      <ReasonField
        value={reason}
        onChange={setReason}
        id="crew-reason"
        suggestions={["Ausencia de personal", "Reforzar cuadrilla", "Especialidad requerida", "Cambio de turno"]}
      />
      <DialogActions hint={hint}>
        <Button variant="outline" onClick={onDone} className="h-11 rounded-[12px] border-line px-5 font-semibold">
          Cancelar
        </Button>
        <Button onClick={save} disabled={!valid} className="h-11 rounded-[12px] px-5 font-semibold">
          Guardar cuadrilla
        </Button>
      </DialogActions>
    </div>
  );
}
