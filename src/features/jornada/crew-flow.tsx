"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { useAppStore, useLookups } from "@/lib/hooks";
import type { Worker } from "@/lib/types";
import { CrewPicker } from "@/components/pk/crew-picker";
import { PersonAvatar } from "@/components/pk/bits";
import { BigButton, FieldCaption, FlowHeading, FlowScreen } from "@/components/pk/mobile";
import { Textarea } from "@/components/ui/textarea";
import { Chip, fmtShortDay } from "./field-bits";
import { FlowEyebrow } from "./flow-bits";
import type { FieldReady } from "./use-field-state";

const REASONS = ["Ausencia de personal", "Refuerzo por carga de trabajo", "Rotación de turno", "Especialidad requerida en sitio"];

/** Variable crew for THIS jornada (doc §4.1, §8: historial de cambios de personal por fecha, con motivo). */
export function CrewFlow({ f, open, onOpenChange }: { f: FieldReady; open: boolean; onOpenChange: (v: boolean) => void }) {
  const assignCrew = useAppStore((s) => s.assignCrew);
  const { workers } = useLookups();
  const [ids, setIds] = useState<string[]>(f.jornada.workerIds);
  const [reason, setReason] = useState("");

  const diff = useMemo(() => {
    const before = new Set(f.jornada.workerIds);
    const after = new Set(ids);
    const pick = (xs: string[]) => xs.map((id) => workers.get(id)).filter((w): w is Worker => !!w);
    return { added: pick(ids.filter((id) => !before.has(id))), removed: pick(f.jornada.workerIds.filter((id) => !after.has(id))) };
  }, [ids, f.jornada.workerIds, workers]);

  const changed = diff.added.length > 0 || diff.removed.length > 0;
  const valid = changed && ids.length > 0 && reason.trim().length >= 6;

  const save = () => {
    if (!ids.length) return void toast.error("La cuadrilla necesita al menos una persona");
    if (reason.trim().length < 6) return void toast.error("Escribe el motivo del cambio");
    assignCrew(f.order.id, ids, reason.trim(), f.jornada.id);
    toast.success("Cuadrilla actualizada", {
      description: `${ids.length} personas en la Jornada ${f.jornada.dayIndex}${diff.added.length ? ` · +${diff.added.length}` : ""}${diff.removed.length ? ` · −${diff.removed.length}` : ""}`,
    });
    onOpenChange(false);
  };

  return (
    <FlowScreen
      open={open}
      onOpenChange={onOpenChange}
      title="Cuadrilla"
      description={`Cambiar cuadrilla de la Jornada ${f.jornada.dayIndex}`}
      className="md:w-[min(540px,calc(100vw-32px))]"
      footer={
        <BigButton onClick={save} disabled={!valid}>
          Guardar cuadrilla
        </BigButton>
      }
    >
      <FlowHeading eyebrow={<FlowEyebrow f={f} />} title="Cambiar cuadrilla">
        Aplica solo a la jornada del {fmtShortDay(f.jornada.plannedStart)} y queda en el historial de la orden con el motivo.
      </FlowHeading>

      <CrewPicker
        unitId={f.order.unitId}
        dates={[f.jornada.date]}
        value={ids}
        onChange={setIds}
        excludeOrderId={f.order.id}
        className="h-[320px]"
      />

      <AnimatePresence initial={false}>
        {changed && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-3 rounded-[18px] bg-sand/70 p-4">
              {diff.added.length > 0 && <DiffGroup label="Entran" tone="teal" people={diff.added} />}
              {diff.removed.length > 0 && <DiffGroup label="Salen" tone="red" people={diff.removed} />}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-6">
        <FieldCaption>
          <label htmlFor="crew-reason">Motivo del cambio · obligatorio</label>
        </FieldCaption>
        <Textarea
          id="crew-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Ej. Ausencia de Juan; se integra Rosa como refuerzo"
          className="min-h-[80px] rounded-[14px] border-[#e2e0da] bg-[#faf9f6] text-[16px]"
        />
        <div className="scrollbar-none -mx-1 mt-2.5 flex gap-2 overflow-x-auto px-1 pb-0.5">
          {REASONS.map((r) => (
            <Chip key={r} active={reason === r} onClick={() => setReason(r)}>
              {r}
            </Chip>
          ))}
        </div>
      </div>
    </FlowScreen>
  );
}

function DiffGroup({ label, tone, people }: { label: string; tone: "teal" | "red"; people: Worker[] }) {
  return (
    <div className="min-w-0">
      <p className={tone === "teal" ? "mb-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-st-teal" : "mb-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-st-red"}>
        {label} · {people.length}
      </p>
      <ul className="flex flex-wrap gap-2">
        {people.map((p) => (
          <li key={p.id} className="inline-flex items-center gap-2 rounded-full bg-white py-1 pl-1 pr-3 ring-1 ring-hairline">
            <PersonAvatar initials={p.initials} hue={p.hue} size={24} name={p.name} />
            <span className="max-w-[140px] truncate text-[13px] text-ink">{p.name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
