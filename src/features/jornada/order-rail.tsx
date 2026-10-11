"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { ArrowUpRight, CircleCheck, ClipboardList, Navigation, Phone, ScrollText, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLookups } from "@/lib/hooks";
import { jornadaMinutes, mapsLink } from "@/lib/domain";
import { fmtDuration, fmtTime } from "@/lib/format";
import { ClientMark } from "@/components/pk/client-mark";
import type { GeoMarker } from "@/components/pk/geo-map";
import { KeyValues, Panel } from "@/components/pk/bits";
import { MobileRow } from "@/components/pk/mobile";
import { OrderStatusPill, StatusDot } from "@/components/pk/status";
import { rowVariants, staggerContainer } from "@/components/pk/motion";
import { BottomSheet } from "@/components/shell/bottom-sheet";
import { Button } from "@/components/ui/button";
import { StableMap, fmtShortDay } from "./field-bits";
import type { FieldReady } from "./use-field-state";

/** Right rail on wide layouts: order context, map, jornadas, scope of work. */
export function OrderRail({ f }: { f: FieldReady }) {
  return (
    <div className="space-y-5">
      <OrderMapCard f={f} />
      <JornadaSwitcher f={f} />
      <ScopePanel f={f} />
    </div>
  );
}

/**
 * Narrow layouts (phones, tablets, small laptops): the rail's content opens from a compact row right under
 * the hero instead of sitting at the very end of the page, after the whole bitácora.
 */
export function OrderContextRow({ f }: { f: FieldReady }) {
  const [open, setOpen] = useState(false);
  const { order, client } = f;
  return (
    <>
      <div className="rounded-[22px] border border-hairline bg-surface px-4 shadow-soft">
        <MobileRow
          onClick={() => setOpen(true)}
          leading={
            <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-sky-soft text-azure-fg">
              <ClipboardList className="size-5" />
            </span>
          }
          title="Datos de la orden"
          meta="Contacto, materiales y mapa"
          status={order.specialInstructions ? { tone: "amber", label: "Tiene instrucciones especiales" } : undefined}
        />
      </div>
      <BottomSheet open={open} onOpenChange={setOpen} title="Datos de la orden" description={`${order.folio} · ${client.shortName}`}>
        <div className="space-y-4 pb-2">
          <ContactCard f={f} />
          <ScopePanel f={f} />
          <JornadaSwitcher f={f} onNavigate={() => setOpen(false)} />
          <OrderMapCard f={f} showCall={false} />
        </div>
      </BottomSheet>
    </>
  );
}

/** Site contact with a one-tap call (the supervisor's most common reason to open this panel). */
function ContactCard({ f }: { f: FieldReady }) {
  const { name, phone } = f.order.siteContact;
  return (
    <Panel className="flex items-center gap-3.5 p-4 sm:p-4">
      <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-sand text-ink">
        <UserRound className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-subtle">Contacto en sitio</p>
        <p className="truncate text-[15px] font-semibold text-ink">{name}</p>
        {phone && <p className="truncate text-[13.5px] text-subtle tabular">{phone}</p>}
      </div>
      {phone && (
        <Button asChild className="h-11 shrink-0 rounded-[12px] px-4 font-semibold" aria-label={`Llamar a ${name}`}>
          <a href={`tel:${phone.replace(/\s/g, "")}`}>
            <Phone /> Llamar
          </a>
        </Button>
      )}
    </Panel>
  );
}

/** Client, check-in/out map, directions and the order's key facts. */
function OrderMapCard({ f, showCall = true }: { f: FieldReady; showCall?: boolean }) {
  const { order, client, site, serviceType, supervisor, jornada } = f;

  const { checkIn, checkOut, status } = jornada;
  const map = useMemo(() => {
    const markers: GeoMarker[] = [{ lat: site.lat, lng: site.lng, kind: "site", label: "Sitio", tooltip: site.name }];
    // Supervisión remota is where the supervisor was (or the site's own coordinates as a stand-in): never drawn as a pin on site.
    const inFix = checkIn && checkIn.source !== "remota" ? checkIn : undefined;
    const outFix = checkOut && checkOut.source !== "remota" ? checkOut : undefined;
    if (inFix) markers.push({ lat: inFix.lat, lng: inFix.lng, kind: status === "en_curso" ? "live" : "checkin", tooltip: `Entrada ${fmtTime(inFix.deviceAt)}` });
    if (outFix) markers.push({ lat: outFix.lat, lng: outFix.lng, kind: "checkout", tooltip: `Salida ${fmtTime(outFix.deviceAt)}` });
    const accuracy = inFix ? { lat: inFix.lat, lng: inFix.lng, radius: inFix.accuracy } : undefined;
    return { markers, accuracy };
  }, [site, checkIn, checkOut, status]);

  return (
    <Panel className="overflow-hidden p-0 sm:p-0">
      <div className="flex items-start gap-3.5 p-5 pb-4">
        <ClientMark name={client.name} hue={client.hue} size={44} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-ink">{client.name}</p>
          <p className="truncate text-[13px] text-subtle">
            {client.segment} · {serviceType.name}
          </p>
        </div>
      </div>
      <div className="px-3">
        <StableMap markers={map.markers} accuracy={map.accuracy} connect={map.markers.length > 1} className="h-[190px]" />
      </div>
      <div className="space-y-5 p-5">
        <div className="flex gap-2">
          {/* 44px tap target on narrow layouts; the wide rail keeps its 40px buttons */}
          <Button asChild variant="outline" className="h-11 flex-1 rounded-[12px] border-line font-semibold @min-[880px]:h-10">
            <a href={mapsLink(site.lat, site.lng)} target="_blank" rel="noreferrer">
              <Navigation /> Cómo llegar
            </a>
          </Button>
          {showCall && order.siteContact.phone && (
            <Button asChild variant="outline" className="h-11 rounded-[12px] border-line px-3.5 @min-[880px]:h-10" aria-label={`Llamar a ${order.siteContact.name}`}>
              <a href={`tel:${order.siteContact.phone.replace(/\s/g, "")}`}>
                <Phone />
              </a>
            </Button>
          )}
        </div>
        <KeyValues
          rows={[
            {
              k: "Orden",
              v: (
                <Link href={`/ordenes/${order.folio}`} className="-my-2.5 inline-flex items-center gap-1 py-2.5 font-semibold text-link hover:underline">
                  {order.folio} <ArrowUpRight className="size-3.5" />
                </Link>
              ),
            },
            { k: "Estado", v: <OrderStatusPill status={order.status} /> },
            { k: "Sitio", v: site.name },
            { k: "Dirección", v: <span className="text-[13.5px] leading-snug">{`${site.address}, ${site.municipality}`}</span> },
            { k: "Contacto", v: <span className="leading-snug">{order.siteContact.name}</span> },
            { k: "Supervisor", v: supervisor?.name ?? "—" },
            ...(order.commercialRef ? [{ k: "Ref. comercial", v: <span className="tabular">{order.commercialRef}</span> }] : []),
          ]}
        />
      </div>
    </Panel>
  );
}

