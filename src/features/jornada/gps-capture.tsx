"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Camera, CircleAlert, CloudOff, Crosshair, Headset, Info, LocateFixed, MapPin, MapPinned, RefreshCw, ShieldCheck, Sparkles, Timer, Wifi } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GeoInput } from "@/lib/store";
import { useDemoSession } from "@/lib/hooks";
import { GEO_NOTE_MIN, TEXT_LIMITS } from "@/lib/domain";
import { fmtCoords } from "@/lib/format";
import { ClientMark } from "@/components/pk/client-mark";
import { distanceMeters, readPosition, type GeoMarker, type GeoReading } from "@/components/pk/geo-map";
import { AuroraStat, BigButton, FlowHeading, FlowScreen, ItemCard, MobileRow } from "@/components/pk/mobile";
import { AnimatedNumber } from "@/components/pk/bits";
import { EASE } from "@/components/pk/motion";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Chip, MAX_SITE_DISTANCE, StableMap, fmtClock, fmtDistance } from "./field-bits";
import { FlowEyebrow } from "./flow-bits";
import type { FieldReady, FieldWarning } from "./use-field-state";

export type GpsMode = "entrada" | "salida";
export type GpsResult = { ok: true; at: string; offline: boolean; minutes?: number } | { ok: false; error: string };
export type GpsNext = "antes" | "despues" | "desglose";

type Reading = GeoReading & { simulated: boolean; error?: string; at: string };

const COPY: Record<GpsMode, { screen: string; title: string; confirm: string; ack: string; ackRemote: string; done: string }> = {
  entrada: {
    screen: "Registro de entrada",
    title: "Registrar entrada",
    confirm: "Confirmar entrada",
    ack: "Confirmo que estoy en el sitio con la cuadrilla.",
    ackRemote: "Confirmo que la cuadrilla ya está en el sitio y que registro esta entrada a distancia.",
    done: "Entrada registrada",
  },
  salida: {
    screen: "Registro de salida",
    title: "Registrar salida",
    confirm: "Confirmar salida",
    ack: "Confirmo que la cuadrilla terminó los trabajos de esta jornada.",
    ackRemote: "Confirmo que la cuadrilla terminó los trabajos de esta jornada y que registro esta salida a distancia.",
    done: "Salida registrada",
  },
};

const REASONS = [
  "Sin señal GPS dentro del inmueble",
  "Permiso de ubicación denegado en el teléfono",
  "Acceso por una entrada alterna del cliente",
  "Sitio extenso: la cuadrilla trabaja en otra área",
];

/** Supervisión remota: how the entrada/salida was confirmed without being on site (the note is mandatory). */
const REMOTE_REASONS = [
  "Confirmado por videollamada con el líder de cuadrilla",
  "Confirmado por llamada con el contacto en el sitio",
  "Confirmado con fotos enviadas por el líder de cuadrilla",
  "Superviso otra obra; el líder de cuadrilla avisó la hora",
];

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * GPS stamp flow for check-in / check-out (doc §4.2): radar while reading the position, then a map with
 * the site and the captured point, distance, accuracy and device time. Simulated readings, GPS failures
 * or distances over 300 m require a justification (stored as source "manual" + note). "Supervisión remota" is the
 * alternative when the supervisor is not on site: its own source ("remota"), a mandatory note, no geofence and no
 * "estoy en el sitio" acknowledgement. Ends in a success screen with a pin drop and the next field step.
 */
