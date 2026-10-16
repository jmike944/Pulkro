"use client";

import Link from "next/link";
import { isSameDay, parseISO } from "date-fns";
import { motion } from "motion/react";
import { CalendarClock, CalendarDays, CalendarPlus, CloudOff, MapPinned, MonitorSmartphone, NotebookPen, Satellite, Server, Smartphone, TriangleAlert, UserRoundPen, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { GEO_SOURCE_LABEL, jornadaMinutes } from "@/lib/domain";
import { fmtDuration, fmtHours, fmtTime, minutesBetween, plural } from "@/lib/format";
import type { GeoStamp, Jornada, Site } from "@/lib/types";
import { AvatarStack, DateBadge } from "@/components/pk/bits";
import { EmptyState } from "@/components/pk/feedback";
import { distanceMeters } from "@/components/pk/geo-map";
import { rowVariants, staggerContainer } from "@/components/pk/motion";
import { SoftBadge, TonePill } from "@/components/pk/status";
import { Button } from "@/components/ui/button";
import { JORNADA_STATUS, compact, crewNames, fmtSeconds, fmtTimeRange, fmtWeekdayDay, jornadaPlanned } from "./orden-format";
import { DENY, useOrder, type Gate, type Lookups } from "./order-context";
import { Gated } from "./ui";

/** Jornadas: one independent record per working day (doc §3: multi-day orders keep separate jornadas). */
export function JornadasTab() {
  const { d, ui } = useOrder();
  const { jornadas, order, now, realMinutes, plannedMinutes, audit } = d;
  const closed = jornadas.filter((j) => j.status === "cerrada").length;
  const reprogrammed = order.status === "reprogramada";
  const lastReprogram = audit.find((a) => /reprogram/i.test(a.action));
  // "Confirmar fechas" only needs the order to be Reprogramada (gates.confirm); "Reprogramar" also needs pending jornadas.
  const confirmGate: Gate = d.gates.confirm;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-[19px] font-medium tracking-[-0.01em] text-ink">Jornadas · {jornadas.length}</h2>
          <p className="mt-1 text-[13.5px] text-subtle">
            {closed} de {jornadas.length} cerradas · plan {fmtHours(plannedMinutes)} · {fmtHours(realMinutes)} reales
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Gated gate={d.gates.reschedule}>
            <Button
              variant="outline"
              disabled={!d.gates.reschedule.ok}
              onClick={() => ui.openSchedule("reprogramar")}
              className="h-10 rounded-[12px] border-line px-4 font-semibold"
            >
              <CalendarClock /> Reprogramar
            </Button>
          </Gated>
          <Gated gate={d.gates.addJornada}>
            <Button disabled={!d.gates.addJornada.ok} onClick={() => ui.openSchedule("agregar")} className="h-10 rounded-[12px] px-4 font-semibold">
              <CalendarPlus /> Agregar jornada
            </Button>
          </Gated>
        </div>
      </div>

      {reprogrammed && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 flex flex-col gap-3 rounded-[20px] bg-amber-soft p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"
        >
          <div className="flex gap-3">
            <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-amber-mid text-amber-fg">
              <CalendarDays className="size-5" />
            </span>
            <div className="text-[14px]">
              <p className="font-semibold text-ink">Fechas reprogramadas</p>
              <p className="text-amber-ink">
                {lastReprogram?.reason ? `“${lastReprogram.reason}”. ` : ""}Confirme las nuevas fechas con el cliente para volver a programada.
              </p>
            </div>
          </div>
          <Gated gate={confirmGate}>
            <Button disabled={!confirmGate.ok} onClick={ui.confirmDates} className="h-10 shrink-0 rounded-[12px] px-4 font-semibold">
              Confirmar fechas
            </Button>
          </Gated>
        </motion.div>
      )}

      {jornadas.length === 0 ? (
        <EmptyState
          icon={<CalendarPlus />}
          title="Sin jornadas programadas"
          action={
            <Gated gate={d.gates.addJornada}>
              <Button disabled={!d.gates.addJornada.ok} onClick={() => ui.openSchedule("agregar")} className="h-10 rounded-[12px] px-4 font-semibold">
                <CalendarPlus /> Agregar jornada
              </Button>
            </Gated>
          }
        >
          Programe uno o varios días de trabajo. Cada jornada guarda su entrada, salida, fotos y bitácora.
        </EmptyState>
      ) : (
        <motion.ul variants={staggerContainer(0.07, 0.05)} initial="hidden" animate="show" className="space-y-4">
          {jornadas.map((j) => (
            <JornadaCard key={j.id} j={j} today={isSameDay(parseISO(j.plannedStart), now)} />
          ))}
        </motion.ul>
      )}
    </div>
  );
}

