"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { isSameDay, parseISO } from "date-fns";
import { motion } from "motion/react";
import { Camera, ChevronDown, Clock, MapPin, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLookups, useMediaQuery, useNow, useScopedData } from "@/lib/hooks";
import { TodayMobile } from "./today-mobile";
import { MONTHS_ES, useAttention, useHoyStats, useIncidentYear } from "./use-hoy-stats";
import { firstName, fmtDaysLeft, fmtDuration, fmtHours, fmtNum, fmtPct, fmtTime, greeting, daysUntil, plural } from "@/lib/format";
import { jornadaMinutes } from "@/lib/domain";
import { ROLE_LABEL } from "@/lib/status";
import type { Jornada, Order } from "@/lib/types";
import { PageHeader } from "@/components/pk/page";
import { AuroraPanel, GlassCard } from "@/components/pk/aurora";
import { PillBars } from "@/components/pk/pill-bars";
import { AnimatedNumber, AvatarStack, BarList, CornerLink, DateBadge, IconTile, Insight, MiniStat, SectionHeader } from "@/components/pk/bits";
import { ToneText, StatusDot } from "@/components/pk/status";
import { EmptyState } from "@/components/pk/feedback";
import { EASE, rowVariants, staggerContainer } from "@/components/pk/motion";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useCanSeeRoute } from "@/components/shell/use-can-see-route";

export function DashboardView() {
  const desktop = useMediaQuery("(min-width: 1024px)");
  return desktop ? <DesktopDashboard /> : <TodayMobile />;
}

