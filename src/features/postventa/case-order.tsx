"use client";

import Link from "next/link";
import { useMemo } from "react";
import { motion } from "motion/react";
import { ArrowRight, CalendarDays, Clock, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OrderBundle } from "@/lib/hooks";
import { useLookups } from "@/lib/hooks";
import { orderMinutes } from "@/lib/domain";
import { fmtDate, fmtDay, fmtHours, plural } from "@/lib/format";
import { INCIDENT_TYPE, SEVERITY, toneSoftBg, toneText } from "@/lib/status";
import { AvatarStack, PersonAvatar, SectionHeader } from "@/components/pk/bits";
import { INCIDENT_ICONS } from "@/components/pk/incident-sheet";
import { BeforeAfter, PhotoThumb } from "@/components/pk/scene-photo";
import { OrderStatusPill, SoftBadge, TonePill } from "@/components/pk/status";
import { rowVariants, staggerContainer } from "@/components/pk/motion";
import type { Photo } from "@/lib/types";
import { NpsValue, Stars } from "./rating";

function beforeAfterPair(photos: Photo[]) {
  for (const a of photos) {
    if (a.kind !== "despues") continue;
    const b = photos.find((p) => p.kind === "antes" && p.area === a.area && p.jornadaId === a.jornadaId);
    if (b) return { before: b, after: a };
  }
  return null;
}