export function GpsFlow({
  f,
  open,
  onOpenChange,
  mode,
  offline,
  warnings,
  onConfirm,
  onNext,
}: {
  f: FieldReady;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mode: GpsMode;
  offline: boolean;
  warnings: FieldWarning[];
  onConfirm: (geo: GeoInput) => GpsResult;
  onNext: (next: GpsNext) => void;
}) {
  const copy = COPY[mode];
  const { site } = f;
  const [attempt, setAttempt] = useState(0);
  const [reading, setReading] = useState<Reading | null>(null);
  const [useSite, setUseSite] = useState(false);
  const [remote, setRemote] = useState(false);
  const [note, setNote] = useState("");
  const [ack, setAck] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Extract<GpsResult, { ok: true }> | null>(null);
  const [slow, setSlow] = useState(false);
  const demo = useDemoSession();

  const siteLat = site.lat;
  const siteLng = site.lng;
  useEffect(() => {
    if (!open) return;
    let alive = true;
    // Keep the radar on screen long enough to read as "searching", even when GPS answers instantly.
    void Promise.all([readPosition({ lat: siteLat, lng: siteLng }, { demo, timeoutMs: 9000 }), wait(1700)]).then(([r]) => {
      if (alive) setReading((prev) => prev ?? { ...r, at: new Date().toISOString() });
    });
    // An unanswered permission prompt never times out: offer a way forward after a few seconds.
    const t = setTimeout(() => alive && setSlow(true), 7000);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [open, siteLat, siteLng, attempt, demo]);

  const close = () => onOpenChange(false);
  const retry = () => {
    setReading(null);
    setSlow(false);
    setUseSite(false);
    setRemote(false);
    setNote("");
    setAck(false);
    setError(null);
    setAttempt((a) => a + 1);
  };
  /** Switch between "estoy en el sitio" (GPS) and "supervisión remota": the note and the acknowledgement start over. */
  const chooseRemote = (v: boolean) => {
    setRemote(v);
    setUseSite(false);
    setNote("");
    setAck(false);
    setError(null);
  };

  /* ── success ── */
  if (done) {
    const next: { key: GpsNext; icon: React.ReactNode; title: string; meta: string }[] = [];
    if (mode === "entrada" && f.antes.length === 0)
      next.push({ key: "antes", icon: <Camera />, title: "Tomar fotos ANTES", meta: "Una por área, antes de empezar · obligatorias" });
    if (mode === "salida" && f.despues.length === 0)
      next.push({ key: "despues", icon: <Sparkles />, title: "Tomar fotos DESPUÉS", meta: "Mismo ángulo que las fotos ANTES · obligatorias" });
    if (mode === "salida" && f.order.activities.length > 0)
      next.push({ key: "desglose", icon: <Timer />, title: "Desglose de horas", meta: "Repartir el tiempo entre actividades · opcional" });

    return (
      <FlowScreen
        open={open}
        onOpenChange={onOpenChange}
        description={copy.done}
        footer={
          <BigButton variant="outline" onClick={close}>
            Volver a la jornada
          </BigButton>
        }
      >
        <PinDrop title={copy.done} at={done.at} offline={done.offline} />
        <ItemCard
          className="mt-7"
          leading={<ClientMark name={f.client.name} hue={f.client.hue} size={44} />}
          title={f.order.title}
          sub={`${f.order.folio} · Jornada ${f.index} de ${f.total}`}
          value={<span className="tabular">{fmtClock(done.at)}</span>}
          status={
            <span className={cn("inline-flex h-6 shrink-0 items-center gap-1 rounded-md px-2 text-[12px] font-semibold", done.offline ? "bg-amber-soft text-amber-fg" : "bg-teal-soft text-teal-fg")}>
              {done.offline ? <CloudOff className="size-3.5" /> : <Wifi className="size-3.5" />}
              {done.offline ? "Por sincronizar" : "Sincronizada"}
            </span>
          }
        />
        {mode === "salida" && done.minutes !== undefined && (
          <AuroraStat
            className="mt-5"
            label="Tiempo real en sitio"
            value={
              <span className="flex items-baseline gap-1.5">
                <AnimatedNumber value={Math.floor(done.minutes / 60)} />
                <span className="text-[18px] font-normal tracking-normal text-subtle">h</span>
                <AnimatedNumber value={done.minutes % 60} />
                <span className="text-[18px] font-normal tracking-normal text-subtle">min</span>
              </span>
            }
            sub={`Se suma a las horas reales de ${f.order.folio}.`}
          />
        )}
        {next.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6, duration: 0.45, ease: EASE }} className="mt-7">
            <p className="mb-1 text-[12px] font-semibold uppercase tracking-[0.1em] text-subtle">Siguiente paso</p>
            {next.map((n) => (
              <MobileRow
                key={n.key}
                onClick={() => onNext(n.key)}
                leading={<span className="inline-flex size-[46px] shrink-0 items-center justify-center rounded-[14px] bg-sky-soft text-azure-fg [&_svg]:size-5">{n.icon}</span>}
                title={n.title}
                meta={<span className="truncate">{n.meta}</span>}
              />
            ))}
          </motion.div>
        )}
      </FlowScreen>
    );
  }

  /* ── locating ── */
  if (!reading && !remote) {
    return (
      <FlowScreen
        open={open}
        onOpenChange={onOpenChange}
        title={copy.screen}
        description="Obteniendo ubicación"
        footer={
          <BigButton variant="outline" onClick={close}>
            Cancelar
          </BigButton>
        }
      >
        <FlowHeading eyebrow={<FlowEyebrow f={f} />} title={copy.title}>
          {site.name} · {site.address}
        </FlowHeading>
        <Radar />
        <AnimatePresence>
          {slow && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-2 flex flex-col items-center gap-2 text-center">
              <p className="text-[13.5px] text-subtle">¿El teléfono no responde? Revise el permiso de ubicación o continúe con una justificación.</p>
              <button
                type="button"
                onClick={() =>
                  setReading({ lat: site.lat, lng: site.lng, accuracy: 25, source: "manual", simulated: true, error: "No se obtuvo señal GPS", at: new Date().toISOString() })
                }
                className="inline-flex h-11 items-center gap-2 rounded-[12px] px-4 text-[14px] font-semibold text-link transition hover:bg-sky-soft"
              >
                <MapPinned className="size-4" /> Continuar sin GPS
              </button>
            </motion.div>
          )}
        </AnimatePresence>
        <button
          type="button"
          onClick={() => chooseRemote(true)}
          className="mx-auto mt-3 flex min-h-11 items-center gap-2 rounded-[12px] px-4 text-[14px] font-semibold text-link transition hover:bg-sky-soft"
        >
          <Headset className="size-4" /> No estoy en el sitio · Supervisión remota
        </button>
      </FlowScreen>
    );
  }

  /* ── review ── */
  // A real reading of the phone (never the simulated fallback). In remote supervision it is where the SUPERVISOR is, not the site.
  const live = reading && !reading.simulated ? { lat: reading.lat, lng: reading.lng, accuracy: reading.accuracy } : null;
  const point = remote
    ? (live ?? { lat: site.lat, lng: site.lng, accuracy: 0 })
    : useSite || !reading
      ? { lat: site.lat, lng: site.lng, accuracy: 15 }
      : { lat: reading.lat, lng: reading.lng, accuracy: reading.accuracy };
  const distance = distanceMeters(point, site);
  const issues: string[] = [];
  if (remote) {
    // no geofence: the supervisor is not at the site by definition
  } else if (useSite) issues.push("Se usará la ubicación registrada del sitio, sin lectura GPS del dispositivo.");
  else if (reading) {
    if (reading.error) issues.push(`${reading.error}: la posición es aproximada.`);
    if (reading.simulated && !reading.error) issues.push("El dispositivo no entregó una lectura GPS real; la posición es aproximada.");
    if (distance > MAX_SITE_DISTANCE) issues.push(`Está a ${fmtDistance(distance)} del sitio (máximo ${MAX_SITE_DISTANCE} m).`);
  }
  const needsNote = remote || issues.length > 0;
  const noteOk = note.trim().length >= GEO_NOTE_MIN;
  const canConfirm = (!needsNote || noteOk) && ack;

  const confirm = () => {
    const geo: GeoInput = remote
      ? { lat: point.lat, lng: point.lng, accuracy: point.accuracy, source: "remota", note: note.trim() }
      : needsNote
        ? { lat: point.lat, lng: point.lng, accuracy: point.accuracy, source: "manual", note: note.trim() }
        : { lat: point.lat, lng: point.lng, accuracy: point.accuracy, source: "gps" };
    const res = onConfirm(geo);
    if (res.ok) setDone(res);
    else setError(res.error);
  };

  return (
    <FlowScreen
      open={open}
      onOpenChange={onOpenChange}
      title={copy.screen}
      description={`${copy.title} en ${site.name}`}
      dirty={note.trim().length > 0}
      footer={
        <BigButton onClick={confirm} disabled={!canConfirm}>
          <LocateFixed /> {copy.confirm}
        </BigButton>
      }
    >
      <FlowHeading eyebrow={<FlowEyebrow f={f} />} title={copy.title}>
        {site.name} · {site.address}
      </FlowHeading>

      <Button variant="outline" className="mb-4 min-h-11" onClick={() => chooseRemote(!remote)}>
        <Headset className="size-4" /> {remote ? "Estoy en el sitio · Usar GPS" : "No estoy en el sitio · Supervisión remota"}
      </Button>
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE }} className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className={cn("inline-flex h-8 items-center gap-2 rounded-full px-3 text-[13px] font-semibold", needsNote ? "bg-amber-soft text-amber-fg" : "bg-teal-soft text-teal-fg")}>
            {needsNote ? <CircleAlert className="size-4" /> : <ShieldCheck className="size-4" />}
            {needsNote ? "Requiere justificación" : "Ubicación verificada"}
          </span>
          <button type="button" onClick={retry} className="inline-flex h-10 items-center gap-1.5 rounded-[12px] px-2.5 text-[13.5px] font-semibold text-link transition hover:bg-sky-soft">
            <RefreshCw className="size-4" /> Leer de nuevo
          </button>
        </div>

        <ReadingMap site={site} point={point} useSite={useSite} mode={mode} />

        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[18px] bg-hairline ring-1 ring-hairline">
          <Stat label="Distancia al sitio" value={useSite ? "0 m" : fmtDistance(distance)} tone={!useSite && distance > MAX_SITE_DISTANCE ? "red" : "ok"} />
          <Stat label="Precisión" value={`±${Math.round(point.accuracy)} m`} tone={point.accuracy > 50 ? "amber" : "ok"} />
          <Stat label="Hora del dispositivo" value={fmtClock(reading?.at ?? new Date())} />
          <Stat
            label="Se guarda"
            value={
              <span className="inline-flex items-center gap-1.5">
                {offline ? <CloudOff className="size-4 text-amber-fg" /> : <Wifi className="size-4 text-teal-fg" />}
                {offline ? "En el teléfono" : "En línea"}
              </span>
            }
            sub={offline ? "Se sincroniza al volver la señal" : "Con hora del servidor"}
          />
        </dl>
        <p className="flex items-center gap-1.5 text-[12.5px] text-subtle tabular">
          <Crosshair className="size-3.5 shrink-0" /> {remote ? "Supervisión remota · ubicación de referencia del sitio" : needsNote ? "Manual justificada" : "GPS del dispositivo"} · {fmtCoords(point.lat, point.lng)}
        </p>
      </motion.div>

      <AnimatePresence initial={false}>
        {needsNote && (
          <motion.div
            key="note"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.35, ease: EASE }}
            className="overflow-hidden"
          >
            <div className="mt-5 space-y-3 rounded-[20px] bg-amber-soft p-4 ring-1 ring-amber-line">
              <ul className="space-y-1.5 text-[13.5px] text-amber-olive">
                {issues.map((t) => (
                  <li key={t} className="flex gap-2">
                    <CircleAlert className="mt-0.5 size-4 shrink-0 text-[#d38a12]" />
                    {t}
                  </li>
                ))}
              </ul>
              <label htmlFor="gps-note" className="block text-[12px] font-semibold uppercase tracking-[0.1em] text-amber-olive">
                Justificación · obligatoria
              </label>
              <Textarea
                id="gps-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={TEXT_LIMITS.geoNote.max}
                placeholder={remote ? "¿Cómo confirmó la entrada o salida de la cuadrilla?" : "¿Por qué no hay lectura GPS confiable en el sitio?"}
                className="min-h-[84px] rounded-[14px] border-amber-line bg-surface text-[16px]"
              />
              <div className="scrollbar-none -mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5">
                {(remote ? REMOTE_REASONS : REASONS).map((r) => (
                  <Chip key={r} active={note === r} onClick={() => setNote(r)}>
                    {r}
                  </Chip>
                ))}
              </div>
              {!remote && !useSite && (
                <button
                  type="button"
                  onClick={() => {
                    setUseSite(true);
                    if (!note.trim()) setNote("Ubicación del sitio usada en la demostración (sin lectura GPS).");
                  }}
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-[12px] border border-amber-line bg-surface text-[14px] font-semibold text-ink transition hover:bg-amber-wash"
                >
                  <MapPinned className="size-4" /> Usar ubicación del sitio (demo)
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {warnings.length > 0 && (
        <ul className="mt-5 space-y-2">
          {warnings.map((w) => (
            <li key={w.text} className={cn("flex gap-2.5 rounded-[16px] px-3.5 py-3 text-[13.5px] leading-snug", w.tone === "amber" ? "bg-amber-soft text-amber-olive" : "bg-blue-wash text-ink")}>
              {w.tone === "amber" ? <CircleAlert className="mt-0.5 size-4 shrink-0 text-[#d38a12]" /> : <Info className="mt-0.5 size-4 shrink-0 text-azure-fg" />}
              {w.text}
            </li>
          ))}
        </ul>
      )}

      <label className={cn("mt-5 flex min-h-12 cursor-pointer items-start gap-3 rounded-[16px] border p-4 transition", ack ? "border-blue-line bg-blue-wash" : "border-hairline hover:bg-sand/40")}>
        <Checkbox checked={ack} onCheckedChange={(v) => setAck(v === true)} className="mt-0.5 size-5 rounded-[6px]" />
        <span className="text-[15px] leading-snug text-ink">{remote ? "Confirmo que verifiqué la entrada o salida de la cuadrilla a distancia." : copy.ack}</span>
      </label>

      {error && (
        <p role="alert" className="mt-4 rounded-[14px] bg-red-soft px-3.5 py-3 text-[13.5px] font-medium text-red-fg">
          {error}
        </p>
      )}
    </FlowScreen>
  );
}

