"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { uid } from "@/lib/store";
import { useAppStore, useCurrentUser, useNow, useShallow } from "@/lib/hooks";
import { firstName, plural } from "@/lib/format";
import type { Worker } from "@/lib/types";
import { PersonAvatar } from "@/components/pk/bits";
import { ModalCancel, ModalShell, firstMissing } from "@/components/pk/modal-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { dayKey } from "@/features/agenda/agenda-model";
import { ConfirmCheck } from "@/features/agenda/form-bits";
import { Field, SwitchLite, inputCls, selectTriggerCls } from "@/features/configuracion/shared";
import { hueFromName, initialsOf } from "./use-team";

/**
 * THE worker editor. One record, one set of rules, mounted from Equipo (Nuevo, and Editar inside the profile sheet) and
 * from Configuración › Catálogos › Personal. The rule it carries: deactivating a worker (or moving them to another unit)
 * while they still have open jornadas needs an explicit confirmation, because they stay booked on those jornadas.
 */

export const WORKER_NOTE = "El personal no usa la app: el supervisor lo asigna a las cuadrillas.";

const DEFAULT_SPECIALTIES = [
  "Limpieza general",
  "Pulido de pisos",
  "Trabajo en altura",
  "Desengrase industrial",
  "Sanitización",
  "Lavado de alfombras",
  "Operador de máquina",
  "Jefe de cuadrilla",
];
const OTHER = "__otra";

/** Open jornadas per worker: not closed and dated today or later. Used by the editor and by the catalog's inline switch. */
export function useOpenJornadas() {
  const jornadas = useAppStore((s) => s.jornadas);
  const todayK = dayKey(useNow(60_000));
  return useMemo(() => {
    const open = new Map<string, number>();
    jornadas.forEach((j) => {
      if (j.status === "cerrada" || j.date < todayK) return;
      j.workerIds.forEach((id) => open.set(id, (open.get(id) ?? 0) + 1));
    });
    return open;
  }, [jornadas, todayK]);
}

type Fields = { name: string; phone: string; specialty: string; other: boolean; unitId: string; active: boolean; confirmed: boolean };
type FieldKey = "name" | "phone" | "specialty";

const seed = (w: Worker | undefined, unitId: string): Fields => ({
  name: w?.name ?? "",
  phone: w?.phone ?? "+52 81 ",
  specialty: w?.specialty ?? "Limpieza general",
  other: false,
  unitId: w?.unitId ?? unitId,
  active: w?.active ?? true,
  confirmed: false,
});

/**
 * Form state + the Equipo rules for one worker (`null` = a new one). Callers that mount it fresh per opening get a clean
 * form; the profile sheet keeps one alive and calls `reset()` when it enters edit mode.
 */