/** The original order behind a case: dates, crew, and a before/after squeegee of the work. */
export function CaseOrderCard({ bundle }: { bundle: OrderBundle }) {
  const { order, serviceType, site, supervisor, jornadas, photos } = bundle;
  const lk = useLookups();
  const crew = useMemo(() => {
    const ids = Array.from(new Set(jornadas.flatMap((j) => j.workerIds)));
    return ids.map((id) => lk.workers.get(id)).filter((w): w is NonNullable<typeof w> => !!w);
  }, [jornadas, lk]);

  // Before/after pair of the same area (seed photos share a scene seed → the wipe lines up).
  const pair = useMemo(() => beforeAfterPair(photos), [photos]);
  const thumbs = photos.filter((p) => (p.kind === "antes" || p.kind === "despues") && p.id !== pair?.before.id && p.id !== pair?.after.id).slice(0, 3);
  const minutes = orderMinutes(order.id, jornadas);

  return (
    <section>
      <SectionHeader title="Orden original" href={`/ordenes/${order.folio}`} linkLabel="Ver orden" />
      <div className="overflow-hidden rounded-[22px] border border-hairline bg-surface shadow-soft">
        <div className="p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[12.5px] font-semibold text-subtle tabular">{order.folio}</p>
              <Link href={`/ordenes/${order.folio}`} className="mt-1 block text-[17px] font-semibold leading-snug text-ink hover:text-link">
                {order.title}
              </Link>
            </div>
            <OrderStatusPill status={order.status} />
          </div>
          <div className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2.5 text-[14px] text-ink/80 sm:grid-cols-2">
            <span className="flex items-center gap-2">
              <CalendarDays className="size-4 shrink-0 text-subtle" />
              {order.plannedDays > 1 ? `${fmtDay(order.scheduledStart)} – ${fmtDate(order.scheduledEnd)}` : fmtDate(order.scheduledStart)}
              {order.plannedDays > 1 && <span className="text-subtle">· {plural(order.plannedDays, "jornada", "jornadas")}</span>}
            </span>
            <span className="flex min-w-0 items-center gap-2">
              <MapPin className="size-4 shrink-0 text-subtle" />
              <span className="truncate">
                {site?.name} · {site?.municipality}
              </span>
            </span>
            <span className="flex items-center gap-2">
              <Clock className="size-4 shrink-0 text-subtle" />
              {minutes ? `${fmtHours(minutes)} reales` : "Sin horas registradas"} · {serviceType?.name}
            </span>
            {supervisor && (
              <span className="flex items-center gap-2">
                <PersonAvatar name={supervisor.name} initials={supervisor.initials} hue={supervisor.hue} size={20} />
                {supervisor.name}
              </span>
            )}
          </div>
          {crew.length > 0 && (
            <div className="mt-4 flex items-center gap-3 border-t border-hairline pt-4">
              <AvatarStack people={crew} max={6} size={30} />
              <span className="text-[13px] text-subtle">Cuadrilla de {plural(crew.length, "persona", "personas")}</span>
            </div>
          )}
        </div>
        {(pair || thumbs.length > 0) && (
          <div className="border-t border-hairline bg-wash p-3 sm:p-4">
            <div className={cn("grid grid-cols-1 gap-3", pair && thumbs.length ? "sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]" : "")}>
              {pair && <BeforeAfter before={pair.before} after={pair.after} />}
              {thumbs.length > 0 && (
                <div className={cn("grid gap-3", pair ? "grid-cols-3 sm:grid-cols-1" : "grid-cols-3")}>
                  {thumbs.map((p) => (
                    <PhotoThumb key={p.id} photo={p} meta={!pair} className={pair ? "sm:aspect-[16/9]" : undefined} />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

/** Incidents recorded during the original execution (context for the complaint). */
export function CaseOrderIncidents({ bundle }: { bundle: OrderBundle }) {
  const { incidents } = bundle;
  return (
    <section>
      <SectionHeader title="Incidencias durante el servicio" subtitle={incidents.length ? plural(incidents.length, "incidencia registrada", "incidencias registradas") : undefined} />
      {incidents.length === 0 ? (
        <p className="rounded-[18px] bg-soft px-4 py-4 text-[14px] text-subtle">La orden no tuvo incidencias durante la ejecución.</p>
      ) : (
        <motion.ul variants={staggerContainer(0.05, 0.1)} initial="hidden" animate="show">
          {incidents.map((i) => {
            const meta = INCIDENT_TYPE[i.type];
            const Icon = INCIDENT_ICONS[i.type];
            return (
              <motion.li key={i.id} variants={rowVariants} className="border-b border-hairline last:border-0">
                <Link href={`/incidencias?i=${i.id}`} className="group flex items-start gap-3.5 py-4">
                  <span className={cn("inline-flex size-9 shrink-0 items-center justify-center rounded-[11px]", toneSoftBg[meta.tone], toneText[meta.tone])}>
                    <Icon className="size-[17px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-[15px] font-semibold text-ink group-hover:text-link">{meta.label}</span>
                      <span className="text-[12.5px] text-subtle tabular">{i.folio}</span>
                      <SoftBadge tone={SEVERITY[i.severity].tone}>{SEVERITY[i.severity].label}</SoftBadge>
                    </span>
                    <span className="mt-1 line-clamp-2 block text-[14px] text-ink/75">{i.description}</span>
                    {i.resolution && <span className="mt-1 block text-[13px] text-teal-fg">Resuelta: {i.resolution}</span>}
                  </span>
                  <span className="shrink-0">
                    <TonePill tone={i.status === "abierta" ? "red" : "teal"}>{i.status === "abierta" ? "Abierta" : "Resuelta"}</TonePill>
                  </span>
                </Link>
              </motion.li>
            );
          })}
        </motion.ul>
      )}
    </section>
  );
}

/** What the client said in the survey for this order, if anything. */
export function CaseOrderSurvey({ bundle }: { bundle: OrderBundle }) {
  const sv = bundle.surveys.find((s) => s.answers) ?? bundle.surveys[0];
  if (!sv) return null;
  return (
    <div className="rounded-[22px] border border-hairline bg-surface p-5 shadow-soft">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[15px] font-medium text-ink">Encuesta del servicio</p>
        <Link href={`/postventa?orden=${bundle.order.folio}`} className="inline-flex items-center gap-1 text-[13.5px] font-semibold text-link">
          Ver <ArrowRight className="size-4" />
        </Link>
      </div>
      {sv.answers ? (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="text-[30px] font-medium leading-none tracking-[-0.03em] text-ink tabular">{sv.answers.overall.toFixed(1)}</span>
            <Stars value={sv.answers.overall} size={18} />
            <NpsValue value={sv.answers.nps} showLabel className="ml-auto" />
          </div>
          {sv.answers.comment && <p className="mt-3 font-serif text-[16px] italic leading-snug text-ink">“{sv.answers.comment}”</p>}
          <p className="mt-2 text-[12.5px] text-subtle">
            {sv.respondentName ?? "Cliente"} · {fmtDay(sv.respondedAt!)}
            {sv.manual ? " · captura manual" : ""}
          </p>
        </>
      ) : (
        <p className="mt-2 text-[14px] text-subtle">Enviada el {fmtDay(sv.sentAt)} · el cliente aún no responde.</p>
      )}
    </div>
  );
}
