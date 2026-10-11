"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Building2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { uid } from "@/lib/store";
import { useAppStore, useCurrentUser } from "@/lib/hooks";
import type { Client, ClientSegment } from "@/lib/types";
import { ClientMark } from "@/components/pk/client-mark";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChipSelect, Field, FormDialog, inputCls, isEmail, phoneDigits, selectTriggerCls } from "./shared";

const SEGMENTS: ClientSegment[] = ["Industrial", "Comercial", "Residencial"];
const HUES = [205, 222, 190, 160, 262, 300, 340, 14, 32, 48];

/** Suggests a short name: drops legal suffixes and keeps the first two meaningful words. */
function suggestShort(name: string) {
  return name
    .replace(/\b(S\.?A\.?( de C\.?V\.?)?|S\. de R\.L\.|de México|Monterrey)\b/gi, "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .join(" ");
}

export function ClientDialog({
  client,
  defaultUnit,
  open,
  onOpenChange,
  onCreated,
}: {
  client: Client | null;
  defaultUnit: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: (c: Client) => void;
}) {
  const me = useCurrentUser();
  const units = useAppStore((s) => s.units);
  const upsertClient = useAppStore((s) => s.upsertClient);
  const isNew = !client;
  const unitLocked = me.role !== "direccion";

  const [name, setName] = useState(client?.name ?? "");
  const [shortName, setShortName] = useState(client?.shortName ?? "");
  const [shortTouched, setShortTouched] = useState(!!client);
  const [segment, setSegment] = useState<ClientSegment>(client?.segment ?? "Comercial");
  const [unitId, setUnitId] = useState(client?.unitId ?? defaultUnit);
  const [contactName, setContactName] = useState(client?.contactName ?? "");
  const [contactPhone, setContactPhone] = useState(client?.contactPhone ?? "+52 81 ");
  const [contactEmail, setContactEmail] = useState(client?.contactEmail ?? "");
  const [since, setSince] = useState(client ? client.since.slice(0, 10) : format(new Date(), "yyyy-MM-dd"));
  const clientCount = useAppStore((s) => s.clients.length);
  const [hue, setHue] = useState(client?.hue ?? HUES[clientCount % HUES.length]);
  const [submitted, setSubmitted] = useState(false);
  // what the form opened with: any difference makes Esc / outside tap / X / Cancelar ask "¿Descartar cambios?"
  const snapshot = JSON.stringify([name, shortName, segment, unitId, contactName, contactPhone, contactEmail, since, hue]);
  const [initial] = useState(snapshot);

  const errors = {
    name: name.trim().length < 3 ? "Escriba la razón social o el nombre comercial." : null,
    shortName: !shortName.trim() ? "Escriba un nombre corto para listas y reportes." : null,
    contactName: !contactName.trim() ? "Escriba el nombre del contacto principal." : null,
    contactPhone: phoneDigits(contactPhone) < 10 ? "Escriba al menos 10 dígitos, con lada (se usa para WhatsApp)." : null,
    contactEmail: !isEmail(contactEmail) ? "Escriba un correo completo, con @ y dominio (se usa para enviar el reporte)." : null,
  };
  const valid = !Object.values(errors).some(Boolean);
  const show = (k: keyof typeof errors) => (submitted ? errors[k] : null);

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      icon={<Building2 />}
      title={isNew ? "Nuevo cliente" : "Editar cliente"}
      description="Los clientes no usan la app: reciben el reporte por WhatsApp o correo."
      submitLabel={isNew ? "Crear cliente" : "Guardar cambios"}
      dirty={snapshot !== initial}
      onSubmit={() => {
        setSubmitted(true);
        if (!valid) return;
        const next: Client = {
          id: client?.id ?? uid("cli"),
          name: name.trim(),
          shortName: shortName.trim(),
          segment,
          unitId,
          contactName: contactName.trim(),
          contactPhone: contactPhone.trim(),
          contactEmail: contactEmail.trim().toLowerCase(),
          since: new Date(`${since}T12:00:00`).toISOString(),
          hue,
          siteIds: client?.siteIds ?? [],
        };
        upsertClient(next);
        if (isNew) onCreated?.(next);
        else toast.success(`${next.shortName} actualizado`);
        onOpenChange(false);
      }}
    >
      <div className="space-y-5">
        <div className="flex items-center gap-3 rounded-[16px] bg-soft p-3">
          <ClientMark name={name || "Nuevo cliente"} hue={hue} size={46} />
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold text-ink">{shortName || name || "Nuevo cliente"}</p>
            <p className="truncate text-[13px] text-subtle">
              {segment} · {units.find((u) => u.id === unitId)?.name}
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre del cliente" htmlFor="c-name" error={show("name")} className="sm:col-span-2">
            <Input
              id="c-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!shortTouched) setShortName(suggestShort(e.target.value));
              }}
              placeholder="Ej. Hotel Arboleda Monterrey"
              className={inputCls}
              aria-invalid={!!show("name")}
            />
          </Field>
          <Field label="Nombre corto" htmlFor="c-short" error={show("shortName")}>
            <Input
              id="c-short"
              value={shortName}
              onChange={(e) => {
                setShortTouched(true);
                setShortName(e.target.value);
              }}
              className={inputCls}
              aria-invalid={!!show("shortName")}
            />
          </Field>
          <Field label="Cliente desde" htmlFor="c-since">
            <Input id="c-since" type="date" value={since} max={format(new Date(), "yyyy-MM-dd")} onChange={(e) => e.target.value && setSince(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Segmento" className="sm:col-span-2">
            <ChipSelect ariaLabel="Segmento" value={segment} onChange={setSegment} options={SEGMENTS.map((s) => ({ value: s, label: s }))} />
          </Field>
          <Field label="Unidad" hint={unitLocked ? "Administración registra clientes de su propia unidad." : undefined} className="sm:col-span-2">
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

        <div>
          <p className="mb-3 text-[12px] font-semibold uppercase tracking-[0.1em] text-subtle">Contacto principal</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nombre" htmlFor="c-contact" error={show("contactName")} className="sm:col-span-2">
              <Input id="c-contact" value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Ej. Lic. Andrea Montemayor" className={inputCls} aria-invalid={!!show("contactName")} />
            </Field>
            <Field label="Teléfono / WhatsApp" htmlFor="c-phone" error={show("contactPhone")}>
              <Input id="c-phone" type="tel" inputMode="tel" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} className={inputCls} aria-invalid={!!show("contactPhone")} />
            </Field>
            <Field label="Correo" htmlFor="c-email" error={show("contactEmail")}>
              <Input id="c-email" type="email" inputMode="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} className={inputCls} aria-invalid={!!show("contactEmail")} />
            </Field>
          </div>
        </div>

        <Field label="Color de identificación">
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Color">
            {HUES.map((h) => (
              <button
                key={h}
                type="button"
                role="radio"
                aria-checked={hue === h}
                aria-label={`Tono ${h}`}
                onClick={() => setHue(h)}
                className={cn("size-10 rounded-[12px] ring-offset-2 transition", hue === h ? "scale-105 ring-2 ring-brand-deep" : "ring-1 ring-edge hover:scale-105")}
                style={{ background: `linear-gradient(135deg, oklch(0.96 0.03 ${h}), oklch(0.86 0.08 ${h}))` }}
              />
            ))}
          </div>
        </Field>
      </div>
    </FormDialog>
  );
}
