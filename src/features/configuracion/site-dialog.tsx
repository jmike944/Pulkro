"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Loader2, LocateFixed, MapPin, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { uid } from "@/lib/store";
import { useAppStore, useDemoSession } from "@/lib/hooks";
import { fmtCoords } from "@/lib/format";
import type { Client, Site } from "@/lib/types";
import { GeoMap, readPosition } from "@/components/pk/geo-map";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FormDialog, inputCls } from "./shared";

const MUNICIPALITIES = [
  "Monterrey",
  "San Pedro Garza García",
  "San Nicolás de los Garza",
  "Guadalupe",
  "Apodaca",
  "General Escobedo",
  "Santa Catarina",
  "García",
  "Juárez",
  "Santiago",
  "Cadereyta Jiménez",
  "Saltillo",
  "Ramos Arizpe",
  "Arteaga",
];

const MTY = { lat: 25.6866, lng: -100.3161 };

const parseCoord = (v: string) => {
  const n = Number(v.replace(",", ".").trim());
  return v.trim() !== "" && Number.isFinite(n) ? n : null;
};

/** Create / edit a client site with coordinates (used to validate check-in distance in campo). */
export function SiteDialog({ client, site, open, onOpenChange }: { client: Client; site: Site | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const upsertSite = useAppStore((s) => s.upsertSite);
  const upsertClient = useAppStore((s) => s.upsertClient);
  const sites = useAppStore((s) => s.sites);
  const demo = useDemoSession();
  const isNew = !site;
  const anchor = sites.find((x) => x.clientId === client.id) ?? null;

  const [name, setName] = useState(site?.name ?? "");
  const [address, setAddress] = useState(site?.address ?? "");
  const [municipality, setMunicipality] = useState(site?.municipality ?? anchor?.municipality ?? "Monterrey");
  const [lat, setLat] = useState(site ? String(site.lat) : "");
  const [lng, setLng] = useState(site ? String(site.lng) : "");
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [locating, setLocating] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  // what the form opened with: any difference makes Esc / outside tap / X / Cancelar ask "¿Descartar cambios?"
  const snapshot = JSON.stringify([name, address, municipality, lat, lng]);
  const [initial] = useState(snapshot);

  const la = parseCoord(lat);
  const ln = parseCoord(lng);
  const coordsValid = la !== null && ln !== null && Math.abs(la) <= 90 && Math.abs(ln) <= 180;
  const outsideMexico = coordsValid && (la! < 14 || la! > 33 || ln! < -118.5 || ln! > -86);

  const errors = {
    name: !name.trim() ? "Escriba el nombre del sitio." : null,
    address: address.trim().length < 6 ? "Escriba calle, número y colonia." : null,
    municipality: !municipality.trim() ? "Escriba el municipio." : null,
    coords: !coordsValid ? "Escriba latitud y longitud válidas o use su ubicación." : null,
  };
  const valid = !Object.values(errors).some(Boolean);
  const show = (k: keyof typeof errors) => (submitted ? errors[k] : null);

  const locate = async () => {
    setLocating(true);
    const fallback = coordsValid ? { lat: la!, lng: ln! } : anchor ?? MTY;
    const r = await readPosition(fallback, { demo });
    setLocating(false);
    setLat(r.lat.toFixed(6));
    setLng(r.lng.toFixed(6));
    setAccuracy(r.accuracy);
    if (r.simulated) toast(r.error ?? "Ubicación aproximada", { description: "Se usó una posición de referencia; ajústela si es necesario." });
    else toast.success(`Ubicación obtenida · ±${r.accuracy} m`);
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      icon={<MapPin />}
      title={isNew ? "Nuevo sitio" : "Editar sitio"}
      description={
        <>
          Sitio de <b className="font-semibold text-ink">{client.shortName}</b>. Las coordenadas se comparan con el GPS de entrada y salida de cada jornada.
        </>
      }
      submitLabel={isNew ? "Agregar sitio" : "Guardar sitio"}
      className="sm:max-w-[620px]"
      dirty={snapshot !== initial}
      onSubmit={() => {
        setSubmitted(true);
        if (!valid) return;
        const next: Site = {
          id: site?.id ?? uid("site"),
          clientId: client.id,
          name: name.trim(),
          address: address.trim(),
          municipality: municipality.trim(),
          lat: Number(la!.toFixed(6)),
          lng: Number(ln!.toFixed(6)),
        };
        upsertSite(next);
        if (isNew) {
          const fresh = useAppStore.getState().clients.find((c) => c.id === client.id) ?? client;
          if (!fresh.siteIds.includes(next.id)) upsertClient({ ...fresh, siteIds: [...fresh.siteIds, next.id] });
        }
        toast.success(isNew ? `Sitio ${next.name} agregado` : `Sitio ${next.name} actualizado`, { description: client.shortName });
        onOpenChange(false);
      }}
    >
      <div className="space-y-4">
        <Field label="Nombre del sitio" htmlFor="s-name" error={show("name")}>
          <Input id="s-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Planta Escobedo" className={inputCls} aria-invalid={!!show("name")} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <Field label="Dirección" htmlFor="s-address" error={show("address")}>
            <Input id="s-address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Calle, número y colonia" autoComplete="street-address" className={inputCls} aria-invalid={!!show("address")} />
          </Field>
          <Field label="Municipio" htmlFor="s-mun" error={show("municipality")}>
            <Input id="s-mun" list="pk-municipios" value={municipality} onChange={(e) => setMunicipality(e.target.value)} className={inputCls} aria-invalid={!!show("municipality")} />
            <datalist id="pk-municipios">
              {MUNICIPALITIES.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </Field>
        </div>

        <div className="rounded-[18px] border border-hairline p-3 sm:p-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <Field label="Latitud" htmlFor="s-lat">
              <Input id="s-lat" inputMode="decimal" value={lat} onChange={(e) => { setLat(e.target.value); setAccuracy(null); }} placeholder="25.686600" className={`${inputCls} tabular`} aria-invalid={!!show("coords")} />
            </Field>
            <Field label="Longitud" htmlFor="s-lng">
              <Input id="s-lng" inputMode="decimal" value={lng} onChange={(e) => { setLng(e.target.value); setAccuracy(null); }} placeholder="-100.316100" className={`${inputCls} tabular`} aria-invalid={!!show("coords")} />
            </Field>
            <Button type="button" variant="outline" onClick={locate} disabled={locating} className="h-11 rounded-[12px] border-line px-4 font-semibold">
              {locating ? <Loader2 className="size-4 animate-spin" /> : <LocateFixed className="size-4" />}
              Usar mi ubicación
            </Button>
          </div>
          {show("coords") && <p className="mt-2 text-[12.5px] font-medium text-red-fg">{errors.coords}</p>}
          <AnimatePresence initial={false}>
            {outsideMexico && (
              <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mt-2 flex items-center gap-2 overflow-hidden text-[12.5px] text-amber-fg">
                <TriangleAlert className="size-3.5 shrink-0" /> Las coordenadas quedan fuera de México. Verifique el signo de la longitud (debe ser negativa).
              </motion.p>
            )}
          </AnimatePresence>
          <div className="mt-3">
            {coordsValid ? (
              <GeoMap
                className="h-[200px] sm:h-[230px]"
                markers={[{ lat: la!, lng: ln!, kind: "site", label: name.trim() || "Sitio" }]}
                accuracy={accuracy ? { lat: la!, lng: ln!, radius: accuracy } : undefined}
                zoom={16}
              />
            ) : (
              <div className="flex h-[200px] flex-col items-center justify-center gap-2 rounded-[20px] bg-soft text-center text-[13.5px] text-subtle sm:h-[230px]">
                <MapPin className="size-6 text-faint" />
                Escriba las coordenadas para ver la vista previa del mapa.
              </div>
            )}
            {coordsValid && (
              <p className="mt-2 text-[12px] text-subtle tabular">
                {fmtCoords(la!, ln!)}
                {accuracy ? ` · precisión ±${accuracy} m` : ""}
              </p>
            )}
          </div>
        </div>
      </div>
    </FormDialog>
  );
}
