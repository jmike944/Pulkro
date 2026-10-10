"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { uid } from "@/lib/store";
import { useAppStore, useCurrentUser, useNow } from "@/lib/hooks";
import { plural } from "@/lib/format";
import type { Worker } from "@/lib/types";
import { PersonAvatar } from "@/components/pk/bits";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { dayKey } from "@/features/agenda/agenda-model";
import { ConfirmCheck, FieldError, FieldLabel } from "@/features/agenda/form-bits";
import { hueFromName, initialsOf } from "./use-team";

export type EditorState = { workerId: string | null; open: boolean } | null;

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

/** Add / edit a worker of the catalog (only can("catalogs.admin")). */
export function WorkerDialog({
  state,
  onOpenChange,
  onSaved,
}: {
  state: EditorState;
  onOpenChange: (open: boolean) => void;
  onSaved: (workerId: string, created: boolean) => void;
}) {
  return (
    <Dialog open={!!state?.open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92dvh] flex-col gap-0 overflow-hidden rounded-[24px] p-0 sm:max-w-[520px]">
        {state ? (
          <WorkerForm key={state.workerId ?? "nuevo"} workerId={state.workerId} onClose={() => onOpenChange(false)} onSaved={onSaved} />
        ) : (
          <DialogTitle className="sr-only">Trabajador</DialogTitle>
        )}
      </DialogContent>
    </Dialog>
  );
}

