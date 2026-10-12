"use client";

import { useMemo } from "react";
import { motion } from "motion/react";
import { ArrowUpRight, MapPin, Navigation, Phone, UserRoundPlus, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { mapsLink } from "@/lib/domain";
import { fmtDateTime, plural } from "@/lib/format";
import { distanceMeters, GeoMap, type GeoMarker } from "@/components/pk/geo-map";
import { AvatarStack, Eyebrow, IconTile, KeyValues, PersonAvatar } from "@/components/pk/bits";
import { rowVariants, staggerContainer } from "@/components/pk/motion";
import { Button } from "@/components/ui/button";
import { compact, crewNames, fmtWeekdayDay } from "./orden-format";
import { useOrder } from "./order-context";
import { Gated } from "./ui";

/**
 * Phones and tablets: where to go, who to call on site and who is on the crew, right under the
 * next-action card (below lg SitePanel/CrewPanel sit after the timeline, breakdown and hours).
 */
export function SiteQuickCard({ className }: { className?: string }) {
  const { d } = useOrder();
  const { order, site } = d;
  const crew = d.currentCrew;
  const phone = order.siteContact.phone;
  return (
    <section aria-label="Sitio y contacto" className={cn("rounded-[22px] border border-hairline bg-surface p-4 shadow-soft sm:p-5 lg:hidden", className)}>
      <div className="flex items-start gap-3">
        <IconTile>
          <MapPin />
        </IconTile>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-ink">{site.name}</p>
          <p className="text-[13.5px] leading-snug text-subtle">
            {site.address}, {site.municipality}
          </p>
          {order.siteContact.name && (
            <p className="mt-1 text-[13px] text-subtle">
              Contacto: <span className="font-medium text-ink">{order.siteContact.name}</span>
            </p>
          )}
        </div>
      </div>
      <div className="mt-3.5 flex gap-2">
        {!site.unavailable && (
          <Button asChild variant="outline" className="h-11 min-w-0 flex-1 rounded-[12px] border-line font-semibold">
            <a href={mapsLink(site.lat, site.lng)} target="_blank" rel="noreferrer">
              <Navigation /> Cómo llegar
            </a>
          </Button>
        )}
        {phone && (
          <Button asChild variant="outline" className="h-11 min-w-0 flex-1 rounded-[12px] border-line font-semibold">
            <a href={`tel:${phone.replace(/\s/g, "")}`} aria-label={`Llamar a ${order.siteContact.name || "contacto en sitio"}`}>
              <Phone /> Llamar
            </a>
          </Button>
        )}
      </div>
      {crew.length > 0 && (
        <div className="mt-3.5 flex items-center gap-2.5 border-t border-hairline pt-3.5">
          <AvatarStack people={crew} size={28} max={4} />
          <p className="min-w-0 flex-1 text-[13px] leading-snug text-subtle">
            <span className="font-medium text-ink">Cuadrilla · {crew.length}</span> · {crewNames(crew)}
          </p>
        </div>
      )}
    </section>
  );
}

/** SITIO: client, address, contact + map with site and check-in/out markers. */
export function SitePanel() {
  const { d } = useOrder();
  const { order, client, site, jornadas } = d;

  // Map the jornada in progress, or the latest one with GPS stamps.
  const stamped = d.live ?? [...jornadas].reverse().find((j) => j.checkIn);
  // Supervisión remota is where the supervisor was (or the site's own coordinates as a stand-in): never a pin, a distance or a
  // precision at the site (same rule as the jornada map and the client report).
  const inFix = stamped?.checkIn && stamped.checkIn.source !== "remota" ? stamped.checkIn : undefined;
  const outFix = stamped?.checkOut && stamped.checkOut.source !== "remota" ? stamped.checkOut : undefined;
  const markers = useMemo(() => {
    // A site not on this device has no location: no pin, no distance to it.
    const m: GeoMarker[] = site.unavailable ? [] : [{ lat: site.lat, lng: site.lng, kind: "site", label: "Sitio", tooltip: site.name }];
    if (stamped && inFix) m.push({ lat: inFix.lat, lng: inFix.lng, kind: stamped.checkOut ? "checkin" : "live", label: "Entrada", tooltip: `Jornada ${stamped.dayIndex}` });
    if (stamped && outFix) m.push({ lat: outFix.lat, lng: outFix.lng, kind: "checkout", label: "Salida", tooltip: `Jornada ${stamped.dayIndex}` });
    return m;
  }, [site, stamped, inFix, outFix]);
  const dist = inFix && !site.unavailable ? Math.round(distanceMeters(site, inFix)) : null;

  return (
    <section>
      <KeyValues
        title="Sitio"
        rows={[
          { k: "Cliente", v: client.name },
          { k: "Sitio", v: site.name },
          { k: "Dirección", v: <span className="font-normal leading-snug">{site.address}</span> },
          { k: "Municipio", v: site.municipality },
          { k: "Contacto", v: order.siteContact.name || "—" },
          {
            k: "Teléfono",
            v: order.siteContact.phone ? (
              <a href={`tel:${order.siteContact.phone.replace(/\s/g, "")}`} className="text-link tabular hover:underline">
                {order.siteContact.phone}
              </a>
            ) : (
              "—"
            ),
          },
        ]}
      />
      {/* Without the site's pin, a line from the entrada to the salida would read as a route between them. */}
      <GeoMap
        markers={markers}
        connect={!site.unavailable}
        accuracy={inFix ? { lat: inFix.lat, lng: inFix.lng, radius: inFix.accuracy } : undefined}
        className="mt-5 h-[210px]"
      />
      <div className="mt-2.5 flex items-center justify-between gap-3 text-[12.5px] text-subtle">
        <span className={cn("min-w-0", inFix && dist === null ? "leading-snug" : "truncate")}>
          {stamped?.checkIn?.source === "remota"
            ? `Entrada J${stamped.dayIndex} por supervisión remota`
            : stamped && inFix && dist !== null
              ? `Entrada J${stamped.dayIndex} a ${dist} m del sitio · ${inFix.source === "manual" ? "ubicación manual" : `±${Math.round(inFix.accuracy)} m`}`
              : stamped && inFix
                ? // A fix is recorded, but the site's location is not on this device yet: no distance to measure.
                  `${inFix.source === "manual" ? "Ubicación manual" : "Registro GPS"} de la entrada J${stamped.dayIndex} · la ubicación del sitio aún no está en este dispositivo`
                : "Sin registros GPS todavía"}
        </span>
        {!site.unavailable && (
          <a href={mapsLink(site.lat, site.lng)} target="_blank" rel="noreferrer" className="inline-flex min-h-11 shrink-0 items-center gap-1 font-semibold text-link lg:min-h-0">
            Abrir en Maps <ArrowUpRight className="size-3.5" />
          </a>
        )}
      </div>
    </section>
  );
}

/** CUADRILLA: current crew with specialty + change crew (supervisor only). */
export function CrewPanel() {
  const { d, ui } = useOrder();
  const crew = d.currentCrew;
  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <Eyebrow>Cuadrilla · {crew.length}</Eyebrow>
        <Gated gate={d.gates.crew}>
          <Button variant="outline" disabled={!d.gates.crew.ok} onClick={() => ui.openCrew()} className="h-9 rounded-[11px] border-line px-3 text-[13px] font-semibold">
            <UserRoundPlus className="size-4" /> Cambiar cuadrilla
          </Button>
        </Gated>
      </div>
      {crew.length === 0 ? (
        <p className="flex items-center gap-2 rounded-[16px] border border-dashed border-line-strong px-4 py-4 text-[14px] text-subtle">
          <Users className="size-4" /> Sin personal asignado
        </p>
      ) : (
        <motion.ul variants={staggerContainer(0.04, 0.1)} initial="hidden" animate="show" className="divide-y divide-hairline">
          {crew.map((w) => (
            <motion.li key={w.id} variants={rowVariants} layout className="flex items-center gap-3 py-2.5">
              <PersonAvatar name={w.name} initials={w.initials} hue={w.hue} size={36} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-medium text-ink">{w.name}</p>
                <p className="truncate text-[12.5px] text-subtle">{w.specialty}</p>
              </div>
              <a
                href={`tel:${w.phone.replace(/\s/g, "")}`}
                aria-label={`Llamar a ${w.name}`}
                className="inline-flex size-10 shrink-0 items-center justify-center rounded-full text-subtle transition hover:bg-muted hover:text-ink"
              >
                <Phone className="size-4" />
              </a>
            </motion.li>
          ))}
        </motion.ul>
      )}
    </section>
  );
}

