"use client";

import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { Clock, Minus, Pencil, Plus, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { uid } from "@/lib/store";
import { useAppStore, useCan, useScopedData } from "@/lib/hooks";
import { plural } from "@/lib/format";
import type { ServiceType } from "@/lib/types";
import { EASE, rowVariants, staggerContainer } from "@/components/pk/motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FormDialog, GatedButton, ListHead, NO_CATALOGS, inputCls, useDialogTarget } from "./shared";
import { TEXT_LIMITS } from "@/lib/domain";

/** Soft swatch for a service hue (same oklch recipe as client marks). */
export function HueSwatch({ hue, size = 36 }: { hue: number; size?: number }) {
  return (
    <span
      aria-hidden
      className="relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[12px] ring-1 ring-edge"
      style={{ width: size, height: size, background: `linear-gradient(135deg, oklch(0.95 0.04 ${hue}), oklch(0.8 0.11 ${hue}))` }}
    >
      <span className="absolute left-[18%] top-[16%] size-[28%] rounded-full bg-surface/70" />
      <span className="absolute bottom-[20%] right-[22%] size-[14%] rounded-full bg-surface/50" />
    </span>
  );
}

export function ServiceTypesCatalog() {
  const serviceTypes = useAppStore((s) => s.serviceTypes);
  const { orders } = useScopedData();
  const canEdit = useCan("catalogs.admin");
  const dlg = useDialogTarget<ServiceType | "new">();

  const usage = useMemo(() => {
    const m = new Map<string, number>();
    orders.forEach((o) => m.set(o.serviceTypeId, (m.get(o.serviceTypeId) ?? 0) + 1));
    return m;
  }, [orders]);
  const maxHours = Math.max(10, ...serviceTypes.map((s) => s.defaultHoursPerDay));

  return (
    <section>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-xl text-[14px] text-subtle">
          Tipos de limpieza que se eligen al dar de alta una orden. Las horas por jornada proponen el horario al programar.
        </p>
        <GatedButton allowed={canEdit} reason={NO_CATALOGS} onClick={() => dlg.show("new")} className="self-start sm:self-auto">
          <Plus className="size-4" /> Nuevo tipo
        </GatedButton>
      </div>

      <ListHead className="lg:hidden xl:grid grid-cols-[minmax(0,1.4fr)_120px_minmax(0,1fr)_96px_96px]">
        <span>Tipo de servicio</span>
        <span>Etiqueta</span>
        <span>Horas por jornada</span>
        <span className="text-right">Órdenes</span>
        <span />
      </ListHead>
      <motion.ul variants={staggerContainer(0.04, 0.05)} initial="hidden" animate="show">
        {serviceTypes.map((st, i) => (
          <motion.li
            key={st.id}
            variants={rowVariants}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 border-b border-hairline py-4 xl:grid-cols-[minmax(0,1.4fr)_120px_minmax(0,1fr)_96px_96px] xl:gap-x-4"
          >
            <div className="flex min-w-0 items-center gap-3">
              <HueSwatch hue={st.hue} size={40} />
              <div className="min-w-0">
                <p className="truncate text-[16px] font-semibold text-ink xl:text-[15px]">{st.name}</p>
                <p className="text-[13px] text-subtle xl:hidden">
                  {st.short} · {st.defaultHoursPerDay} h por jornada · {plural(usage.get(st.id) ?? 0, "orden", "órdenes")}
                </p>
              </div>
            </div>
            <span className="hidden xl:block">
              <span className="inline-flex h-[24px] items-center rounded-md px-2 text-[12px] font-semibold" style={{ background: `oklch(0.95 0.035 ${st.hue})`, color: `oklch(0.4 0.1 ${st.hue})` }}>
                {st.short}
              </span>
            </span>
            <div className="hidden items-center gap-3 xl:flex">
              <div className="h-[7px] flex-1 overflow-hidden rounded-full bg-well">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${(st.defaultHoursPerDay / maxHours) * 100}%` }}
                  transition={{ duration: 0.9, ease: EASE, delay: 0.2 + i * 0.05 }}
                  className="h-full rounded-full"
                  style={{ background: `oklch(0.62 0.13 ${st.hue})` }}
                />
              </div>
              <span className="w-10 text-right text-[14px] font-semibold text-ink tabular">{st.defaultHoursPerDay} h</span>
            </div>
            <span className="hidden text-right text-[15px] font-semibold text-ink tabular xl:block">{usage.get(st.id) ?? 0}</span>
            <div className="col-start-2 row-start-1 flex justify-end xl:col-start-auto xl:row-start-auto">
              <GatedButton allowed={canEdit} reason={NO_CATALOGS} variant="outline" onClick={() => dlg.show(st)} className="w-11 border-line px-0 xl:w-auto xl:min-w-[84px] xl:px-4" aria-label={`Editar ${st.name}`}>
                <Pencil className="size-4 xl:hidden" />
                <span className="max-xl:sr-only">Editar</span>
              </GatedButton>
            </div>
          </motion.li>
        ))}
      </motion.ul>

      {dlg.target && <ServiceTypeDialog key={dlg.key} serviceType={dlg.target === "new" ? null : dlg.target} open={dlg.open} onOpenChange={dlg.onOpenChange} />}
    </section>
  );
}

function ServiceTypeDialog({ serviceType, open, onOpenChange }: { serviceType: ServiceType | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const upsert = useAppStore((s) => s.upsertServiceType);
  const existing = useAppStore((s) => s.serviceTypes);
  const isNew = !serviceType;
  const [name, setName] = useState(serviceType?.name ?? "");
  const [short, setShort] = useState(serviceType?.short ?? "");
  const [hue, setHue] = useState(serviceType?.hue ?? 205);
  const [hours, setHours] = useState(serviceType?.defaultHoursPerDay ?? 8);
  const [submitted, setSubmitted] = useState(false);
  // what the form opened with: any difference makes Esc / outside tap / X / Cancelar ask "¿Descartar cambios?"
  const snapshot = JSON.stringify([name, short, hue, hours]);
  const [initial] = useState(snapshot);

  const dup = existing.some((s) => s.id !== serviceType?.id && s.name.trim().toLowerCase() === name.trim().toLowerCase());
  const errors = {
    name: name.trim().length < 4 ? "Escriba el nombre del servicio." : dup ? "Ya existe un tipo con ese nombre: use otro." : null,
    short: !short.trim() ? "Escriba una etiqueta corta, de hasta 14 caracteres." : short.trim().length > 14 ? "Use 14 caracteres o menos." : null,
  };
  const valid = !errors.name && !errors.short;

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      icon={<Sparkles />}
      title={isNew ? "Nuevo tipo de servicio" : "Editar tipo de servicio"}
      description="Tipo de limpieza que se elige al programar una orden."
      submitLabel={isNew ? "Crear tipo" : "Guardar cambios"}
      dirty={snapshot !== initial}
      onSubmit={() => {
        setSubmitted(true);
        if (!valid) return;
        if (!upsert({ id: serviceType?.id ?? uid("st"), name: name.trim(), short: short.trim(), hue, defaultHoursPerDay: hours })) return;
        toast.success(isNew ? `Tipo ${short.trim()} creado` : `${name.trim()} actualizado`);
        onOpenChange(false);
      }}
    >
      <div className="space-y-5">
        <div className="flex items-center gap-4 rounded-[16px] bg-soft p-3">
          <HueSwatch hue={hue} size={48} />
          <div className="min-w-0">
            <p className="truncate text-[16px] font-semibold text-ink xl:text-[15px]">{name.trim() || "Nuevo servicio"}</p>
            <p className="mt-1 flex items-center gap-2 text-[13px] text-subtle">
              <span className="inline-flex h-[22px] items-center rounded-md px-2 text-[11.5px] font-semibold" style={{ background: `oklch(0.95 0.035 ${hue})`, color: `oklch(0.4 0.1 ${hue})` }}>
                {short.trim() || "Etiqueta"}
              </span>
              <Clock className="size-3.5" /> {hours} h por jornada
            </p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <Field label="Nombre" htmlFor="st-name" error={submitted ? errors.name : null}>
            <Input id="st-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Limpieza profunda" maxLength={TEXT_LIMITS.serviceTypeName.max} className={inputCls} aria-invalid={submitted && !!errors.name} />
          </Field>
          <Field label="Etiqueta corta" htmlFor="st-short" error={submitted ? errors.short : null}>
            <Input id="st-short" value={short} onChange={(e) => setShort(e.target.value)} placeholder="Profunda" maxLength={18} className={inputCls} aria-invalid={submitted && !!errors.short} />
          </Field>
        </div>
        <Field label="Color" hint="Sirve para distinguir el servicio en agenda, tarjetas y reportes.">
          <HueRange value={hue} onChange={setHue} />
        </Field>
        <Field label="Horas por jornada" hint="Duración sugerida al programar cada jornada (1 a 12 h).">
          <div className="flex items-center gap-3">
            <Button type="button" variant="outline" size="icon" onClick={() => setHours((h) => Math.max(1, h - 1))} aria-label="Menos horas" className="size-11 rounded-[12px] border-line">
              <Minus className="size-4" />
            </Button>
            <motion.span key={hours} initial={{ y: -6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="w-16 text-center text-[24px] font-medium tracking-[-0.02em] text-ink tabular">
              {hours} h
            </motion.span>
            <Button type="button" variant="outline" size="icon" onClick={() => setHours((h) => Math.min(12, h + 1))} aria-label="Más horas" className="size-11 rounded-[12px] border-line">
              <Plus className="size-4" />
            </Button>
          </div>
        </Field>
      </div>
    </FormDialog>
  );
}

const HUE_GRADIENT =
  "linear-gradient(90deg, oklch(0.8 0.11 0), oklch(0.8 0.11 60), oklch(0.8 0.11 120), oklch(0.8 0.11 180), oklch(0.8 0.11 240), oklch(0.8 0.11 300), oklch(0.8 0.11 359))";

/** Hue slider: rainbow track with a navy thumb, 40px tall hit area. */
function HueRange({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="relative h-10">
      <span aria-hidden className="absolute inset-x-0 top-1/2 h-3 -translate-y-1/2 rounded-full ring-1 ring-edge" style={{ background: HUE_GRADIENT }} />
      <input
        type="range"
        min={0}
        max={359}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label="Tono del color"
        className="absolute inset-0 h-10 w-full cursor-pointer appearance-none bg-transparent outline-none [&::-moz-range-thumb]:size-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-[3px] [&::-moz-range-thumb]:border-surface [&::-moz-range-thumb]:bg-brand-deep [&::-moz-range-track]:bg-transparent [&::-webkit-slider-thumb]:size-6 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-[3px] [&::-webkit-slider-thumb]:border-surface [&::-webkit-slider-thumb]:bg-brand-deep [&::-webkit-slider-thumb]:shadow-[0_2px_8px_rgb(2_58_99/0.4)] focus-visible:[&::-webkit-slider-thumb]:ring-4 focus-visible:[&::-webkit-slider-thumb]:ring-sky/50"
      />
    </div>
  );
}