export function useWorkerDraft(workerId: string | null, defaultUnitId?: string) {
  const { workers, units } = useAppStore(useShallow((s) => ({ workers: s.workers, units: s.units })));
  const upsertWorker = useAppStore((s) => s.upsertWorker);
  const user = useCurrentUser();
  const openJornadas = useOpenJornadas();

  const existing = workerId ? workers.find((w) => w.id === workerId) : undefined;
  const allowedUnits = user.role === "direccion" ? units : units.filter((u) => u.id === user.unitId);
  const startUnit = allowedUnits.find((u) => u.id === defaultUnitId)?.id ?? allowedUnits[0]?.id ?? user.unitId;

  const [base, setBase] = useState<Fields>(() => seed(existing, startUnit));
  const [f, setF] = useState<Fields>(base);
  const [touched, setTouched] = useState<Partial<Record<FieldKey, boolean>>>({});
  const set = (patch: Partial<Fields>) => setF((s) => ({ ...s, ...patch }));

  const specialties = useMemo(() => Array.from(new Set([...DEFAULT_SPECIALTIES, ...workers.map((w) => w.specialty)])).sort((a, b) => a.localeCompare(b, "es")), [workers]);

  const cleanName = f.name.trim().replace(/\s+/g, " ");
  const upcoming = existing ? (openJornadas.get(existing.id) ?? 0) : 0;
  const deactivating = !!existing?.active && !f.active && upcoming > 0;
  const movingUnit = !!existing && existing.unitId !== f.unitId && upcoming > 0;
  const needsConfirm = deactivating || movingUnit;

  const errors = {
    name: cleanName.split(" ").length < 2 || cleanName.length < 5 ? "Escriba nombre y apellido, por ejemplo Juan Hernández." : null,
    phone: f.phone.replace(/\D/g, "").length < 10 ? "Escriba al menos 10 dígitos, con lada." : null,
    specialty: !f.specialty.trim() ? "Elija una especialidad o escriba una nueva." : null,
  };
  const changed =
    !existing || existing.name !== cleanName || existing.phone !== f.phone.trim() || existing.specialty !== f.specialty.trim() || existing.unitId !== f.unitId || existing.active !== f.active;
  const dirty =
    f.name.trim() !== base.name.trim() || f.phone.trim() !== base.phone.trim() || f.specialty.trim() !== base.specialty.trim() || f.unitId !== base.unitId || f.active !== base.active;
  const valid = !errors.name && !errors.phone && !errors.specialty && (!needsConfirm || f.confirmed) && changed;
  const hint = firstMissing(
    [errors.name, "Escriba nombre y apellido"],
    [errors.phone, "Escriba un teléfono de al menos 10 dígitos"],
    [errors.specialty, "Elija o escriba la especialidad"],
    [needsConfirm && !f.confirmed, "Marque la casilla de confirmación"],
    [!!existing && !changed, "Aún no hay cambios que guardar"],
  );

  const save = () => {
    if (!valid) return null;
    const worker: Worker = {
      id: existing?.id ?? uid("wrk"),
      name: cleanName,
      initials: initialsOf(cleanName),
      unitId: f.unitId,
      specialty: f.specialty.trim(),
      phone: f.phone.trim(),
      hue: existing?.hue ?? hueFromName(cleanName),
      active: f.active,
    };
    upsertWorker(worker);
    toast.success(existing ? "Cambios guardados" : "Trabajador agregado", {
      description: `${worker.name} · ${worker.specialty}${worker.active ? "" : " · inactivo"}`,
    });
    return { worker, created: !existing };
  };

  const reset = () => {
    const fresh = seed(existing, startUnit);
    setBase(fresh);
    setF(fresh);
    setTouched({});
  };

  const preview = cleanName || "Nuevo trabajador";
  return {
    existing,
    f,
    set,
    touch: (k: FieldKey) => setTouched((t) => (t[k] ? t : { ...t, [k]: true })),
    shown: (k: FieldKey) => (touched[k] ? errors[k] : null),
    units,
    allowedUnits,
    specialties,
    upcoming,
    deactivating,
    needsConfirm,
    preview,
    hue: existing?.hue ?? hueFromName(preview),
    changed,
    dirty,
    valid,
    hint,
    save,
    reset,
  };
}

export type WorkerDraft = ReturnType<typeof useWorkerDraft>;

/** Live avatar for the modal header: the initials follow the name being typed. */
export function WorkerAvatarPreview({ draft, size = 56 }: { draft: WorkerDraft; size?: number }) {
  const initials = initialsOf(draft.preview) || "+";
  return (
    <motion.span key={initials} className="inline-flex" initial={{ scale: 0.85, opacity: 0.6 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 420, damping: 24 }}>
      <PersonAvatar name={draft.preview} initials={initials} hue={draft.hue} size={size} />
    </motion.span>
  );
}