function DesktopDashboard() {
  const data = useScopedData();
  const { user, orders, jornadas, photos } = data;
  const lk = useLookups();
  const now = useNow(60_000);
  const [month, setMonthIdx] = useState(now.getMonth());
  const canSee = useCanSeeRoute();
  // Agenda, Jornada, Incidencias and Evidencias are supervisor screens: other roles get the map, the order detail,
  // the orders with incidents and Indicadores › Calidad instead (never the "not available for your role" page).
  const dayLink = canSee("/agenda") ? { href: "/agenda", label: "Abrir agenda" } : { href: "/mapa", label: "Ver mapa" };
  const incidentsLink = canSee("/incidencias") ? { href: "/incidencias", label: "Ver incidencias" } : { href: "/ordenes?tab=incidencia", label: "Ver órdenes con incidencia" };
  const complianceHref = canSee("/evidencias") ? "/evidencias" : canSee("/indicadores") ? "/indicadores?tab=calidad" : undefined;
  const jornadaHref = (j: Jornada, o: Order) => (canSee(`/jornada/${j.id}`) ? `/jornada/${j.id}` : `/ordenes/${o.folio}?tab=jornadas`);

  const stats = useHoyStats(data, now, month);

  const today = useMemo(
    () =>
      jornadas
        .filter((j) => isSameDay(parseISO(j.plannedStart), now) || j.status === "en_curso")
        .sort((a, b) => (a.status === "en_curso" ? -1 : 0) - (b.status === "en_curso" ? -1 : 0) || a.plannedStart.localeCompare(b.plannedStart)),
    [jornadas, now],
  );

  const { top: attention } = useAttention(data, now);

  const readyToClose = attention.filter((x) => x.a.status === "Lista para cierre").length;

  const { incidentYear, incidentBars } = useIncidentYear(data, now);

  const description = (
    <>
      <b>{plural(today.length, "jornada", "jornadas")}</b> en campo hoy.{" "}
      {readyToClose > 0 && (
        <>
          <b>{plural(readyToClose, "orden lista", "órdenes listas")}</b> para cierre
          {stats.incidentsOpen ? " y " : "."}
        </>
      )}
      {stats.incidentsOpen > 0 && (
        <>
          <b>{plural(stats.incidentsOpen, "incidencia abierta", "incidencias abiertas")}</b>.
        </>
      )}
    </>
  );

  return (
    <div>
      <PageHeader title={`${greeting(now)}, ${firstName(user.name)}`} description={description} />

      {/* ── Hero ── */}
      <AuroraPanel className="p-3 sm:p-6 lg:p-8">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-10">
          <GlassCard className="p-5 sm:p-7">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <IconTile>
                  <Sparkles />
                </IconTile>
                <span className="text-[15px] font-medium text-ink">Servicios terminados</span>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger className="inline-flex h-9 items-center gap-2 rounded-[10px] bg-tile px-3 text-[14px] font-medium text-ink outline-none transition hover:bg-press">
                  {MONTHS_ES[month]}
                  <ChevronDown className="size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {MONTHS_ES.slice(0, now.getMonth() + 1).map((m, i) => (
                    <DropdownMenuItem key={m} onClick={() => setMonthIdx(i)}>
                      {m}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="mt-5 flex items-end gap-3">
              <AnimatedNumber value={stats.current} className="text-[64px] font-medium leading-none tracking-[-0.045em] text-ink sm:text-[76px]" />
              <span className="mb-2 text-[15px] text-subtle">servicios</span>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2.5 text-[14px] text-subtle">
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-[8px] px-2 py-1 text-[13px] font-semibold",
                  stats.delta >= 0 ? "bg-blue-tint text-azure-fg" : "bg-red-soft text-red-fg",
                )}
              >
                {stats.delta >= 0 ? <TrendingUp className="size-4" /> : <TrendingDown className="size-4" />}
                {fmtPct(Math.abs(stats.delta), 1)}
              </span>
              vs {stats.prev} en {stats.prevLabel}
            </div>
            <div className="mt-6 grid grid-cols-3 divide-x divide-hairline border-t border-hairline pt-5">
              <MiniStat tone="blue" label="Pendientes" value={stats.buckets.pendientes.length} sub="órdenes" className="pr-3" />
              <MiniStat tone="amber" label="En proceso" value={stats.buckets.enProceso.length} sub="órdenes" className="px-3 sm:px-5" />
              <MiniStat tone="red" label="Incidencias" value={stats.incidentsOpen} sub="abiertas" className="pl-3 sm:pl-5" />
            </div>
          </GlassCard>

          <div className="flex min-w-0 flex-col px-1 pb-1 sm:px-0">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[14px] font-medium text-ink/70">Terminados en {now.getFullYear()}</p>
                <AnimatedNumber value={stats.yearClosed} className="mt-1 block text-[38px] font-medium leading-none tracking-[-0.03em] text-ink" />
                <p className="mt-2 text-[14px] text-ink/70">
                  {fmtNum(Math.round(stats.totalHours))} h reales · {fmtPct(stats.compliance.rate)} cumplimiento fotográfico
                </p>
              </div>
            </div>
            <PillBars data={stats.byMonth} highlight={month} className="mt-6 flex-1" height={210} onSelect={(i) => setMonthIdx(i)} />
          </div>
        </div>
      </AuroraPanel>

      {/* ── Hoy en campo ── */}
      <section className="mt-10">
        <SectionHeader
          title="Hoy en campo"
          subtitle={user.role === "supervisor" ? "Tus jornadas de hoy" : `${ROLE_LABEL[user.role]} · todas las cuadrillas visibles`}
          href={dayLink.href}
          linkLabel={dayLink.label}
        />
        {today.length === 0 ? (
          <EmptyState icon={<Clock />} title="Sin jornadas hoy">
            No hay cuadrillas programadas para hoy en tu alcance.
          </EmptyState>
        ) : (
          <motion.div
            variants={staggerContainer(0.06, 0.2)}
            initial="hidden"
            animate="show"
            className="scrollbar-none -mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 sm:-mx-7 sm:px-7 lg:-mx-1 lg:px-1"
          >
            {today.map((j) => (
              <TodayCard key={j.id} j={j} order={orders.find((o) => o.id === j.orderId)!} now={now} lk={lk} photosCount={photos.filter((p) => p.jornadaId === j.id)} href={jornadaHref} />
            ))}
          </motion.div>
        )}
      </section>

      {/* ── Attention + Incidents ── */}
      <section className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:gap-0">
        <div className="min-w-0 lg:border-r lg:border-hairline lg:pr-10">
          <SectionHeader title={`Requieren atención · ${attention.length}`} href="/ordenes" linkLabel="Ver órdenes" />
          {attention.length === 0 ? (
            <EmptyState icon={<Sparkles />} title="Todo al día">
              No hay órdenes pendientes de acción. ¡Impecable!
            </EmptyState>
          ) : (
            <div>
              <div className="hidden grid-cols-[64px_minmax(0,1fr)_148px_64px_92px] gap-4 border-b border-hairline pb-3 text-[12px] font-semibold uppercase tracking-[0.1em] text-subtle md:grid">
                <span>Fecha</span>
                <span>Orden</span>
                <span>Estado</span>
                <span className="text-right">Horas</span>
                <span />
              </div>
              <motion.ul variants={staggerContainer(0.05, 0.25)} initial="hidden" animate="show">
                {attention.map(({ o, a, minutes }) => {
                  const client = lk.clients.get(o.clientId);
                  const st = lk.serviceTypes.get(o.serviceTypeId);
                  const dl = daysUntil(o.scheduledEnd);
                  return (
                    <motion.li
                      key={o.id}
                      variants={rowVariants}
                      className="grid grid-cols-[52px_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 border-b border-hairline py-4 md:grid-cols-[64px_minmax(0,1fr)_148px_64px_92px]"
                    >
                      <DateBadge date={o.scheduledStart} tone={isSameDay(parseISO(o.scheduledStart), now) ? "today" : undefined} />
                      <Link href={`/ordenes/${o.folio}`} className="group min-w-0">
                        <p className="truncate text-[15px] font-semibold text-ink group-hover:text-link">{o.title}</p>
                        <p className="mt-0.5 flex items-center gap-1.5 truncate text-[13px] text-subtle">
                          {o.folio} · {client?.shortName ?? st?.short}
                          <span className={cn("ml-0.5 size-[6px] shrink-0 rounded-full", dl <= 1 ? "bg-st-red" : "bg-st-amber")} />
                          <span className="font-medium text-ink/80">{fmtDaysLeft(o.scheduledEnd)}</span>
                        </p>
                      </Link>
                      <span className="col-start-2 md:col-start-auto">
                        <ToneText tone={a.tone}>{a.status}</ToneText>
                      </span>
                      <span className="hidden text-right text-[15px] font-semibold text-ink tabular md:block">{minutes ? fmtHours(minutes) : "—"}</span>
                      <span className="col-start-3 row-span-2 row-start-1 flex justify-end md:col-start-auto md:row-span-1 md:row-start-auto">
                        <Button
                          asChild
                          size="lg"
                          variant={a.variant === "primary" ? "default" : "outline"}
                          className={cn("h-10 min-w-[84px] rounded-[12px] px-4 text-[14px] font-semibold", a.variant !== "primary" && "border-line shadow-[0_1px_2px_rgb(16_24_40/0.05)]")}
                        >
                          <Link href={a.href}>{a.label}</Link>
                        </Button>
                      </span>
                    </motion.li>
                  );
                })}
              </motion.ul>
            </div>
          )}
        </div>

        <div className="min-w-0 lg:pl-10">
          <div className="mb-1 flex items-start justify-between gap-4">
            <h2 className="text-[19px] font-medium tracking-[-0.01em] text-ink">Qué detiene los cierres</h2>
            <CornerLink href={incidentsLink.href} label={incidentsLink.label} />
          </div>
          <p className="mb-6 text-[13.5px] text-subtle">
            {plural(incidentYear.length, "incidencia", "incidencias")} · {now.getFullYear()}
          </p>
          <BarList items={incidentBars.map((b) => ({ label: b.label, value: b.count, pct: b.pct }))} />
          <Insight icon={<Camera />} href={complianceHref} linkLabel="Ver cumplimiento fotográfico" className="mt-8">
            Faltó la foto <b className="font-semibold">DESPUÉS</b> en {stats.compliance.missingDespues} de {fmtNum(stats.compliance.total)} cierres del año
            {stats.compliance.withException ? `, ${stats.compliance.withException} con excepción autorizada` : ""}.
          </Insight>
        </div>
      </section>
    </div>
  );
}