/** Site pin + captured pin + accuracy circle; memoized so typing the justification doesn't refit the map. */
function ReadingMap({ site, point, useSite, mode }: { site: FieldReady["site"]; point: { lat: number; lng: number; accuracy: number }; useSite: boolean; mode: GpsMode }) {
  const { lat, lng, accuracy } = point;
  const props = useMemo(() => {
    const markers: GeoMarker[] = [{ lat: site.lat, lng: site.lng, kind: "site", label: "Sitio", tooltip: site.name }];
    if (!useSite) markers.push({ lat, lng, kind: mode === "entrada" ? "checkin" : "checkout", label: mode === "entrada" ? "Entrada" : "Salida" });
    return { markers, accuracy: { lat, lng, radius: accuracy } };
  }, [site, lat, lng, accuracy, useSite, mode]);
  return <StableMap markers={props.markers} accuracy={props.accuracy} connect className="h-[200px]" />;
}

function Stat({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: string; tone?: "ok" | "amber" | "red" }) {
  return (
    <div className="bg-surface px-4 py-3.5">
      <dt className="text-[12px] text-subtle">{label}</dt>
      <dd className={cn("mt-1 text-[18px] font-medium tracking-[-0.01em] tabular", tone === "red" ? "text-red-fg" : tone === "amber" ? "text-amber-fg" : "text-ink")}>{value}</dd>
      {sub && <p className="mt-0.5 text-[11.5px] leading-snug text-subtle">{sub}</p>}
    </div>
  );
}

