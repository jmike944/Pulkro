"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, type Variants } from "motion/react";
import { ArrowLeft, ArrowRight, CalendarClock, Lock, Navigation, Phone, TriangleAlert, Users } from "lucide-react";
import { toast } from "sonner";
import { parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { useAppStore, useCan, useJornadaBundle, useLookups, useMediaQuery, useNow, useScopedData } from "@/lib/hooks";
import { jornadaMinutes, mapsLink } from "@/lib/domain";
import { fmtDateTime, fmtDay, fmtDuration, fmtTime, plural } from "@/lib/format";
import { ORDER_STATUS } from "@/lib/status";
import type { Jornada, OrderStatus } from "@/lib/types";
import { CrewPicker } from "@/components/pk/crew-picker";
import { AvatarStack, Eyebrow, KeyValues, PersonAvatar } from "@/components/pk/bits";
import { ClientMark } from "@/components/pk/client-mark";
import { OrderStatusPill, StatusDot, TonePill } from "@/components/pk/status";
import { EASE } from "@/components/pk/motion";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  REASON_CREW,
  dayKey,
  dayLabel,
  hm,
  jornadaVisual,
  longDay,
  pendingDaysWithMove,
  sameSet,
  toDayPlan,
  validatePlan,
} from "./agenda-model";
import { ConfirmCheck, DateTimeInput, FieldError, FieldLabel, MotivoField } from "./form-bits";
import { Gate } from "./gate";

type Bundle = NonNullable<ReturnType<typeof useJornadaBundle>>;
type Mode = "detalle" | "cuadrilla" | "reprogramar";

/** Orders whose plan can no longer change from the agenda. */
const LOCKED: OrderStatus[] = ["cancelada", "finalizada", "reporte_enviado", "seguimiento", "archivada"];

const CREW_REASONS = ["Ausencia de personal", "Ajuste de carga", "Especialidad requerida", "Solicitud del cliente"];
const MOVE_REASONS = ["Solicitud del cliente", "Acceso no disponible", "Clima", "Reasignación de personal"];

export type SheetState = { id: string; open: boolean } | null;

/** Forward (detail → editor) slides left, back slides right. */
const modeSlide: Variants = {
  enter: (d: number) => ({ opacity: 0, x: d * 18 }),
  center: { opacity: 1, x: 0, transition: { duration: 0.22, ease: EASE } },
  exit: (d: number) => ({ opacity: 0, x: d * -18, transition: { duration: 0.15, ease: EASE } }),
};

/**
 * Side sheet for one jornada: order + jornada summary, crew, status and the planning actions
 * (Cambiar cuadrilla / Reprogramar) — the latter only with can("crew.assign").
 */
export function JornadaSheet({
  state,
  onOpenChange,
  onSelect,
  onMoved,
}: {
  state: SheetState;
  onOpenChange: (open: boolean) => void;
  /** switch to another jornada of the same order */
  onSelect: (jornadaId: string) => void;
  /** jornada ids change when rescheduling — follow the moved one */
  onMoved: (jornadaId: string, date: string) => void;
}) {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  return (
    <Sheet open={!!state?.open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isDesktop ? "right" : "bottom"}
        className={cn("gap-0 p-0", isDesktop ? "w-full sm:max-w-[500px]" : "h-[92dvh] max-h-[92dvh] rounded-t-[24px]")}
      >
        {state ? (
          <SheetBody key={state.id} jornadaId={state.id} onClose={() => onOpenChange(false)} onSelect={onSelect} onMoved={onMoved} />
        ) : (
          <SheetTitle className="sr-only">Jornada</SheetTitle>
        )}
      </SheetContent>
    </Sheet>
  );
}

