"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Building2, ChevronDown, ClipboardList, MapPin, MessageCircle, Pencil, Phone, Plus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAppStore, useCan, useLookups, useScopedData, useShallow } from "@/lib/hooks";
import { whatsappLink } from "@/lib/domain";
import { firstName, fmtCoords, fmtDate, plural } from "@/lib/format";
import type { Client, ClientSegment, Site } from "@/lib/types";
import { ClientMark } from "@/components/pk/client-mark";
import { GeoMap } from "@/components/pk/geo-map";
import { Segmented } from "@/components/pk/page";
import { EmptyState } from "@/components/pk/feedback";
import { EASE, rowVariants, staggerContainer } from "@/components/pk/motion";
import { ReasonTip } from "@/components/pk/reason-tip";
import { Button } from "@/components/ui/button";
import { GatedButton, ListHead, NO_CATALOGS, SearchField, norm, useDialogTarget } from "./shared";
import { useCatalogUnit } from "./use-catalog-unit";
import { ClientDialog } from "./client-dialog";
import { SiteDialog } from "./site-dialog";

type SegmentFilter = "all" | ClientSegment;

export function ClientsCatalog() {
  const { clients, sites } = useAppStore(useShallow((s) => ({ clients: s.clients, sites: s.sites })));
  const { orders } = useScopedData();
  const lk = useLookups();
  const unit = useCatalogUnit();
  const canEdit = useCan("catalogs.admin");
  const [segment, setSegment] = useState<SegmentFilter>("all");
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const clientDlg = useDialogTarget<Client | "new">();
  const siteDlg = useDialogTarget<{ client: Client; site: Site | null }>();

  const ordersBy = useMemo(() => {
    const m = new Map<string, number>();
    orders.forEach((o) => m.set(o.clientId, (m.get(o.clientId) ?? 0) + 1));
    return m;
  }, [orders]);

  const sitesBy = useMemo(() => {
    const m = new Map<string, Site[]>();
    sites.forEach((s) => m.set(s.clientId, [...(m.get(s.clientId) ?? []), s]));
    return m;
  }, [sites]);

  const list = useMemo(() => {
    const term = norm(q.trim());
    return clients
      .filter((c) => unit === "all" || c.unitId === unit)
      .filter((c) => segment === "all" || c.segment === segment)
      .filter((c) => !term || norm(`${c.name} ${c.shortName} ${c.contactName} ${(sitesBy.get(c.id) ?? []).map((s) => `${s.name} ${s.municipality}`).join(" ")}`).includes(term))
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
  }, [clients, unit, segment, q, sitesBy]);

  const defaultUnit = unit === "all" ? "u_mty" : unit;

  return (
    <section>
      <div className="mb-5 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="scrollbar-none -mx-1 overflow-x-auto px-1">
            <Segmented<SegmentFilter>
              id="client-segment"
              value={segment}
              onChange={setSegment}
              items={[
                { value: "all", label: "Todos" },
                { value: "Industrial", label: "Industrial" },
                { value: "Comercial", label: "Comercial" },
                { value: "Residencial", label: "Residencial" },
              ]}
            />
          </div>
          <SearchField value={q} onChange={setQ} placeholder="Buscar cliente, contacto o sitio" className="sm:w-[280px]" />
        </div>
        <GatedButton allowed={canEdit} reason={NO_CATALOGS} onClick={() => clientDlg.show("new")} className="self-start xl:self-auto">
          <Plus className="size-4" /> Nuevo cliente
        </GatedButton>
      </div>

      {list.length === 0 ? (
        <EmptyState icon={<Building2 />} title="Sin clientes">
          No hay clientes que coincidan en {unit === "all" ? "las unidades" : lk.units.get(unit)?.name ?? "esta unidad"}.
        </EmptyState>
      ) : (
        <div>
          <ListHead className="lg:hidden xl:grid grid-cols-[minmax(0,1.4fr)_140px_minmax(0,1fr)_76px_40px]">
            <span>Cliente</span>
            <span>Segmento</span>
            <span>Contacto</span>
            <span className="text-right">Sitios</span>
            <span />
          </ListHead>
          <motion.ul variants={staggerContainer(0.035, 0.05)} initial="hidden" animate="show">
            {list.map((c) => {
              const cs = sitesBy.get(c.id) ?? [];
              const isOpen = expanded === c.id;
              return (
                <motion.li key={c.id} variants={rowVariants} className="border-b border-hairline">
                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : c.id)}
                    aria-expanded={isOpen}
                    className="group grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 py-4 text-left xl:grid-cols-[minmax(0,1.4fr)_140px_minmax(0,1fr)_76px_40px] xl:gap-x-4"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <ClientMark name={c.name} hue={c.hue} size={42} />
                      <div className="min-w-0">
                        <p className="truncate text-[16px] font-semibold text-ink xl:text-[15px] group-hover:text-link">{c.name}</p>
                        <p className="truncate text-[13px] text-subtle">
                          {plural(ordersBy.get(c.id) ?? 0, "orden", "órdenes")} · desde {fmtDate(c.since)}
                        </p>
                      </div>
                    </div>
                    <div className="col-start-1 row-start-2 flex items-center gap-2 pl-[54px] text-[13px] xl:col-start-auto xl:row-start-auto xl:block xl:pl-0">
                      <p className="font-medium text-ink">{c.segment}</p>
                      <p className="text-subtle xl:mt-0.5">{lk.units.get(c.unitId)?.code}</p>
                    </div>
                    <div className="hidden min-w-0 text-[13px] xl:block">
                      <p className="truncate text-ink">{c.contactName}</p>
                      <p className="truncate text-subtle tabular">{c.contactPhone}</p>
                    </div>
                    <span className="hidden text-right text-[15px] font-semibold text-ink tabular xl:block">{cs.length}</span>
                    <span className="col-start-2 row-span-2 row-start-1 flex items-center gap-2 xl:col-start-auto xl:row-span-1 xl:row-start-auto xl:justify-end">
                      <span className="rounded-md bg-tile px-1.5 py-0.5 text-[12px] font-semibold text-subtle tabular xl:hidden">
                        {cs.length} {cs.length === 1 ? "sitio" : "sitios"}
                      </span>
                      <motion.span
                        animate={{ rotate: isOpen ? 180 : 0 }}
                        transition={{ type: "spring", stiffness: 400, damping: 28 }}
                        className="inline-flex size-10 items-center justify-center rounded-full text-subtle transition group-hover:bg-muted group-hover:text-ink"
                      >
                        <ChevronDown className="size-[18px]" />
                      </motion.span>
                    </span>
                  </button>

                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        key="detail"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.35, ease: EASE }}
                        className="overflow-hidden"
                      >
                        <ClientDetail
                          client={c}
                          sites={cs}
                          canEdit={canEdit}
                          onEditClient={() => clientDlg.show(c)}
                          onEditSite={(site) => siteDlg.show({ client: c, site })}
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.li>
              );
            })}
          </motion.ul>
        </div>
      )}

      {clientDlg.target && (
        <ClientDialog
          key={clientDlg.key}
          client={clientDlg.target === "new" ? null : clientDlg.target}
          defaultUnit={defaultUnit}
          open={clientDlg.open}
          onOpenChange={clientDlg.onOpenChange}
          onCreated={(c) => {
            setExpanded(c.id);
            toast.success(`Cliente ${c.shortName} creado`, {
              description: "Agregue su primer sitio para poder programar órdenes.",
              action: { label: "Agregar sitio", onClick: () => siteDlg.show({ client: c, site: null }) },
            });
          }}
        />
      )}
      {siteDlg.target && (
        <SiteDialog key={siteDlg.key} client={siteDlg.target.client} site={siteDlg.target.site} open={siteDlg.open} onOpenChange={siteDlg.onOpenChange} />
      )}
    </section>
  );
}

