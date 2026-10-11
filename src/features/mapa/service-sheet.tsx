"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { ArrowUpRight, CloudOff, Info, MapPin, TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMediaQuery } from "@/lib/hooks";
import { GEO_SOURCE_LABEL, jornadaMinutes, mapsLink } from "@/lib/domain";
import { fmtDuration, fmtTime, plural } from "@/lib/format";
import { INCIDENT_TYPE, SEVERITY } from "@/lib/status";
import type { GeoSource, GeoStamp, Site } from "@/lib/types";
import { distanceMeters } from "@/components/pk/geo-map";
import { AvatarStack, Eyebrow, KeyValues, PersonAvatar } from "@/components/pk/bits";
import { ClientMark } from "@/components/pk/client-mark";
import { SoftBadge, TonePill } from "@/components/pk/status";
import { EASE } from "@/components/pk/motion";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useCanSeeRoute } from "@/components/shell/use-can-see-route";
import { isMultiDay } from "@/features/agenda/agenda-model";
import { fmtTimeRange } from "@/features/orden/orden-format";
import { fmtDistance, MAX_SITE_DISTANCE } from "@/features/jornada/field-bits";
import { INCIDENT_TONE, SERVICE_STATUS, isLate, type MapaService } from "./mapa-model";

/** Source tag of a stamp. "GPS" is the normal case; manual and remote stamps are called out so nobody reads them as a GPS fix. */
const SOURCE_TAG: Record<GeoSource, { label: string; tone: "teal" | "amber" | "violet" }> = {
  gps: { label: "GPS", tone: "teal" },
  manual: { label: "Manual", tone: "amber" },
  remota: { label: "Remota", tone: "violet" },
};

/**
 * Detail of one service of the map: right Sheet from md, bottom sheet on phones (Sheet convention). The service stays set
 * after closing so the exit animation keeps its content.
 */