function WorkerForm({ workerId, onClose, onSaved }: { workerId: string | null; onClose: () => void; onSaved: (id: string, created: boolean) => void }) {
  const workers = useAppStore((s) => s.workers);
  const units = useAppStore((s) => s.units);
  const jornadas = useAppStore((s) => s.jornadas);
  const upsertWorker = useAppStore((s) => s.upsertWorker);
  const user = useCurrentUser();
  const now = useNow(60_000);
  const existing = workerId ? workers.find((w) => w.id === workerId) : undefined;
  const allowedUnits = user.role === "direccion" ? units : units.filter((u) => u.id === user.unitId);

  const specialties = useMemo(
    () => Array.from(new Set([...DEFAULT_SPECIALTIES, ...workers.map((w) => w.specialty)])).sort((a, b) => a.localeCompare(b)),
    [workers],
  );

  const [name, setName] = useState(existing?.name ?? "");
  const [phone, setPhone] = useState(existing?.phone ?? "+52 81 ");
  const [specialty, setSpecialty] = useState(existing?.specialty ?? "Limpieza general");
  const [custom, setCustom] = useState(false);
  const [unitId, setUnitId] = useState(existing?.unitId ?? allowedUnits[0]?.id ?? user.unitId);
  const [active, setActive] = useState(existing?.active ?? true);
  const [ok, setOk] = useState(false);
  const [touched, setTouched] = useState(false);

  const todayK = dayKey(now);
  const upcoming = existing ? jornadas.filter((j) => j.workerIds.includes(existing.id) && j.status !== "cerrada" && j.date >= todayK).length : 0;
  const cleanName = name.trim().replace(/\s+/g, " ");
  const deactivating = !!existing?.active && !active && upcoming > 0;
  const movingUnit = !!existing && existing.unitId !== unitId && upcoming > 0;
  const needsConfirm = deactivating || movingUnit;

  const errors = {
    name: cleanName.split(" ").length < 2 || cleanName.length < 5 ? "Escribe nombre y apellido." : null,
    phone: phone.replace(/\D/g, "").length < 10 ? "El teléfono debe tener al menos 10 dígitos." : null,
    specialty: !specialty.trim() ? "Indica la especialidad." : null,
  };
  const changed =
    !existing ||
    existing.name !== cleanName ||
    existing.phone !== phone.trim() ||
    existing.specialty !== specialty.trim() ||
    existing.unitId !== unitId ||
    existing.active !== active;
  const valid = !errors.name && !errors.phone && !errors.specialty && (!needsConfirm || ok) && changed;

  const save = () => {
    setTouched(true);
    if (!valid) return;
    const worker: Worker = {
      id: existing?.id ?? uid("wrk"),
      name: cleanName,
      initials: initialsOf(cleanName),
      unitId,
      specialty: specialty.trim(),
      phone: phone.trim(),
      hue: existing?.hue ?? hueFromName(cleanName),
      active,
    };
    upsertWorker(worker);
    toast.success(existing ? "Datos actualizados" : "Trabajador agregado", {
      description: `${worker.name} · ${worker.specialty}${worker.active ? "" : " · inactivo"}`,
    });
    onSaved(worker.id, !existing);
  };

  const preview = cleanName || "Nuevo trabajador";

  return (
    <>
      <DialogHeader className="border-b border-hairline p-5 pr-12 sm:p-6 sm:pr-14">
        <div className="flex items-center gap-4">
          <motion.span key={initialsOf(preview)} initial={{ scale: 0.85, opacity: 0.6 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 420, damping: 24 }}>
            <PersonAvatar name={preview} initials={initialsOf(preview) || "+"} hue={existing?.hue ?? hueFromName(preview)} size={48} />
          </motion.span>
          <div className="min-w-0">
            <DialogTitle className="font-serif text-[24px] font-medium leading-tight">{existing ? "Editar trabajador" : "Nuevo trabajador"}</DialogTitle>
            <DialogDescription className="text-[13.5px]">Catálogo de personal · no usa la app; se asigna a cuadrillas.</DialogDescription>
          </div>
        </div>
      </DialogHeader>

      <form
        className="flex min-h-0 flex-1 flex-col"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div className="flex-1 space-y-4 overflow-y-auto p-5 sm:p-6">
          <div>
            <FieldLabel htmlFor="wk-name">Nombre completo</FieldLabel>
            <Input id="wk-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" placeholder="Nombre y apellidos" className="h-11 rounded-[12px] text-[15px]" aria-invalid={(touched && !!errors.name) || undefined} />
            <FieldError>{touched ? errors.name : null}</FieldError>
          </div>
          <div>
            <FieldLabel htmlFor="wk-phone">Teléfono</FieldLabel>
            <Input id="wk-phone" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="h-11 rounded-[12px] text-[15px] tabular" aria-invalid={(touched && !!errors.phone) || undefined} />
            <FieldError>{touched ? errors.phone : null}</FieldError>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <FieldLabel htmlFor="wk-spec">Especialidad</FieldLabel>
              <Select
                value={custom ? OTHER : specialties.includes(specialty) ? specialty : OTHER}
                onValueChange={(v) => {
                  if (v === OTHER) {
                    setCustom(true);
                    setSpecialty("");
                  } else {
                    setCustom(false);
                    setSpecialty(v);
                  }
                }}
              >
                <SelectTrigger id="wk-spec" className="h-11 w-full rounded-[12px] px-3 text-[15px] data-[size=default]:h-11">
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
            </div>
            <div>
              <FieldLabel htmlFor="wk-unit">Unidad</FieldLabel>
              <Select value={unitId} onValueChange={setUnitId} disabled={allowedUnits.length < 2}>
                <SelectTrigger id="wk-unit" className="h-11 w-full rounded-[12px] px-3 text-[15px] data-[size=default]:h-11">
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
              {allowedUnits.length < 2 && <p className="mt-1.5 text-[12px] text-subtle">Administración registra personal de su unidad.</p>}
            </div>
          </div>
          <AnimatePresence initial={false}>
            {(custom || !specialties.includes(specialty)) && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                <FieldLabel htmlFor="wk-spec-custom">Nueva especialidad</FieldLabel>
                <Input id="wk-spec-custom" value={specialty} onChange={(e) => setSpecialty(e.target.value)} placeholder="Ej. Limpieza de ductos" className="h-11 rounded-[12px] text-[15px]" />
                <FieldError>{touched ? errors.specialty : null}</FieldError>
              </motion.div>
            )}
          </AnimatePresence>

          <label className="flex min-h-14 items-center justify-between gap-4 rounded-[16px] border border-hairline p-4">
            <span className="text-[14px]">
              <span className="block font-semibold text-ink">Activo</span>
              <span className="text-subtle">Disponible para asignarse a cuadrillas.</span>
            </span>
            <Switch checked={active} onCheckedChange={setActive} aria-label="Activo" />
          </label>

          <AnimatePresence initial={false}>
            {needsConfirm && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="space-y-3 overflow-hidden">
                <div className="flex gap-3 rounded-[16px] bg-[#fff6e6] p-4 text-[13px] leading-snug text-[#6b4200]">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0 text-[#b86e00]" />
                  <span>
                    Tiene <b className="font-semibold">{plural(upcoming, "jornada abierta", "jornadas abiertas")}</b>. {deactivating ? "Al desactivarlo no aparecerá" : "En otra unidad no aparecerá"} al
                    asignar nuevas cuadrillas; revisa esas jornadas en la agenda.
                  </span>
                </div>
                <ConfirmCheck id="wk-ok" checked={ok} onChange={setOk}>
                  Entiendo y quiero guardar el cambio.
                </ConfirmCheck>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="flex justify-end gap-2 border-t border-hairline bg-[#fafbfc] p-4">
          <Button type="button" variant="outline" onClick={onClose} className="h-11 rounded-[12px] px-5">
            Cancelar
          </Button>
          <Button type="submit" disabled={(touched && !valid) || (!!existing && !changed)} className="h-11 rounded-[12px] px-5 font-semibold">
            {existing ? "Guardar cambios" : "Agregar trabajador"}
          </Button>
        </div>
      </form>
    </>
  );
}
