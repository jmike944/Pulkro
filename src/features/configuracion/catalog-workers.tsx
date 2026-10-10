"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { subDays } from "date-fns";
import { motion } from "motion/react";
import { HardHat, Pencil, Plus, Users } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { uid } from "@/lib/store";
import { useAppStore, useCan, useCurrentUser, useLookups, useShallow } from "@/lib/hooks";
import type { Worker } from "@/lib/types";
import { PersonAvatar } from "@/components/pk/bits";
import { Segmented } from "@/components/pk/page";
import { EmptyState } from "@/components/pk/feedback";
import { rowVariants, staggerContainer } from "@/components/pk/motion";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field, FormDialog, GatedButton, InlineSwitch, useDialogTarget, ListHead, NO_CATALOGS, SearchField, SwitchLite, hueFrom, initialsOf, inputCls, norm, phoneDigits, selectTriggerCls } from "./shared";
import { useCatalogUnit } from "./use-catalog-unit";

type StatusFilter = "activos" | "inactivos" | "todos";

export function WorkersCatalog() {
  const { workers, jornadas } = useAppStore(useShallow((s) => ({ workers: s.workers, jornadas: s.jornadas })));
  const upsertWorker = useAppStore((s) => s.upsertWorker);
  const lk = useLookups();
  const unit = useCatalogUnit();
  const canEdit = useCan("catalogs.admin");
  const [status, setStatus] = useState<StatusFilter>("activos");
  const [q, setQ] = useState("");
  const dlg = useDialogTarget<Worker | "new">();

  const recent = useMemo(() => {
    const since = subDays(new Date(), 30).toISOString();
    const m = new Map<string, number>();
    jornadas.forEach((j) => {
      if (j.plannedStart < since) return;
      j.workerIds.forEach((id) => m.set(id, (m.get(id) ?? 0) + 1));
    });
    return m;
  }, [jornadas]);

  const inUnit = useMemo(() => workers.filter((w) => unit === "all" || w.unitId === unit), [workers, unit]);
  const list = useMemo(() => {
    const term = norm(q.trim());
    return inUnit
      .filter((w) => status === "todos" || (status === "activos" ? w.active : !w.active))
      .filter((w) => !term || norm(`${w.name} ${w.specialty} ${w.phone}`).includes(term))
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
  }, [inUnit, status, q]);
  const activeCount = inUnit.filter((w) => w.active).length;

  const toggle = (w: Worker, active: boolean) => {
    upsertWorker({ ...w, active });
    toast(active ? `${w.name} vuelve a estar disponible para cuadrillas` : `${w.name} ya no aparecerá al asignar cuadrillas`, {
      action: { label: "Deshacer", onClick: () => upsertWorker({ ...w, active: !active }) },
    });
  };

  return (
    <section>
      <div className="mb-5 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Segmented<StatusFilter>
            id="workers-status"
            value={status}
            onChange={setStatus}
            items={[
              { value: "activos", label: `Activos · ${activeCount}` },
              { value: "inactivos", label: `Inactivos · ${inUnit.length - activeCount}` },
              { value: "todos", label: "Todos" },
            ]}
          />
          <SearchField value={q} onChange={setQ} placeholder="Buscar por nombre o especialidad" className="sm:w-[280px]" />
        </div>
        <GatedButton allowed={canEdit} reason={NO_CATALOGS} onClick={() => dlg.show("new")} className="self-start xl:self-auto">
          <Plus className="size-4" /> Nuevo trabajador
        </GatedButton>
      </div>
      <p className="mb-5 flex items-start gap-2 text-[13px] text-subtle">
        <HardHat className="mt-0.5 size-4 shrink-0" />
        El personal de limpieza no usa la app: el supervisor registra por ellos entrada, salida, fotos e incidencias (doc §4.2).
      </p>

      {list.length === 0 ? (
        <EmptyState icon={<Users />} title="Sin personal">
          No hay trabajadores con este filtro.
        </EmptyState>
      ) : (
        <>
          <ListHead className="lg:hidden xl:grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_96px_64px_96px]">
            <span>Persona</span>
            <span>Especialidad</span>
            <span className="text-right">Jornadas 30 d</span>
            <span className="text-center">Activo</span>
            <span />
          </ListHead>
          <motion.ul variants={staggerContainer(0.025, 0.05)} initial="hidden" animate="show">
            {list.map((w) => (
              <motion.li
                key={w.id}
                variants={rowVariants}
                className={cn(
                  "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 border-b border-hairline py-3.5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_96px_64px_96px] xl:gap-x-4",
                  !w.active && "opacity-60",
                )}
              >
                <Link href={`/equipo?w=${w.id}`} className="group flex min-w-0 items-center gap-3">
                  <PersonAvatar name={w.name} initials={w.initials} hue={w.hue} size={40} />
                  <div className="min-w-0">
                    <p className="truncate text-[16px] font-semibold text-ink xl:text-[15px] group-hover:text-link">{w.name}</p>
                    <p className="truncate text-[13px] text-subtle tabular">
                      {w.phone}
                      {unit === "all" && ` · ${lk.units.get(w.unitId)?.code ?? ""}`}
                    </p>
                    <p className="truncate text-[13px] text-ink/70 xl:hidden">
                      {w.specialty} · {recent.get(w.id) ?? 0} jornadas en 30 días
                    </p>
                  </div>
                </Link>
                <span className="hidden truncate text-[14px] text-ink xl:block">{w.specialty}</span>
                <span className="hidden text-right text-[15px] font-semibold text-ink tabular xl:block">{recent.get(w.id) ?? 0}</span>
                <div className="col-start-2 row-start-1 flex items-center justify-end gap-1 xl:col-start-auto xl:row-start-auto xl:justify-center">
                  <InlineSwitch checked={w.active} onChange={(v) => toggle(w, v)} label={`${w.active ? "Desactivar" : "Activar"} a ${w.name}`} disabled={!canEdit} reason={NO_CATALOGS} />
                  <GatedButton allowed={canEdit} reason={NO_CATALOGS} variant="outline" size="icon" onClick={() => dlg.show(w)} aria-label={`Editar a ${w.name}`} className="size-11 min-w-0 border-line px-0 xl:hidden">
                    <Pencil className="size-4" />
                  </GatedButton>
                </div>
                <div className="hidden justify-end xl:flex">
                  <GatedButton allowed={canEdit} reason={NO_CATALOGS} variant="outline" onClick={() => dlg.show(w)} className="min-w-[84px] border-line">
                    Editar
                  </GatedButton>
                </div>
              </motion.li>
            ))}
          </motion.ul>
        </>
      )}

      {dlg.target && <WorkerDialog key={dlg.key} worker={dlg.target === "new" ? null : dlg.target} defaultUnit={unit === "all" ? "u_mty" : unit} open={dlg.open} onOpenChange={dlg.onOpenChange} />}
    </section>
  );
}