/** Historial de reasignaciones: who changed the crew, when and why (doc §8). */
export function CrewHistory() {
  const { d } = useOrder();
  const { order, lk, jornadas } = d;
  const entries = order.crewHistory.map((c, i) => {
    const prev = order.crewHistory[i - 1];
    const added = prev ? c.workerIds.filter((id) => !prev.workerIds.includes(id)) : [];
    const removed = prev ? prev.workerIds.filter((id) => !c.workerIds.includes(id)) : [];
    return { c, added: compact(added.map((id) => lk.workers.get(id))), removed: compact(removed.map((id) => lk.workers.get(id))), first: !prev };
  });
  if (!entries.length) return null;
  const firstName = (n: string) => n.split(" ")[0];
  return (
    <section>
      <Eyebrow className="mb-4">Historial de reasignaciones</Eyebrow>
      <ol className="space-y-4">
        {[...entries].reverse().map(({ c, added, removed, first }, i) => {
          const by = lk.users.get(c.by);
          const j = c.jornadaId ? jornadas.find((x) => x.id === c.jornadaId) : undefined;
          return (
            <motion.li key={`${c.at}-${i}`} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.05 * i }} className="flex gap-3">
              <PersonAvatar name={by?.name} initials={by?.initials ?? "?"} hue={by?.hue} size={30} />
              <div className="min-w-0 flex-1 text-[13.5px]">
                <p className="text-ink">
                  <span className="font-semibold">{by?.name ?? "Usuario"}</span>{" "}
                  {first ? "asignó" : "reasignó"} {plural(c.workerIds.length, "persona", "personas")}
                  {j ? ` · Jornada ${j.dayIndex} (${fmtWeekdayDay(j.date)})` : ""}
                </p>
                {(added.length > 0 || removed.length > 0) && (
                  <p className="mt-0.5 flex flex-wrap gap-x-2 text-[12.5px]">
                    {added.length > 0 && <span className="text-teal-fg">+ {added.map((w) => firstName(w.name)).join(", ")}</span>}
                    {removed.length > 0 && <span className="text-red-fg">− {removed.map((w) => firstName(w.name)).join(", ")}</span>}
                  </p>
                )}
                <p className="mt-0.5 text-subtle">
                  {c.reason ? `“${c.reason}”` : "Sin motivo"} · {fmtDateTime(c.at)}
                </p>
              </div>
            </motion.li>
          );
        })}
      </ol>
    </section>
  );
}