/* ───────────── radar (searching) ───────────── */

const BLIPS = [
  { x: 28, y: 34, d: 0.5 },
  { x: 70, y: 26, d: 1.3 },
  { x: 64, y: 72, d: 1.9 },
  { x: 33, y: 66, d: 0.9 },
];

/** Concentric pulsing rings + rotating sweep while the device looks for a fix. */
export function Radar() {
  return (
    <div className="flex flex-col items-center py-4" role="status" aria-live="polite">
      <div className="relative size-[220px] overflow-hidden rounded-full bg-brand-deep shadow-lift">
        <span aria-hidden className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_50%_50%,rgb(122_209_244/0.18),transparent_70%)]" />
        {[18, 34].map((inset) => (
          <span key={inset} aria-hidden className="absolute rounded-full border border-sky/20" style={{ inset: `${inset}%` }} />
        ))}
        <span aria-hidden className="absolute inset-[2%] rounded-full border border-sky/25" />
        <span aria-hidden className="absolute inset-x-0 top-1/2 h-px bg-sky/15" />
        <span aria-hidden className="absolute inset-y-0 left-1/2 w-px bg-sky/15" />

        <motion.div
          aria-hidden
          className="absolute inset-0 rounded-full"
          style={{ background: "conic-gradient(from 0deg, transparent 0deg 260deg, rgb(122 209 244 / 0.04) 275deg, rgb(122 209 244 / 0.55) 359deg, transparent 360deg)" }}
          animate={{ rotate: 360 }}
          transition={{ duration: 2.4, ease: "linear", repeat: Infinity }}
        >
          <span className="absolute left-1/2 top-0 h-1/2 w-[2px] -translate-x-1/2 bg-gradient-to-t from-sky/0 via-sky/70 to-sky" />
        </motion.div>

        {[0, 0.8, 1.6].map((delay) => (
          <motion.span
            key={delay}
            aria-hidden
            className="absolute left-1/2 top-1/2 -ml-8 -mt-8 size-16 rounded-full border-2 border-sky/80"
            initial={{ scale: 0.4, opacity: 0.8 }}
            animate={{ scale: 3.6, opacity: 0 }}
            transition={{ duration: 2.4, delay, repeat: Infinity, ease: "easeOut" }}
          />
        ))}

        {BLIPS.map((b) => (
          <motion.span
            key={`${b.x}-${b.y}`}
            aria-hidden
            className="absolute size-2 rounded-full bg-sky shadow-[0_0_10px_rgb(122_209_244)]"
            style={{ left: `${b.x}%`, top: `${b.y}%` }}
            animate={{ opacity: [0, 1, 0], scale: [0.6, 1.2, 0.6] }}
            transition={{ duration: 2.4, delay: b.d, repeat: Infinity, times: [0, 0.15, 1] }}
          />
        ))}

        <span className="absolute left-1/2 top-1/2 inline-flex size-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-surface text-brand-ink shadow-[0_8px_24px_-6px_rgb(0_0_0/0.45)]">
          <LocateFixed className="size-6" />
        </span>
      </div>
      <p className="mt-6 text-[17px] font-semibold text-ink">Obteniendo ubicación…</p>
      <p className="mt-1 max-w-[300px] text-center text-[14px] leading-relaxed text-subtle">Mantenga el teléfono a cielo abierto unos segundos. Si no hay señal, podrá justificarlo.</p>
    </div>
  );
}