export function ServiceSheet({
  service,
  open,
  onOpenChange,
  now,
}: {
  service: MapaService | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  now: Date;
}) {
  const wide = useMediaQuery("(min-width: 768px)");
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={wide ? "right" : "bottom"}
        showCloseButton={false}
        className={cn("gap-0 p-0", wide ? "data-[side=right]:w-full data-[side=right]:sm:max-w-[460px]" : "max-h-[88dvh] rounded-t-[26px]")}
      >
        {service ? (
          <ServiceBody key={service.id} s={service} now={now} />
        ) : (
          <>
            <SheetTitle className="sr-only">Servicio</SheetTitle>
            <SheetDescription className="sr-only">Sin servicio seleccionado</SheetDescription>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function ServiceBody({ s, now }: { s: MapaService; now: Date }) {
  const canSee = useCanSeeRoute();
  const { j, order, client, site } = s;
  const meta = SERVICE_STATUS[s.status];
  const late = isLate(s, now);
  const jornadaHref = `/jornada/${j.id}`;
  const canOpenJornada = canSee(jornadaHref);
  const minutes = jornadaMinutes(j, now);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* ── header ── */}
      <header className="relative shrink-0 border-b border-hairline px-5 pb-4 pr-[72px] pt-5 sm:px-6 sm:pr-[76px]">
        <div className="flex items-center gap-3.5">
          {client && (
            <motion.span initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 380, damping: 24 }}>
              <ClientMark name={client.name} hue={client.hue} size={48} />
            </motion.span>
          )}
          <div className="min-w-0">
            <SheetTitle className="font-serif text-[26px] font-medium leading-tight text-ink">{client?.shortName ?? order.folio}</SheetTitle>
            <SheetDescription className="mt-0.5 truncate text-[14px] text-subtle">
              {site ? `${site.name} · ${site.municipality}` : "Sitio sin registrar"}
            </SheetDescription>
          </div>
        </div>
        <div className="mt-3.5 flex flex-wrap items-center gap-2">
          <TonePill tone={meta.tone} live={meta.live}>
            {meta.label}
            {s.status === "en_curso" && <span className="tabular text-subtle">· {fmtDuration(minutes)}</span>}
          </TonePill>
          {late && <SoftBadge tone="amber">Sin entrada · plan {fmtTime(j.plannedStart)}</SoftBadge>}
          {s.openIncidents.length > 0 && (
            <SoftBadge tone={INCIDENT_TONE}>
              <TriangleAlert className="size-3" /> {plural(s.openIncidents.length, "incidencia abierta", "incidencias abiertas")}
            </SoftBadge>
          )}
        </div>
        <SheetClose asChild>
          <button
            type="button"
            aria-label="Cerrar"
            className="absolute right-3 top-3 inline-flex size-11 items-center justify-center rounded-full bg-sand text-ink transition hover:bg-sand-deep active:scale-95 sm:right-4 sm:top-4"
          >
            <X className="size-[18px]" />
          </button>
        </SheetClose>
      </header>

      {/* ── body ── */}
      <div className="min-h-0 flex-1 space-y-7 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">
        {site && (
          <section className="flex items-start gap-3">
            <span className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-[11px] bg-blue-tint text-azure-fg">
              <MapPin className="size-[17px]" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[14.5px] font-semibold text-ink">{site.name}</p>
              <p className="text-[13.5px] leading-snug text-subtle">
                {site.address}, {site.municipality}
              </p>
              <a
                href={mapsLink(site.lat, site.lng)}
                target="_blank"
                rel="noreferrer"
                className="-my-2 inline-flex min-h-11 items-center gap-1 text-[13.5px] font-semibold text-link lg:min-h-9"
              >
                Abrir en Maps <ArrowUpRight className="size-3.5" />
              </a>
            </div>
          </section>
        )}

        <KeyValues
          rows={[
            {
              k: "Folio",
              v: (
                <Link href={`/ordenes/${order.folio}`} className="text-link tabular hover:underline">
                  {order.folio}
                </Link>
              ),
            },
            { k: "Servicio", v: s.serviceType?.name ?? "—" },
            {
              k: "Supervisor",
              v: s.supervisor ? (
                <span className="inline-flex items-center gap-2">
                  <PersonAvatar initials={s.supervisor.initials} hue={s.supervisor.hue} size={24} />
                  {s.supervisor.name}
                </span>
              ) : (
                "—"
              ),
            },
            {
              k: "Programado",
              v: (
                <span className="tabular">
                  {fmtTimeRange(j.plannedStart, j.plannedEnd)}
                  {isMultiDay(j, order) && <span className="font-normal text-subtle"> · J{j.dayIndex} de {Math.max(order.plannedDays, j.dayIndex)}</span>}
                </span>
              ),
            },
          ]}
        />

        <section>
          <Eyebrow className="mb-2.5">Cuadrilla · {s.crew.length}</Eyebrow>
          {s.crew.length ? (
            <div className="flex items-center gap-3">
              <AvatarStack people={s.crew} size={32} max={5} />
              <p className="min-w-0 text-[13.5px] leading-snug text-subtle">{s.crew.map((w) => w.name.split(" ")[0]).join(", ")}</p>
            </div>
          ) : (
            <p className="text-[13.5px] font-medium text-amber-fg">Sin cuadrilla asignada</p>
          )}
        </section>

        <section>
          <div className="mb-2.5 flex items-baseline justify-between gap-3">
            <Eyebrow>Entrada y salida</Eyebrow>
            {s.status === "terminada" && minutes > 0 && <span className="text-[13px] text-subtle tabular">{fmtDuration(minutes)} en sitio</span>}
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <StampTile label="Entrada" stamp={j.checkIn} site={site} empty={late ? "Sin registro" : "Pendiente"} />
            <StampTile label="Salida" stamp={j.checkOut} site={site} empty={s.status === "en_curso" ? "Cuadrilla en sitio" : "Pendiente"} />
          </div>
          <p className="mt-2.5 flex items-start gap-1.5 text-[12.5px] leading-snug text-subtle">
            <Info className="mt-px size-3.5 shrink-0" />
            Ubicaciones registradas al marcar entrada y salida; no es un rastreo en tiempo real.
          </p>
        </section>

        <section>
          <Eyebrow className="mb-2.5">Fotos de la jornada</Eyebrow>
          <div className="flex flex-wrap gap-2">
            <PhotoCount label="ANTES" count={s.photos.antes} tone="amber" />
            <PhotoCount label="DESPUÉS" count={s.photos.despues} tone="teal" />
          </div>
        </section>

        {s.openIncidents.length > 0 && (
          <section>
            <Eyebrow className="mb-2">Incidencias abiertas · {s.openIncidents.length}</Eyebrow>
            <ul className="divide-y divide-hairline">
              {s.openIncidents.map((i) => {
                const href = canSee("/incidencias") ? `/incidencias?i=${i.id}` : `/ordenes/${order.folio}?tab=incidencias`;
                return (
                  <li key={i.id}>
                    <Link href={href} className="group flex items-start gap-3 py-3">
                      <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-red-tint text-red-fg">
                        <TriangleAlert className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px] font-semibold text-ink group-hover:text-link">
                          {INCIDENT_TYPE[i.type].label}
                          <span className="font-normal text-subtle tabular">{i.folio}</span>
                        </span>
                        <span className="mt-0.5 line-clamp-2 block text-[13px] leading-snug text-subtle">{i.description}</span>
                        <span className="mt-1.5 flex flex-wrap gap-1.5">
                          <SoftBadge tone={SEVERITY[i.severity].tone}>Severidad {SEVERITY[i.severity].label.toLowerCase()}</SoftBadge>
                          {i.blocksClosure && <SoftBadge tone="red">Bloquea el cierre</SoftBadge>}
                          {i.jornadaId && i.jornadaId !== j.id && <SoftBadge tone="slate">Otra jornada</SoftBadge>}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>

      {/* ── actions ── */}
      <footer className="flex shrink-0 flex-col-reverse gap-2.5 border-t border-hairline bg-wash px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4 sm:flex-row sm:justify-end sm:px-6">
        <Button asChild variant={canOpenJornada ? "outline" : "default"} className={cn("h-12 rounded-[12px] px-5 text-[15px] font-semibold sm:h-11 sm:text-[14px]", canOpenJornada && "border-line")}>
          <Link href={`/ordenes/${order.folio}`}>Ver orden</Link>
        </Button>
        {canOpenJornada && (
          <Button asChild className="h-12 rounded-[12px] px-5 text-[15px] font-semibold sm:h-11 sm:text-[14px]">
            <Link href={jornadaHref}>Abrir jornada</Link>
          </Button>
        )}
      </footer>
    </div>
  );
}

/** ENTRADA / SALIDA: time, distance from the site and how the location was obtained (GPS · manual · remota). */
function StampTile({ label, stamp, site, empty }: { label: string; stamp?: GeoStamp; site?: Site; empty: string }) {
  if (!stamp)
    return (
      <div className="rounded-[18px] border border-dashed border-line-strong p-3.5">
        <p className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-subtle">{label}</p>
        <p className="mt-1 text-[24px] font-medium tracking-[-0.02em] text-ghost tabular">--:--</p>
        <p className="mt-0.5 text-[12.5px] text-subtle">{empty}</p>
      </div>
    );
  const tag = SOURCE_TAG[stamp.source];
  const dist = site ? distanceMeters(site, stamp) : null;
  const far = dist !== null && dist > MAX_SITE_DISTANCE;
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: EASE }}
      className="min-w-0 rounded-[18px] bg-soft p-3.5 ring-1 ring-edge"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-subtle">{label}</p>
        <span title={GEO_SOURCE_LABEL[stamp.source]}>
          <SoftBadge tone={tag.tone} className="h-5 px-1.5 text-[10.5px]">
            {tag.label}
          </SoftBadge>
        </span>
      </div>
      <p className="mt-1 text-[24px] font-medium tracking-[-0.02em] text-ink tabular">{fmtTime(stamp.deviceAt)}</p>
      <p className={cn("mt-0.5 text-[12.5px] leading-snug tabular", far && stamp.source === "gps" ? "font-medium text-amber-fg" : "text-subtle")}>
        {dist === null ? "Sin sitio para comparar" : `a ${fmtDistance(dist)} del sitio`}
        {stamp.source === "gps" && ` · ±${Math.round(stamp.accuracy)} m`}
      </p>
      {stamp.source !== "gps" && <p className="mt-1 text-[12px] leading-snug text-subtle">{GEO_SOURCE_LABEL[stamp.source]}</p>}
      {stamp.note && <p className="mt-1.5 line-clamp-3 text-[12px] leading-snug text-ink-muted">“{stamp.note}”</p>}
      {stamp.offline && (
        <p className="mt-1.5 flex items-center gap-1 text-[12px] font-medium text-amber-fg">
          <CloudOff className="size-3.5 shrink-0" /> Capturada sin conexión
        </p>
      )}
    </motion.div>
  );
}

function PhotoCount({ label, count, tone }: { label: string; count: number; tone: "amber" | "teal" }) {
  return (
    <span
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-[10px] px-2.5 text-[12px] font-bold tracking-[0.06em] tabular",
        count > 0 ? (tone === "amber" ? "bg-amber-soft text-amber-fg" : "bg-teal-soft text-teal-fg") : "bg-tile text-subtle",
      )}
    >
      {label}
      <span className="text-[13px]">{count}</span>
    </span>
  );
}
