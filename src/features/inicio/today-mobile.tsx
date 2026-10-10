"use client";

import { useMemo, useState } from "react";
import { isSameDay, parseISO } from "date-fns";
import { motion } from "motion/react";
import { Camera, Clock, Sparkles, WifiOff } from "lucide-react";
import { useCan, useIsOffline, useLookups, useNow, useScopedData, useSyncSummary } from "@/lib/hooks";
import { jornadaMinutes } from "@/lib/domain";
import { firstName, fmtLongDay, fmtNum, fmtPct, fmtTime, greeting, plural } from "@/lib/format";
import type { Jornada } from "@/lib/types";
import { PulkroMark } from "@/components/pk/brand";
import { AnimatedNumber, PersonAvatar } from "@/components/pk/bits";
import { EmptyState } from "@/components/pk/feedback";
import { AuroraStat, BigButton, MobileGreeting, MobileRow, NextStepCard } from "@/components/pk/mobile";
import { staggerContainer } from "@/components/pk/motion";
import { MobileToolbar, useUnitScope } from "@/components/shell/header-tools";
import { usePendingItems, type PendingItem } from "@/features/pendientes/use-pending-items";
import { AttentionRow, ClosureBlockers, JornadaRow, MoreLink, PipelineTiles, SectionTitle, ServicesHero } from "./today-parts";
import { useAttention, useHoyStats, useIncidentYear } from "./use-hoy-stats";

/** Rows per list on the phone: scannable, the full list is one "Ver todo" tap away. */
const JORNADAS_MAX = 5;
const ATTENTION_MAX = 5;

/**
 * Mobile "Hoy" (PWA home) — mirrors the reference Today screen, then the dashboard's data in phone form:
 * today's jornadas (crew, photos), the orders that need attention and, for Dirección / Administración,
 * the month KPI, pipeline counters and what holds closures back. Supervisors keep a field focus.
 */
