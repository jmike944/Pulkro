"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { isSameDay, parseISO } from "date-fns";
import { motion } from "motion/react";
import { ArrowRight, Camera, Check, ChevronDown, ChevronRight, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { useLookups } from "@/lib/hooks";
import { can, type Action } from "@/lib/permissions";
import { jornadaMinutes } from "@/lib/domain";
import { daysUntil, fmtDaysLeft, fmtDuration, fmtHours, fmtNum, fmtPct, plural } from "@/lib/format";
import type { Incident, Jornada, Order, Role, Worker } from "@/lib/types";
import { AnimatedNumber, AvatarStack, BarList, DateBadge, IconTile, Insight, MiniStat } from "@/components/pk/bits";
import { ClientMark } from "@/components/pk/client-mark";
import { MobileRow, TimeTile } from "@/components/pk/mobile";
import { rowVariants } from "@/components/pk/motion";
import { AuroraPanel, GlassCard } from "@/components/pk/aurora";
import { PillBars } from "@/components/pk/pill-bars";
import { BottomSheet } from "@/components/shell/bottom-sheet";
import { MONTHS_ES, type AttentionItem, type useHoyStats, type useIncidentYear } from "./use-hoy-stats";

/** Building blocks of the phone "Hoy" below the next-step card (kept out of today-mobile.tsx to keep that file readable). */
type Lookups = ReturnType<typeof useLookups>;

/* ───────────── section heading ───────────── */

/** "Requieren atención · 4 ........ Ver órdenes →". With a subtitle the link moves to its own row (long titles keep their width). */
export function SectionTitle({
  title,
  count,
  subtitle,
  href,
  linkLabel,
  className,
}: {
  title: string;
  count?: number;
  subtitle?: React.ReactNode;
  href?: string;
  linkLabel?: string;
  className?: string;
}) {
  // 44px hit area without growing the row: the padding is pulled back with negative margins
  const link = href && (
    <Link href={href} className="-my-2 -mr-2 inline-flex h-11 shrink-0 items-center gap-1 px-2 text-[14px] font-semibold text-link">
      {linkLabel}
      <ArrowRight className="size-4" />
    </Link>
  );
  return (
    <div className={cn("mb-1", className)}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[21px] font-medium tracking-[-0.01em] text-ink">
          {title}
          {count !== undefined && <span className="ml-2 text-[17px] font-normal text-subtle tabular">{count}</span>}
        </h2>
        {!subtitle && link}
      </div>
      {subtitle && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-[14px] text-subtle">{subtitle}</p>
          {link}
        </div>
      )}
    </div>
  );
}

/** Full-width "Ver 3 más en la agenda →" row closing a capped list. */
export function MoreLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="mt-2 flex h-11 items-center justify-center gap-1.5 rounded-[14px] bg-sand/70 text-[14px] font-semibold text-link active:bg-sand">
      {children}
      <ArrowRight className="size-4" />
    </Link>
  );
}

/* ───────────── jornadas de hoy ───────────── */

function PhotoChip({ label, count, missing }: { label: string; count: number; missing: boolean }) {
  const tone = missing
    ? "bg-amber-soft text-amber-fg ring-1 ring-inset ring-amber-line"
    : count > 0
      ? label === "ANTES"
        ? "bg-blue-soft text-link"
        : "bg-teal-soft text-teal-fg"
      : "bg-tile text-faint";
  return (
    <span className={cn("inline-flex h-[22px] items-center gap-1 rounded-md px-1.5 text-[10.5px] font-bold tracking-[0.06em] tabular", tone)}>
      {missing && <span className="sr-only">Falta foto </span>}
      {label}
      <span>{missing && count === 0 ? "!" : count}</span>
    </span>
  );
}

/**
 * One of today's jornadas: the tappable MobileRow (time, title, folio · client, status) plus a strip with the
 * crew (tap for names) and ANTES / DESPUÉS photo counts, so the office sees who is where and what evidence is missing.
 */