/** Sibling jornadas of the order (J1/J2/J3) with a link to each. */
function JornadaSwitcher({ f, onNavigate }: { f: FieldReady; onNavigate?: () => void }) {
  const { jornada, jornadas } = f;
  if (jornadas.length < 2) return null;
  return (
    <Panel className="p-5 sm:p-5">
      <p className="mb-3 text-[12px] font-semibold uppercase tracking-[0.1em] text-subtle">Jornadas de la orden · {jornadas.length}</p>
      <motion.ul variants={staggerContainer(0.05, 0.1)} initial="hidden" animate="show" className="space-y-1.5">
        {jornadas.map((j) => {
          const current = j.id === jornada.id;
          const tone = j.status === "en_curso" ? "sky" : j.status === "cerrada" ? "teal" : "blue";
          const body = (
            <>
              <span
                className={cn(
                  "inline-flex size-9 shrink-0 items-center justify-center rounded-[11px] text-[13px] font-bold tabular",
                  current ? "bg-brand-deep text-white" : j.status === "cerrada" ? "bg-teal-soft text-teal-fg" : "bg-tile text-ink",
                )}
              >
                {j.status === "cerrada" && !current ? <CircleCheck className="size-4" /> : `J${j.dayIndex}`}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-medium text-ink">
                  {fmtShortDay(j.plannedStart)} · {fmtTime(j.plannedStart)}–{fmtTime(j.plannedEnd)}
                </span>
                <span className="flex items-center gap-1.5 text-[12.5px] text-subtle">
                  <StatusDot tone={tone} live={j.status === "en_curso"} />
                  {j.status === "en_curso" ? "En curso" : j.status === "cerrada" ? `Cerrada · ${fmtDuration(jornadaMinutes(j))}` : "Pendiente"}
                </span>
              </span>
              {current && <span className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-azure-fg">Aquí</span>}
            </>
          );
          return (
            <motion.li key={j.id} variants={rowVariants}>
              {current ? (
                <div aria-current="page" className="flex items-center gap-3 rounded-[14px] bg-sky-soft px-2.5 py-2">
                  {body}
                </div>
              ) : (
                <Link href={`/jornada/${j.id}`} onClick={onNavigate} className="flex min-h-11 items-center gap-3 rounded-[14px] px-2.5 py-2 transition hover:bg-muted">
                  {body}
                </Link>
              )}
            </motion.li>
          );
        })}
      </motion.ul>
    </Panel>
  );
}

/** What the crew has to do: activities, special instructions and the material list. */
function ScopePanel({ f }: { f: FieldReady }) {
  const { order } = f;
  const { materials } = useLookups();
  return (
    <Panel className="space-y-5 p-5 sm:p-5">
      <div>
        <p className="mb-3 text-[12px] font-semibold uppercase tracking-[0.1em] text-subtle">Actividades</p>
        <ul className="space-y-2">
          {order.activities.map((a) => (
            <li key={a} className="flex gap-2.5 text-[14px] leading-snug text-ink">
              <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-sky" />
              {a}
            </li>
          ))}
        </ul>
      </div>
      {order.specialInstructions && (
        <div className="rounded-[16px] bg-blue-wash p-4">
          <p className="mb-1 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.1em] text-azure-fg">
            <ScrollText className="size-3.5" /> Instrucciones especiales
          </p>
          <p className="text-[14px] leading-relaxed text-ink">{order.specialInstructions}</p>
        </div>
      )}
      {order.materials.length > 0 && (
        <div>
          <p className="mb-3 text-[12px] font-semibold uppercase tracking-[0.1em] text-subtle">Materiales</p>
          <ul className="divide-y divide-hairline">
            {order.materials.map((m) => {
              const mat = materials.get(m.materialId);
              return (
                <li key={m.materialId} className="flex items-baseline justify-between gap-4 py-2 text-[14px]">
                  <span className="min-w-0 text-ink">{mat?.name ?? m.materialId}</span>
                  <span className="shrink-0 font-semibold text-ink tabular">
                    {m.qty} {mat?.unit}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Panel>
  );
}
