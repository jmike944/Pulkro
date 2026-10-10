"use client";

import { useMemo } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { ArrowUpRight, CircleCheck, Navigation, Phone, ScrollText } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLookups } from "@/lib/hooks";
import { jornadaMinutes, mapsLink } from "@/lib/domain";
import { fmtDuration, fmtTime } from "@/lib/format";
import { ClientMark } from "@/components/pk/client-mark";
import type { GeoMarker } from "@/components/pk/geo-map";
import { KeyValues, Panel } from "@/components/pk/bits";
import { OrderStatusPill, StatusDot } from "@/components/pk/status";
import { rowVariants, staggerContainer } from "@/components/pk/motion";
import { Button } from "@/components/ui/button";
import { StableMap, fmtShortDay } from "./field-bits";
import type { FieldReady } from "./use-field-state";

/** Right rail (desktop) / bottom block (phone): order context, map, jornadas, scope of work. */
export function OrderRail({ f }: { f: FieldReady }) {
  const { order, client, site, serviceType, supervisor, jornada, jornadas } = f;
  const { materials } = useLookups();

  const { checkIn, checkOut, status } = jornada;
  const map = useMemo(() => {
    const markers: GeoMarker[] = [{ lat: site.lat, lng: site.lng, kind: "site", label: "Sitio", tooltip: site.name }];
    if (checkIn) markers.push({ lat: checkIn.lat, lng: checkIn.lng, kind: status === "en_curso" ? "live" : "checkin", tooltip: `Entrada ${fmtTime(checkIn.deviceAt)}` });
    if (checkOut) markers.push({ lat: checkOut.lat, lng: checkOut.lng, kind: "checkout", tooltip: `Salida ${fmtTime(checkOut.deviceAt)}` });
    const accuracy = checkIn ? { lat: checkIn.lat, lng: checkIn.lng, radius: checkIn.accuracy } : undefined;
    return { markers, accuracy };
  }, [site, checkIn, checkOut, status]);

  return (
    <div className="space-y-5">
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
            <Button asChild variant="outline" className="h-10 flex-1 rounded-[12px] border-[#dfe3ea] font-semibold">
              <a href={mapsLink(site.lat, site.lng)} target="_blank" rel="noreferrer">
                <Navigation /> Cómo llegar
              </a>
            </Button>
            {order.siteContact.phone && (
              <Button asChild variant="outline" className="h-10 rounded-[12px] border-[#dfe3ea] px-3.5" aria-label={`Llamar a ${order.siteContact.name}`}>
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

      {jornadas.length > 1 && (
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
                      current ? "bg-brand-deep text-white" : j.status === "cerrada" ? "bg-[#e7f7f4] text-st-teal" : "bg-[#f2f4f7] text-ink",
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
                  {current && <span className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-[#1667e0]">Aquí</span>}
                </>
              );
              return (
                <motion.li key={j.id} variants={rowVariants}>
                  {current ? (
                    <div aria-current="page" className="flex items-center gap-3 rounded-[14px] bg-sky-soft px-2.5 py-2">
                      {body}
                    </div>
                  ) : (
                    <Link href={`/jornada/${j.id}`} className="flex min-h-11 items-center gap-3 rounded-[14px] px-2.5 py-2 transition hover:bg-muted">
                      {body}
                    </Link>
                  )}
                </motion.li>
              );
            })}
          </motion.ul>
        </Panel>
      )}

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
          <div className="rounded-[16px] bg-[#f4f8fd] p-4">
            <p className="mb-1 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.1em] text-[#1667e0]">
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
    </div>
  );
}
