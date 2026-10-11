"use client";

import { use, useState } from "react";
import { differenceInMinutes, isSameDay, parseISO } from "date-fns";
import { toast } from "sonner";
import { useAppStore } from "@/lib/hooks";
import { useUi } from "@/lib/ui-store";
import type { GeoInput } from "@/lib/store";
import { jornadaMinutes } from "@/lib/domain";
import { fmtDuration, fmtTime } from "@/lib/format";
import { Shimmer } from "@/components/pk/feedback";
import { NotFoundOrOutOfScope } from "@/components/shell/out-of-scope";
import { IncidentSheet } from "@/components/pk/incident-sheet";
import { useFieldState, type FieldReady, type FieldWarning } from "./use-field-state";
import { FieldHeader } from "./field-header";
import { StepRail, scrollToSection } from "./step-rail";
import { HeroCard, type HeroActions } from "./hero-card";
import { NextStep } from "./next-step";
import { PhotoSection, QuickCaptureFlow } from "./photo-section";
import { IncidentsSection } from "./incidents-section";
import { BeforeAfterSection } from "./before-after-section";
import { Bitacora, NoteFlow } from "./bitacora";
import { OrderContextRow, OrderRail } from "./order-rail";
import { GpsFlow, type GpsMode, type GpsNext, type GpsResult } from "./gps-capture";
import { CrewFlow } from "./crew-flow";
import { BreakdownFlow } from "./breakdown-flow";
import { useFlowState } from "./flow-bits";
import { fmtShortDay, stampHow } from "./field-bits";
import { useMinWidth } from "./use-min-width";

