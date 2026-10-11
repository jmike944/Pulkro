"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { subDays } from "date-fns";
import { motion } from "motion/react";
import { HardHat, Pencil, Plus, UserMinus, Users } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAppStore, useCan, useLookups, useShallow } from "@/lib/hooks";
import { firstName } from "@/lib/format";
import type { Worker } from "@/lib/types";
import { PersonAvatar } from "@/components/pk/bits";
import { Segmented } from "@/components/pk/page";
import { EmptyState } from "@/components/pk/feedback";
import { rowVariants, staggerContainer } from "@/components/pk/motion";
import { WorkerEditor, useOpenJornadas } from "@/features/equipo/worker-editor";
import { ConfirmDialog, GatedButton, InlineSwitch, useDialogTarget, ListHead, NO_CATALOGS, SearchField, norm } from "./shared";
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
  const openJornadas = useOpenJornadas();
  const [deactivating, setDeactivating] = useState<Worker | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

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

  const apply = (w: Worker, active: boolean) => {
    upsertWorker({ ...w, active });
    toast(active ? `${w.name} vuelve a estar disponible para cuadrillas` : `${w.name} ya no aparecerá al asignar cuadrillas`, {
      action: { label: "Deshacer", onClick: () => upsertWorker({ ...w, active: !active }) },
    });
  };
  // Same rule as the editor: someone with open jornadas stays booked on them, so deactivating asks first.
  const toggle = (w: Worker, active: boolean) => {
    if (!active && (openJornadas.get(w.id) ?? 0) > 0) {
      setDeactivating(w);
      setConfirmOpen(true);
      return;
    }
    apply(w, active);
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
        El personal de limpieza no usa la app: el supervisor registra por ellos entrada, salida, fotos e incidencias.
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

      {dlg.target && (
        <WorkerEditor
          key={dlg.key}
          workerId={dlg.target === "new" ? null : dlg.target.id}
          defaultUnitId={unit === "all" ? undefined : unit}
          open={dlg.open}
          onOpenChange={dlg.onOpenChange}
        />
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        icon={<UserMinus />}
        iconTone="red"
        title="Desactivar trabajador"
        description="Deja de aparecer al asignar cuadrillas. Su historial y sus jornadas ya asignadas se conservan."
        rows={
          deactivating
            ? [
                { k: "Persona", v: deactivating.name },
                { k: "Especialidad", v: deactivating.specialty },
                { k: "Unidad", v: lk.units.get(deactivating.unitId)?.name ?? "—" },
                { k: "Jornadas abiertas", v: openJornadas.get(deactivating.id) ?? 0 },
              ]
            : []
        }
        checkboxLabel={`Entiendo que ${deactivating ? firstName(deactivating.name) : "la persona"} dejará de aparecer al asignar cuadrillas.`}
        confirmLabel="Desactivar trabajador"
        destructive
        onConfirm={() => deactivating && apply(deactivating, false)}
      >
        <p className="rounded-[14px] bg-amber-soft px-4 py-3 text-[13.5px] leading-snug text-amber-ink">
          Revise esas jornadas en la agenda: la persona sigue asignada hasta que se cambie la cuadrilla.
        </p>
      </ConfirmDialog>
    </section>
  );
}
