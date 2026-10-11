"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Info, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/lib/store";
import type { Order } from "@/lib/types";
import { Segmented } from "@/components/pk/page";
import { ModalCancel } from "@/components/pk/modal-shell";
import { Button } from "@/components/ui/button";
import { useOpenSession } from "@/features/agenda/modal-bits";
import { compact } from "./orden-format";
import { useOrder } from "./order-context";
import { DialogActions, Field, FormSection, NativeSelect, OrderDialog, ReasonField, inputClass } from "./ui";

/**
 * Editar datos. Administración edits every field (`order.edit`); the supervisor edits only the
 * operational data (`order.editOperational`: instructions, contact, activities, materials) — doc §2.
 * Any edit or typed reason makes Esc / outside tap / X / Cancelar ask "¿Descartar cambios?" first.
 */
export function EditOrderDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  // a fresh form on every open; it stays mounted while closing so the exit animation plays
  const session = useOpenSession(open);
  if (session === 0) return null;
  return <EditForm key={session} open={open} onOpenChange={onOpenChange} />;
}

const sameList = <T,>(a: T[], b: T[]) => JSON.stringify(a) === JSON.stringify(b);

function EditForm({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const onDone = () => onOpenChange(false);
  const { d } = useOrder();
  const { order, client, lk, perms } = d;
  const updateOrder = useAppStore((s) => s.updateOrder);
  const users = useAppStore((s) => s.users);
  const full = perms.edit;

  const [title, setTitle] = useState(order.title);
  const [priority, setPriority] = useState<Order["priority"]>(order.priority);
  const [commercialRef, setCommercialRef] = useState(order.commercialRef);
  const [serviceTypeId, setServiceTypeId] = useState(order.serviceTypeId);
  const [siteId, setSiteId] = useState(order.siteId);
  const [supervisorId, setSupervisorId] = useState(order.supervisorId);
  const [instructions, setInstructions] = useState(order.specialInstructions);
  const [contactName, setContactName] = useState(order.siteContact.name);
  const [contactPhone, setContactPhone] = useState(order.siteContact.phone);
  const [activities, setActivities] = useState<string[]>(order.activities);
  const [draft, setDraft] = useState("");
  const [materials, setMaterials] = useState(order.materials);
  const [reason, setReason] = useState("");

  const sites = compact(client.siteIds.map((id) => lk.sites.get(id)));
  const serviceTypes = useMemo(() => Array.from(lk.serviceTypes.values()), [lk.serviceTypes]);
  const supervisors = useMemo(() => users.filter((u) => u.role === "supervisor" && u.unitId === order.unitId && u.active), [users, order.unitId]);
  const allMaterials = useMemo(() => Array.from(lk.materials.values()).sort((a, b) => a.name.localeCompare(b.name)), [lk.materials]);
  const unusedMaterial = allMaterials.find((m) => !materials.some((x) => x.materialId === m.id));

  const cleanMaterials = materials.filter((m) => m.qty > 0);
  const changes: { label: string; patch: Partial<Order> }[] = [];
  if (full) {
    if (title.trim() !== order.title) changes.push({ label: "título", patch: { title: title.trim() } });
    if (priority !== order.priority) changes.push({ label: "prioridad", patch: { priority } });
    if (commercialRef.trim() !== order.commercialRef) changes.push({ label: "referencia comercial", patch: { commercialRef: commercialRef.trim() } });
    if (serviceTypeId !== order.serviceTypeId) changes.push({ label: "tipo de servicio", patch: { serviceTypeId } });
    if (siteId !== order.siteId) changes.push({ label: "sitio", patch: { siteId } });
    if (supervisorId !== order.supervisorId) changes.push({ label: "supervisor", patch: { supervisorId } });
  }
  if (instructions.trim() !== order.specialInstructions) changes.push({ label: "instrucciones", patch: { specialInstructions: instructions.trim() } });
  if (contactName.trim() !== order.siteContact.name || contactPhone.trim() !== order.siteContact.phone)
    changes.push({ label: "contacto en sitio", patch: { siteContact: { name: contactName.trim(), phone: contactPhone.trim() } } });
  if (!sameList(activities, order.activities)) changes.push({ label: "actividades", patch: { activities } });
  if (!sameList(cleanMaterials, order.materials)) changes.push({ label: "materiales", patch: { materials: cleanMaterials } });

  const titleOk = !full || title.trim().length >= 4;
  const reasonOk = reason.trim().length >= 5;
  const valid = changes.length > 0 && titleOk && reasonOk;
  const hint = !changes.length ? "Aún no hay cambios que guardar" : !titleOk ? "Escriba un título de al menos 4 caracteres" : !reasonOk ? "Indique el motivo del cambio" : `Cambios: ${changes.map((c) => c.label).join(", ")}`;

  const addActivity = () => {
    const v = draft.trim();
    if (!v || activities.includes(v)) return;
    setActivities((a) => [...a, v]);
    setDraft("");
  };

  const save = () => {
    if (!valid) return;
    const patch = Object.assign({}, ...changes.map((c) => c.patch)) as Partial<Order>;
    updateOrder(order.id, patch, `Editó ${changes.map((c) => c.label).join(", ")}`, reason.trim());
    toast.success("Cambios guardados", { description: "Quedaron en la actividad de la orden con su motivo." });
    onDone();
  };

  /** Something the user would have to redo: any field change, the typed reason or an activity still in the input. */
  const dirty = changes.length > 0 || reason.trim().length > 0 || draft.trim().length > 0;

  return (
    <OrderDialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      eyebrow={order.folio}
      title="Editar datos de la orden"
      description={full ? "Puede editar todos los campos. El cambio queda registrado con su motivo." : "Como supervisor puede editar los datos operativos. El resto lo edita Administración."}
      dirty={dirty}
    >
      <div>
        {full && (
          <FormSection title="Datos generales">
            <div className="grid gap-3">
              <Field label="Título" htmlFor="ed-title">
                <input id="ed-title" value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Tipo de servicio" htmlFor="ed-st">
                  <NativeSelect id="ed-st" value={serviceTypeId} onChange={(e) => setServiceTypeId(e.target.value)}>
                    {serviceTypes.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field label="Sitio" htmlFor="ed-site">
                  <NativeSelect id="ed-site" value={siteId} onChange={(e) => setSiteId(e.target.value)}>
                    {sites.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} · {s.municipality}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field label="Supervisor" htmlFor="ed-sup">
                  <NativeSelect id="ed-sup" value={supervisorId} onChange={(e) => setSupervisorId(e.target.value)}>
                    {supervisors.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field label="Referencia comercial" htmlFor="ed-ref">
                  <input id="ed-ref" value={commercialRef} onChange={(e) => setCommercialRef(e.target.value)} className={cn(inputClass, "tabular")} />
                </Field>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-[13px] font-medium text-ink">Prioridad</span>
                <Segmented
                  id="ed-priority"
                  items={[
                    { value: "normal", label: "Normal" },
                    { value: "alta", label: "Alta" },
                  ]}
                  value={priority}
                  onChange={setPriority}
                />
              </div>
            </div>
          </FormSection>
        )}

        {!full && (
          <p className="mb-5 flex gap-2.5 rounded-[14px] bg-blue-wash px-3.5 py-3 text-[13px] leading-relaxed text-ink">
            <Info className="mt-0.5 size-4 shrink-0 text-azure-fg" />
            Título, sitio, tipo de servicio, supervisor y referencia comercial solo los modifica Administración.
          </p>
        )}

        <FormSection title="Contacto en sitio">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nombre" htmlFor="ed-cname">
              <input id="ed-cname" value={contactName} onChange={(e) => setContactName(e.target.value)} className={inputClass} autoComplete="off" />
            </Field>
            <Field label="Teléfono" htmlFor="ed-cphone">
              <input id="ed-cphone" type="tel" inputMode="tel" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} className={cn(inputClass, "tabular")} autoComplete="off" />
            </Field>
          </div>
        </FormSection>

        <FormSection title="Instrucciones especiales">
          <textarea
            aria-label="Instrucciones especiales"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            rows={3}
            placeholder="Accesos, EPP, horarios restringidos…"
            className="w-full resize-none rounded-[14px] border border-input bg-surface px-3.5 py-3 text-[15px] leading-relaxed outline-none placeholder:text-faint focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </FormSection>

        <FormSection title={`Actividades · ${activities.length}`}>
          <ul className="flex flex-wrap gap-1.5">
            <AnimatePresence initial={false}>
              {activities.map((a) => (
                <motion.li
                  key={a}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.85 }}
                  className="inline-flex max-w-full items-center gap-1 rounded-full border border-hairline bg-soft py-1 pl-3 pr-1 text-[13px] text-ink"
                >
                  <span className="truncate">{a}</span>
                  <button
                    type="button"
                    onClick={() => setActivities((xs) => xs.filter((x) => x !== a))}
                    aria-label={`Quitar ${a}`}
                    className="inline-flex size-7 shrink-0 items-center justify-center rounded-full text-subtle hover:bg-surface hover:text-red-fg"
                  >
                    <X className="size-3.5" />
                  </button>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
          <div className="mt-2.5 flex gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addActivity();
                }
              }}
              placeholder="Agregar actividad"
              aria-label="Nueva actividad"
              className={inputClass}
            />
            <Button type="button" variant="outline" onClick={addActivity} disabled={!draft.trim()} className="h-11 shrink-0 rounded-[12px] border-line px-4 font-semibold">
              <Plus className="size-4" /> Agregar
            </Button>
          </div>
        </FormSection>

        <FormSection title={`Materiales · ${cleanMaterials.length}`}>
          <ul className="space-y-2">
            {materials.map((m, i) => {
              const mat = lk.materials.get(m.materialId);
              return (
                <li key={`${m.materialId}-${i}`} className="grid grid-cols-[minmax(0,1fr)_96px_40px] items-center gap-2">
                  <NativeSelect
                    aria-label="Material"
                    value={m.materialId}
                    onChange={(e) => setMaterials((xs) => xs.map((x, k) => (k === i ? { ...x, materialId: e.target.value } : x)))}
                  >
                    {allMaterials
                      .filter((o) => o.id === m.materialId || !materials.some((x) => x.materialId === o.id))
                      .map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name}
                        </option>
                      ))}
                  </NativeSelect>
                  <label className="relative">
                    <span className="sr-only">Cantidad</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="any"
                      value={Number.isFinite(m.qty) ? m.qty : 0}
                      onChange={(e) => setMaterials((xs) => xs.map((x, k) => (k === i ? { ...x, qty: Math.max(0, Number(e.target.value)) } : x)))}
                      className={cn(inputClass, "pr-9 text-right tabular")}
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-subtle">{mat?.unit}</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setMaterials((xs) => xs.filter((_, k) => k !== i))}
                    aria-label={`Quitar ${mat?.name ?? "material"}`}
                    className="inline-flex size-10 items-center justify-center rounded-full text-subtle transition hover:bg-red-soft hover:text-red-fg"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              );
            })}
          </ul>
          <Button
            type="button"
            variant="outline"
            disabled={!unusedMaterial}
            onClick={() => unusedMaterial && setMaterials((xs) => [...xs, { materialId: unusedMaterial.id, qty: 1 }])}
            className="mt-2.5 h-11 w-full rounded-[14px] border-dashed border-line-heavy font-semibold text-ink"
          >
            <Plus className="size-4" /> Agregar material
          </Button>
        </FormSection>

        <FormSection title="Motivo del cambio">
          <ReasonField value={reason} onChange={setReason} id="edit-reason" suggestions={["Solicitud del cliente", "Corrección de captura", "Ajuste operativo"]} />
        </FormSection>

        <DialogActions hint={hint}>
          <ModalCancel />
          <Button onClick={save} disabled={!valid} className="h-11 rounded-[12px] px-5 font-semibold">
            Guardar cambios
          </Button>
        </DialogActions>
      </div>
    </OrderDialog>
  );
}
