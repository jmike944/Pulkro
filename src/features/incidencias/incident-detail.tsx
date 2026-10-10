"use client";

import Link from "next/link";
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUpRight, CheckCircle2, Clock, ImageOff, Lock, LockOpen, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMediaQuery } from "@/lib/hooks";
import { fmtAgo, fmtDateTime, fmtDay, plural } from "@/lib/format";
import { INCIDENT_TYPE, SEVERITY } from "@/lib/status";
import type { Photo } from "@/lib/types";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { AnimatedNumber, Eyebrow, KeyValues } from "@/components/pk/bits";
import { OrderStatusPill, SoftBadge } from "@/components/pk/status";
import { PhotoThumb } from "@/components/pk/scene-photo";
import { ClientMark } from "@/components/pk/client-mark";
import { Timeline, type TimelineStep } from "@/components/pk/timeline";
import { AuroraStat, BigButton, FlowHeading, FlowScreen, ItemCard, SuccessHero } from "@/components/pk/mobile";
import { EASE } from "@/components/pk/motion";
import { PhotoLightbox, useLightbox } from "@/features/evidencias/photo-lightbox";
import { Guarded } from "@/features/evidencias/guarded";
import { SqueegeeWipe } from "@/features/evidencias/squeegee";
import { RESOLUTION_SUGGESTIONS } from "./incident-data";
import { useIncidentModel, type ResolveOutcome } from "./incident-model";
import { StatePill, TypeTile } from "./incident-list";

const RESOLVE_REASON = "Solo el supervisor asignado registra la resolución. Dirección y Administración tienen acceso de consulta.";

type Model = ReturnType<typeof useIncidentModel>;
type Ready = Model & { incident: NonNullable<Model["incident"]>; bundle: NonNullable<Model["bundle"]> };
const isReady = (m: Model): m is Ready => !!m.incident && !!m.bundle;

/** Incident detail: right Sheet on tablet/desktop, full-screen flow (with success screen) on phones. */
export function IncidentDetail({
  incidentId,
  open,
  onOpenChange,
  openCount,
}: {
  incidentId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** open incidents in scope (phone success screen) */
  openCount: number;
}) {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  if (!isDesktop) return incidentId ? <PhoneIncident key={incidentId} incidentId={incidentId} open={open} onOpenChange={onOpenChange} openCount={openCount} /> : null;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-[520px]">
        {incidentId ? <DesktopIncident key={incidentId} incidentId={incidentId} /> : <SheetTitle className="sr-only">Incidencia</SheetTitle>}
      </SheetContent>
    </Sheet>
  );
}

/* ───────────── desktop ───────────── */

function DesktopIncident({ incidentId }: { incidentId: string }) {
  const m = useIncidentModel(incidentId);
  const [text, setText] = useState("");
  const [wipe, setWipe] = useState(0);
  const lb = useLightbox();

  if (!isReady(m)) return <SheetTitle className="p-6 text-[15px] text-subtle">Incidencia no disponible</SheetTitle>;
  const { incident: inc, bundle } = m;
  const { order, client } = bundle;
  const type = INCIDENT_TYPE[inc.type];
  const open = inc.status === "abierta";

  const submit = () => {
    if (m.resolve(text)) setWipe((n) => n + 1);
  };

  return (
    <>
      <SheetHeader className="gap-0 border-b border-hairline p-6 pr-14">
        <div className="flex items-center gap-3">
          <TypeTile type={inc.type} size={36} />
          <span className="text-[13px] text-subtle tabular">
            {inc.folio} · registrada {fmtAgo(inc.createdAt)}
          </span>
        </div>
        <SheetTitle className="mt-3 font-serif text-[26px] font-medium leading-tight tracking-[-0.01em] text-ink">{type.label}</SheetTitle>
        <SheetDescription className="mt-1 text-[14px] text-subtle">
          {order.folio} · {client.shortName}
          {m.jornada ? ` · Jornada ${m.jornada.dayIndex}` : ""}
        </SheetDescription>
        <Chips m={m} className="mt-4" />
      </SheetHeader>

      <div className="flex-1 space-y-7 overflow-y-auto p-6">
        <Body m={m} wipe={wipe} onPreview={lb.open} />
        {open && m.canCapture && <ResolutionForm value={text} onChange={setText} />}
      </div>

      <SheetFooter className="flex-row flex-wrap items-center justify-end gap-2 border-t border-hairline p-4">
        <Button asChild variant="outline" className="h-11 rounded-[12px] border-[#dfe3ea] px-4 font-semibold">
          <Link href={`/ordenes/${order.folio}?tab=incidencias`}>
            Ver orden <ArrowUpRight />
          </Link>
        </Button>
        {open ? (
          <Guarded reason={m.canCapture ? null : RESOLVE_REASON}>
            <Button onClick={submit} disabled={!m.canCapture || text.trim().length < 6} className="h-11 rounded-[12px] px-5 font-semibold">
              <CheckCircle2 /> Marcar como resuelta
            </Button>
          </Guarded>
        ) : (
          m.canClose &&
          (order.status === "pendiente_validacion" || order.status === "reabierta") && (
            <Button asChild className="h-11 rounded-[12px] px-5 font-semibold">
              <Link href={`/ordenes/${order.folio}?cerrar=1`}>Ir al cierre</Link>
            </Button>
          )
        )}
      </SheetFooter>

      <PhotoLightbox photos={lb.list} index={lb.index} onIndexChange={lb.setIndex} pairPool={bundle.photos} />
    </>
  );
}