export function JornadaRow({ j, o, lk, now, photos }: { j: Jornada; o: Order; lk: Lookups; now: Date; photos: { antes: number; despues: number } }) {
  const c = lk.clients.get(o.clientId);
  const site = lk.sites.get(o.siteId);
  const crew = j.workerIds.map((id) => lk.workers.get(id)).filter((w): w is Worker => !!w);
  const live = j.status === "en_curso";
  const st = live
    ? { tone: "blue" as const, label: `En curso · ${fmtDuration(jornadaMinutes(j, now))}`, live: true }
    : j.status === "cerrada"
      ? { tone: "teal" as const, label: `Cerrada · ${fmtHours(jornadaMinutes(j))}` }
      : { tone: "slate" as const, label: `Programada · J${j.dayIndex} de ${o.plannedDays}` };
  return (
    <motion.div variants={rowVariants} className="border-b border-hairline last:border-0">
      <MobileRow
        className="border-0 pb-2"
        href={`/jornada/${j.id}`}
        leading={<TimeTile date={j.plannedStart} tone={live ? "live" : undefined} />}
        title={o.title.split(" · ")[0]}
        meta={
          <>
            {c && <ClientMark name={c.name} hue={c.hue} size={18} className="rounded-[5px]" />}
            <span className="truncate">
              {o.folio} · {c?.shortName} · {site?.municipality}
            </span>
          </>
        }
        status={st}
      />
      {/* 70px = time tile (54) + row gap (16): lines up under the text */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pb-3.5 pl-[70px]">
        {crew.length > 0 ? <AvatarStack people={crew} size={24} max={4} /> : <span className="text-[12.5px] font-medium text-amber-fg">Sin cuadrilla</span>}
        {j.status !== "pendiente" && (
          <span className="flex items-center gap-1.5">
            <PhotoChip label="ANTES" count={photos.antes} missing={photos.antes === 0} />
            <PhotoChip label="DESPUÉS" count={photos.despues} missing={j.status === "cerrada" && photos.despues === 0} />
          </span>
        )}
      </div>
    </motion.div>
  );
}

/* ───────────── requieren atención ───────────── */

/** Who can act on each nextAction() verb — same matrix as ACTION_RULES in ordenes/row-bits.tsx (doc §2). */
const ACTION_GATE: Record<string, Action> = {
  Asignar: "crew.assign",
  Entrada: "field.capture",
  Continuar: "field.capture",
  Solicitar: "field.capture",
  Cerrar: "closure.authorize",
  Generar: "report.share",
  Compartir: "report.share",
  Resolver: "field.capture",
  Encuesta: "postventa.manage",
  Atender: "postventa.manage",
  Confirmar: "crew.assign",
};

/**
 * Order row of the attention list: start date, title, folio · client + deadline, next-action status (+ real hours).
 * The whole row is the link. Roles that cannot do the next action (Dirección, Administración) land on the order
 * instead of the action; the verb pill (decorative, never a nested link) only shows for roles that can act.
 */
export function AttentionRow({ item, lk, role, now }: { item: AttentionItem; lk: Lookups; role: Role; now: Date }) {
  const { o, a, minutes } = item;
  const client = lk.clients.get(o.clientId);
  const st = lk.serviceTypes.get(o.serviceTypeId);
  const gate = ACTION_GATE[a.label];
  const allowed = !gate || can(role, gate);
  const dl = daysUntil(o.scheduledEnd);
  return (
    <motion.div variants={rowVariants} className="border-b border-hairline last:border-0">
      <MobileRow
        className="gap-3 border-0"
        href={allowed ? a.href : `/ordenes/${o.folio}`}
        leading={<DateBadge date={o.scheduledStart} tone={isSameDay(parseISO(o.scheduledStart), now) ? "today" : undefined} />}
        title={o.title}
        meta={
          <>
            <span className="min-w-0 truncate">
              {o.folio} · {client?.shortName ?? st?.short}
            </span>
            <span className="flex shrink-0 items-center gap-1.5 font-medium text-ink/80">
              <span className={cn("size-[6px] shrink-0 rounded-full", dl <= 1 ? "bg-st-red" : "bg-st-amber")} />
              <span className="sr-only">Fecha límite: </span>
              {fmtDaysLeft(o.scheduledEnd)}
            </span>
          </>
        }
        status={{ tone: a.tone, label: minutes ? `${a.status} · ${fmtHours(minutes)}` : a.status }}
        trailing={
          allowed && a.label !== "Ver" ? (
            <>
              {/* phones: the chevron only, the status line already names the step and the pill would leave ~150px for the text */}
              <ChevronRight className="size-[18px] shrink-0 text-faint sm:hidden" />
              <span
                className={cn(
                  "hidden h-9 min-w-[72px] shrink-0 items-center justify-center rounded-[12px] px-3.5 text-[14px] font-semibold sm:inline-flex",
                  a.variant === "primary" ? "bg-brand-deep text-white" : "border border-line bg-surface text-ink",
                )}
              >
                {a.label}
              </span>
            </>
          ) : undefined
        }
      />
    </motion.div>
  );
}

/* ───────────── servicios terminados (Dirección · Administración) ───────────── */

type HoyStats = ReturnType<typeof useHoyStats>;

/**
 * Month KPI hero: services closed in the chosen month with the month-over-month delta, the year's totals and the
 * services-by-month bars. A tap on a bar or on the month chip (bottom sheet) changes the month.
 */
export function ServicesHero({ stats, now, month, onMonth }: { stats: HoyStats; now: Date; month: number; onMonth: (m: number) => void }) {
  const [open, setOpen] = useState(false);
  const year = now.getFullYear();
  // 12 bars at 320px leave ~18px per slot: "Mar" and "May" would touch, so December falls back to initials
  const bars = useMemo(
    () => stats.byMonth.map((m) => ({ key: String(m.month), label: stats.byMonth.length > 11 ? m.label.slice(0, 1) : m.label, value: m.value })),
    [stats.byMonth],
  );
  return (
    <AuroraPanel className="p-3">
      <GlassCard className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-3">
          <div className="flex items-center gap-3">
            <IconTile>
              <Sparkles />
            </IconTile>
            <span className="text-[15px] font-medium text-ink">Servicios terminados</span>
          </div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-haspopup="dialog"
            aria-label={`Mes: ${MONTHS_ES[month]}. Cambiar mes`}
            className="inline-flex h-11 items-center gap-2 rounded-[12px] bg-tile px-4 text-[14px] font-semibold text-ink transition active:scale-95"
          >
            {MONTHS_ES[month]}
            <ChevronDown className="size-4" />
          </button>
        </div>
        <div className="mt-4 flex items-end gap-3">
          <AnimatedNumber value={stats.current} className="text-[64px] font-medium leading-none tracking-[-0.045em] text-ink" />
          <span className="mb-2 text-[15px] text-subtle">{stats.current === 1 ? "servicio" : "servicios"}</span>
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
      </GlassCard>

      <div className="px-2 pb-2 pt-6">
        <p className="text-[14px] font-medium text-ink/70">Terminados en {year}</p>
        <AnimatedNumber value={stats.yearClosed} className="mt-1 block text-[38px] font-medium leading-none tracking-[-0.03em] text-ink" />
        <p className="mt-2 text-[14px] text-ink/70">
          {fmtNum(Math.round(stats.totalHours))} h reales · {fmtPct(stats.compliance.rate)} cumplimiento fotográfico
        </p>
        <PillBars data={bars} highlight={month} height={140} className="mt-6" onSelect={onMonth} />
      </div>

      <MonthSheet
        open={open}
        onOpenChange={setOpen}
        year={year}
        month={month}
        currentMonth={now.getMonth()}
        months={stats.byMonth}
        onPick={(m) => {
          onMonth(m);
          setOpen(false);
        }}
      />
    </AuroraPanel>
  );
}

/** Bottom sheet with one 60px row per month (newest first), the services closed in it and a check on the active one. */
function MonthSheet({
  open,
  onOpenChange,
  year,
  month,
  currentMonth,
  months,
  onPick,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  year: number;
  month: number;
  currentMonth: number;
  months: HoyStats["byMonth"];
  onPick: (m: number) => void;
}) {
  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title="Mes" description={`Servicios terminados por mes en ${year}.`}>
      <ul role="radiogroup" aria-label="Mes" className="space-y-0.5">
        {months
          .slice()
          .reverse()
          .map((m) => {
            const active = m.month === month;
            return (
              <li key={m.month}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => onPick(m.month)}
                  className={cn("flex h-[60px] w-full items-center gap-3.5 rounded-[14px] px-2.5 text-left transition active:bg-sand", active && "bg-blue-wash")}
                >
                  <span className={cn("inline-flex size-10 shrink-0 items-center justify-center rounded-[12px] text-[13px] font-bold tracking-wide", active ? "bg-blue-tint text-azure-fg" : "bg-sand text-ink")}>{m.label}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[16px] font-semibold text-ink">{MONTHS_ES[m.month]}</span>
                    <span className="block truncate text-[13.5px] text-subtle">
                      {plural(m.value, "servicio", "servicios")}
                      {m.month === currentMonth ? " · mes en curso" : ""}
                    </span>
                  </span>
                  {active && <Check className="size-5 shrink-0 text-azure-fg" />}
                </button>
              </li>
            );
          })}
      </ul>
    </BottomSheet>
  );
}