export function TodayMobile() {
  const data = useScopedData();
  const { user, orders, jornadas, photos, incidents, reports } = data;
  const lk = useLookups();
  const now = useNow(30_000);
  const offline = useIsOffline();
  const { pending } = useSyncSummary();
  const { items } = usePendingItems();
  const canCapture = useCan("field.capture");
  const { allUnits, selected } = useUnitScope();
  const manager = user.role !== "supervisor";
  const [month, setMonth] = useState(() => now.getMonth());
  const stats = useHoyStats(data, now, month);
  const { all: attentionAll } = useAttention(data, now);
  const { incidentYear, incidentBars } = useIncidentYear(data, now);

  // live first (like the desktop strip), then by planned start
  const today = useMemo(
    () =>
      jornadas
        .filter((j) => isSameDay(parseISO(j.plannedStart), now) || j.status === "en_curso")
        .filter((j) => orders.find((o) => o.id === j.orderId)?.status !== "cancelada")
        .sort((a, b) => Number(b.status === "en_curso") - Number(a.status === "en_curso") || a.plannedStart.localeCompare(b.plannedStart)),
    [jornadas, orders, now],
  );
  const live = today.find((j) => j.status === "en_curso");

  // ANTES / DESPUÉS photo counts per jornada, in one pass
  const photoCount = useMemo(() => {
    const m = new Map<string, { antes: number; despues: number }>();
    for (const p of photos) {
      if (!p.jornadaId || (p.kind !== "antes" && p.kind !== "despues")) continue;
      const c = m.get(p.jornadaId) ?? { antes: 0, despues: 0 };
      c[p.kind]++;
      m.set(p.jornadaId, c);
    }
    return m;
  }, [photos]);

  /* ── the one card that matters right now ── */
  const card = useMemo(() => {
    const actionable = items.filter((i) => i.actionable);
    const blocking = actionable.find((i) => i.kind === "incidencia" && i.rank === 0);
    if (live && canCapture && !blocking) return { type: "live" as const, j: live };
    const it = blocking ?? actionable[0] ?? items[0];
    return it ? { type: "item" as const, it } : null;
  }, [items, live, canCapture]);

  // Supervisor: own evidence this year (the hero KPI block is for Dirección / Administración)
  const myPhotos = useMemo(() => {
    const year = now.getFullYear();
    return photos.filter((p) => p.by === user.id && parseISO(p.takenAt).getFullYear() === year && (p.kind === "antes" || p.kind === "despues")).length;
  }, [photos, user.id, now]);

  const more = items.filter((i) => i.actionable && (card?.type !== "item" || i.id !== card.it.id)).slice(0, 3);

  // The attention list leaves out the orders already shown above (next-step card, "También pendiente")
  const shownOrders = new Set<string | undefined>([card?.type === "live" ? card.j.orderId : card?.it.orderId, ...more.map((i) => i.orderId)]);
  const attention = attentionAll.filter((x) => !shownOrders.has(x.o.id));

  return (
    <div>
      <MobileGreeting
        eyebrow={
          <>
            {fmtLongDay(now)}
            {allUnits && <> · {selected?.name ?? "Todas las unidades"}</>}
          </>
        }
        title={`${greeting(now)}, ${firstName(user.name)}`}
        avatar={<MobileToolbar />}
      />

      {offline && (
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="mb-5 flex items-center gap-3 rounded-[16px] bg-amber-soft px-4 py-3 text-[14px] text-amber-ink">
          <WifiOff className="size-4 shrink-0" />
          <span>
            <b className="font-semibold">Sin conexión.</b> Todo lo que captures se guarda aquí{pending.length ? ` (${pending.length} por enviar)` : ""}.
          </span>
        </motion.div>
      )}

      {card?.type === "live" && <LiveCard j={card.j} now={now} lk={lk} orders={orders} photosCount={photoCount.get(card.j.id)?.antes ?? 0} />}
      {card?.type === "item" && <ItemCard it={card.it} lk={lk} data={{ orders, jornadas, incidents, reports }} />}

      <section className="mt-8">
        <SectionTitle title="Jornadas de hoy" count={today.length} href="/agenda" linkLabel="Abrir agenda" />
        {today.length === 0 ? (
          <EmptyState icon={<Clock />} title="Sin jornadas hoy" className="mt-3 py-9">
            No hay cuadrillas programadas para hoy.
          </EmptyState>
        ) : (
          <>
            <motion.div variants={staggerContainer(0.05, 0.25)} initial="hidden" animate="show">
              {today.slice(0, JORNADAS_MAX).map((j) => {
                const o = orders.find((x) => x.id === j.orderId);
                if (!o) return null;
                return <JornadaRow key={j.id} j={j} o={o} lk={lk} now={now} photos={photoCount.get(j.id) ?? { antes: 0, despues: 0 }} />;
              })}
            </motion.div>
            {today.length > JORNADAS_MAX && <MoreLink href="/agenda">Ver {today.length - JORNADAS_MAX} más en la agenda</MoreLink>}
          </>
        )}
      </section>

      {more.length > 0 && (
        <section className="mt-8">
          <SectionTitle title="También pendiente" href="/pendientes" linkLabel="Ver todo" />
          {more.map((it) => (
            <MobileRow key={it.id} href={it.href} title={it.title} meta={<span className="truncate">{it.sub}</span>} status={{ tone: it.tone, label: kindLabel(it) }} />
          ))}
        </section>
      )}

      {attention.length > 0 ? (
        <section className="mt-8">
          <SectionTitle title="Requieren atención" subtitle={plural(attention.length, "orden", "órdenes")} href="/ordenes" linkLabel="Ver órdenes" />
          <motion.div variants={staggerContainer(0.05, 0.25)} initial="hidden" animate="show">
            {attention.slice(0, ATTENTION_MAX).map((x) => (
              <AttentionRow key={x.o.id} item={x} lk={lk} role={user.role} now={now} />
            ))}
          </motion.div>
          {attention.length > ATTENTION_MAX && <MoreLink href="/ordenes">Ver {attention.length - ATTENTION_MAX} más en Órdenes</MoreLink>}
        </section>
      ) : (
        // management roles: say so when nothing waits on anyone (not when the card above already shows the only one)
        manager &&
        attentionAll.length === 0 && (
          <section className="mt-8">
            <SectionTitle title="Requieren atención" href="/ordenes" linkLabel="Ver órdenes" />
            <EmptyState icon={<Sparkles />} title="Todo al día" className="mt-3 py-9">
              No hay órdenes pendientes de acción.
            </EmptyState>
          </section>
        )
      )}

      {manager ? (
        <div className="mt-9">
          <ServicesHero stats={stats} now={now} month={month} onMonth={setMonth} />
          <PipelineTiles stats={stats} className="mt-3" />
          <ClosureBlockers className="mt-9" year={now.getFullYear()} incidentYear={incidentYear} bars={incidentBars} compliance={stats.compliance} />
        </div>
      ) : (
        <AuroraStat
          className="mt-9"
          label="Tu evidencia este año"
          value={
            <span className="flex items-baseline gap-2">
              <AnimatedNumber value={myPhotos} />
              <span className="text-[18px] font-normal tracking-normal text-subtle">fotos</span>
            </span>
          }
          sub={`En ${fmtNum(stats.yearClosed)} cierres · ${fmtNum(Math.round(stats.totalHours))} h reales · ${fmtPct(stats.compliance.rate)} con ANTES y DESPUÉS completos`}
        />
      )}
    </div>
  );
}

function kindLabel(it: PendingItem) {
  return { cierre: "Lista para cierre", evidencia: "Evidencia faltante", entrada: "Entrada de hoy", incidencia: "Incidencia abierta", reporte: "Reporte", encuesta: "Encuesta", caso: "Caso postventa", asignar: "Por asignar" }[it.kind];
}