/* ───────────── phone ───────────── */

function PhoneIncident({
  incidentId,
  open,
  onOpenChange,
  openCount,
}: {
  incidentId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  openCount: number;
}) {
  const m = useIncidentModel(incidentId);
  const [text, setText] = useState("");
  const [outcome, setOutcome] = useState<ResolveOutcome | null>(null);
  const lb = useLightbox();
  // The flow stays mounted while closed; drop the success screen once it has animated out.
  const handleOpenChange = (v: boolean) => {
    onOpenChange(v);
    if (!v && outcome) setTimeout(() => setOutcome(null), 450);
  };

  if (!isReady(m))
    return (
      <FlowScreen open={open} onOpenChange={handleOpenChange} title="Incidencia">
        <p className="py-10 text-center text-[15px] text-subtle">Esta incidencia no está disponible.</p>
      </FlowScreen>
    );
  const { incident: inc, bundle } = m;
  const { order, client } = bundle;
  const type = INCIDENT_TYPE[inc.type];
  const isOpen = inc.status === "abierta";

  if (outcome) {
    const left = Math.max(0, openCount);
    return (
      <FlowScreen
        open={open}
        onOpenChange={handleOpenChange}
        closeSide="right"
        description="Incidencia resuelta"
        footer={
          <div className="space-y-2.5">
            {outcome.ready && m.canClose && <BigButton href={`/ordenes/${order.folio}?cerrar=1`}>Validar cierre</BigButton>}
            <BigButton variant="outline" onClick={() => handleOpenChange(false)}>
              Volver a incidencias
            </BigButton>
          </div>
        }
      >
        <SuccessHero title="Incidencia resuelta" icon={outcome.freed ? <LockOpen className="relative size-8" /> : undefined}>
          {outcome.message}
        </SuccessHero>
        <ItemCard
          className="mt-8"
          leading={<ClientMark name={client.name} hue={client.hue} size={44} />}
          title={order.title}
          sub={`${order.folio} · ${client.shortName}`}
          status={<OrderStatusPill status={outcome.after} />}
        />
        <AuroraStat
          className="mt-4"
          label="Incidencias abiertas"
          value={<AnimatedNumber value={left} />}
          sub={left ? `${plural(left, "sigue abierta", "siguen abiertas")} en tu alcance.` : "Sin incidencias abiertas. ¡Todo en orden!"}
        />
      </FlowScreen>
    );
  }

  return (
    <FlowScreen
      open={open}
      onOpenChange={handleOpenChange}
      title="Incidencia"
      description={`${inc.folio} · ${type.label}`}
      footer={
        isOpen ? (
          m.canCapture ? (
            <BigButton disabled={text.trim().length < 6} onClick={() => setOutcome(m.resolve(text))}>
              <CheckCircle2 /> Marcar como resuelta
            </BigButton>
          ) : (
            <p className="rounded-[14px] bg-[#f5f7fa] px-4 py-3 text-center text-[13.5px] leading-snug text-subtle">{RESOLVE_REASON}</p>
          )
        ) : (
          <BigButton variant="outline" href={`/ordenes/${order.folio}?tab=incidencias`}>
            Ver orden {order.folio}
          </BigButton>
        )
      }
    >
      <FlowHeading
        eyebrow={
          <>
            <TypeTile type={inc.type} size={24} />
            <span className="tabular">
              {inc.folio} · {fmtDay(inc.createdAt)}
            </span>
          </>
        }
        title={type.label}
      >
        {order.folio} · {client.shortName}
        {m.jornada ? ` · Jornada ${m.jornada.dayIndex}` : ""}
      </FlowHeading>
      <Chips m={m} />
      <div className="mt-6 space-y-7">
        <Body m={m} onPreview={lb.open} />
        {isOpen && m.canCapture && <ResolutionForm value={text} onChange={setText} />}
      </div>
      <PhotoLightbox photos={lb.list} index={lb.index} onIndexChange={lb.setIndex} pairPool={bundle.photos} />
    </FlowScreen>
  );
}