function JornadaCard({ j, today }: { j: Jornada; today: boolean }) {
  const { d, ui } = useOrder();
  const { lk, site, photos, incidents, now, jornadas } = d;
  const crew = compact(j.workerIds.map((id) => lk.workers.get(id)));
  const status = JORNADA_STATUS[j.status];
  const live = j.status === "en_curso";
  const planned = jornadaPlanned(j);
  const real = jornadaMinutes(j, now);
  const ps = photos.filter((p) => p.jornadaId === j.id);
  const antes = ps.filter((p) => p.kind === "antes").length;
  const despues = ps.filter((p) => p.kind === "despues").length;
  const incs = incidents.filter((i) => i.jornadaId === j.id).length;
  const crewGate: Gate = !d.perms.crew ? { ok: false, reason: DENY.crew } : j.status === "cerrada" || d.isTerminal ? { ok: false, reason: "La jornada ya está cerrada." } : { ok: true };

  // The field screen (/jornada) opens for every role; without field capture it is read-only, so it is "Ver jornada".
  const capture = d.perms.capture;
  const openLabel = !capture ? "Ver jornada" : live ? "Continuar jornada" : j.status === "pendiente" && today ? "Registrar entrada" : "Abrir jornada";
  const primary = capture && (live || (j.status === "pendiente" && today));

  return (
    <motion.li
      layout
      variants={rowVariants}
      className={cn(
        "relative overflow-hidden rounded-[22px] border bg-surface p-4 shadow-soft sm:p-6",
        live ? "border-transparent ring-2 ring-sky/70" : "border-hairline",
      )}
    >
      {live && <span className="pointer-events-none absolute -right-20 -top-20 size-56 rounded-full bg-sky/15 blur-3xl" aria-hidden />}
      <div className="relative flex items-start gap-3 sm:gap-4">
        <DateBadge date={j.date} tone={today ? "today" : undefined} />
        <div className="min-w-0 flex-1">
          <h3 className="text-[16px] font-semibold leading-snug text-ink sm:text-[17px]">
            Jornada {j.dayIndex} <span className="font-normal text-subtle">· {fmtWeekdayDay(j.date)} · {fmtTimeRange(j.plannedStart, j.plannedEnd)}</span>
          </h3>
          <p className="mt-0.5 text-[13px] text-subtle">
            Plan {fmtHours(planned)} · {plural(crew.length, "persona", "personas")}
            {jornadas.length > 1 ? ` · día ${j.dayIndex} de ${jornadas.length}` : ""}
          </p>
        </div>
        <TonePill tone={status.tone} live={live} className="shrink-0">
          {status.label}
        </TonePill>
      </div>

      <div className="relative mt-5 grid gap-3 md:grid-cols-2">
        <StampCard label="Entrada" stamp={j.checkIn} planned={j.plannedStart} site={site} lk={lk} />
        <StampCard label="Salida" stamp={j.checkOut} planned={j.plannedEnd} site={site} lk={lk} live={live} />
      </div>

      <div className="relative mt-4 grid grid-cols-2 gap-x-4 gap-y-4 border-t border-hairline pt-4 sm:flex sm:flex-wrap sm:items-center sm:gap-x-8">
        <div>
          <p className="text-[12px] text-subtle">Duración</p>
          <p className="text-[15px] font-semibold text-ink tabular">
            {j.checkIn ? fmtDuration(real) : "—"}
            {j.checkOut && <span className="ml-1.5 text-[12.5px] font-normal text-subtle">de {fmtHours(planned)}</span>}
          </p>
        </div>
        <div>
          <p className="text-[12px] text-subtle">Evidencia</p>
          <div className="mt-0.5 flex flex-wrap gap-1.5 text-[11px] font-bold tracking-[0.06em]">
            <span className={cn("rounded-md px-1.5 py-0.5", antes ? "bg-amber-soft text-amber-fg" : "bg-muted text-faint")}>ANTES {antes}</span>
            <span className={cn("rounded-md px-1.5 py-0.5", despues ? "bg-teal-soft text-teal-fg" : "bg-muted text-faint")}>DESPUÉS {despues}</span>
            {incs > 0 && <span className="rounded-md bg-red-soft px-1.5 py-0.5 text-red-fg">INC {incs}</span>}
          </div>
        </div>
        <div className="col-span-2 flex items-center gap-2 sm:col-span-1">
          <AvatarStack people={crew} size={30} max={5} />
          <Gated gate={crewGate}>
            <Button
              variant="ghost"
              disabled={!crewGate.ok}
              onClick={() => ui.openCrew(j.id)}
              className="h-10 rounded-[12px] px-3 text-[13px] font-semibold text-ink"
            >
              <UserRoundPen className="size-4" /> Cambiar
            </Button>
          </Gated>
        </div>
        {/* names are title-only on avatars: spell out who worked this day on touch screens (the stack opens the full list) */}
        {crew.length > 0 && (
          <p className="col-span-2 -mt-1.5 text-[13px] leading-snug text-subtle sm:basis-full lg:hidden">
            Cuadrilla: <span className="font-medium text-ink">{crewNames(crew)}</span>
          </p>
        )}
      </div>

      {j.log.length > 0 && <Bitacora j={j} lk={lk} />}

      <div className="relative mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Gated gate={d.gates.capture} className="flex">
          <Button
            variant="ghost"
            disabled={!d.gates.capture.ok}
            onClick={() => ui.openIncident(j.id)}
            className="h-10 w-full rounded-[12px] px-4 text-[14px] font-semibold text-ink sm:w-auto"
          >
            <TriangleAlert className="size-4" /> Registrar incidencia
          </Button>
        </Gated>
        <Button
          asChild
          variant={primary ? "default" : "outline"}
          className={cn("h-10 rounded-[12px] px-4 text-[14px] font-semibold", !primary && "border-line shadow-[0_1px_2px_rgb(16_24_40/0.05)]")}
        >
          <Link href={`/jornada/${j.id}`}>{openLabel}</Link>
        </Button>
      </div>
    </motion.li>
  );
}

