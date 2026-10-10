"use client";

import { useMemo } from "react";
import { motion } from "motion/react";
import { MapPin, Navigation, ScrollText } from "lucide-react";
import { mapsLink } from "@/lib/domain";
import { fmtDay, plural } from "@/lib/format";
import type { Survey } from "@/lib/types";
import { BarList, Eyebrow } from "@/components/pk/bits";
import { GeoMap, type GeoMarker } from "@/components/pk/geo-map";
import { EASE } from "@/components/pk/motion";
import { casesByCategory } from "@/features/postventa/lib";
import { Stars } from "@/features/postventa/rating";
import type { ClientStats } from "./use-clients";

/** Right column of the client detail: sites map, standing instructions, complaints, what they say. */
export function ClientAside({ stats, surveys }: { stats: ClientStats; surveys: Survey[] }) {
  const { sites, orders } = stats;

  const markers = useMemo<GeoMarker[]>(
    () => sites.map((s, i) => ({ lat: s.lat, lng: s.lng, kind: "site", label: sites.length > 1 ? String(i + 1) : undefined, tooltip: s.name })),
    [sites],
  );

  const servicesBySite = useMemo(() => {
    const m = new Map<string, number>();
    orders.filter((o) => o.closure).forEach((o) => m.set(o.siteId, (m.get(o.siteId) ?? 0) + 1));
    return m;
  }, [orders]);

  const instructions = useMemo(() => {
    const m = new Map<string, number>();
    orders.forEach((o) => {
      const t = o.specialInstructions.trim();
      if (t) m.set(t, (m.get(t) ?? 0) + 1);
    });
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  }, [orders]);

  const reasons = useMemo(() => casesByCategory(stats.cases.length ? stats.cases : []), [stats.cases]);

  const comments = useMemo(() => {
    const ids = new Set(orders.map((o) => o.id));
    return surveys
      .filter((s) => ids.has(s.orderId) && s.answers?.comment && s.respondedAt)
      .sort((a, b) => b.respondedAt!.localeCompare(a.respondedAt!))
      .slice(0, 3);
  }, [orders, surveys]);

  return (
    <div className="space-y-10">
      <section>
        <h2 className="text-[19px] font-medium tracking-[-0.01em] text-ink">Sitios</h2>
        <p className="mb-4 mt-1 text-[13.5px] text-subtle">{plural(sites.length, "ubicación registrada", "ubicaciones registradas")}</p>
        {markers.length > 0 && <GeoMap markers={markers} zoom={14} className="h-[200px]" />}
        <ul className="mt-3">
          {sites.map((s, i) => (
            <li key={s.id} className="flex items-start gap-3 border-b border-hairline py-3.5 last:border-0">
              <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-deep text-[12px] font-semibold text-white">
                {sites.length > 1 ? i + 1 : <MapPin className="size-3.5" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14.5px] font-semibold text-ink">{s.name}</span>
                <span className="block text-[13px] leading-snug text-subtle">
                  {s.address}, {s.municipality}
                </span>
                <span className="mt-0.5 block text-[12.5px] text-ink/70">{plural(servicesBySite.get(s.id) ?? 0, "servicio", "servicios")}</span>
              </span>
              <a
                href={mapsLink(s.lat, s.lng)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Cómo llegar a ${s.name}`}
                className="inline-flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-tile text-ink transition hover:bg-brand-deep hover:text-white"
              >
                <Navigation className="size-4" />
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-[19px] font-medium tracking-[-0.01em] text-ink">Instrucciones frecuentes</h2>
        <p className="mb-4 mt-1 text-[13.5px] text-subtle">De las órdenes de este cliente</p>
        {instructions.length ? (
          <ul className="space-y-2.5">
            {instructions.map(([text, n], i) => (
              <motion.li
                key={text}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, ease: EASE, delay: 0.1 + i * 0.06 }}
                className="flex items-start gap-3 rounded-[16px] bg-soft p-3.5"
              >
                <ScrollText className="mt-0.5 size-4 shrink-0 text-azure-fg" />
                <span className="min-w-0 flex-1 text-[14px] leading-snug text-ink">{text}</span>
                <span className="shrink-0 rounded-md bg-surface px-1.5 py-0.5 text-[12px] font-semibold text-subtle tabular">
                  {/* no hover on touch: spell the count out below lg, keep the compact ×n (with its tooltip) on desktop */}
                  <span className="lg:hidden">{n === 1 ? "1 orden" : `${n} órdenes`}</span>
                  <span className="max-lg:hidden" title={n === 1 ? "En 1 orden" : `En ${n} órdenes`}>
                    ×{n}
                  </span>
                </span>
              </motion.li>
            ))}
          </ul>
        ) : (
          <p className="rounded-[16px] bg-soft px-4 py-4 text-[14px] text-subtle">Sin instrucciones especiales registradas.</p>
        )}
      </section>

      <section>
        <h2 className="text-[19px] font-medium tracking-[-0.01em] text-ink">Por qué se queja</h2>
        <p className="mb-5 mt-1 text-[13.5px] text-subtle">{plural(stats.cases.length, "caso postventa", "casos postventa")} en total</p>
        {reasons.length ? (
          <BarList showCount items={reasons.map((r) => ({ label: r.label, value: r.value, pct: r.pct }))} />
        ) : (
          <p className="rounded-[16px] bg-teal-soft px-4 py-4 text-[14px] text-teal-fg">Sin quejas registradas. ¡Impecable!</p>
        )}
      </section>

      <section>
        <h2 className="text-[19px] font-medium tracking-[-0.01em] text-ink">Lo que dicen</h2>
        <p className="mb-4 mt-1 text-[13.5px] text-subtle">Comentarios recientes en encuestas</p>
        {comments.length ? (
          <ul className="space-y-3">
            {comments.map((s) => (
              <li key={s.id} className="rounded-[20px] border border-hairline bg-surface p-4 shadow-[0_1px_2px_rgb(16_24_40/0.04)]">
                <div className="flex items-center justify-between gap-3">
                  <Stars value={s.answers!.overall} size={14} />
                  <Eyebrow className="text-[11px]">{fmtDay(s.respondedAt!)}</Eyebrow>
                </div>
                <p className="mt-2.5 font-serif text-[16px] italic leading-snug text-ink">“{s.answers!.comment}”</p>
                <p className="mt-1.5 text-[12.5px] text-subtle">
                  {s.respondentName ?? "Cliente"}
                  {s.manual ? " · captura manual" : ""}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-[16px] bg-soft px-4 py-4 text-[14px] text-subtle">Aún no hay comentarios de encuesta.</p>
        )}
      </section>
    </div>
  );
}
