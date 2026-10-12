"use client";

/**
 * The one crew editor (doc §4.1, §8: historial de cambios de personal por fecha, con motivo).
 *
 * Mounted from three places, all through `CrewModal`: the order page (`orden/crew-dialog`), the agenda's jornada sheet
 * and the field view (`CrewFlow` below). Phones get the full-screen flow, desktop a centered dialog; the picker is as tall
 * as its list (the modal body scrolls, never the picker), and the reason is the app-wide `ReasonField` (at least 5 characters).
 */
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { useAppStore, useLookups } from "@/lib/hooks";
import { plural } from "@/lib/format";
import type { Jornada, Order, Worker } from "@/lib/types";
import { TEXT_LIMITS } from "@/lib/domain";
import { CrewPicker } from "@/components/pk/crew-picker";
import { PersonAvatar } from "@/components/pk/bits";
import { ModalCancel, ModalShell, firstMissing } from "@/components/pk/modal-shell";
import { ReasonField, reasonOk } from "@/components/pk/reason-field";
import { useOpenSession } from "@/components/pk/use-open-session";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { sameSet } from "@/features/agenda/agenda-model";
import { FOOTER_PRIMARY } from "@/features/agenda/modal-bits";
import { jornadaTitle } from "@/features/orden/orden-format";
import type { FieldReady } from "./use-field-state";

const REASONS = ["Ausencia de personal", "Refuerzo por carga de trabajo", "Cambio de turno", "Especialidad requerida", "Solicitud del cliente"];

export type CrewModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: Pick<Order, "id" | "folio" | "unitId" | "crewHistory">;
  /** every jornada of the order */
  jornadas: Jornada[];
  /** the jornada to edit; without one the change applies to every pending jornada (or the one in progress when none is pending) */
  jornadaId?: string;
  /** offer "Aplicar a todas las jornadas pendientes" when the jornada is pending and so are others */
  allowApplyAll?: boolean;
};

/** Variable crew for one jornada, several, or the order's next ones. Starts fresh on every open. */
export function CrewModal(props: CrewModalProps) {
  const session = useOpenSession(props.open);
  if (session === 0) return null;
  return <CrewForm key={session} {...props} />;
}