function TodayCard({
  j,
  order,
  now,
  lk,
  photosCount,
  href,
}: {
  j: Jornada;
  order: Order;
  now: Date;
  lk: ReturnType<typeof useLookups>;
  photosCount: { kind: string }[];
  href: (j: Jornada, o: Order) => string;
}) {
  if (!order) return null;
  const client = lk.clients.get(order.clientId);
  const site = lk.sites.get(order.siteId);
  const crew = j.workerIds.map((id) => lk.workers.get(id)!).filter(Boolean);
  const live = j.status === "en_curso";
  const antes = photosCount.filter((p) => p.kind === "antes").length;
  const despues = photosCount.filter((p) => p.kind === "despues").length;
  return (
    <motion.div variants={rowVariants} className="snap-start">
      <Link
        href={href(j, order)}
        className={cn(
          "group relative flex w-[290px] flex-col overflow-hidden rounded-[22px] border p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-lift",
          live ? "border-transparent bg-brand-deep text-white" : "border-hairline bg-surface",
        )}
      >
        {live && <span className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full bg-sky/25 blur-2xl" />}
        <div className="relative flex items-center justify-between">
          <span className={cn("inline-flex items-center gap-2 text-[12.5px] font-semibold", live ? "text-sky" : "text-subtle")}>
            <StatusDot tone={live ? "sky" : j.status === "cerrada" ? "teal" : "blue"} live={live} />
            {live ? "En curso" : j.status === "cerrada" ? "Cerrada" : `Inicia ${fmtTime(j.plannedStart)}`}
          </span>
          <span className={cn("text-[12px] tabular", live ? "text-white/60" : "text-subtle")}>
            {order.folio} · J{j.dayIndex}/{order.plannedDays}
          </span>
        </div>
        <p className={cn("relative mt-4 line-clamp-2 text-[16px] font-semibold leading-snug", live ? "text-white" : "text-ink")}>{order.title}</p>
        <p className={cn("relative mt-1 flex items-center gap-1.5 truncate text-[13px]", live ? "text-white/70" : "text-subtle")}>
          <MapPin className="size-3.5 shrink-0" /> {client?.shortName} · {site?.municipality}
        </p>
        <div className="relative mt-5 flex items-end justify-between">
          <div>
            {live ? (
              <>
                <p className="text-[11px] uppercase tracking-[0.12em] text-white/50">Tiempo en sitio</p>
                <p className="text-[24px] font-medium tracking-tight tabular">{fmtDuration(jornadaMinutes(j, now))}</p>
              </>
            ) : (
              <AvatarStack people={crew} size={28} interactive={false} />
            )}
          </div>
          <div className="flex gap-1.5 text-[11px] font-bold tracking-[0.06em]">
            <span className={cn("rounded-md px-1.5 py-0.5", antes ? (live ? "bg-white/15 text-white" : "bg-amber-soft text-amber-fg") : live ? "bg-white/5 text-white/40" : "bg-muted text-faint")}>
              ANTES {antes || ""}
            </span>
            <span className={cn("rounded-md px-1.5 py-0.5", despues ? (live ? "bg-white/15 text-white" : "bg-teal-soft text-teal-fg") : live ? "bg-white/5 text-white/40" : "bg-muted text-faint")}>
              DESPUÉS {despues || ""}
            </span>
          </div>
        </div>
        {live && (
          <motion.span
            className="absolute inset-x-0 bottom-0 h-[3px] bg-gradient-to-r from-transparent via-sky to-transparent"
            animate={{ x: ["-100%", "100%"] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: EASE }}
          />
        )}
      </Link>
    </motion.div>
  );
}