function ClientDetail({
  client,
  sites,
  canEdit,
  onEditClient,
  onEditSite,
}: {
  client: Client;
  sites: Site[];
  canEdit: boolean;
  onEditClient: () => void;
  onEditSite: (s: Site | null) => void;
}) {
  // Orders are created by Administración only: Dirección (catalogs.admin, order.create=false) gets no link into the wizard.
  const canCreateOrder = useCan("order.create");
  return (
    <div className="mb-5 grid gap-5 rounded-[20px] bg-soft p-4 sm:p-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-subtle">Sitios · {sites.length}</p>
          <div className="flex flex-wrap gap-2">
            <GatedButton allowed={canEdit} reason={NO_CATALOGS} variant="outline" onClick={onEditClient} className="border-line bg-surface">
              <Pencil className="size-4" /> Editar cliente
            </GatedButton>
            <GatedButton allowed={canEdit} reason={NO_CATALOGS} onClick={() => onEditSite(null)}>
              <Plus className="size-4" /> Agregar sitio
            </GatedButton>
          </div>
        </div>
        {sites.length === 0 ? (
          <p className="mt-4 rounded-[14px] border border-dashed border-line-strong bg-surface px-4 py-6 text-center text-[13.5px] text-subtle">
            Sin sitios registrados. Agregue uno para poder programar órdenes.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {sites.map((s, i) => (
              <motion.li
                key={s.id}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.08 + i * 0.05, duration: 0.3, ease: EASE }}
                className="flex items-center gap-3 rounded-[16px] bg-surface p-3 ring-1 ring-hairline"
              >
                <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-[11px] bg-press text-brand-ink">
                  <MapPin className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-semibold text-ink">{s.name}</p>
                  <p className="truncate text-[12.5px] text-subtle">
                    {s.address} · {s.municipality}
                  </p>
                  <p className="text-[11.5px] text-faint tabular">{fmtCoords(s.lat, s.lng)}</p>
                </div>
                {/* a title attribute never shows on touch: ReasonTip opens the reason on tap */}
                <ReasonTip reason={canEdit ? undefined : NO_CATALOGS} contentClassName="max-w-[260px] text-[12.5px] leading-snug">
                  <span tabIndex={canEdit ? undefined : 0} className="inline-flex shrink-0 rounded-[12px] outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                    <Button variant="ghost" size="icon" onClick={() => onEditSite(s)} disabled={!canEdit} aria-label={`Editar sitio ${s.name}`} className="size-11 shrink-0 rounded-[12px] xl:size-10">
                      <Pencil className="size-4" />
                    </Button>
                  </span>
                </ReasonTip>
              </motion.li>
            ))}
          </ul>
        )}
        <div className="mt-4 grid gap-2 text-[13px] sm:grid-cols-2">
          <p className="min-w-0 truncate text-subtle">
            Contacto: <span className="font-medium text-ink">{client.contactName}</span>
          </p>
          <p className="min-w-0 truncate text-subtle sm:text-right">
            <a href={`mailto:${client.contactEmail}`} className="text-link hover:underline">
              {client.contactEmail}
            </a>
          </p>
        </div>
        {/* the "Contacto" column (phone) only exists from xl: below it, call / WhatsApp live here */}
        {client.contactPhone && (
          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:hidden">
            <Button asChild variant="outline" className="h-11 min-w-0 rounded-[12px] border-line bg-surface px-3 font-semibold">
              <a href={`tel:${client.contactPhone.replace(/\s/g, "")}`} aria-label={`Llamar a ${client.contactName}: ${client.contactPhone}`}>
                <Phone className="size-4 shrink-0" /> <span className="truncate tabular">{client.contactPhone}</span>
              </a>
            </Button>
            <Button asChild variant="outline" className="h-11 min-w-0 rounded-[12px] border-line bg-surface px-3 font-semibold">
              <a
                href={whatsappLink(client.contactPhone, `Hola ${firstName(client.contactName)}, le saluda Pulkro Compañía de Servicios.`)}
                target="_blank"
                rel="noreferrer"
                aria-label={`Escribir por WhatsApp a ${client.contactName}`}
              >
                <MessageCircle className="size-4 shrink-0" /> WhatsApp
              </a>
            </Button>
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button asChild variant="outline" className="h-10 rounded-[12px] border-line bg-surface px-4 font-semibold">
            <Link href={`/clientes/${client.id}`}>
              <Building2 className="size-4" /> Ver ficha
            </Link>
          </Button>
          {canCreateOrder && (
            <Button asChild variant="outline" className="h-10 rounded-[12px] border-line bg-surface px-4 font-semibold">
              <Link href={`/ordenes/nueva?cliente=${client.id}`}>
                <ClipboardList className="size-4" /> Nueva orden
              </Link>
            </Button>
          )}
        </div>
      </div>
      <div className={cn("min-w-0", sites.length === 0 && "hidden xl:block")}>
        {sites.length > 0 ? (
          <GeoMap
            className="h-[220px] xl:h-full xl:min-h-[240px]"
            markers={sites.map((s) => ({ lat: s.lat, lng: s.lng, kind: "site" as const, label: s.name, tooltip: s.address }))}
            zoom={14}
          />
        ) : (
          <div className="flex h-full min-h-[220px] items-center justify-center rounded-[20px] bg-surface text-[13px] text-subtle ring-1 ring-hairline">Sin ubicaciones</div>
        )}
      </div>
    </div>
  );
}
