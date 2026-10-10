"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { Check, Flame, Link2, MapPin, Phone, RotateCcw, Search, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLookups } from "@/lib/hooks";
import { fmtDate, plural } from "@/lib/format";
import type { Client, Order, Site } from "@/lib/types";
import { ClientMark } from "@/components/pk/client-mark";
import { GeoMap } from "@/components/pk/geo-map";
import { Segmented } from "@/components/pk/page";
import { EASE } from "@/components/pk/motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { normalize } from "../order-rows";
import { FieldLabel, FieldMessage, FormSection, inputClass } from "./form-bits";
import type { StepProps } from "./step-types";

export function StepClient({ draft, setDraft, issues, errorOf, touch, clients, orders }: StepProps & { clients: Client[]; orders: Order[] }) {
  const lk = useLookups();
  const [query, setQuery] = useState("");
  const [picking, setPicking] = useState(!draft.clientId);
  const client = lk.clients.get(draft.clientId);
  const sites = useMemo(() => (client ? client.siteIds.map((id) => lk.sites.get(id)).filter((s): s is Site => !!s) : []), [client, lk.sites]);
  const site = lk.sites.get(draft.siteId);

  const ordersByClient = useMemo(() => {
    const m = new Map<string, number>();
    orders.forEach((o) => m.set(o.clientId, (m.get(o.clientId) ?? 0) + 1));
    return m;
  }, [orders]);

  const list = useMemo(() => {
    const q = normalize(query);
    const terms = q ? q.split(/\s+/) : [];
    return clients
      .filter((c) => {
        if (!terms.length) return true;
        const hay = normalize(
          [c.name, c.shortName, c.segment, ...c.siteIds.map((id) => `${lk.sites.get(id)?.name} ${lk.sites.get(id)?.municipality}`)].join(" "),
        );
        return terms.every((t) => hay.includes(t));
      })
      .sort((a, b) => (ordersByClient.get(b.id) ?? 0) - (ordersByClient.get(a.id) ?? 0) || a.shortName.localeCompare(b.shortName, "es"));
  }, [clients, query, lk.sites, ordersByClient]);

  const choose = (c: Client) => {
    setDraft((d) =>
      d.clientId === c.id
        ? d
        : {
            ...d,
            clientId: c.id,
            siteId: c.siteIds.length === 1 ? c.siteIds[0] : "",
            contactName: c.contactName,
            contactPhone: c.contactPhone,
          },
    );
    setPicking(false);
  };

  const contactChanged = client && (draft.contactName !== client.contactName || draft.contactPhone !== client.contactPhone);

  return (
    <div>
      <FormSection
        title="Cliente"
        description="Solo aparecen los clientes de su unidad."
        aside={
          client && !picking ? (
            <Button type="button" variant="outline" onClick={() => setPicking(true)} className="h-10 rounded-[12px] border-line px-3.5 font-semibold">
              Cambiar
            </Button>
          ) : undefined
        }
      >
        <AnimatePresence mode="wait" initial={false}>
          {client && !picking ? (
            <motion.div
              key="selected"
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.98 }}
              transition={{ duration: 0.35, ease: EASE }}
              className="flex items-center gap-4 rounded-[20px] border border-blue-mid bg-blue-wash p-4"
            >
              <ClientMark name={client.name} hue={client.hue} size={52} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[16px] font-semibold text-ink">{client.name}</p>
                <p className="mt-0.5 truncate text-[13px] text-subtle">
                  {client.segment} · cliente desde {fmtDate(client.since)} · {plural(ordersByClient.get(client.id) ?? 0, "orden previa", "órdenes previas")}
                </p>
              </div>
              <span className="hidden size-8 items-center justify-center rounded-full bg-azure text-white sm:inline-flex">
                <Check className="size-4" strokeWidth={3} />
              </span>
            </motion.div>
          ) : (
            <motion.div key="picker" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.3, ease: EASE }}>
              <div className="relative mb-3">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 size-[17px] -translate-y-1/2 text-subtle" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar cliente, sitio o municipio"
                  aria-label="Buscar cliente"
                  className={cn(inputClass, "pl-10")}
                />
              </div>
              {list.length === 0 ? (
                <p className="rounded-[16px] border border-dashed border-line-strong px-4 py-8 text-center text-[14px] text-subtle">
                  Sin clientes que coincidan con «{query}».
                </p>
              ) : (
                <LayoutGroup id="client-pick">
                  <motion.ul layout className="grid gap-2 sm:grid-cols-2" role="listbox" aria-label="Clientes">
                    <AnimatePresence initial={false}>
                      {list.map((c, i) => {
                        const on = c.id === draft.clientId;
                        const n = ordersByClient.get(c.id) ?? 0;
                        return (
                          <motion.li
                            key={c.id}
                            layout
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0, transition: { delay: Math.min(i, 10) * 0.025, duration: 0.3, ease: EASE } }}
                            exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.15 } }}
                          >
                            <motion.button
                              type="button"
                              role="option"
                              aria-selected={on}
                              onClick={() => choose(c)}
                              whileTap={{ scale: 0.98 }}
                              className={cn(
                                "relative flex w-full items-center gap-3 rounded-[16px] border p-3 text-left transition-[border-color,box-shadow,background-color] duration-200",
                                on ? "border-blue-line bg-blue-wash" : "border-hairline bg-surface hover:border-line-strong hover:shadow-soft",
                              )}
                            >
                              <ClientMark name={c.name} hue={c.hue} size={42} />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-[14.5px] font-semibold text-ink">{c.shortName}</span>
                                <span className="block truncate text-[12.5px] text-subtle">
                                  {c.segment} · {plural(c.siteIds.length, "sitio", "sitios")}
                                  {n > 0 && ` · ${plural(n, "orden", "órdenes")}`}
                                </span>
                              </span>
                              {on && (
                                <motion.span layoutId="client-check" className="inline-flex size-6 items-center justify-center rounded-full bg-azure text-white">
                                  <Check className="size-3.5" strokeWidth={3} />
                                </motion.span>
                              )}
                            </motion.button>
                          </motion.li>
                        );
                      })}
                    </AnimatePresence>
                  </motion.ul>
                </LayoutGroup>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </FormSection>

      <AnimatePresence initial={false}>
        {client && (
          <motion.div key="rest" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.4, ease: EASE }}>
            <FormSection title="Sitio" description={sites.length > 1 ? `${client.shortName} tiene ${sites.length} sitios. Elija dónde se hará el trabajo.` : "Dirección y ubicación del servicio."}>
              <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
                <div className="space-y-2" role="radiogroup" aria-label="Sitio">
                  <LayoutGroup id="site-pick">
                    {sites.map((s) => {
                      const on = s.id === draft.siteId;
                      return (
                        <motion.button
                          key={s.id}
                          type="button"
                          role="radio"
                          aria-checked={on}
                          whileTap={{ scale: 0.985 }}
                          onClick={() => setDraft((d) => ({ ...d, siteId: s.id }))}
                          className={cn(
                            "relative flex w-full items-start gap-3 rounded-[16px] border p-3.5 text-left transition-colors",
                            on ? "border-transparent" : "border-hairline bg-surface hover:border-line-strong",
                          )}
                        >
                          {on && (
                            <motion.span
                              layoutId="site-ring"
                              className="absolute inset-0 rounded-[16px] bg-blue-wash ring-[1.5px] ring-azure"
                              transition={{ type: "spring", stiffness: 480, damping: 36 }}
                            />
                          )}
                          <span className={cn("relative mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-[11px]", on ? "bg-azure text-white" : "bg-tile text-subtle")}>
                            <MapPin className="size-[17px]" />
                          </span>
                          <span className="relative min-w-0">
                            <span className="block text-[14.5px] font-semibold text-ink">{s.name}</span>
                            <span className="mt-0.5 block text-[13px] leading-snug text-subtle">{s.address}</span>
                            <span className="mt-0.5 block text-[12.5px] font-medium text-ink/70">{s.municipality}</span>
                          </span>
                        </motion.button>
                      );
                    })}
                  </LayoutGroup>
                  <FieldMessage error={sites.length > 1 ? errorOf("site") : undefined} />
                </div>
                <div className="relative">
                  <GeoMap
                    className="h-[200px] md:h-full md:min-h-[220px]"
                    markers={(site ? [site] : sites).map((s) => ({ lat: s.lat, lng: s.lng, kind: "site" as const, label: s.name }))}
                    zoom={15}
                    interactive={false}
                  />
                  {!site && sites.length > 1 && (
                    <span className="pointer-events-none absolute inset-x-3 bottom-3 z-[500] rounded-[12px] bg-surface/90 px-3 py-2 text-center text-[12.5px] font-medium text-ink shadow-soft backdrop-blur">
                      Elija un sitio para fijar la ubicación
                    </span>
                  )}
                </div>
              </div>
            </FormSection>

            <FormSection
              title="Contacto en sitio"
              description="Quién recibe a la cuadrilla y firma la conformidad."
              aside={
                contactChanged ? (
                  <button
                    type="button"
                    onClick={() => setDraft((d) => ({ ...d, contactName: client.contactName, contactPhone: client.contactPhone }))}
                    className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-[12px] px-2.5 text-[13px] font-medium text-link hover:bg-blue-wash"
                  >
                    <RotateCcw className="size-3.5" />
                    <span className="hidden sm:inline">Usar contacto del cliente</span>
                    <span className="sm:hidden">Restablecer</span>
                  </button>
                ) : undefined
              }
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <FieldLabel htmlFor="no-contact-name">Nombre</FieldLabel>
                  <div className="relative">
                    <UserRound className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-subtle" />
                    <Input
                      id="no-contact-name"
                      value={draft.contactName}
                      onChange={(e) => setDraft((d) => ({ ...d, contactName: e.target.value }))}
                      onBlur={() => touch("contactName")}
                      aria-invalid={!!errorOf("contactName")}
                      autoComplete="off"
                      className={cn(inputClass, "pl-10")}
                    />
                  </div>
                  <FieldMessage error={errorOf("contactName")} hint={!contactChanged ? "Precargado del contacto del cliente." : undefined} />
                </div>
                <div>
                  <FieldLabel htmlFor="no-contact-phone">Teléfono</FieldLabel>
                  <div className="relative">
                    <Phone className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-subtle" />
                    <Input
                      id="no-contact-phone"
                      type="tel"
                      inputMode="tel"
                      value={draft.contactPhone}
                      onChange={(e) => setDraft((d) => ({ ...d, contactPhone: e.target.value }))}
                      onBlur={() => touch("contactPhone")}
                      aria-invalid={!!errorOf("contactPhone")}
                      placeholder="+52 81 1234 5678"
                      className={cn(inputClass, "pl-10 tabular")}
                    />
                  </div>
                  <FieldMessage error={errorOf("contactPhone")} hint="Se usa para compartir el reporte por WhatsApp." />
                </div>
              </div>
            </FormSection>

            <FormSection title="Autorización comercial" description="El trabajo ya viene autorizado por el sistema comercial externo; aquí solo se vincula.">
              <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_auto]">
                <div>
                  <FieldLabel htmlFor="no-ref">Referencia del sistema comercial</FieldLabel>
                  <div className="relative">
                    <Link2 className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-subtle" />
                    <Input
                      id="no-ref"
                      value={draft.commercialRef}
                      onChange={(e) => setDraft((d) => ({ ...d, commercialRef: e.target.value.toUpperCase() }))}
                      onBlur={() => touch("commercialRef")}
                      aria-invalid={!!errorOf("commercialRef")}
                      aria-describedby="no-ref-msg"
                      placeholder="COT-2026-1187"
                      autoComplete="off"
                      spellCheck={false}
                      className={cn(inputClass, "pl-10 font-mono uppercase tracking-wide")}
                    />
                  </div>
                  <FieldMessage
                    id="no-ref-msg"
                    error={errorOf("commercialRef")}
                    warning={issues.warnings.commercialRefDup ?? (draft.commercialRef ? issues.warnings.commercialRef : undefined)}
                    hint="Vincula la orden con la cotización autorizada. Pulkro Cuadrillas no cotiza ni autoriza trabajos."
                  />
                </div>
                <div>
                  <FieldLabel>Prioridad</FieldLabel>
                  <Segmented
                    id="no-priority"
                    items={[
                      { value: "normal", label: "Normal" },
                      { value: "alta", label: "Alta" },
                    ]}
                    value={draft.priority}
                    onChange={(v) => setDraft((d) => ({ ...d, priority: v }))}
                    className="h-11 [&_button]:px-5"
                  />
                  <AnimatePresence initial={false}>
                    {draft.priority === "alta" && (
                      <motion.p
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="flex items-center gap-1.5 overflow-hidden pt-1.5 text-[12.5px] text-red-fg"
                      >
                        <motion.span animate={{ rotate: [0, -12, 10, 0] }} transition={{ duration: 0.5 }} className="inline-flex">
                          <Flame className="size-3.5" />
                        </motion.span>
                        Se destaca en listas y agenda.
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </FormSection>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