function StampCard({
  label,
  stamp,
  planned,
  site,
  lk,
  live,
}: {
  label: string;
  stamp?: GeoStamp;
  planned: string;
  site: Site;
  lk: Lookups;
  live?: boolean;
}) {
  if (!stamp)
    return (
      <div className="rounded-[18px] border border-dashed border-line-strong p-4">
        <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-subtle">{label}</p>
        <p className="mt-1 text-[26px] font-medium tracking-[-0.02em] text-ghost tabular">--:--</p>
        <p className="mt-1 text-[13px] text-subtle">{live ? "Cuadrilla en sitio" : "Pendiente"} · plan {fmtTime(planned)}</p>
      </div>
    );
  const dist = Math.round(distanceMeters(site, stamp));
  const delta = minutesBetween(planned, stamp.deviceAt);
  const by = lk.users.get(stamp.by);
  const remote = stamp.source === "remota";
  const justified = stamp.source !== "gps"; // manual and remote stamps always carry a justification
  return (
    <div className="rounded-[18px] bg-soft p-4 ring-1 ring-edge">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-subtle">{label}</p>
        <span className="flex flex-wrap items-center justify-end gap-1.5">
          {remote && (
            <SoftBadge tone="violet">
              <MonitorSmartphone className="size-3" /> Remota
            </SoftBadge>
          )}
          {stamp.offline && (
            <SoftBadge tone="amber">
              <WifiOff className="size-3" /> Sin conexión
            </SoftBadge>
          )}
        </span>
      </div>
      <p className="mt-1 flex items-baseline gap-2">
        <span className="text-[26px] font-medium tracking-[-0.02em] text-ink tabular">{fmtTime(stamp.deviceAt)}</span>
        {Math.abs(delta) >= 10 && (
          <span className={cn("text-[12.5px] tabular", delta > 0 ? "text-amber-fg" : "text-subtle")}>
            {delta > 0 ? `+${delta}` : delta} min vs plan
          </span>
        )}
      </p>
      <dl className="mt-2 space-y-1.5 text-[12.5px]">
        <StampRow icon={<Smartphone />} k="Hora del dispositivo" v={fmtSeconds(stamp.deviceAt)} />
        <StampRow
          icon={<Server />}
          k="Hora del servidor"
          v={
            stamp.serverAt ? (
              fmtSeconds(stamp.serverAt)
            ) : (
              <span className="inline-flex items-center gap-1 font-medium text-amber-fg">
                <CloudOff className="size-3.5" /> pendiente de sincronizar
              </span>
            )
          }
        />
        {stamp.source === "gps" ? (
          <StampRow icon={<Satellite />} k="GPS" v={`±${Math.round(stamp.accuracy)} m · a ${dist} m del sitio`} />
        ) : (
          // Manual pin or remote supervision: never described as GPS at the site (a remote stamp's position is the supervisor's phone).
          <StampRow icon={remote ? <MonitorSmartphone /> : <MapPinned />} k="Ubicación" v={GEO_SOURCE_LABEL[stamp.source]} />
        )}
        <StampRow icon={<NotebookPen />} k="Capturó" v={by?.name ?? "Usuario"} />
      </dl>
      {stamp.note && (
        <p className={cn("mt-2.5 rounded-[10px] px-3 py-2 text-[12.5px] leading-snug", justified ? "bg-amber-soft text-amber-ink" : "bg-surface text-subtle")}>
          {justified ? "Justificación: " : "Nota: "}
          {stamp.note}
        </p>
      )}
    </div>
  );
}

function StampRow({ icon, k, v }: { icon: React.ReactNode; k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="flex shrink-0 items-center gap-1.5 text-subtle [&_svg]:size-3.5 [&_svg]:translate-y-[2px]">
        {icon}
        {k}
      </dt>
      <dd className="min-w-0 truncate text-right font-medium text-ink tabular">{v}</dd>
    </div>
  );
}

function Bitacora({ j, lk }: { j: Jornada; lk: Lookups }) {
  return (
    <div className="relative mt-4 rounded-[18px] bg-wash p-4">
      <p className="mb-2.5 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-subtle">
        <NotebookPen className="size-3.5" /> Bitácora
      </p>
      <ul className="space-y-2">
        {j.log.map((e, i) => (
          <li key={`${e.at}-${i}`} className="grid grid-cols-[44px_minmax(0,1fr)] gap-3 text-[13.5px]">
            <span className="text-subtle tabular">{fmtTime(e.at)}</span>
            <span className="text-ink">
              {e.text} <span className="text-subtle">· {lk.users.get(e.by)?.name.split(" ")[0] ?? "Usuario"}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
