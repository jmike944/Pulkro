"use client";

import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { FlaskConical, Package, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { uid } from "@/lib/store";
import { useAppStore, useCan, useScopedData } from "@/lib/hooks";
import { plural } from "@/lib/format";
import type { Material } from "@/lib/types";
import { EmptyState } from "@/components/pk/feedback";
import { rowVariants, staggerContainer } from "@/components/pk/motion";
import { Input } from "@/components/ui/input";
import { ChipSelect, Field, FormDialog, GatedButton, ListHead, NO_CATALOGS, SearchField, inputCls, norm, useDialogTarget } from "./shared";

const UNITS = ["L", "kg", "pza", "caja", "galón", "rollo", "m²"] as const;
const UNIT_LABEL: Record<string, string> = { L: "Litros", kg: "Kilogramos", pza: "Piezas", caja: "Cajas", galón: "Galones", rollo: "Rollos", "m²": "Metros cuadrados" };

export function MaterialsCatalog() {
  const materials = useAppStore((s) => s.materials);
  const { orders } = useScopedData();
  const canEdit = useCan("catalogs.admin");
  const [q, setQ] = useState("");
  const dlg = useDialogTarget<Material | "new">();

  const usage = useMemo(() => {
    const m = new Map<string, number>();
    orders.forEach((o) => o.materials.forEach((x) => m.set(x.materialId, (m.get(x.materialId) ?? 0) + 1)));
    return m;
  }, [orders]);

  const list = useMemo(() => {
    const term = norm(q.trim());
    return materials.filter((m) => !term || norm(m.name).includes(term)).sort((a, b) => a.name.localeCompare(b.name, "es"));
  }, [materials, q]);

  return (
    <section>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchField value={q} onChange={setQ} placeholder="Buscar material o producto" className="sm:w-[300px]" />
        <GatedButton allowed={canEdit} reason={NO_CATALOGS} onClick={() => dlg.show("new")} className="self-start sm:self-auto">
          <Plus className="size-4" /> Nuevo material
        </GatedButton>
      </div>
      <p className="mb-5 text-[13px] text-subtle">
        Se usan como recursos de la orden. El consumo real por orden aún no se captura (doc §5 · advertencia de alcance).
      </p>

      {list.length === 0 ? (
        <EmptyState icon={<Package />} title="Sin materiales">
          Ningún material coincide con la búsqueda.
        </EmptyState>
      ) : (
        <>
          <ListHead className="grid-cols-[minmax(0,1fr)_140px_120px_96px]">
            <span>Material o producto</span>
            <span>Unidad</span>
            <span className="text-right">Órdenes</span>
            <span />
          </ListHead>
          <motion.ul variants={staggerContainer(0.03, 0.05)} initial="hidden" animate="show">
            {list.map((m) => (
              <motion.li
                key={m.id}
                variants={rowVariants}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 border-b border-hairline py-3.5 lg:grid-cols-[minmax(0,1fr)_140px_120px_96px] lg:gap-x-4"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-[#e6f5fd] text-[#1b8fc0]">
                    <FlaskConical className="size-[18px]" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[16px] font-semibold text-ink lg:text-[15px]">{m.name}</p>
                    <p className="text-[13px] text-subtle lg:hidden">
                      {UNIT_LABEL[m.unit] ?? m.unit} · {plural(usage.get(m.id) ?? 0, "orden", "órdenes")}
                    </p>
                  </div>
                </div>
                <span className="hidden text-[14px] text-ink lg:block">
                  <span className="mr-2 inline-flex h-[22px] min-w-9 items-center justify-center rounded-md bg-[#f2f4f7] px-1.5 text-[12px] font-semibold">{m.unit}</span>
                  <span className="text-subtle">{UNIT_LABEL[m.unit] ?? ""}</span>
                </span>
                <span className="hidden text-right text-[15px] font-semibold text-ink tabular lg:block">{usage.get(m.id) ?? 0}</span>
                <div className="flex justify-end">
                  <GatedButton allowed={canEdit} reason={NO_CATALOGS} variant="outline" onClick={() => dlg.show(m)} className="w-11 border-[#dfe3ea] px-0 lg:w-auto lg:min-w-[84px] lg:px-4" aria-label={`Editar ${m.name}`}>
                    <Pencil className="size-4 lg:hidden" />
                    <span className="max-lg:sr-only">Editar</span>
                  </GatedButton>
                </div>
              </motion.li>
            ))}
          </motion.ul>
        </>
      )}

      {dlg.target && <MaterialDialog key={dlg.key} material={dlg.target === "new" ? null : dlg.target} open={dlg.open} onOpenChange={dlg.onOpenChange} />}
    </section>
  );
}

function MaterialDialog({ material, open, onOpenChange }: { material: Material | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const upsert = useAppStore((s) => s.upsertMaterial);
  const materials = useAppStore((s) => s.materials);
  const isNew = !material;
  const [name, setName] = useState(material?.name ?? "");
  const initialUnit = material?.unit ?? "L";
  const preset = (UNITS as readonly string[]).includes(initialUnit);
  const [unit, setUnit] = useState<string>(preset ? initialUnit : "otra");
  const [custom, setCustom] = useState(preset ? "" : initialUnit);
  const [submitted, setSubmitted] = useState(false);

  const dup = materials.some((m) => m.id !== material?.id && norm(m.name) === norm(name.trim()));
  const finalUnit = unit === "otra" ? custom.trim() : unit;
  const errors = {
    name: name.trim().length < 3 ? "Captura el nombre del material." : dup ? "Ese material ya está en el catálogo." : null,
    unit: !finalUnit ? "Captura la unidad de medida." : null,
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      icon={<FlaskConical />}
      title={isNew ? "Nuevo material" : "Editar material"}
      description="Materiales y productos que se asignan como recursos de una orden."
      submitLabel={isNew ? "Agregar material" : "Guardar cambios"}
      onSubmit={() => {
        setSubmitted(true);
        if (errors.name || errors.unit) return;
        upsert({ id: material?.id ?? uid("mat"), name: name.trim(), unit: finalUnit });
        toast.success(isNew ? `${name.trim()} agregado al catálogo` : `${name.trim()} actualizado`);
        onOpenChange(false);
      }}
    >
      <div className="space-y-5">
        <Field label="Nombre" htmlFor="m-name" error={submitted ? errors.name : null}>
          <Input id="m-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Desengrasante industrial" className={inputCls} aria-invalid={submitted && !!errors.name} />
        </Field>
        <Field label="Unidad de medida" error={submitted ? errors.unit : null}>
          <ChipSelect
            ariaLabel="Unidad de medida"
            value={unit}
            onChange={setUnit}
            options={[...UNITS.map((u) => ({ value: u as string, label: u })), { value: "otra", label: "Otra…" }]}
          />
          {unit === "otra" && (
            <Input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Ej. bulto" aria-label="Otra unidad" className={`${inputCls} mt-2`} autoFocus />
          )}
        </Field>
      </div>
    </FormDialog>
  );
}