/* ───────────── pin drop (saved) ───────────── */

const SPARKS = [
  { x: -46, y: -50, s: 12, d: 0.42 },
  { x: 44, y: -58, s: 9, d: 0.5 },
  { x: 58, y: -14, s: 7, d: 0.58 },
  { x: -58, y: -10, s: 8, d: 0.62 },
];

/** Success hero for GPS stamps: the pin drops onto the site with a ripple and a few sparkles. */
export function PinDrop({ title, at, offline }: { title: string; at: string; offline: boolean }) {
  return (
    <div className="flex flex-col items-center pt-2 text-center" role="status" aria-live="polite">
      <div className="relative h-32 w-36">
        <motion.span
          className="absolute bottom-3 left-1/2 h-3 w-16 -translate-x-1/2 rounded-[50%] bg-brand-deep/20 blur-[1px] dark:bg-black/40"
          initial={{ scaleX: 0.2, opacity: 0 }}
          animate={{ scaleX: 1, opacity: 1 }}
          transition={{ delay: 0.32, duration: 0.3 }}
        />
        {[0, 1].map((i) => (
          <motion.span
            key={i}
            className="absolute bottom-1.5 left-1/2 -ml-10 h-6 w-20 rounded-[50%] border-2 border-sky"
            initial={{ scale: 0.3, opacity: 0 }}
            animate={{ scale: [0.3, 2.1], opacity: [0.9, 0] }}
            transition={{ delay: 0.38 + i * 0.22, duration: 1.1, ease: "easeOut" }}
          />
        ))}
        <motion.div
          className="absolute bottom-[18px] left-1/2 -ml-8"
          initial={{ y: -110, opacity: 0, scaleY: 1.15 }}
          animate={{ y: 0, opacity: 1, scaleY: 1 }}
          transition={{ type: "spring", stiffness: 560, damping: 15, mass: 0.9 }}
        >
          <MapPin className="size-16 fill-brand-deep text-white drop-shadow-[0_10px_14px_rgb(7_36_63/0.35)] dark:fill-azure dark:drop-shadow-[0_10px_14px_rgb(0_0_0/0.5)]" strokeWidth={1.4} />
        </motion.div>
        {SPARKS.map((s, i) => (
          <motion.span
            key={i}
            aria-hidden
            className="absolute left-1/2 top-1/2 text-sky"
            style={{ fontSize: s.s * 1.6 }}
            initial={{ x: 0, y: 0, scale: 0, opacity: 0 }}
            animate={{ x: s.x, y: s.y, scale: [0, 1.2, 1], opacity: [0, 1, 0] }}
            transition={{ delay: s.d, duration: 0.9, ease: EASE }}
          >
            ✦
          </motion.span>
        ))}
      </div>
      <motion.h2
        initial={{ opacity: 0, y: 10, filter: "blur(6px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ duration: 0.5, ease: EASE, delay: 0.25 }}
        className="mt-4 font-serif text-[32px] font-medium leading-tight text-ink"
      >
        {title}
      </motion.h2>
      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} className="mt-2 max-w-[340px] text-[16px] leading-relaxed text-subtle">
        <b className="font-semibold text-ink tabular">{fmtClock(at)}</b> ·{" "}
        {offline ? "guardada en el teléfono; se sincroniza al volver la señal." : "sincronizada con la hora del servidor."}
      </motion.p>
    </div>
  );
}