/** /jornada/[id] — the supervisor's field screen (doc §3 pasos 5–11, §4.2, §6, §8). */
export function JornadaView({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const res = useFieldState(id);
  // One state for "doesn't exist" and "outside your scope" (doc §2): never which of the two, never the record's name.
  if (res.status !== "ok") return <NotFoundOrOutOfScope subject="Esta jornada" backHref="/agenda" backLabel="Volver a la agenda" />;
  return <FieldScreen f={res.f} />;
}

function FieldScreen({ f }: { f: FieldReady }) {
  const checkIn = useAppStore((s) => s.checkIn);
  const checkOut = useAppStore((s) => s.checkOut);

  const gps = useFlowState<{ mode: GpsMode; warnings: FieldWarning[] }>();
  const capture = useFlowState<"antes" | "despues">();
  const note = useFlowState();
  const crew = useFlowState();
  const breakdown = useFlowState();
  const [incidentOpen, setIncidentOpen] = useState(false);
  // Same breakpoint as the `@min-[880px]` classes below: the rail is a side column only when it fits.
  const [boxRef, wide] = useMinWidth<HTMLDivElement>(880);

  const openGps = (mode: GpsMode) => gps.show({ mode, warnings: gpsWarnings(f, mode, new Date()) });

  const actions: HeroActions = {
    checkIn: () => openGps("entrada"),
    checkOut: () => openGps("salida"),
    crew: () => crew.show(),
    photo: (kind) => capture.show(kind),
    incident: () => setIncidentOpen(true),
    note: () => note.show(),
    breakdown: () => breakdown.show(),
  };

  const confirmGps = (mode: GpsMode, geo: GeoInput): GpsResult => {
    const read = () => useAppStore.getState().jornadas.find((j) => j.id === f.jornada.id);
    const before = read();
    if (!before) return { ok: false, error: "La jornada ya no existe en este dispositivo." };
    const how = stampHow(geo);

    if (mode === "entrada") {
      if (before.checkIn) return { ok: false, error: "Esta jornada ya tiene registro de entrada." };
      checkIn(before.id, geo);
      const after = read();
      if (!after?.checkIn) return { ok: false, error: "No se pudo registrar la entrada. Intente de nuevo." };
      toast.success(`Entrada registrada · ${fmtTime(after.checkIn.deviceAt)}`, {
        description: `${how}${after.checkIn.offline ? " · guardada sin conexión" : ""}`,
      });
      return { ok: true, at: after.checkIn.deviceAt, offline: after.checkIn.offline };
    }

    // Sequence (doc §8): salida only after an entrada of this same jornada, never twice.
    if (!before.checkIn) return { ok: false, error: "No hay registro de entrada: la salida debe ir después de la entrada." };
    if (before.checkOut) return { ok: false, error: "Esta jornada ya tiene registro de salida." };
    checkOut(before.id, geo);
    const after = read();
    if (!after?.checkOut)
      return {
        ok: false,
        error: `La hora del dispositivo es anterior a la entrada (${fmtTime(before.checkIn.deviceAt)}). Revise la fecha y hora del teléfono.`,
      };
    const minutes = jornadaMinutes(after);
    toast.success(`Salida registrada · ${fmtTime(after.checkOut.deviceAt)}`, {
      description: `Jornada de ${fmtDuration(minutes)} · ${how}${after.checkOut.offline ? " · guardada sin conexión" : ""}`,
    });
    useUi.getState().fireCelebrate();
    return { ok: true, at: after.checkOut.deviceAt, offline: after.checkOut.offline, minutes };
  };

  const onGpsNext = (next: GpsNext) => {
    gps.setOpen(false);
    // let the success screen slide out before the next flow slides in
    setTimeout(() => (next === "desglose" ? breakdown.show() : capture.show(next)), 280);
  };

  return (
    <div ref={boxRef} className="@container mx-auto w-full max-w-[1240px]">
      <FieldHeader f={f} />

      <div className="grid gap-10 @min-[880px]:grid-cols-[minmax(0,1fr)_minmax(290px,340px)] @min-[1080px]:gap-14">
        <div className="mx-auto w-full min-w-0 max-w-2xl space-y-10">
          <div className="space-y-5">
            <StepRail steps={f.steps} current={f.currentStep} />
            <HeroCard f={f} actions={actions} />
            {f.jornada.status === "cerrada" && <NextStep f={f} />}
            {!wide && <OrderContextRow f={f} />}
          </div>
          <PhotoSection f={f} kind="antes" />
          <IncidentsSection f={f} onNew={() => setIncidentOpen(true)} />
          <PhotoSection f={f} kind="despues" />
          <BeforeAfterSection f={f} />
          <Bitacora f={f} />
        </div>

        {wide && (
          <aside aria-label="Datos de la orden" className="min-w-0 @min-[880px]:sticky @min-[880px]:top-6 @min-[880px]:max-h-[calc(var(--pk-pane-h)-48px)] @min-[880px]:self-start @min-[880px]:overflow-y-auto @min-[880px]:scrollbar-none">
            <OrderRail f={f} />
          </aside>
        )}
      </div>

      {gps.session > 0 && gps.data && (
        <GpsFlow
          key={`gps-${gps.session}`}
          f={f}
          open={gps.open}
          onOpenChange={gps.setOpen}
          mode={gps.data.mode}
          offline={f.offline}
          warnings={gps.data.warnings}
          onConfirm={(geo) => confirmGps(gps.data!.mode, geo)}
          onNext={onGpsNext}
        />
      )}
      {capture.session > 0 && capture.data && (
        <QuickCaptureFlow key={`cap-${capture.session}`} f={f} kind={capture.data} open={capture.open} onOpenChange={capture.setOpen} />
      )}
      {note.session > 0 && <NoteFlow key={`note-${note.session}`} f={f} open={note.open} onOpenChange={note.setOpen} />}
      {crew.session > 0 && <CrewFlow key={`crew-${crew.session}`} f={f} open={crew.open} onOpenChange={crew.setOpen} />}
      {breakdown.session > 0 && <BreakdownFlow key={`bd-${breakdown.session}`} f={f} open={breakdown.open} onOpenChange={breakdown.setOpen} />}
      <IncidentSheet
        orderId={f.order.id}
        jornadaId={f.jornada.id}
        open={incidentOpen}
        onOpenChange={setIncidentOpen}
        onCreated={() => setTimeout(() => scrollToSection("incidencias"), 350)}
      />
    </div>
  );
}

/** Non-blocking context shown inside the GPS flow (doc §8: secuencia, duplicados, fotos obligatorias). */
function gpsWarnings(f: FieldReady, mode: GpsMode, now: Date): FieldWarning[] {
  const w: FieldWarning[] = [];
  if (mode === "entrada") {
    const start = parseISO(f.jornada.plannedStart);
    if (f.earlierPending)
      w.push({ tone: "amber", text: `La Jornada ${f.earlierPending.dayIndex} sigue pendiente; esta entrada abre la Jornada ${f.jornada.dayIndex} antes que ella.` });
    if (!isSameDay(start, now)) w.push({ tone: "amber", text: `Esta jornada está programada para el ${fmtShortDay(start)}; la entrada quedará con la fecha de hoy.` });
    else {
      const early = differenceInMinutes(start, now);
      if (early > 90) w.push({ tone: "info", text: `Faltan ${fmtDuration(early)} para el inicio programado (${fmtTime(start)}).` });
    }
    if (!f.crew.length) w.push({ tone: "amber", text: "La jornada no tiene cuadrilla asignada; asígnela desde “Cambiar”." });
    if (f.order.status === "reprogramada") w.push({ tone: "info", text: "La orden está reprogramada; confirme las fechas con administración." });
  } else {
    if (!f.antes.length) w.push({ tone: "amber", text: "No hay fotos ANTES en esta jornada; son obligatorias para el cierre." });
    if (!f.despues.length) w.push({ tone: "info", text: "Aún no hay fotos DESPUÉS: tómelas al terminar, después de la salida. Son obligatorias para el cierre." });
    if (f.openIncidents.length)
      w.push({ tone: "info", text: `${f.openIncidents.length === 1 ? "Hay 1 incidencia abierta" : `Hay ${f.openIncidents.length} incidencias abiertas`}: puede registrar la salida y resolverla después.` });
  }
  return w;
}

/* ───────────── loading ───────────── */

export function JornadaSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[1240px]" aria-busy="true" aria-label="Cargando jornada">
      <Shimmer className="h-9 w-32" />
      <Shimmer className="mt-6 h-4 w-56" />
      <Shimmer className="mt-3 h-10 w-full max-w-lg" />
      <Shimmer className="mt-3 h-5 w-72" />
      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="mx-auto w-full max-w-2xl space-y-5">
          <Shimmer className="h-[112px] rounded-[22px]" />
          <Shimmer className="h-[360px] rounded-[28px]" />
          <Shimmer className="h-[180px] rounded-[22px]" />
        </div>
        <Shimmer className="hidden h-[480px] rounded-[22px] lg:block" />
      </div>
    </div>
  );
}
