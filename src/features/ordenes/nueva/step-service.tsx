"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { Check, ChevronDown, Plus, RotateCcw, Wand2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLookups } from "@/lib/hooks";
import { plural } from "@/lib/format";
import type { Material, Order, ServiceType } from "@/lib/types";
import { EASE } from "@/components/pk/motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { endFor, instructionSuggestions, serviceSuggestions, suggestedTitle } from "./draft";
import { CheckMark, FieldMessage, FormSection, QtyStepper, ServiceIcon, inputClass } from "./form-bits";
import type { StepProps } from "./step-types";

export function StepService({
  draft,
  setDraft,
  issues,
  errorOf,
  touch,
  serviceTypes,
  materials,
  orders,
  title,
}: StepProps & { serviceTypes: ServiceType[]; materials: Material[]; orders: Order[]; title: string }) {
  const lk = useLookups();
  const site = lk.sites.get(draft.siteId);
  const service = lk.serviceTypes.get(draft.serviceTypeId);
  const [custom, setCustom] = useState("");
  const [showAllMaterials, setShowAllMaterials] = useState(false);

  const suggestions = useMemo(() => (draft.serviceTypeId ? serviceSuggestions(orders, draft.serviceTypeId) : { activities: [], materials: [] }), [orders, draft.serviceTypeId]);
  const pastForClient = useMemo(() => {
    const m = new Map<string, number>();
    orders.filter((o) => o.clientId === draft.clientId).forEach((o) => m.set(o.serviceTypeId, (m.get(o.serviceTypeId) ?? 0) + 1));
    return m;
  }, [orders, draft.clientId]);
  const instructionIdeas = useMemo(
    () => instructionSuggestions(orders, draft.clientId).filter((t) => !draft.specialInstructions.includes(t)),
    [orders, draft.clientId, draft.specialInstructions],
  );

  const chooseService = (st: ServiceType) => {
    if (st.id === draft.serviceTypeId) return;
    const sug = serviceSuggestions(orders, st.id);
    setDraft((d) => ({
      ...d,
      serviceTypeId: st.id,
      activities: [...sug.activities, ...d.customActivities],
      materials: Object.fromEntries(sug.materials.map((m) => [m.materialId, m.qty])),
      // keep schedule in sync with the service's typical day unless the person set times
      days: d.timesEdited ? d.days : d.days.map((day) => ({ ...day, end: endFor(day.start, st.defaultHoursPerDay) })),
    }));
  };

  const toggleActivity = (a: string) =>
    setDraft((d) => ({ ...d, activities: d.activities.includes(a) ? d.activities.filter((x) => x !== a) : [...d.activities, a] }));

  const addCustom = () => {
    const a = custom.trim().replace(/\s+/g, " ");
    if (!a) return;
    const exists = [...suggestions.activities, ...draft.customActivities].some((x) => x.toLowerCase() === a.toLowerCase());
    setDraft((d) => ({
      ...d,
      customActivities: exists ? d.customActivities : [...d.customActivities, a],
      activities: d.activities.some((x) => x.toLowerCase() === a.toLowerCase()) ? d.activities : [...d.activities, a],
    }));
    setCustom("");
  };

  const removeCustom = (a: string) =>
    setDraft((d) => ({ ...d, customActivities: d.customActivities.filter((x) => x !== a), activities: d.activities.filter((x) => x !== a) }));

  const suggestedMaterialIds = new Set(suggestions.materials.map((m) => m.materialId));
  const primaryMaterials = materials.filter((m) => suggestedMaterialIds.has(m.id) || (draft.materials[m.id] ?? 0) > 0);
  const otherMaterials = materials.filter((m) => !primaryMaterials.includes(m));
  const materialCount = Object.values(draft.materials).filter((q) => q > 0).length;
  const allActivities = [...suggestions.activities, ...draft.customActivities.filter((c) => !suggestions.activities.includes(c))];

  return (
    <div>
      <FormSection title="Tipo de servicio" description="Define las actividades y materiales sugeridos.">
        <LayoutGroup id="service-pick">
          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4" role="radiogroup" aria-label="Tipo de servicio">
            {serviceTypes.map((st, i) => {
              const on = st.id === draft.serviceTypeId;
              const past = pastForClient.get(st.id) ?? 0;
              return (
                <motion.button
                  key={st.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => chooseService(st)}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0, transition: { delay: i * 0.035, duration: 0.35, ease: EASE } }}
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.97 }}
                  style={{ ["--h" as string]: st.hue }}
                  className={cn(
                    "relative flex min-h-[132px] flex-col items-start rounded-[18px] border p-3.5 text-left transition-[border-color,box-shadow] duration-200",
                    on ? "border-transparent" : "border-hairline bg-surface hover:shadow-soft",
                  )}
                >
                  {on && (
                    <motion.span
                      layoutId="service-ring"
                      className="absolute inset-0 rounded-[18px] bg-[oklch(0.985_0.012_var(--h))] ring-[1.5px] ring-[oklch(0.55_0.14_var(--h))] dark:bg-[oklch(0.3_0.05_var(--h))] dark:ring-[oklch(0.72_0.13_var(--h))]"
                      transition={{ type: "spring", stiffness: 480, damping: 36 }}
                    />
                  )}
                  <span className="relative flex w-full items-start justify-between gap-2">
                    <ServiceIcon id={st.id} hue={st.hue} size={40} />
                    {on ? (
                      <motion.span
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: "spring", stiffness: 520, damping: 24 }}
                        className="inline-flex size-6 items-center justify-center rounded-full text-white"
                        style={{ background: `oklch(0.52 0.14 ${st.hue})` }}
                      >
                        <Check className="size-3.5" strokeWidth={3} />
                      </motion.span>
                    ) : (
                      past > 0 && <span className="rounded-md bg-tile px-1.5 py-0.5 text-[10.5px] font-semibold text-subtle">{plural(past, "previa", "previas")}</span>
                    )}
                  </span>
                  <span className="relative mt-auto block pt-3 text-[14px] font-semibold leading-snug text-ink">{st.name}</span>
                  <span className="relative mt-0.5 block text-[12px] text-subtle">≈ {st.defaultHoursPerDay} h por jornada</span>
                </motion.button>
              );
            })}
          </div>
        </LayoutGroup>
      </FormSection>

      <AnimatePresence initial={false}>
        {service && (
          <motion.div key="details" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.4, ease: EASE }}>
            <FormSection title="Título de la orden" description="Así aparecerá en listas, agenda y en el reporte al cliente.">
              <div className="relative">
                <Input
                  value={title}
                  onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value, titleEdited: true }))}
                  onBlur={() => touch("title")}
                  aria-invalid={!!errorOf("title")}
                  aria-label="Título de la orden"
                  maxLength={90}
                  className={cn(inputClass, "pr-28 text-[15.5px] font-medium")}
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2">
                  {draft.titleEdited ? (
                    <button
                      type="button"
                      onClick={() => setDraft((d) => ({ ...d, title: "", titleEdited: false }))}
                      className="inline-flex h-8 items-center gap-1 rounded-[9px] px-2 text-[12.5px] font-medium text-link hover:bg-blue-wash"
                    >
                      <RotateCcw className="size-3.5" /> Sugerido
                    </button>
                  ) : (
                    <span className="inline-flex h-7 items-center gap-1 rounded-[8px] bg-violet-soft px-2 text-[12px] font-semibold text-violet-fg">
                      <Wand2 className="size-3.5" /> Sugerido
                    </span>
                  )}
                </span>
              </div>
              <FieldMessage error={errorOf("title")} hint={!draft.titleEdited ? `Se arma con el servicio y el sitio: “${suggestedTitle(service, site?.name)}”.` : undefined} />
            </FormSection>

            <FormSection
              title="Actividades"
              description="Alcance del trabajo. Sugeridas a partir de órdenes anteriores de este servicio."
              aside={<span className="shrink-0 rounded-md bg-tile px-2 py-1 text-[12.5px] font-semibold text-ink tabular">{draft.activities.length} de {allActivities.length}</span>}
            >
              <ul className="grid gap-1.5 sm:grid-cols-2">
                <AnimatePresence initial={false}>
                  {allActivities.map((a) => {
                    const on = draft.activities.includes(a);
                    const isCustom = draft.customActivities.includes(a) && !suggestions.activities.includes(a);
                    return (
                      <motion.li key={a} layout initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ duration: 0.22 }}>
                        <div
                          className={cn(
                            "flex min-h-[48px] items-center gap-3 rounded-[14px] border px-3 py-2 transition-colors",
                            on ? "border-blue-mid bg-blue-wash" : "border-hairline bg-surface hover:border-line-strong",
                          )}
                        >
                          <button type="button" role="checkbox" aria-checked={on} onClick={() => toggleActivity(a)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                            <CheckMark on={on} />
                            <span className={cn("text-[14px] leading-snug", on ? "text-ink" : "text-subtle")}>{a}</span>
                          </button>
                          {isCustom && (
                            <button
                              type="button"
                              onClick={() => removeCustom(a)}
                              aria-label={`Quitar actividad ${a}`}
                              className="inline-flex size-10 shrink-0 items-center justify-center rounded-[10px] text-subtle hover:bg-muted hover:text-ink"
                            >
                              <X className="size-4" />
                            </button>
                          )}
                        </div>
                      </motion.li>
                    );
                  })}
                </AnimatePresence>
              </ul>
              <form
                className="mt-3 flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  addCustom();
                }}
              >
                <Input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Agregar actividad personalizada" aria-label="Nueva actividad" maxLength={90} className={cn(inputClass, "flex-1")} />
                <Button type="submit" variant="outline" disabled={!custom.trim()} className="h-11 rounded-[13px] border-line px-4 font-semibold">
                  <Plus className="size-4" />
                  <span className="hidden sm:inline">Agregar</span>
                </Button>
              </form>
              <FieldMessage error={issues.errors.activities} />
            </FormSection>

            <FormSection
              title="Materiales y productos"
              description="Cantidades a entregar a la cuadrilla. Opcional."
              aside={<span className="shrink-0 rounded-md bg-tile px-2 py-1 text-[12.5px] font-semibold text-ink tabular">{plural(materialCount, "material", "materiales")}</span>}
            >
              <ul className="divide-y divide-hairline rounded-[18px] border border-hairline bg-surface">
                {primaryMaterials.map((m) => (
                  <MaterialRow key={m.id} material={m} suggested={suggestedMaterialIds.has(m.id)} qty={draft.materials[m.id] ?? 0} onChange={(q) => setDraft((d) => ({ ...d, materials: { ...d.materials, [m.id]: q } }))} />
                ))}
                <AnimatePresence initial={false}>
                  {showAllMaterials &&
                    otherMaterials.map((m) => (
                      <motion.li key={m.id} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.25, ease: EASE }} className="overflow-hidden">
                        <MaterialRow as="div" material={m} suggested={false} qty={draft.materials[m.id] ?? 0} onChange={(q) => setDraft((d) => ({ ...d, materials: { ...d.materials, [m.id]: q } }))} />
                      </motion.li>
                    ))}
                </AnimatePresence>
              </ul>
              {otherMaterials.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowAllMaterials((v) => !v)}
                  className="mt-2.5 inline-flex h-10 items-center gap-1.5 rounded-[12px] px-2 text-[13.5px] font-medium text-link hover:bg-blue-wash"
                >
                  <ChevronDown className={cn("size-4 transition-transform", showAllMaterials && "rotate-180")} />
                  {showAllMaterials ? "Ocultar otros materiales" : `Ver otros materiales del catálogo (${otherMaterials.length})`}
                </button>
              )}
            </FormSection>

            <FormSection title="Instrucciones especiales" description="Accesos, horarios restringidos, EPP, productos a evitar…">
              <Textarea
                value={draft.specialInstructions}
                onChange={(e) => setDraft((d) => ({ ...d, specialInstructions: e.target.value }))}
                placeholder="Ej. Acceso por andén 3. Presentar identificación y EPP completo."
                aria-label="Instrucciones especiales"
                maxLength={600}
                className="min-h-[104px] rounded-[14px] border-hairline bg-surface px-3.5 py-3 text-[15px] md:text-[14.5px]"
              />
              {instructionIdeas.length > 0 && (
                <div className="mt-3">
                  <p className="mb-2 text-[12.5px] text-subtle">Usadas antes con este cliente:</p>
                  <div className="flex flex-wrap gap-2">
                    {instructionIdeas.map((t) => (
                      <motion.button
                        key={t}
                        type="button"
                        whileTap={{ scale: 0.96 }}
                        onClick={() => setDraft((d) => ({ ...d, specialInstructions: d.specialInstructions.trim() ? `${d.specialInstructions.trim()}\n${t}` : t }))}
                        className="inline-flex min-h-10 max-w-full items-center gap-1.5 rounded-[12px] border border-dashed border-line-heavy bg-surface px-3 py-1.5 text-left text-[13px] text-ink transition hover:border-azure hover:bg-blue-wash"
                      >
                        <Plus className="size-3.5 shrink-0 text-link" />
                        <span className="line-clamp-2">{t}</span>
                      </motion.button>
                    ))}
                  </div>
                </div>
              )}
            </FormSection>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function MaterialRow({
  material,
  qty,
  onChange,
  suggested,
  as = "li",
}: {
  material: Material;
  qty: number;
  onChange: (q: number) => void;
  suggested: boolean;
  as?: "li" | "div";
}) {
  const Tag = as;
  return (
    <Tag className="flex items-center gap-3 px-3.5 py-2.5">
      <div className="min-w-0 flex-1">
        <p className={cn("line-clamp-2 text-[14px] leading-snug", qty > 0 ? "font-medium text-ink" : "text-subtle")}>{material.name}</p>
        {suggested && <p className="mt-0.5 text-[11.5px] font-medium text-violet-fg">Sugerido</p>}
      </div>
      <QtyStepper value={qty} onChange={onChange} unit={material.unit} label={material.name} />
    </Tag>
  );
}
