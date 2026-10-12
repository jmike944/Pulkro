"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, CalendarClock, Lock, Navigation, Phone, TriangleAlert, Users } from "lucide-react";
import { parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { useAppStore, useCan, useJornadaBundle, useLookups, useMediaQuery, useNow, useScopedData } from "@/lib/hooks";
import { jornadaMinutes, mapsLink } from "@/lib/domain";
import { fmtDateTime, fmtDay, fmtDuration, fmtTime, plural } from "@/lib/format";
import { ORDER_STATUS } from "@/lib/status";
import type { Jornada, OrderStatus } from "@/lib/types";
import { AvatarStack, Eyebrow, KeyValues, PersonAvatar } from "@/components/pk/bits";
import { ClientMark } from "@/components/pk/client-mark";
import { MODAL_DESKTOP_QUERY } from "@/components/pk/modal-shell";
import { OrderStatusPill, StatusDot, TonePill } from "@/components/pk/status";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { CrewModal } from "@/features/jornada/crew-flow";
import { REASON_CREW, dayLabel, jornadaVisual, longDay } from "./agenda-model";
import { Gate } from "./gate";
import { MoveDialog, type MoveState } from "./move-dialog";

type Bundle = NonNullable<ReturnType<typeof useJornadaBundle>>;

/** Orders whose plan can no longer change from the agenda. */
const LOCKED: OrderStatus[] = ["cancelada", "finalizada", "reporte_enviado", "seguimiento", "archivada"];

export type SheetState = { id: string; open: boolean } | null;

/**
 * Side sheet for one jornada: order + jornada summary, crew, status and the planning actions
 * (Cambiar cuadrilla / Reprogramar) — the latter only with can("crew.assign"). Both actions open their own modal
 * (the shared `CrewModal` and `MoveDialog`) over the sheet: a full-screen flow on phones, a dialog on desktop.
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
  // Same breakpoint as the shell and every modal: right sheet on the desktop panel (lg), bottom sheet below.
  const isDesktop = useMediaQuery(MODAL_DESKTOP_QUERY);
  // Lives outside the sheet: rescheduling replaces the jornada (new id), which re-keys the sheet body.
  const [move, setMove] = useState<MoveState>(null);
  return (
    <>
      <Sheet open={!!state?.open} onOpenChange={onOpenChange}>
        <SheetContent
          side={isDesktop ? "right" : "bottom"}
          className={cn("gap-0 p-0", isDesktop ? "w-full sm:max-w-[500px]" : "h-[92dvh] max-h-[92dvh] rounded-t-[28px]")}
        >
          {state ? (
            <SheetBody
              key={state.id}
              jornadaId={state.id}
              onClose={() => onOpenChange(false)}
              onSelect={onSelect}
              onMove={() => setMove({ jornadaId: state.id, open: true })}
            />
          ) : (
            <SheetTitle className="sr-only">Jornada</SheetTitle>
          )}
        </SheetContent>
      </Sheet>
      <MoveDialog state={move} onOpenChange={(open) => setMove((m) => (m ? { ...m, open } : m))} onMoved={onMoved} />
    </>
  );
}

function SheetBody({
  jornadaId,
  onClose,
  onSelect,
  onMove,
}: {
  jornadaId: string;
  onClose: () => void;
  onSelect: (id: string) => void;
  onMove: () => void;
}) {
  const b = useJornadaBundle(jornadaId);
  const now = useNow(60_000);
  const [crewOpen, setCrewOpen] = useState(false);

  if (!b) {
    return (
      <SheetHeader className="p-6 pr-[68px]">
        <SheetTitle className="font-serif text-[26px] font-medium">Jornada no disponible</SheetTitle>
        <SheetDescription>Es posible que se haya reprogramado o eliminado.</SheetDescription>
      </SheetHeader>
    );
  }

  const visual = jornadaVisual(b.jornada, b.order, now);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* 68px on the right keeps a long title clear of the 44px close button */}
      <SheetHeader className="border-b border-hairline p-5 pr-[68px] sm:p-6 sm:pr-[68px]">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <TonePill tone={visual.tone} live={visual.live}>
            {visual.label}
          </TonePill>
          <span className="inline-flex h-6 items-center rounded-md bg-tile px-2 text-[12px] font-semibold text-ink tabular">{dayLabel(b.jornada, b.order)}</span>
          <OrderStatusPill status={b.order.status} solid={false} className="text-subtle" />
        </div>
        <SheetTitle className="font-serif text-[26px] font-medium leading-tight">{b.client?.shortName ?? b.order.title}</SheetTitle>
        <SheetDescription className="text-[14px]">
          {b.order.folio} · {b.order.title}
        </SheetDescription>
      </SheetHeader>

      <Detail b={b} now={now} onClose={onClose} onSelect={onSelect} onCrew={() => setCrewOpen(true)} onMove={onMove} />

      <CrewModal
        open={crewOpen}
        onOpenChange={setCrewOpen}
        order={b.order}
        jornadas={b.jornadas}
        jornadaId={b.jornada.id}
        allowApplyAll
      />
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
  onCrew,
  onMove,
}: {
  b: Bundle;
  now: Date;
  onClose: () => void;
  onSelect: (id: string) => void;
  onCrew: () => void;
  onMove: () => void;
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
    (j.status === "en_curso" ? "La jornada ya inició: registre la salida o una incidencia." : j.status === "cerrada" ? "La jornada ya se cerró." : null);

  return (
    <>
      <div className="flex-1 space-y-7 overflow-y-auto p-5 sm:p-6">
        {/* time hero */}
        <div className={cn("relative overflow-hidden rounded-[20px] p-5", visual.live ? "bg-brand-deep text-white" : "border border-hairline bg-gradient-to-br from-blue-wash via-surface to-surface")}>
          {visual.live && <span aria-hidden className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full bg-sky/25 blur-2xl" />}
          <Eyebrow className={cn("relative", visual.live && "text-white/60")}>{longDay(start)}</Eyebrow>
          <p className="relative mt-1.5 text-[34px] font-medium leading-none tracking-[-0.035em] tabular">
            {fmtTime(start)} <span className={visual.live ? "text-white/40" : "text-ghost"}>–</span> {fmtTime(end)}
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
          {visual.kind === "late" && <p className="relative mt-3 text-[13.5px] font-medium text-amber-fg">Pasó la hora de inicio sin registro de entrada.</p>}

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
                      "inline-flex h-11 items-center gap-2 rounded-[12px] border px-3 text-[12.5px] font-medium tabular transition",
                      on
                        ? visual.live
                          ? "border-white/30 bg-white/15 text-white"
                          : "border-ink bg-ink text-on-ink"
                        : visual.live
                          ? "border-white/15 text-white/70 hover:bg-white/10"
                          : "border-hairline bg-surface text-ink hover:bg-muted",
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
          {site && !site.unavailable && (
            <a
              href={mapsLink(site.lat, site.lng)}
              target="_blank"
              rel="noreferrer"
              aria-label="Cómo llegar (abre mapas)"
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-[12px] border border-hairline text-ink transition hover:bg-muted"
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
            <p className="rounded-[16px] border border-dashed border-line-strong px-4 py-5 text-center text-[13.5px] text-subtle">Sin cuadrilla asignada.</p>
          ) : (
            <ul>
              {crew.map((w) => {
                const c = conflicts.get(w.id);
                return (
                  <li key={w.id} className="flex items-center gap-3 border-b border-hairline py-2.5 last:border-0">
                    <PersonAvatar name={w.name} initials={w.initials} hue={w.hue} size={34} />
                    <div className="min-w-0 flex-1">
                      {/* the staff directory (/equipo) is for Dirección and Administración: supervisors just see the name */}
                      <span className="block truncate text-[14px] font-medium text-ink">{w.name}</span>
                      <p className="truncate text-[12.5px] text-subtle">{w.specialty}</p>
                    </div>
                    {c && (
                      <span className="inline-flex max-w-[48%] items-center gap-1 truncate text-right text-[12px] font-medium text-amber-fg">
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
          <div className="rounded-[16px] bg-amber-soft p-4 text-[13.5px] leading-relaxed text-amber-deep">
            <p className="mb-1 text-[12px] font-semibold uppercase tracking-[0.1em] text-amber-fg">Instrucciones especiales</p>
            {order.specialInstructions}
          </div>
        )}

        {history.length > 0 && (
          <section>
            <Eyebrow className="mb-3">Historial de cuadrilla</Eyebrow>
            <ol className="space-y-3 border-l border-hairline pl-4">
              {history.map((h, i) => (
                <li key={`${h.at}-${i}`} className="relative">
                  <span className="absolute -left-[21px] top-1.5 size-2 rounded-full bg-blue-mid ring-4 ring-surface" />
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

      <div className="border-t border-hairline px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-4">
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
            <Button variant="outline" disabled={!!crewReason} onClick={onCrew} className="h-11 w-full rounded-[12px] font-semibold">
              <Users className="size-4" /> Cambiar cuadrilla
            </Button>
          </Gate>
          <Gate allowed={!moveReason} reason={moveReason ?? ""} className="w-full">
            <Button variant="outline" disabled={!!moveReason} onClick={onMove} className="h-11 w-full rounded-[12px] font-semibold">
              <CalendarClock className="size-4" /> Reprogramar
            </Button>
          </Gate>
        </div>
      </div>
    </>
  );
}
