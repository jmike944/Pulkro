"use client";

import Link from "next/link";
import { useMemo } from "react";
import { isSameDay, parseISO } from "date-fns";
import { motion } from "motion/react";
import { ArrowRight, Camera, Clock, WifiOff } from "lucide-react";
import { useCan, useIsOffline, useLookups, useNow, useScopedData, useSyncSummary } from "@/lib/hooks";
import { closedAt, photoCompliance } from "@/lib/metrics";
import { jornadaMinutes } from "@/lib/domain";
import { firstName, fmtDuration, fmtHours, fmtLongDay, fmtNum, fmtPct, fmtTime, greeting, plural } from "@/lib/format";
import type { Jornada } from "@/lib/types";
import { PulkroMark } from "@/components/pk/brand";
import { AnimatedNumber, PersonAvatar } from "@/components/pk/bits";
import { ClientMark } from "@/components/pk/client-mark";
import { EmptyState } from "@/components/pk/feedback";
import { AuroraStat, BigButton, MobileGreeting, MobileRow, NextStepCard, TimeTile } from "@/components/pk/mobile";
import { rowVariants, staggerContainer } from "@/components/pk/motion";
import { ProfileAvatar } from "@/components/shell/header-tools";
import { usePendingItems, type PendingItem } from "@/features/pendientes/use-pending-items";