/* ───────────── shared sections ───────────── */

function Chips({ m, className }: { m: Ready; className?: string }) {
  const inc = m.incident;
  const sev = SEVERITY[inc.severity];
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <StatePill inc={inc} />
      <SoftBadge tone={sev.tone}>Severidad {sev.label.toLowerCase()}</SoftBadge>
      {inc.blocksClosure && (
        <SoftBadge tone={inc.status === "abierta" ? "red" : "slate"}>
          {inc.status === "abierta" ? <Lock className="size-3" /> : <LockOpen className="size-3" />}
          {inc.status === "abierta" ? "Impide el cierre" : "Impedía el cierre"}
        </SoftBadge>
      )}
    </div>
  );
}

function Body({ m, wipe = 0, onPreview }: { m: Ready; wipe?: number; onPreview: (photos: Photo[], i: number) => void }) {
  const { incident: inc, bundle, jornada, photos } = m;
  const { order, client, site, supervisor } = bundle;
  const open = inc.status === "abierta";

  const steps: TimelineStep[] = [
    {
      id: "created",
      title: "Incidencia registrada",
      detail: `${m.createdBy?.name ?? "Usuario"} · severidad ${SEVERITY[inc.severity].label.toLowerCase()}`,
      when: fmtDateTime(inc.createdAt),
      state: "done",
      icon: <TriangleAlert />,
    },
  ];
  if (inc.blocksClosure)
    steps.push({
      id: "blocked",
      title: "Cierre detenido",
      detail: `${order.folio} pasó a “Con incidencia” hasta resolverla.`,
      when: fmtDateTime(inc.createdAt),
      state: open ? "alert" : "done",
      icon: <Lock />,
    });
  if (!open && inc.resolvedAt)
    steps.push({
      id: "resolved",
      title: inc.blocksClosure ? "Resuelta · cierre liberado" : "Resuelta",
      detail: (
        <>
          {inc.resolution}
          {m.resolvedBy && <span className="mt-1 block text-[13px]">{m.resolvedBy.name}</span>}
        </>
      ),
      when: fmtDateTime(inc.resolvedAt),
      state: "done",
      icon: <CheckCircle2 />,
    });
  else steps.push({ id: "pending", title: "Pendiente de resolución", detail: `Abierta ${fmtAgo(inc.createdAt)}`, state: "current", icon: <Clock /> });

  return (
    <>
      <section>
        <Eyebrow className="mb-2.5">Descripción</Eyebrow>
        <p className="text-[15px] leading-relaxed text-ink">{inc.description}</p>
      </section>

      <section>
        <Eyebrow className="mb-3">Fotos · {photos.length}</Eyebrow>
        {photos.length ? (
          <div className="grid grid-cols-3 gap-2">
            {photos.map((p, i) => (
              <PhotoThumb key={p.id} photo={p} className="rounded-[12px]" meta={false} onClick={() => onPreview(photos, i)} />
            ))}
          </div>
        ) : (
          <p className="flex items-center gap-2 rounded-[14px] border border-dashed border-[#d9dfe7] px-4 py-3 text-[13.5px] text-subtle">
            <ImageOff className="size-4" /> Sin fotos adjuntas
          </p>
        )}
      </section>

      {/* closure effect */}
      <div
        className={cn(
          "relative overflow-hidden rounded-[18px] p-4 transition-colors duration-500",
          open ? (inc.blocksClosure ? "bg-[#fdf1f1]" : "bg-[#f5f7fa]") : "bg-[#e7f7f4]",
        )}
      >
        {wipe > 0 && <SqueegeeWipe key={wipe} />}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`${inc.status}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.3, ease: EASE }}
            className="flex items-start gap-3"
          >
            <span
              className={cn(
                "inline-flex size-9 shrink-0 items-center justify-center rounded-[11px] bg-white [&_svg]:size-[18px]",
                open ? (inc.blocksClosure ? "text-st-red" : "text-subtle") : "text-st-teal",
              )}
            >
              {open ? inc.blocksClosure ? <Lock /> : <LockOpen /> : <CheckCircle2 />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[14.5px] font-semibold text-ink">
                {open ? (inc.blocksClosure ? "Impide el cierre" : "No impide el cierre") : inc.blocksClosure ? "Cierre liberado" : "Resuelta"}
              </p>
              <p className="mt-0.5 text-[13.5px] leading-relaxed text-subtle">
                {open
                  ? inc.blocksClosure
                    ? `La orden ${order.folio} queda “Con incidencia” hasta registrar la resolución.`
                    : "Se documenta en la orden y en el reporte final; no detiene la validación."
                  : `Resuelta el ${fmtDay(inc.resolvedAt ?? inc.createdAt)}. Estado actual de la orden:`}
              </p>
              <OrderStatusPill status={order.status} className="mt-2.5 bg-white" />
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      <KeyValues
        title="Detalle"
        rows={[
          {
            k: "Orden",
            v: (
              <Link href={`/ordenes/${order.folio}?tab=incidencias`} className="text-link hover:underline">
                {order.folio}
              </Link>
            ),
          },
          { k: "Cliente", v: client.shortName },
          { k: "Sitio", v: site?.name ?? "—" },
          {
            k: "Jornada",
            v: jornada ? (
              <Link href={`/jornada/${jornada.id}`} className="text-link hover:underline">
                Jornada {jornada.dayIndex} · {fmtDay(jornada.plannedStart)}
              </Link>
            ) : (
              "—"
            ),
          },
          { k: "Supervisor", v: supervisor?.name ?? "—" },
          { k: "Registró", v: m.createdBy?.name ?? "—" },
        ]}
      />

      <section>
        <Eyebrow className="mb-4">Seguimiento</Eyebrow>
        <Timeline steps={steps} />
      </section>
    </>
  );
}

function ResolutionForm({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE, delay: 0.1 }}>
      <Label htmlFor="inc-resolution" className="mb-2 block text-[12px] font-semibold uppercase tracking-[0.1em] text-subtle">
        Resolución
      </Label>
      <div className="mb-3 flex flex-wrap gap-2">
        {RESOLUTION_SUGGESTIONS.map((s) => (
          <motion.button
            key={s}
            type="button"
            whileTap={{ scale: 0.97 }}
            onClick={() => onChange(s)}
            className={cn(
              "min-h-11 rounded-[12px] border px-3 py-2 text-left text-[13px] leading-snug transition md:min-h-10",
              value === s ? "border-ink bg-ink text-white" : "border-hairline bg-white text-ink hover:bg-muted",
            )}
          >
            {s}
          </motion.button>
        ))}
      </div>
      <Textarea
        id="inc-resolution"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="¿Qué se hizo y con quién se acordó?"
        className="min-h-[104px] rounded-[14px] text-[15px]"
      />
      <p className="mt-2 text-[12.5px] text-subtle">Queda en la bitácora con tu nombre y la hora; si la orden estaba detenida, se libera.</p>
    </motion.section>
  );
}