function CrewForm({ open, onOpenChange, order, jornadas, jornadaId, allowApplyAll = false }: CrewModalProps) {
  const assignCrew = useAppStore((s) => s.assignCrew);
  const { workers } = useLookups();

  const target = jornadaId ? jornadas.find((j) => j.id === jornadaId) : undefined;
  const pending = jornadas.filter((j) => j.status === "pendiente");
  const live = jornadas.find((j) => j.status === "en_curso");
  const canApplyAll = allowApplyAll && !!target && target.status === "pendiente" && pending.length > 1;
  const [applyAll, setApplyAll] = useState(false);
  const all = canApplyAll && applyAll;

  // assignCrew() without a jornada id updates every pending jornada
  const affected = target ? (all ? pending : [target]) : pending.length ? pending : live ? [live] : [];
  const applyTo = target ? (all ? undefined : target.id) : pending.length ? undefined : live?.id;

  const [initial] = useState<string[]>(() => {
    const base = target ? [target] : pending.length ? pending : live ? [live] : [];
    // with no jornada yet, assignCrew keeps the crew only in the order's history (the next jornadas take the latest entry)
    const latest = (jornadas.find((j) => j.status !== "cerrada") ?? jornadas.at(-1))?.workerIds ?? order.crewHistory.at(-1)?.workerIds ?? [];
    return base[0]?.workerIds ?? latest.filter((id) => workers.has(id));
  });
  const [initialReason] = useState(() => (order.crewHistory.length ? "" : "Asignación inicial"));
  const [value, setValue] = useState<string[]>(initial);
  const [reason, setReason] = useState(initialReason);

  const diff = useMemo(() => {
    const before = new Set(initial);
    const after = new Set(value);
    const pick = (ids: string[]) => ids.map((id) => workers.get(id)).filter((w): w is Worker => !!w);
    return { added: pick(value.filter((id) => !before.has(id))), removed: pick(initial.filter((id) => !after.has(id))) };
  }, [initial, value, workers]);
  // a stable array: the picker recomputes who is double-booked whenever `dates` changes identity
  const dateKey = affected.map((j) => j.date).join(",");
  const crewDates = useMemo(() => (dateKey ? dateKey.split(",") : []), [dateKey]);

  const changed = affected.length ? affected.some((j) => !sameSet(j.workerIds, value)) : !sameSet(initial, value);
  const valid = changed && value.length > 0 && reasonOk(reason);
  const dirty = !sameSet(value, initial) || reason !== initialReason || all;

  let scope: string;
  if (target && !all) scope = `${jornadaTitle(target)} · solo esta jornada`;
  else if (pending.length) scope = `Se aplica a ${plural(pending.length, "jornada pendiente", "jornadas pendientes")}`;
  else if (live) scope = `Se aplica a la jornada ${live.dayIndex}, en curso`;
  else scope = "Se usará en las próximas jornadas que programe";

  const scopeShort = target && !all ? `Jornada ${target.dayIndex}` : pending.length ? "jornadas pendientes" : live ? `Jornada ${live.dayIndex}` : "próximas jornadas";
  const summary = `${plural(value.length, "persona", "personas")}${diff.added.length ? ` · +${diff.added.length}` : ""}${diff.removed.length ? ` · −${diff.removed.length}` : ""}`;
  const hint =
    firstMissing(
      [value.length === 0, "Seleccione al menos una persona"],
      [!changed, "Marque o desmarque personas para cambiar la cuadrilla"],
      [!reasonOk(reason), "Indique el motivo (mínimo 5 caracteres)"],
    ) ?? summary;

  const save = () => {
    if (!valid) return;
    assignCrew(order.id, value, reason.trim(), applyTo);
    toast.success("Cuadrilla actualizada", { description: `${order.folio} · ${scopeShort} · ${summary}` });
    onOpenChange(false);
  };

  return (
    <ModalShell
      open={open}
      onOpenChange={onOpenChange}
      title="Cambiar cuadrilla"
      eyebrow={order.folio}
      description={scope}
      size="md"
      phone="flow"
      dirty={dirty}
      footerHint={hint}
      footer={
        <>
          <ModalCancel className="max-lg:hidden" />
          <Button type="button" disabled={!valid} onClick={save} className={FOOTER_PRIMARY}>
            Guardar cuadrilla
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {canApplyAll && (
          <label className="flex min-h-14 cursor-pointer items-center justify-between gap-4 rounded-[16px] border border-hairline p-4">
            <span className="text-[13.5px] leading-snug">
              <span className="block font-semibold text-ink">Aplicar a todas las jornadas pendientes</span>
              <span className="text-subtle">{plural(pending.length, "jornada pendiente", "jornadas pendientes")} de la orden.</span>
            </span>
            <Switch checked={applyAll} onCheckedChange={setApplyAll} aria-label="Aplicar a todas las jornadas pendientes" />
          </label>
        )}

        <CrewPicker unitId={order.unitId} dates={crewDates} value={value} onChange={setValue} excludeOrderId={order.id} />

        <AnimatePresence initial={false}>
          {(diff.added.length > 0 || diff.removed.length > 0) && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <div className="flex flex-wrap gap-x-6 gap-y-3 rounded-[18px] bg-sand/70 p-4">
                {diff.added.length > 0 && <DiffGroup label="Entran" tone="teal" people={diff.added} />}
                {diff.removed.length > 0 && <DiffGroup label="Salen" tone="red" people={diff.removed} />}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <ReasonField id="crew-reason" value={reason} onChange={setReason} suggestions={REASONS} max={TEXT_LIMITS.crewReason.max} />
      </div>
    </ModalShell>
  );
}

function DiffGroup({ label, tone, people }: { label: string; tone: "teal" | "red"; people: Worker[] }) {
  return (
    <div className="min-w-0">
      <p className={tone === "teal" ? "mb-2 text-[13px] font-semibold text-teal-fg" : "mb-2 text-[13px] font-semibold text-red-fg"}>
        {label} · {people.length}
      </p>
      <ul className="flex flex-wrap gap-2">
        {people.map((p) => (
          <li key={p.id} className="inline-flex items-center gap-2 rounded-full bg-surface py-1 pl-1 pr-3 ring-1 ring-hairline">
            <PersonAvatar initials={p.initials} hue={p.hue} size={24} name={p.name} />
            <span className="max-w-[140px] truncate text-[13px] text-ink">{p.name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Field view: change the crew of THIS jornada (the phone flow of the jornada screen). */
export function CrewFlow({ f, open, onOpenChange }: { f: FieldReady; open: boolean; onOpenChange: (v: boolean) => void }) {
  return <CrewModal open={open} onOpenChange={onOpenChange} order={f.order} jornadas={f.jornadas} jornadaId={f.jornada.id} />;
}