function LiveCard({ j, now, lk, orders, photosCount }: { j: Jornada; now: Date; lk: ReturnType<typeof useLookups>; orders: ReturnType<typeof useScopedData>["orders"]; photosCount: number }) {
  const o = orders.find((x) => x.id === j.orderId);
  if (!o) return null;
  const site = lk.sites.get(o.siteId);
  const c = lk.clients.get(o.clientId);
  return (
    <NextStepCard
      avatar={<PulkroMark className="size-11 rounded-[13px]" animated />}
      name="En curso"
      sub={`${o.folio} · Jornada ${j.dayIndex} de ${o.plannedDays}`}
      value={<LiveClock minutes={jornadaMinutes(j, now)} />}
      message={
        <>
          {c?.shortName} · {site?.name}. Entrada a las <b className="font-semibold text-ink">{j.checkIn ? fmtTime(j.checkIn.deviceAt) : "—"}</b> con {plural(photosCount, "foto ANTES", "fotos ANTES")}. Al terminar registra la salida y las fotos DESPUÉS.
        </>
      }
      action={<BigButton href={`/jornada/${j.id}`}>Continuar jornada</BigButton>}
    />
  );
}

function LiveClock({ minutes }: { minutes: number }) {
  const h = Math.floor(minutes / 60);
  const m = String(Math.floor(minutes % 60)).padStart(2, "0");
  return (
    <span className="inline-flex items-center gap-1.5 text-st-blue" aria-label={`${h} horas ${m} minutos en sitio`}>
      <span className="size-2 animate-pulse rounded-full bg-st-blue" />
      {h}:{m}
      <span className="text-[13px] text-subtle">h</span>
    </span>
  );
}

function ItemCard({
  it,
  lk,
  data,
}: {
  it: PendingItem;
  lk: ReturnType<typeof useLookups>;
  data: Pick<ReturnType<typeof useScopedData>, "orders" | "jornadas" | "incidents" | "reports">;
}) {
  const o = data.orders.find((x) => x.id === it.orderId);
  const c = o ? lk.clients.get(o.clientId) : undefined;
  const site = o ? lk.sites.get(o.siteId) : undefined;
  const jornadaId = it.href.startsWith("/jornada/") ? it.href.split("/")[2] : undefined;
  const j = jornadaId ? data.jornadas.find((x) => x.id === jornadaId) : undefined;

  // A manual nudge from the office (logged by Evidencias → "Recordar") becomes the card's author.
  const nudge = j?.log.filter((l) => /recordatorio/i.test(l.text)).at(-1);
  const author = nudge ? lk.users.get(nudge.by) : undefined;

  const copy: Record<PendingItem["kind"], { msg: React.ReactNode; cta: string; value?: React.ReactNode }> = {
    cierre: { msg: <>{c?.shortName} · {o?.title}: las jornadas y las fotos ANTES y DESPUÉS están completas. Valida el cierre para generar el reporte.</>, cta: "Validar cierre", value: o?.folio },
    evidencia: { msg: <>{it.title.replace(" · ", " de la ")} en {o?.folio} ({c?.shortName}) antes de poder validar el cierre.</>, cta: it.title.includes("DESPUÉS") ? "Tomar foto DESPUÉS" : "Tomar foto ANTES", value: <Camera className="size-5 text-amber-fg" /> },
    entrada: { msg: <>La cuadrilla para {c?.shortName} · {site?.name} empieza a las {j ? fmtTime(j.plannedStart) : ""}. Registra la entrada con GPS al llegar.</>, cta: "Registrar entrada", value: j ? fmtTime(j.plannedStart) : undefined },
    incidencia: { msg: <>{it.title} Resuélvela para continuar con el cierre.</>, cta: "Resolver incidencia", value: o?.folio },
    reporte: { msg: <>El cierre de {o?.folio} está validado. Genera el reporte con fotos y compártelo con {o?.siteContact.name}.</>, cta: it.title.startsWith("Compartir") ? "Compartir reporte" : "Generar reporte", value: o?.folio },
    asignar: { msg: <>{o?.folio} · {c?.shortName} aún no tiene cuadrilla ni fechas confirmadas.</>, cta: "Asignar cuadrilla", value: o?.folio },
    caso: { msg: <>{it.title}</>, cta: "Atender caso", value: it.sub.split(" · ")[0] },
    encuesta: { msg: <>Pide a {c?.shortName} que califique el servicio {o?.folio}. La encuesta se abre sin instalar nada.</>, cta: "Enviar encuesta", value: o?.folio },
  };
  const k = copy[it.kind];
  return (
    <NextStepCard
      avatar={author ? <PersonAvatar initials={author.initials} hue={author.hue} size={44} /> : <PulkroMark className="size-11 rounded-[13px]" />}
      name={author ? author.name.split(" ").slice(0, 2).join(" ") : "Siguiente paso"}
      sub={author ? `${author.title} · ${fmtTime(nudge!.at)}` : kindLabel(it)}
      value={k.value}
      message={k.msg}
      action={<BigButton href={it.href}>{it.actionable ? k.cta : "Ver detalle"}</BigButton>}
    />
  );
}