/** The fields. Render inside a modal body; pair with `draft.hint` / `draft.valid` in the footer. */
export function WorkerFields({ draft, className }: { draft: WorkerDraft; className?: string }) {
  const id = useId();
  const { f, set, touch, shown, specialties, allowedUnits, units, existing, upcoming, deactivating } = draft;
  const showOther = f.other || !specialties.includes(f.specialty);
  const first = firstName(draft.preview);
  const fromUnit = existing ? units.find((u) => u.id === existing.unitId)?.name : undefined;
  const toUnit = units.find((u) => u.id === f.unitId)?.name;

  return (
    <div className={cn("space-y-4 pt-2", className)}>
      <Field label="Nombre completo" htmlFor={`${id}-name`} error={shown("name")}>
        <Input
          id={`${id}-name`}
          value={f.name}
          onChange={(e) => set({ name: e.target.value })}
          onBlur={() => touch("name")}
          autoComplete="off"
          placeholder="Nombre y apellidos"
          className={inputCls}
          aria-invalid={!!shown("name") || undefined}
        />
      </Field>
      <Field label="Teléfono" htmlFor={`${id}-phone`} error={shown("phone")}>
        <Input
          id={`${id}-phone`}
          type="tel"
          inputMode="tel"
          autoComplete="off"
          value={f.phone}
          onChange={(e) => set({ phone: e.target.value })}
          onBlur={() => touch("phone")}
          className={cn(inputCls, "tabular")}
          aria-invalid={!!shown("phone") || undefined}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Especialidad" htmlFor={`${id}-spec`}>
          <Select
            value={f.other ? OTHER : specialties.includes(f.specialty) ? f.specialty : OTHER}
            onValueChange={(v) => (v === OTHER ? set({ other: true, specialty: "" }) : set({ other: false, specialty: v }))}
          >
            <SelectTrigger id={`${id}-spec`} className={selectTriggerCls}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              {specialties.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
              <SelectItem value={OTHER}>Otra…</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Unidad" htmlFor={`${id}-unit`} hint={allowedUnits.length < 2 ? "Administración registra personal de su unidad." : undefined}>
          <Select value={f.unitId} onValueChange={(v) => set({ unitId: v, confirmed: false })} disabled={allowedUnits.length < 2}>
            <SelectTrigger id={`${id}-unit`} className={selectTriggerCls}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              {allowedUnits.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      <AnimatePresence initial={false}>
        {showOther && (
          <motion.div key="other" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="-mx-1 overflow-hidden px-1 pb-1">
            <Field label="Nueva especialidad" htmlFor={`${id}-spec-new`} error={shown("specialty")}>
              <Input
                id={`${id}-spec-new`}
                value={f.specialty}
                onChange={(e) => set({ specialty: e.target.value })}
                onBlur={() => touch("specialty")}
                placeholder="Ej. Limpieza de ductos"
                className={inputCls}
                aria-invalid={!!shown("specialty") || undefined}
              />
            </Field>
          </motion.div>
        )}
      </AnimatePresence>

      <label className="flex min-h-14 cursor-pointer items-center justify-between gap-4 rounded-[16px] border border-hairline px-4 py-3">
        <span className="min-w-0">
          <span className="block text-[14px] font-semibold text-ink">Activo</span>
          <span className="block text-[12.5px] text-subtle">Disponible para asignarse a cuadrillas.</span>
        </span>
        <SwitchLite checked={f.active} onChange={(v) => set({ active: v, confirmed: false })} label="Activo" />
      </label>

      <AnimatePresence initial={false}>
        {draft.needsConfirm && (
          <motion.div key="confirm" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="-mx-1 space-y-3 overflow-hidden px-1 pb-1">
            <div role="note" className="flex gap-3 rounded-[16px] bg-amber-soft p-4 text-[13.5px] leading-snug text-amber-deep">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-fg" aria-hidden />
              <span>
                {deactivating ? (
                  <>
                    {first} tiene <b className="font-semibold">{plural(upcoming, "jornada abierta", "jornadas abiertas")}</b>. Si se desactiva, no aparecerá al asignar nuevas cuadrillas; revise esas
                    jornadas en la agenda.
                  </>
                ) : (
                  <>
                    {first} tiene <b className="font-semibold">{plural(upcoming, "jornada abierta", "jornadas abiertas")}</b>. Al pasar a {toUnit}, ya no aparecerá al asignar cuadrillas en {fromUnit};
                    revise esas jornadas en la agenda.
                  </>
                )}
              </span>
            </div>
            <ConfirmCheck id={`${id}-ok`} checked={f.confirmed} onChange={(v) => set({ confirmed: v })}>
              {deactivating ? (
                <>
                  Entiendo que {first} <b className="font-semibold">dejará de aparecer</b> al asignar cuadrillas.
                </>
              ) : (
                <>
                  Entiendo que {first} <b className="font-semibold">cambiará de unidad</b> con jornadas abiertas.
                </>
              )}
            </ConfirmCheck>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Scrolls the modal body back to the top when the editor replaces another view in the same modal (profile → edit). */
export function ScrollToTopOnMount({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ block: "start" });
  }, []);
  return (
    <motion.div ref={ref} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.18 }}>
      {children}
    </motion.div>
  );
}

export const saveLabel = (existing: Worker | undefined) => (existing ? "Guardar cambios" : "Agregar trabajador");

/**
 * Standalone editor: centered dialog on desktop, bottom sheet on phones. Mount it with a fresh `key` per opening
 * (`useDialogTarget`) so every opening starts from a clean form.
 */
export function WorkerEditor({
  workerId,
  defaultUnitId,
  open,
  onOpenChange,
  onSaved,
}: {
  /** the worker to edit, or `null` for a new one */
  workerId: string | null;
  /** unit preselected for a new worker (when the role may pick it) */
  defaultUnitId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (workerId: string, created: boolean) => void;
}) {
  const draft = useWorkerDraft(workerId, defaultUnitId);
  const submit = () => {
    const saved = draft.save();
    if (!saved) return;
    onOpenChange(false);
    onSaved?.(saved.worker.id, saved.created);
  };
  return (
    <ModalShell
      open={open}
      onOpenChange={onOpenChange}
      title={draft.existing ? "Editar trabajador" : "Nuevo trabajador"}
      description={WORKER_NOTE}
      icon={<WorkerAvatarPreview draft={draft} />}
      dirty={draft.dirty}
      onSubmit={submit}
      footerHint={draft.hint}
      footer={
        <>
          <ModalCancel />
          <Button type="submit" disabled={!draft.valid} className="h-11 rounded-[12px] px-5 text-[14px] font-semibold">
            {saveLabel(draft.existing)}
          </Button>
        </>
      }
    >
      <WorkerFields draft={draft} />
    </ModalShell>
  );
}