/* ───────────── pipeline ───────────── */

/** Pendientes / En proceso / Incidencias abiertas as three tappable tiles (the desktop MiniStat strip). */
export function PipelineTiles({ stats, className }: { stats: HoyStats; className?: string }) {
  const tiles = [
    { tone: "blue", label: "Pendientes", value: stats.buckets.pendientes.length, sub: "órdenes", href: "/ordenes" },
    { tone: "amber", label: "En proceso", value: stats.buckets.enProceso.length, sub: "órdenes", href: "/ordenes" },
    { tone: "red", label: "Incidencias", value: stats.incidentsOpen, sub: "abiertas", href: "/incidencias" },
  ] as const;
  return (
    <div className={cn("grid grid-cols-3 gap-2", className)}>
      {tiles.map((t) => (
        <Link key={t.label} href={t.href} className="rounded-[18px] border border-hairline bg-surface px-2.5 py-3 transition active:bg-sand/60">
          <MiniStat tone={t.tone} label={t.label} value={t.value} sub={t.sub} />
        </Link>
      ))}
    </div>
  );
}

/* ───────────── qué detiene los cierres ───────────── */

/** The year's incidents by type plus the photo-compliance insight, linking out to Incidencias and Evidencias. */
export function ClosureBlockers({
  year,
  incidentYear,
  bars,
  compliance,
  className,
}: {
  year: number;
  incidentYear: Incident[];
  bars: ReturnType<typeof useIncidentYear>["incidentBars"];
  compliance: HoyStats["compliance"];
  className?: string;
}) {
  const shown = bars.filter((b) => b.count > 0);
  return (
    <section className={className}>
      <SectionTitle title="Qué detiene los cierres" subtitle={`${plural(incidentYear.length, "incidencia", "incidencias")} · ${year}`} href="/incidencias" linkLabel="Ver incidencias" />
      {shown.length > 0 ? (
        <BarList className="mt-4" items={shown.map((b) => ({ label: b.label, value: b.count, pct: b.pct }))} />
      ) : (
        <p className="mt-3 text-[14px] text-subtle">Sin incidencias registradas este año.</p>
      )}
      <Insight icon={<Camera />} className="mt-6">
        {compliance.total === 0 ? (
          <>Aún no hay cierres validados este año.</>
        ) : (
          <>
            Faltó la foto <b className="font-semibold">DESPUÉS</b> en {compliance.missingDespues} de {fmtNum(compliance.total)} cierres del año
            {compliance.withException ? `, ${compliance.withException} con excepción autorizada` : ""}.
          </>
        )}
        {/* the Insight's own link is a 20px target: this one pulls its 44px hit area back with negative margins */}
        <Link href="/evidencias" className="-mb-2.5 mt-0.5 flex min-h-11 w-fit items-center gap-1.5 font-semibold text-link">
          Ver cumplimiento fotográfico
          <ArrowRight className="size-4" />
        </Link>
      </Insight>
    </section>
  );
}
