"use client";

import { AnimatePresence, motion } from "motion/react";
import { differenceInMinutes, isSameDay, parseISO } from "date-fns";
import { Camera, ChevronRight, CircleCheck, CloudOff, Headset, Lock, LocateFixed, LogOut, MapPin, NotebookPen, Sparkles, Timer, TriangleAlert, UsersRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNow } from "@/lib/hooks";
import { jornadaMinutes } from "@/lib/domain";
import { fmtDuration, fmtRelativeDay, fmtTime } from "@/lib/format";
import type { GeoStamp } from "@/lib/types";
import { AnimatedNumber, AvatarStack } from "@/components/pk/bits";
import { Bubbles } from "@/components/pk/aurora";
import { StatusDot } from "@/components/pk/status";
import { EASE } from "@/components/pk/motion";
import { Button } from "@/components/ui/button";
import { Gate, fmtClock, fmtShortDay } from "./field-bits";
import type { FieldReady } from "./use-field-state";

export type HeroActions = {
  checkIn: () => void;
  checkOut: () => void;
  crew: () => void;
  photo: (kind: "antes" | "despues") => void;
  incident: () => void;
  note: () => void;
  breakdown: () => void;
};

/**
 * Dark navy state card — the one thing a supervisor needs to read in sunlight:
 * pendiente → "Registrar entrada", en curso → live timer + quick actions + "Registrar salida", cerrada → summary.
 */