function WorkerDialog({ worker, defaultUnit, open, onOpenChange }: { worker: Worker | null; defaultUnit: string; open: boolean; onOpenChange: (v: boolean) => void }) {
  const me = useCurrentUser();
  const { workers, units } = useAppStore(useShallow((s) => ({ workers: s.workers, units: s.units })));
  const upsert = useAppStore((s) => s.upsertWorker);
  const isNew = !worker;
  const unitLocked = me.role !== "direccion";
  const specialties = useMemo(() => [...new Set(workers.map((w) => w.specialty))].sort((a, b) => a.localeCompare(b, "es")), [workers]);

  const [name, setName] = useState(worker?.name ?? "");
  const [specialty, setSpecialty] = useState(worker?.specialty ?? "Limpieza general");
  const [unitId, setUnitId] = useState(worker?.unitId ?? defaultUnit);
  const [phone, setPhone] = useState(worker?.phone ?? "+52 81 ");
  const [active, setActive] = useState(worker?.active ?? true);
  const [submitted, setSubmitted] = useState(false);

  const errors = {
    name: name.trim().length < 5 ? "Captura nombre y apellido." : null,
    specialty: !specialty.trim() ? "Captura la especialidad." : null,
    phone: phoneDigits(phone) < 10 ? "Teléfono de al menos 10 dígitos." : null,
  };
  const valid = !Object.values(errors).some(Boolean);
  const preview = name.trim() || "Nuevo trabajador";

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      icon={<HardHat />}
      title={isNew ? "Nuevo trabajador" : "Editar trabajador"}
      description="Personal disponible para cuadrillas variables. No necesita cuenta en la app."
      submitLabel={isNew ? "Agregar trabajador" : "Guardar cambios"}
      onSubmit={() => {
        setSubmitted(true);
        if (!valid) return;
        const clean = name.trim().replace(/\s+/g, " ");
        upsert({
          id: worker?.id ?? uid("wrk"),
          name: clean,
          initials: initialsOf(clean),
          unitId,
          specialty: specialty.trim(),
          phone: phone.trim(),
          hue: worker?.hue ?? hueFrom(clean),
          active,
        });
        toast.success(isNew ? `${clean.split(" ")[0]} se agregó al personal` : `${clean} actualizado`, { description: units.find((u) => u.id === unitId)?.name });
        onOpenChange(false);
      }}
    >
      <div className="space-y-5">
        <div className="flex items-center gap-3 rounded-[16px] bg-soft p-3">
          <PersonAvatar name={preview} initials={initialsOf(preview)} hue={worker?.hue ?? hueFrom(preview)} size={44} />
          <div className="min-w-0">
            <p className="truncate text-[16px] font-semibold text-ink xl:text-[15px]">{preview}</p>
            <p className="truncate text-[13px] text-subtle">
              {specialty || "Especialidad"} · {units.find((u) => u.id === unitId)?.name}
            </p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre completo" htmlFor="w-name" error={submitted ? errors.name : null} className="sm:col-span-2">
            <Input id="w-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Juan Hernández Ruiz" className={inputCls} aria-invalid={submitted && !!errors.name} />
          </Field>
          <Field label="Especialidad" htmlFor="w-spec" error={submitted ? errors.specialty : null}>
            <Input id="w-spec" list="pk-especialidades" value={specialty} onChange={(e) => setSpecialty(e.target.value)} className={inputCls} aria-invalid={submitted && !!errors.specialty} />
            <datalist id="pk-especialidades">
              {specialties.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </Field>
          <Field label="Teléfono" htmlFor="w-phone" error={submitted ? errors.phone : null}>
            <Input id="w-phone" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} aria-invalid={submitted && !!errors.phone} />
          </Field>
          <Field label="Unidad" hint={unitLocked ? "Administración registra personal de su unidad." : undefined} className="sm:col-span-2">
            <Select value={unitId} onValueChange={setUnitId} disabled={unitLocked}>
              <SelectTrigger className={selectTriggerCls} aria-label="Unidad">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {units.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <div className="flex items-center justify-between gap-4 rounded-[16px] border border-hairline px-4 py-3">
          <div>
            <p className="text-[14px] font-semibold text-ink">Disponible para cuadrillas</p>
            <p className="text-[12.5px] text-subtle">Si se desactiva, deja de aparecer al asignar personal.</p>
          </div>
          <SwitchLite checked={active} onChange={setActive} label="Disponible para cuadrillas" />
        </div>
      </div>
    </FormDialog>
  );
}