/** Mobile "Hoy" (PWA home) — mirrors the reference Today screen. */
export function TodayMobile() {
  const data = useScopedData();
  const { user, orders, jornadas, photos, incidents, reports } = data;
  const lk = useLookups();
  const now = useNow(30_000);
  const offline = useIsOffline();
  const { pending } = useSyncSummary();
  const { items } = usePendingItems();
  const canCapture = useCan("field.capture");

  const today = useMemo(
    () =>
      jornadas
        .filter((j) => isSameDay(parseISO(j.plannedStart), now) || j.status === "en_curso")
        .filter((j) => orders.find((o) => o.id === j.orderId)?.status !== "cancelada")
        .sort((a, b) => a.plannedStart.localeCompare(b.plannedStart)),
    [jornadas, orders, now],
  );
  const live = today.find((j) => j.status === "en_curso");

  /* ── the one card that matters right now ── */
  const card = useMemo(() => {
    const actionable = items.filter((i) => i.actionable);
    const blocking = actionable.find((i) => i.kind === "incidencia" && i.rank === 0);
    if (live && canCapture && !blocking) return { type: "live" as const, j: live };
    const it = blocking ?? actionable[0] ?? items[0];
    return it ? { type: "item" as const, it } : null;
  }, [items, live, canCapture]);

  const stat = useMemo(() => {
    const year = now.getFullYear();
    const closed = orders.filter((o) => closedAt(o)?.getFullYear() === year);
    const comp = photoCompliance(closed, jornadas, photos);
    if (user.role === "supervisor") {
      const mine = photos.filter((p) => p.by === user.id && parseISO(p.takenAt).getFullYear() === year && (p.kind === "antes" || p.kind === "despues")).length;
      return { label: "Tu evidencia este año", value: mine, unit: "fotos", sub: `En ${fmtNum(closed.length)} cierres · ${fmtPct(comp.rate)} con ANTES y DESPUÉS completos` };
    }
    const minutes = jornadas.filter((j) => j.checkOut && closed.some((o) => o.id === j.orderId)).reduce((s, j) => s + jornadaMinutes(j), 0);
    return { label: `Servicios terminados en ${year}`, value: closed.length, unit: "servicios", sub: `${fmtNum(Math.round(minutes / 60))} h reales · ${fmtPct(comp.rate)} cumplimiento fotográfico` };
  }, [orders, jornadas, photos, user, now]);

  const more = items.filter((i) => i.actionable && (card?.type !== "item" || i.id !== card.it.id)).slice(0, 3);

  return (
    <div>
      <MobileGreeting eyebrow={fmtLongDay(now)} title={`${greeting(now)}, ${firstName(user.name)}`} avatar={<ProfileAvatar className="size-12" />} />

      {offline && (
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="mb-5 flex items-center gap-3 rounded-[16px] bg-[#fff6e6] px-4 py-3 text-[14px] text-[#8a5300]">
          <WifiOff className="size-4 shrink-0" />
          <span>
            <b className="font-semibold">Sin conexión.</b> Todo lo que captures se guarda aquí{pending.length ? ` (${pending.length} por enviar)` : ""}.
          </span>
        </motion.div>
      )}

      {card?.type === "live" && <LiveCard j={card.j} now={now} lk={lk} orders={orders} photosCount={photos.filter((p) => p.jornadaId === card.j.id && p.kind === "antes").length} />}
      {card?.type === "item" && <ItemCard it={card.it} lk={lk} data={{ orders, jornadas, incidents, reports }} />}

      <section className="mt-8">
        <div className="mb-1 flex items-baseline justify-between">
          <h2 className="text-[21px] font-medium tracking-[-0.01em] text-ink">Jornadas de hoy</h2>
          <span className="text-[14px] text-subtle">{plural(today.length, "jornada", "jornadas")}</span>
        </div>
        {today.length === 0 ? (
          <EmptyState icon={<Clock />} title="Sin jornadas hoy" className="mt-3 py-9">
            No hay cuadrillas programadas para hoy.
          </EmptyState>
        ) : (
          <motion.div variants={staggerContainer(0.05, 0.25)} initial="hidden" animate="show">
            {today.map((j) => {
              const o = orders.find((x) => x.id === j.orderId);
              if (!o) return null;
              const c = lk.clients.get(o.clientId);
              const site = lk.sites.get(o.siteId);
              const st =
                j.status === "en_curso"
                  ? { tone: "blue" as const, label: `En curso · ${fmtDuration(jornadaMinutes(j, now))}`, live: true }
                  : j.status === "cerrada"
                    ? { tone: "teal" as const, label: `Cerrada · ${fmtHours(jornadaMinutes(j))}` }
                    : { tone: "slate" as const, label: `Programada · J${j.dayIndex} de ${o.plannedDays}` };
              return (
                <motion.div key={j.id} variants={rowVariants}>
                  <MobileRow
                    href={`/jornada/${j.id}`}
                    leading={<TimeTile date={j.plannedStart} tone={j.status === "en_curso" ? "live" : undefined} />}
                    title={o.title.split(" · ")[0]}
                    meta={
                      <>
                        {c && <ClientMark name={c.name} hue={c.hue} size={18} className="rounded-[5px]" />}
                        <span className="truncate">
                          {c?.shortName} · {site?.municipality}
                        </span>
                      </>
                    }
                    status={st}
                  />
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </section>

      {more.length > 0 && (
        <section className="mt-8">
          <div className="mb-1 flex items-baseline justify-between">
            <h2 className="text-[21px] font-medium tracking-[-0.01em] text-ink">También pendiente</h2>
            <Link href="/pendientes" className="flex items-center gap-1 text-[14px] font-semibold text-link">
              Ver todo <ArrowRight className="size-4" />
            </Link>
          </div>
          {more.map((it) => (
            <MobileRow key={it.id} href={it.href} title={it.title} meta={<span className="truncate">{it.sub}</span>} status={{ tone: it.tone, label: kindLabel(it) }} />
          ))}
        </section>
      )}

      <AuroraStat
        className="mt-9"
        label={stat.label}
        value={
          <span className="flex items-baseline gap-2">
            <AnimatedNumber value={stat.value} />
            <span className="text-[18px] font-normal tracking-normal text-subtle">{stat.unit}</span>
          </span>
        }
        sub={stat.sub}
      />
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
    evidencia: { msg: <>{it.title.replace(" · ", " de la ")} en {o?.folio} ({c?.shortName}) antes de poder validar el cierre.</>, cta: it.title.includes("DESPUÉS") ? "Tomar foto DESPUÉS" : "Tomar foto ANTES", value: <Camera className="size-5 text-[#b86e00]" /> },
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