export function HeroCard({ f, actions }: { f: FieldReady; actions: HeroActions }) {
  const status = f.jornada.status;
  return (
    <motion.section
      id="jornada-hero"
      initial={{ opacity: 0, y: 16, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.6, ease: EASE }}
      className="relative isolate scroll-mt-24 overflow-hidden rounded-[28px] bg-brand-deep p-5 text-white shadow-lift sm:p-7"
    >
      <span aria-hidden className="pointer-events-none absolute -right-24 -top-28 size-80 rounded-full bg-sky/25 blur-3xl" />
      <span aria-hidden className="pointer-events-none absolute -bottom-32 -left-20 size-72 rounded-full bg-st-blue/20 blur-3xl" />
      {status === "en_curso" && <Bubbles className="opacity-40" />}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={status}
          initial={{ opacity: 0, y: 14, filter: "blur(6px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: -10, filter: "blur(6px)" }}
          transition={{ duration: 0.45, ease: EASE }}
          className="relative z-[2]"
        >
          {status === "pendiente" && <PendingState f={f} actions={actions} />}
          {status === "en_curso" && <LiveState f={f} actions={actions} />}
          {status === "cerrada" && <ClosedState f={f} actions={actions} />}
        </motion.div>
      </AnimatePresence>
    </motion.section>
  );
}

/* ───────────── pendiente ───────────── */

function PendingState({ f, actions }: { f: FieldReady; actions: HeroActions }) {
  const now = useNow(30_000);
  const { jornada } = f;
  const start = parseISO(jornada.plannedStart);
  const planned = differenceInMinutes(parseISO(jornada.plannedEnd), start);
  const delta = differenceInMinutes(start, now);
  const today = isSameDay(start, now);
  const when = !today ? fmtShortDay(start) : delta > 0 ? `inicia en ${fmtDuration(delta)}` : `inició hace ${fmtDuration(-delta)}`;

  return (
    <div>
      <HeroTop
        left={
          <>
            <StatusDot tone="sky" /> Programada
          </>
        }
        right={`${fmtRelativeDay(start)} · J${f.index}/${f.total}`}
      />
      <p className="mt-6 text-[12px] font-semibold uppercase tracking-[0.12em] text-white/50">Horario programado</p>
      <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2.5 text-[40px] font-medium leading-none tracking-[-0.045em] tabular min-[400px]:text-[46px] sm:text-[60px]">
        {fmtTime(jornada.plannedStart)}
        <span className="text-white/35">–</span>
        {fmtTime(jornada.plannedEnd)}
      </p>
      <p className={cn("mt-3 text-[14.5px]", today && delta < -15 ? "font-medium text-amber-glow" : "text-white/70")}>
        {fmtDuration(planned)} de trabajo · {when}
      </p>

      <CrewRow f={f} onChange={actions.crew} className="mt-6" />

      <div className="mt-5">
        {f.permissions.capture ? (
          <Gate reason={f.checkInBlock} className="w-full">
            <BigAction icon={<LocateFixed />} label="Registrar entrada" sub="Hora del dispositivo + GPS" onClick={actions.checkIn} disabled={!!f.checkInBlock} />
          </Gate>
        ) : (
          <ReadOnlyLine>Esperando el registro de entrada del supervisor.</ReadOnlyLine>
        )}
        {f.permissions.capture && f.checkInBlock && <p className="mt-2.5 text-[13px] leading-snug text-amber-glow">{f.checkInBlock}</p>}
      </div>
    </div>
  );
}

/* ───────────── en curso ───────────── */

function LiveState({ f, actions }: { f: FieldReady; actions: HeroActions }) {
  const { jornada } = f;
  const checkIn = jornada.checkIn!;
  const planned = differenceInMinutes(parseISO(jornada.plannedEnd), parseISO(jornada.plannedStart));

  return (
    <div>
      <HeroTop
        left={
          <>
            <StatusDot tone="sky" live /> En curso
          </>
        }
        right={
          <span className="inline-flex items-center gap-1.5">
            {(checkIn.offline || !checkIn.serverAt) && <CloudOff className="size-3.5 text-amber-glow" aria-label="Entrada sin sincronizar" />}
            En sitio desde {fmtTime(checkIn.deviceAt)}
          </span>
        }
      />
      <LiveTimer since={checkIn.deviceAt} planned={planned} />

      <CrewRow f={f} onChange={actions.crew} className="mt-6" />

      {f.permissions.capture && (
        <div className="mt-4 grid grid-cols-4 gap-2 sm:gap-2.5">
          <QuickAction icon={<Camera />} label="Foto ANTES" count={f.antes.length} onClick={() => actions.photo("antes")} disabled={!!f.photoBlock} reason={f.photoBlock} />
          <QuickAction icon={<TriangleAlert />} label="Incidencia" count={f.openIncidents.length} onClick={actions.incident} disabled={!!f.recordBlock} reason={f.recordBlock} alert={f.openIncidents.length > 0} />
          <QuickAction icon={<NotebookPen />} label="Nota" count={jornada.log.length} onClick={actions.note} disabled={!!f.recordBlock} reason={f.recordBlock} />
          <QuickAction icon={<Sparkles />} label="Foto DESPUÉS" count={f.despues.length} onClick={() => actions.photo("despues")} disabled={!!f.photoBlock} reason={f.photoBlock} />
        </div>
      )}

      <div className="mt-5">
        {f.permissions.capture ? (
          <Gate reason={f.checkOutBlock} className="w-full">
            <BigAction icon={<LogOut />} label="Registrar salida" sub="Cierre de la jornada con hora y GPS" onClick={actions.checkOut} disabled={!!f.checkOutBlock} variant="sky" />
          </Gate>
        ) : (
          <ReadOnlyLine>La salida la registra el supervisor al terminar.</ReadOnlyLine>
        )}
        {f.permissions.capture && f.antes.length === 0 && (
          <p className="mt-3 flex items-start gap-2 text-[13px] leading-snug text-amber-glow">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" /> Aún no hay fotos ANTES: tómelas antes de empezar los trabajos.
          </p>
        )}
        {f.permissions.capture && f.antes.length > 0 && f.despues.length === 0 && (
          <p className="mt-3 text-[13px] leading-snug text-white/60">Después de registrar la salida, tome las fotos DESPUÉS: son obligatorias para el cierre.</p>
        )}
      </div>
    </div>
  );
}

const pad = { minimumIntegerDigits: 2, useGrouping: false } as const;

/** Live HH:MM:SS on-site timer with rolling digits + progress against the planned duration. */
function LiveTimer({ since, planned }: { since: string; planned: number }) {
  const now = useNow(1000);
  const secs = Math.max(0, Math.floor((now.getTime() - parseISO(since).getTime()) / 1000));
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  const pct = planned > 0 ? secs / 60 / planned : 0;
  const over = pct > 1;

  return (
    <div className="mt-5">
      <p className="sr-only" aria-live="off">
        Tiempo en sitio {h} horas {m} minutos
      </p>
      <p aria-hidden className="flex items-baseline text-[58px] font-medium leading-none tracking-[-0.05em] sm:text-[76px]">
        <AnimatedNumber value={h} format={pad} />
        <span className="mx-0.5 -translate-y-[0.06em] text-white/35">:</span>
        <AnimatedNumber value={m} format={pad} />
        <span className="mx-0.5 -translate-y-[0.06em] text-white/35">:</span>
        <AnimatedNumber value={s} format={pad} className="text-sky" />
      </p>
      <div className="mt-4 flex items-center justify-between gap-3 text-[13px] text-white/60">
        <span>Plan {fmtDuration(planned)}</span>
        <span className={cn("tabular", over && "font-semibold text-amber-glow")}>{over ? `+${fmtDuration(secs / 60 - planned)} sobre el plan` : `${Math.round(pct * 100)}%`}</span>
      </div>
      <div className="mt-2 h-[6px] overflow-hidden rounded-full bg-white/10">
        <motion.div
          className={cn("h-full rounded-full", over ? "bg-amber-glow" : "bg-gradient-to-r from-st-blue to-sky")}
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(1, pct) * 100}%` }}
          transition={{ type: "spring", stiffness: 60, damping: 18 }}
        />
      </div>
    </div>
  );
}

/* ───────────── cerrada ───────────── */

function ClosedState({ f, actions }: { f: FieldReady; actions: HeroActions }) {
  const { jornada } = f;
  const minutes = jornadaMinutes(jornada);
  const planned = differenceInMinutes(parseISO(jornada.plannedEnd), parseISO(jornada.plannedStart));
  const diff = minutes - planned;

  return (
    <div>
      <HeroTop
        left={
          <>
            <CircleCheck className="size-4 text-[#7fe0cf]" /> Jornada cerrada
          </>
        }
        right={`${fmtRelativeDay(jornada.plannedStart)} · J${f.index}/${f.total}`}
      />
      <p className="mt-6 text-[12px] font-semibold uppercase tracking-[0.12em] text-white/50">Tiempo real en sitio</p>
      <p className="mt-1.5 flex items-baseline gap-2 text-[52px] font-medium leading-none tracking-[-0.045em] sm:text-[64px]">
        <AnimatedNumber value={Math.floor(minutes / 60)} />
        <span className="text-[22px] tracking-normal text-white/50">h</span>
        <AnimatedNumber value={minutes % 60} />
        <span className="text-[22px] tracking-normal text-white/50">min</span>
      </p>
      <p className="mt-3 text-[14px] text-white/70">
        Plan {fmtDuration(planned)} ·{" "}
        <span className={cn(Math.abs(diff) > 30 && "font-semibold text-amber-glow")}>
          {diff === 0 ? "justo a tiempo" : diff > 0 ? `+${fmtDuration(diff)}` : `−${fmtDuration(-diff)}`}
        </span>
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {jornada.checkIn && <StampTile label="Entrada" stamp={jornada.checkIn} />}
        {jornada.checkOut && <StampTile label="Salida" stamp={jornada.checkOut} />}
      </div>

      <CrewRow f={f} onChange={actions.crew} className="mt-3" />
      <BreakdownStrip f={f} onEdit={actions.breakdown} />

      {f.permissions.capture && !f.locked && f.despues.length === 0 && (
        <BigAction icon={<Sparkles />} label="Tomar fotos DESPUÉS" sub="Obligatorias para el cierre" onClick={() => actions.photo("despues")} className="mt-5" />
      )}

      <p className="mt-5 flex items-start gap-2 text-[12.5px] leading-snug text-white/55">
        <Lock className="mt-0.5 size-3.5 shrink-0" /> Una jornada cerrada no se reabre desde campo; las correcciones se hacen desde la orden y quedan en auditoría.
      </p>
    </div>
  );
}

function StampTile({ label, stamp }: { label: string; stamp: GeoStamp }) {
  const manual = stamp.source === "manual";
  // Supervisión remota is not a site fix: no accuracy chip, its note is the justification.
  const remote = stamp.source === "remota";
  const justified = manual || remote;
  return (
    <div className="rounded-[20px] bg-white/[0.07] p-4 ring-1 ring-white/10">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-white/50">{label}</p>
        <span className={cn("inline-flex h-6 items-center gap-1 rounded-full px-2 text-[11.5px] font-semibold", justified ? "bg-amber-glow/15 text-amber-glow" : "bg-sky/15 text-sky")}>
          {remote ? <Headset className="size-3" /> : <MapPin className="size-3" />} {remote ? "Remota" : manual ? "Manual" : `±${Math.round(stamp.accuracy)} m`}
        </span>
      </div>
      <p className="mt-2 text-[30px] font-medium leading-none tracking-[-0.03em] tabular">{fmtTime(stamp.deviceAt)}</p>
      <dl className="mt-3 space-y-1.5 text-[12.5px]">
        <div className="flex justify-between gap-3">
          <dt className="text-white/50">Dispositivo</dt>
          <dd className="tabular text-white/85">{fmtClock(stamp.deviceAt)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-white/50">Servidor</dt>
          <dd className={cn("tabular", stamp.serverAt ? "text-white/85" : "font-semibold text-amber-glow")}>
            {stamp.serverAt ? fmtClock(stamp.serverAt) : "pendiente de sincronizar"}
          </dd>
        </div>
      </dl>
      {(stamp.offline || justified) && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {stamp.offline && (
            <span className="inline-flex h-6 items-center gap-1 rounded-full bg-white/10 px-2 text-[11.5px] font-medium text-white/80">
              <CloudOff className="size-3" /> Capturada sin conexión
            </span>
          )}
          {justified && stamp.note && (
            <span className="w-full text-[12px] leading-snug text-white/60">
              <span className="font-semibold text-white/70">Justificación:</span> “{stamp.note}”
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/** Hours per activity (captured after salida) as bars that grow in; or an invitation to register them. */
function BreakdownStrip({ f, onEdit }: { f: FieldReady; onEdit: () => void }) {
  const items = f.jornada.breakdown ?? [];
  if (!items.length) {
    if (f.breakdownBlock) return null;
    return (
      <button
        type="button"
        onClick={onEdit}
        className="mt-3 flex min-h-[52px] w-full items-center gap-3 rounded-[20px] bg-white/[0.06] px-3.5 py-3 text-left ring-1 ring-white/10 transition hover:bg-white/[0.11]"
      >
        <span className="inline-flex size-[34px] shrink-0 items-center justify-center rounded-full bg-white/10 text-sky">
          <Timer className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-semibold">Desglose de horas</span>
          <span className="block truncate text-[12.5px] text-white/60">Opcional · repartir el tiempo entre actividades</span>
        </span>
        <ChevronRight className="size-[18px] shrink-0 text-white/50" />
      </button>
    );
  }
  const max = Math.max(...items.map((b) => b.hours), 0.5);
  const total = items.reduce((s, b) => s + b.hours, 0);
  return (
    <div className="mt-3 rounded-[20px] bg-white/[0.06] p-4 ring-1 ring-white/10">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-white/50">
          Desglose de horas · <span className="tabular text-white/80">{total.toFixed(1)} h</span>
        </p>
        <Gate reason={f.breakdownBlock}>
          <Button
            variant="ghost"
            onClick={onEdit}
            disabled={!!f.breakdownBlock}
            className="h-9 rounded-[10px] bg-white/10 px-3 text-[13px] font-semibold text-white hover:bg-white/20 hover:text-white disabled:opacity-40"
          >
            Editar
          </Button>
        </Gate>
      </div>
      <ul className="space-y-2.5">
        {items.map((b, i) => (
          <li key={b.activity} className="grid grid-cols-[minmax(0,1fr)_44px] items-center gap-x-3 gap-y-1">
            <span className="truncate text-[13px] text-white/80">{b.activity}</span>
            <span className="row-span-2 text-right text-[14px] font-semibold tabular">{b.hours.toFixed(1)} h</span>
            <span className="h-[5px] overflow-hidden rounded-full bg-white/10">
              <motion.span
                className="block h-full rounded-full bg-gradient-to-r from-st-blue to-sky"
                initial={{ width: 0 }}
                animate={{ width: `${(b.hours / max) * 100}%` }}
                transition={{ duration: 0.9, ease: EASE, delay: 0.2 + i * 0.07 }}
              />
            </span>
          </li>
        ))}
      </ul>
      {f.jornada.breakdownNote && <p className="mt-3 text-[12.5px] leading-snug text-white/60">“{f.jornada.breakdownNote}”</p>}
    </div>
  );
}

/* ───────────── shared pieces ───────────── */

function HeroTop({ left, right }: { left: React.ReactNode; right: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="inline-flex items-center gap-2 text-[13px] font-semibold text-sky">{left}</span>
      <span className="truncate text-right text-[12.5px] text-white/60 tabular">{right}</span>
    </div>
  );
}

function CrewRow({ f, onChange, className }: { f: FieldReady; onChange: () => void; className?: string }) {
  const names = f.crew.map((w) => w.name.split(" ")[0]).join(", ");
  return (
    <div className={cn("flex items-center justify-between gap-3 rounded-[20px] bg-white/[0.06] px-3.5 py-3 ring-1 ring-white/10", className)}>
      <div className="flex min-w-0 items-center gap-3">
        {f.crew.length ? (
          <AvatarStack people={f.crew} size={34} max={4} className="[&>span]:ring-brand-deep" />
        ) : (
          <span className="inline-flex size-[34px] items-center justify-center rounded-full bg-white/10">
            <UsersRound className="size-4 text-white/70" />
          </span>
        )}
        <div className="min-w-0">
          <p className="text-[14px] font-semibold">{f.crew.length ? `${f.crew.length} en cuadrilla` : "Sin cuadrilla asignada"}</p>
          <p className="truncate text-[12.5px] text-white/60">{names || "Asigne al menos una persona"}</p>
        </div>
      </div>
      <Gate reason={f.crewBlock}>
        <Button
          variant="ghost"
          onClick={onChange}
          disabled={!!f.crewBlock}
          className="h-10 shrink-0 rounded-[12px] bg-white/10 px-3.5 font-semibold text-white hover:bg-white/20 hover:text-white disabled:opacity-40"
        >
          Cambiar
        </Button>
      </Gate>
    </div>
  );
}

function QuickAction({
  icon,
  label,
  count,
  onClick,
  disabled,
  reason,
  alert,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  onClick: () => void;
  disabled?: boolean;
  reason?: string | null;
  alert?: boolean;
}) {
  return (
    <Gate reason={reason} className="w-full">
      <motion.button
        type="button"
        onClick={onClick}
        disabled={disabled}
        whileTap={{ scale: 0.93 }}
        className="relative flex h-[80px] w-full flex-col items-center justify-center gap-1.5 rounded-[18px] bg-white/[0.07] px-1 text-center text-[12px] font-semibold leading-tight ring-1 ring-white/10 transition hover:bg-white/[0.13] disabled:opacity-40 sm:h-[88px] sm:text-[13px] [&_svg]:size-[22px]"
      >
        <span className={alert ? "text-[#ff9a9d]" : "text-sky"}>{icon}</span>
        {label}
        <AnimatePresence>
          {count > 0 && (
            <motion.span
              key={count}
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.4, opacity: 0 }}
              transition={{ type: "spring", stiffness: 600, damping: 20 }}
              className={cn(
                "absolute right-1.5 top-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-bold tabular",
                alert ? "bg-st-red text-white" : "bg-sky text-on-light",
              )}
            >
              {count}
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>
    </Gate>
  );
}

/** Giant one-thumb action button with a periodic squeegee sheen. */
function BigAction({
  icon,
  label,
  sub,
  onClick,
  disabled,
  variant = "white",
  className,
}: {
  icon: React.ReactNode;
  label: string;
  sub?: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: "white" | "sky";
  className?: string;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      whileTap={{ scale: 0.98 }}
      whileHover={disabled ? undefined : { y: -1 }}
      className={cn(
        "group relative flex h-16 w-full items-center gap-3.5 overflow-hidden rounded-[20px] px-4 text-left text-on-light shadow-[0_14px_30px_-14px_rgb(0_0_0/0.6)] outline-none transition focus-visible:ring-4 focus-visible:ring-sky/60 disabled:opacity-45",
        variant === "white" ? "bg-white" : "bg-sky",
        className,
      )}
    >
      <span className={cn("inline-flex size-10 shrink-0 items-center justify-center rounded-[13px] text-white [&_svg]:size-5", variant === "white" ? "bg-brand-deep" : "bg-brand-deep/90")}>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[17px] font-semibold leading-tight">{label}</span>
        {sub && <span className="block truncate text-[12.5px] text-on-light/60">{sub}</span>}
      </span>
      {!disabled && (
        <motion.span
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 -skew-x-[18deg] bg-gradient-to-r from-transparent to-transparent",
            variant === "white" ? "via-sky/45" : "via-white/70",
          )}
          animate={{ x: ["0%", "420%"] }}
          transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 2.8, ease: EASE }}
        />
      )}
    </motion.button>
  );
}

function ReadOnlyLine({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-2.5 rounded-[18px] bg-white/[0.07] px-4 py-4 text-[14px] text-white/75 ring-1 ring-white/10">
      <Lock className="size-4 shrink-0" />
      {children}
    </p>
  );
}