function SheetBody({
  jornadaId,
  onClose,
  onSelect,
  onMoved,
}: {
  jornadaId: string;
  onClose: () => void;
  onSelect: (id: string) => void;
  onMoved: (id: string, date: string) => void;
}) {
  const b = useJornadaBundle(jornadaId);
  const now = useNow(60_000);
  const [mode, setMode] = useState<Mode>("detalle");

  if (!b) {
    return (
      <SheetHeader className="p-6">
        <SheetTitle className="font-serif text-[26px] font-medium">Jornada no disponible</SheetTitle>
        <SheetDescription>Es posible que se haya reprogramado o eliminado.</SheetDescription>
      </SheetHeader>
    );
  }

  const visual = jornadaVisual(b.jornada, b.order, now);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SheetHeader className="border-b border-hairline p-5 pr-12 sm:p-6 sm:pr-14">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <TonePill tone={visual.tone} live={visual.live}>
            {visual.label}
          </TonePill>
          <span className="inline-flex h-6 items-center rounded-md bg-[#f2f4f7] px-2 text-[12px] font-semibold text-ink tabular">{dayLabel(b.jornada, b.order)}</span>
          <OrderStatusPill status={b.order.status} solid={false} className="text-subtle" />
        </div>
        <SheetTitle className="font-serif text-[26px] font-medium leading-tight">{b.client?.shortName ?? b.order.title}</SheetTitle>
        <SheetDescription className="text-[14px]">
          {b.order.folio} · {b.order.title}
        </SheetDescription>
      </SheetHeader>

      <AnimatePresence mode="wait" initial={false} custom={mode === "detalle" ? -1 : 1}>
        <motion.div
          key={mode}
          custom={mode === "detalle" ? -1 : 1}
          variants={modeSlide}
          initial="enter"
          animate="center"
          exit="exit"
          className="flex min-h-0 flex-1 flex-col"
        >
          {mode === "detalle" && <Detail b={b} now={now} onClose={onClose} onSelect={onSelect} onMode={setMode} />}
          {mode === "cuadrilla" && <CrewEditor b={b} onBack={() => setMode("detalle")} />}
          {mode === "reprogramar" && <MoveEditor b={b} now={now} onBack={() => setMode("detalle")} onMoved={onMoved} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/* ───────────── detail ───────────── */

function useCrewConflicts(j: Jornada) {
  const allJornadas = useAppStore((s) => s.jornadas);
  const allOrders = useAppStore((s) => s.orders);
  const { orderIds } = useScopedData();
  return useMemo(() => {
    const m = new Map<string, { folio: string; time: string; visible: boolean }[]>();
    if (j.status === "cerrada") return m;
    const byId = new Map(allOrders.map((o) => [o.id, o] as const));
    allJornadas.forEach((x) => {
      if (x.id === j.id || x.date !== j.date || x.status === "cerrada") return;
      const o = byId.get(x.orderId);
      if (!o || o.status === "cancelada") return;
      x.workerIds.forEach((w) => {
        if (!j.workerIds.includes(w)) return;
        const list = m.get(w) ?? [];
        list.push({ folio: o.folio, time: fmtTime(x.plannedStart), visible: orderIds.has(o.id) });
        m.set(w, list);
      });
    });
    return m;
  }, [allJornadas, allOrders, orderIds, j]);
}

function Detail({
  b,
  now,
  onClose,
  onSelect,
  onMode,
}: {
  b: Bundle;
  now: Date;
  onClose: () => void;
  onSelect: (id: string) => void;
  onMode: (m: Mode) => void;
}) {
  const { jornada: j, order, client, site, serviceType, supervisor, unit, jornadas } = b;
  const lk = useLookups();
  const canAssign = useCan("crew.assign");
  const conflicts = useCrewConflicts(j);
  const visual = jornadaVisual(j, order, now);
  const crew = j.workerIds.map((id) => lk.workers.get(id)).filter((w) => !!w);
  const start = parseISO(j.plannedStart);
  const end = parseISO(j.plannedEnd);
  const planned = Math.max(0, (end.getTime() - start.getTime()) / 60_000);
  const history = order.crewHistory.filter((h) => !h.jornadaId || h.jornadaId === j.id).slice(-3).reverse();

  const locked = LOCKED.includes(order.status);
  const baseReason = !canAssign ? REASON_CREW : locked ? `La orden está en “${ORDER_STATUS[order.status].label}”; su plan ya no cambia.` : null;
  const crewReason = baseReason ?? (j.status === "cerrada" ? "La jornada ya se cerró; su cuadrilla queda en el historial." : null);
  const moveReason =
    baseReason ??
    (j.status === "en_curso" ? "La jornada ya inició: registra la salida o una incidencia." : j.status === "cerrada" ? "La jornada ya se cerró." : null);

  return (
    <>
      <div className="flex-1 space-y-7 overflow-y-auto p-5 sm:p-6">
        {/* time hero */}
        <div className={cn("relative overflow-hidden rounded-[20px] p-5", visual.live ? "bg-brand-deep text-white" : "border border-hairline bg-gradient-to-br from-[#f3f8fe] via-white to-white")}>
          {visual.live && <span aria-hidden className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full bg-sky/25 blur-2xl" />}
          <Eyebrow className={cn("relative", visual.live && "text-white/60")}>{longDay(start)}</Eyebrow>
          <p className="relative mt-1.5 text-[34px] font-medium leading-none tracking-[-0.035em] tabular">
            {fmtTime(start)} <span className={visual.live ? "text-white/40" : "text-[#c5ccd6]"}>–</span> {fmtTime(end)}
          </p>
          <p className={cn("relative mt-2 text-[13.5px]", visual.live ? "text-white/70" : "text-subtle")}>
            {fmtDuration(planned)} planeadas · Jornada {j.dayIndex} de {Math.max(order.plannedDays, j.dayIndex)}
          </p>
          {visual.live && j.checkIn && (
            <p className="relative mt-3 flex items-center gap-2 text-[14px] font-medium text-sky">
              <StatusDot tone="sky" live /> En sitio desde {fmtTime(j.checkIn.deviceAt)} · {fmtDuration(jornadaMinutes(j, now))}
            </p>
          )}
          {j.status === "cerrada" && j.checkIn && j.checkOut && (
            <p className="relative mt-3 text-[13.5px] text-ink">
              Entrada {fmtTime(j.checkIn.deviceAt)} · Salida {fmtTime(j.checkOut.deviceAt)} · <b className="font-semibold">{fmtDuration(jornadaMinutes(j))} reales</b>
            </p>
          )}
          {visual.kind === "late" && <p className="relative mt-3 text-[13.5px] font-medium text-[#b86e00]">Pasó la hora de inicio sin registro de entrada.</p>}

          {jornadas.length > 1 && (
            <div className="relative mt-4 flex flex-wrap gap-1.5" role="tablist" aria-label="Jornadas de la orden">
              {jornadas.map((x) => {
                const v = jornadaVisual(x, order, now);
                const on = x.id === j.id;
                return (
                  <button
                    key={x.id}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    onClick={() => !on && onSelect(x.id)}
                    className={cn(
                      "inline-flex h-10 items-center gap-2 rounded-[12px] border px-3 text-[12.5px] font-medium tabular transition",
                      on
                        ? visual.live
                          ? "border-white/30 bg-white/15 text-white"
                          : "border-ink bg-ink text-white"
                        : visual.live
                          ? "border-white/15 text-white/70 hover:bg-white/10"
                          : "border-hairline bg-white text-ink hover:bg-muted",
                    )}
                  >
                    <StatusDot tone={v.tone} live={v.live} />J{x.dayIndex} · {fmtDay(x.date)}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* location */}
        <div className="flex items-start gap-3.5">
          {client && <ClientMark name={client.name} hue={client.hue} size={44} />}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold text-ink">{client?.name}</p>
            <p className="text-[13.5px] text-ink/80">
              {site?.name} · {site?.municipality}
            </p>
            <p className="mt-0.5 text-[13px] leading-snug text-subtle">{site?.address}</p>
          </div>
          {site && (
            <a
              href={mapsLink(site.lat, site.lng)}
              target="_blank"
              rel="noreferrer"
              aria-label="Cómo llegar (abre mapas)"
              className="inline-flex size-10 shrink-0 items-center justify-center rounded-[12px] border border-hairline text-ink transition hover:bg-muted"
            >
              <Navigation className="size-4" />
            </a>
          )}
        </div>

        {/* crew */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
              <Users className="size-4 text-subtle" /> Cuadrilla · {crew.length}
            </h3>
            {crew.length > 0 && <AvatarStack people={crew} size={26} max={5} />}
          </div>
          {crew.length === 0 ? (
            <p className="rounded-[16px] border border-dashed border-[#d9dfe7] px-4 py-5 text-center text-[13.5px] text-subtle">Sin cuadrilla asignada.</p>
          ) : (
            <ul>
              {crew.map((w) => {
                const c = conflicts.get(w.id);
                return (
                  <li key={w.id} className="flex items-center gap-3 border-b border-hairline py-2.5 last:border-0">
                    <PersonAvatar name={w.name} initials={w.initials} hue={w.hue} size={34} />
                    <div className="min-w-0 flex-1">
                      <Link href={`/equipo?w=${w.id}`} onClick={onClose} className="block truncate text-[14px] font-medium text-ink hover:text-link">
                        {w.name}
                      </Link>
                      <p className="truncate text-[12.5px] text-subtle">{w.specialty}</p>
                    </div>
                    {c && (
                      <span className="inline-flex max-w-[48%] items-center gap-1 truncate text-right text-[12px] font-medium text-[#b86e00]">
                        <TriangleAlert className="size-3.5 shrink-0" />
                        <span className="truncate">También {c.map((x) => (x.visible ? `${x.folio} ${x.time}` : `otra cuadrilla ${x.time}`)).join(", ")}</span>
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <KeyValues
          title="Detalles"
          rows={[
            { k: "Supervisor", v: supervisor?.name ?? "—" },
            { k: "Unidad", v: unit?.name ?? "—" },
            { k: "Servicio", v: serviceType?.name ?? "—" },
            {
              k: "Contacto en sitio",
              v: order.siteContact.name ? (
                <a href={`tel:${order.siteContact.phone.replace(/\s/g, "")}`} className="inline-flex items-center gap-1.5 hover:text-link">
                  <Phone className="size-3.5" /> {order.siteContact.name}
                </a>
              ) : (
                "—"
              ),
            },
            { k: "Ref. comercial", v: <span className="tabular">{order.commercialRef || "—"}</span> },
          ]}
        />

        {order.specialInstructions && (
          <div className="rounded-[16px] bg-[#fff6e6] p-4 text-[13.5px] leading-relaxed text-[#6b4200]">
            <p className="mb-1 text-[12px] font-semibold uppercase tracking-[0.1em] text-[#b86e00]">Instrucciones especiales</p>
            {order.specialInstructions}
          </div>
        )}

        {history.length > 0 && (
          <section>
            <Eyebrow className="mb-3">Historial de cuadrilla</Eyebrow>
            <ol className="space-y-3 border-l border-hairline pl-4">
              {history.map((h, i) => (
                <li key={`${h.at}-${i}`} className="relative">
                  <span className="absolute -left-[21px] top-1.5 size-2 rounded-full bg-[#c5d6ea] ring-4 ring-white" />
                  <p className="text-[13.5px] text-ink">
                    {plural(h.workerIds.length, "persona", "personas")} · {h.reason}
                  </p>
                  <p className="text-[12px] text-subtle">
                    {fmtDateTime(h.at)} · {lk.users.get(h.by)?.name ?? "Sistema"}
                    {h.jornadaId ? ` · solo J${j.dayIndex}` : ""}
                  </p>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>

      <div className="border-t border-hairline p-4">
        {(crewReason ?? moveReason) && (
          // the dimmed buttons below can't explain themselves on touch (no hover): say why in plain sight
          <p className="mb-3 flex items-start gap-2 text-[12.5px] leading-snug text-subtle">
            <Lock className="mt-0.5 size-3.5 shrink-0" />
            <span>{!canAssign ? `Solo consulta. ${REASON_CREW}` : (crewReason ?? `Reprogramar no disponible. ${moveReason}`)}</span>
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Button asChild className="h-11 rounded-[12px] font-semibold">
            <Link href={`/jornada/${j.id}`} onClick={onClose}>
              Abrir jornada
            </Link>
          </Button>
          <Button asChild variant="outline" className="h-11 rounded-[12px] font-semibold">
            <Link href={`/ordenes/${order.folio}`} onClick={onClose}>
              Ver orden <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Gate allowed={!crewReason} reason={crewReason ?? ""} className="w-full">
            <Button variant="outline" disabled={!!crewReason} onClick={() => onMode("cuadrilla")} className="h-11 w-full rounded-[12px] font-semibold">
              <Users className="size-4" /> Cambiar cuadrilla
            </Button>
          </Gate>
          <Gate allowed={!moveReason} reason={moveReason ?? ""} className="w-full">
            <Button variant="outline" disabled={!!moveReason} onClick={() => onMode("reprogramar")} className="h-11 w-full rounded-[12px] font-semibold">
              <CalendarClock className="size-4" /> Reprogramar
            </Button>
          </Gate>
        </div>
      </div>
    </>
  );
}

function ModeHeader({ title, subtitle, onBack }: { title: string; subtitle: string; onBack: () => void }) {
  return (
    <div className="mb-5 flex items-start gap-3">
      <button type="button" onClick={onBack} aria-label="Regresar al detalle" className="inline-flex size-10 shrink-0 items-center justify-center rounded-[12px] border border-hairline hover:bg-muted">
        <ArrowLeft className="size-4" />
      </button>
      <div className="min-w-0">
        <p className="text-[17px] font-semibold text-ink">{title}</p>
        <p className="text-[13px] text-subtle">{subtitle}</p>
      </div>
    </div>
  );
}

/* ───────────── change crew ───────────── */

function CrewEditor({ b, onBack }: { b: Bundle; onBack: () => void }) {
  const { jornada: j, order, jornadas } = b;
  const assignCrew = useAppStore((s) => s.assignCrew);
  const lk = useLookups();
  const [crew, setCrew] = useState<string[]>(j.workerIds);
  const [motivo, setMotivo] = useState("");
  const [applyAll, setApplyAll] = useState(false);
  const [ok, setOk] = useState(false);

  const pending = jornadas.filter((x) => x.status === "pendiente");
  const canApplyAll = j.status === "pendiente" && pending.length > 1;
  const added = crew.filter((id) => !j.workerIds.includes(id));
  const removed = j.workerIds.filter((id) => !crew.includes(id));
  const changed = added.length > 0 || removed.length > 0 || (applyAll && pending.some((x) => !sameSet(x.workerIds, crew)));
  const valid = crew.length > 0 && changed && motivo.trim().length >= 4 && ok;
  const dates = applyAll ? pending.map((x) => x.date) : [j.date];

  const save = () => {
    if (!valid) return;
    assignCrew(order.id, crew, motivo.trim(), applyAll ? undefined : j.id);
    toast.success("Cuadrilla actualizada", {
      description: `${order.folio} · ${applyAll ? "jornadas pendientes" : `Jornada ${j.dayIndex}`} · ${plural(crew.length, "persona", "personas")}`,
    });
    onBack();
  };

  const people = (ids: string[]) => ids.map((id) => lk.workers.get(id)).filter((w) => !!w);

  return (
    <>
      <div className="flex-1 space-y-5 overflow-y-auto p-5 sm:p-6">
        <ModeHeader title="Cambiar cuadrilla" subtitle={`Jornada ${j.dayIndex} · ${longDay(parseISO(j.plannedStart))}`} onBack={onBack} />
        <CrewPicker unitId={order.unitId} dates={dates} value={crew} onChange={setCrew} excludeOrderId={order.id} className="h-[min(44dvh,360px)]" />

        <AnimatePresence initial={false}>
          {(added.length > 0 || removed.length > 0) && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="flex flex-wrap gap-x-6 gap-y-2 rounded-[16px] border border-hairline p-4 text-[13px]">
                {added.length > 0 && (
                  <span className="flex items-center gap-2">
                    <b className="font-semibold text-st-teal">+{added.length}</b>
                    <AvatarStack people={people(added)} size={24} />
                  </span>
                )}
                {removed.length > 0 && (
                  <span className="flex items-center gap-2">
                    <b className="font-semibold text-st-red">−{removed.length}</b>
                    <AvatarStack people={people(removed)} size={24} className="opacity-60" />
                  </span>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {canApplyAll && (
          <label className="flex items-start justify-between gap-4 rounded-[16px] border border-hairline p-4">
            <span className="text-[13.5px]">
              <span className="block font-semibold text-ink">Aplicar a todas las jornadas pendientes</span>
              <span className="text-subtle">{plural(pending.length, "jornada pendiente", "jornadas pendientes")} de la orden.</span>
            </span>
            <Switch checked={applyAll} onCheckedChange={setApplyAll} aria-label="Aplicar a todas las jornadas pendientes" />
          </label>
        )}

        <MotivoField id="crew-motivo" value={motivo} onChange={setMotivo} suggestions={CREW_REASONS} />
        <ConfirmCheck id="crew-ok" checked={ok} onChange={setOk}>
          Confirmo el cambio de cuadrilla. Quedará en el historial de reasignaciones con mi usuario, fecha y motivo.
        </ConfirmCheck>
      </div>
      <div className="flex justify-end gap-2 border-t border-hairline p-4">
        <Button variant="outline" onClick={onBack} className="h-11 rounded-[12px] px-5">
          Cancelar
        </Button>
        <Button onClick={save} disabled={!valid} className="h-11 rounded-[12px] px-5 font-semibold">
          Guardar cuadrilla
        </Button>
      </div>
    </>
  );
}

/* ───────────── reschedule one jornada ───────────── */

function MoveEditor({ b, now, onBack, onMoved }: { b: Bundle; now: Date; onBack: () => void; onMoved: (id: string, date: string) => void }) {
  const { jornada: j, order, jornadas } = b;
  const scheduleJornadas = useAppStore((s) => s.scheduleJornadas);
  const assignCrew = useAppStore((s) => s.assignCrew);
  const todayK = dayKey(now);
  const current = toDayPlan(j);
  const [date, setDate] = useState(current.date < todayK ? todayK : current.date);
  const [start, setStart] = useState(current.start);
  const [end, setEnd] = useState(current.end);
  const [motivo, setMotivo] = useState("");
  const [ok, setOk] = useState(false);

  const others = jornadas.filter((x) => x.id !== j.id);
  const lastExecuted = others
    .filter((x) => x.status !== "pendiente")
    .map((x) => x.date)
    .sort()
    .at(-1);
  let error = validatePlan({ date, start, end }, todayK);
  if (!error && others.some((x) => x.date === date)) error = "La orden ya tiene otra jornada ese día.";
  if (!error && lastExecuted && date <= lastExecuted) error = `Debe ser posterior al ${fmtDay(lastExecuted)}, la última jornada ejecutada.`;
  const unchanged = date === current.date && start === current.start && end === current.end && !current.clamped;
  const clampedOthers = others.filter((x) => x.status === "pendiente").map(toDayPlan).filter((p) => p.clamped);
  const valid = !error && !unchanged && motivo.trim().length >= 4 && ok;
  const dateErr = error && /fecha|día|posterior al/i.test(error) ? error : null;
  const timeErr = error && !dateErr ? error : null;

  const save = () => {
    if (!valid) return;
    const days = pendingDaysWithMove(jornadas, { jornadaId: j.id, date, start, end });
    scheduleJornadas(
      order.id,
      days.map(({ date: d, start: s, end: e }) => ({ date: d, start: s, end: e })),
      motivo.trim(),
    );
    // scheduleJornadas gives every fresh jornada the order's latest crew — keep each day's own crew.
    const fresh = useAppStore
      .getState()
      .jornadas.filter((x) => x.orderId === order.id && x.status === "pendiente")
      .sort((a, c) => a.date.localeCompare(c.date) || a.plannedStart.localeCompare(c.plannedStart));
    fresh.forEach((fj, i) => {
      const want = days[i]?.crew;
      if (want && want.length && !sameSet(want, fj.workerIds)) assignCrew(order.id, want, "Se conserva la cuadrilla de la jornada reprogramada", fj.id);
    });
    const moved = fresh.find((x) => x.date === date && hm(x.plannedStart) === start) ?? fresh.find((x) => x.date === date);
    toast.success("Jornada reprogramada", { description: `${order.folio} · ${longDay(parseISO(date))} · ${start}–${end}` });
    if (moved) onMoved(moved.id, date);
    else onBack();
  };

  return (
    <>
      <div className="flex-1 space-y-5 overflow-y-auto p-5 sm:p-6">
        <ModeHeader title="Reprogramar jornada" subtitle={`Jornada ${j.dayIndex} de ${Math.max(order.plannedDays, j.dayIndex)} · ${order.folio}`} onBack={onBack} />

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <FieldLabel htmlFor="mv-date">Nueva fecha</FieldLabel>
            <DateTimeInput id="mv-date" type="date" min={todayK} value={date} onChange={(e) => setDate(e.target.value)} invalid={!!dateErr} />
            <FieldError>{dateErr}</FieldError>
          </div>
          <div>
            <FieldLabel htmlFor="mv-start">Inicio</FieldLabel>
            <DateTimeInput id="mv-start" type="time" step={900} value={start} onChange={(e) => setStart(e.target.value)} invalid={!!timeErr} />
          </div>
          <div>
            <FieldLabel htmlFor="mv-end">Término</FieldLabel>
            <DateTimeInput id="mv-end" type="time" step={900} value={end} onChange={(e) => setEnd(e.target.value)} invalid={!!timeErr} />
          </div>
          <div className="col-span-2 -mt-1">
            <FieldError>{timeErr}</FieldError>
            {current.clamped && <p className="mt-1.5 text-[12.5px] text-[#b86e00]">Esta jornada terminaba al día siguiente ({current.originalEnd}); las jornadas se registran dentro del mismo día.</p>}
          </div>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 rounded-[18px] border border-hairline p-4">
          <div className="min-w-0">
            <Eyebrow>Antes</Eyebrow>
            <p className="mt-1 truncate text-[14px] font-medium text-subtle line-through decoration-[#c5ccd6]">{fmtDay(current.date)}</p>
            <p className="text-[13px] text-subtle tabular">
              {current.start}–{current.clamped ? current.originalEnd : current.end}
            </p>
          </div>
          <motion.span animate={{ x: [0, 4, 0] }} transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }} className="text-subtle">
            <ArrowRight className="size-4" />
          </motion.span>
          <div className="min-w-0">
            <Eyebrow>Después</Eyebrow>
            <p className="mt-1 truncate text-[14px] font-semibold text-ink">{/^\d{4}-\d{2}-\d{2}$/.test(date) ? fmtDay(date) : "—"}</p>
            <p className="text-[13px] text-ink tabular">
              {start}–{end}
            </p>
          </div>
        </div>

        {clampedOthers.length > 0 && (
          <p className="rounded-[14px] bg-[#fff6e6] px-4 py-3 text-[12.5px] leading-snug text-[#8a5300]">
            {plural(clampedOthers.length, "otra jornada nocturna", "otras jornadas nocturnas")} de la orden se registrará{clampedOthers.length > 1 ? "n" : ""} con término a las 23:59 del mismo día.
          </p>
        )}

        <MotivoField id="mv-motivo" value={motivo} onChange={setMotivo} suggestions={MOVE_REASONS} />
        <ConfirmCheck id="mv-ok" checked={ok} onChange={setOk}>
          Confirmo la nueva fecha y aviso al contacto en sitio por los medios habituales (la app no envía notificaciones). El cambio queda en la bitácora.
        </ConfirmCheck>
      </div>
      <div className="flex justify-end gap-2 border-t border-hairline p-4">
        <Button variant="outline" onClick={onBack} className="h-11 rounded-[12px] px-5">
          Cancelar
        </Button>
        <Button onClick={save} disabled={!valid} className="h-11 rounded-[12px] px-5 font-semibold">
          Reprogramar
        </Button>
      </div>
    </>
  );
}
