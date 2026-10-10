"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUpRight, Camera, ImagePlus, Loader2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useMediaQuery } from "@/lib/hooks";
import { plural } from "@/lib/format";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { AnimatedNumber } from "@/components/pk/bits";
import { OrderStatusPill, TonePill } from "@/components/pk/status";
import { BeforeAfter, PhotoThumb } from "@/components/pk/scene-photo";
import { PhotoCaptureButtons, usePhotoCapture } from "@/components/pk/photo-capture";
import { ClientMark } from "@/components/pk/client-mark";
import { AuroraStat, BigButton, FlowHeading, FlowScreen, ItemCard, SuccessHero } from "@/components/pk/mobile";
import { EASE } from "@/components/pk/motion";
import { dueLabel, type EvidenceRequest } from "./evidence-data";
import { PhotoLightbox, useLightbox } from "./photo-lightbox";
import { CAPTURE_REASON, Guarded } from "./guarded";
import { useRequestModel } from "./request-model";
import { AreaChips, History, NeededBox, PersonCard, ReceivedCard, RequestFacts, RingingBell } from "./request-sections";

const NO_PHONE_REASON = "El supervisor no tiene teléfono registrado.";

/**
 * Detail of one missing-evidence request: right Sheet on tablet/desktop, full-screen flow on phones
 * (one-tap camera in the sticky footer, success screen after the upload).
 */
export function RequestSheet({
  request,
  open,
  onOpenChange,
  remaining,
}: {
  request: EvidenceRequest | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** open requests in the current list (live), for the phone success screen */
  remaining: number;
}) {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  if (!isDesktop)
    return request ? <PhoneRequest key={request.key} request={request} open={open} onOpenChange={onOpenChange} remaining={remaining} /> : null;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-[520px]">
        {request ? <DesktopRequest key={request.key} request={request} /> : <SheetTitle className="sr-only">Solicitud de evidencia</SheetTitle>}
      </SheetContent>
    </Sheet>
  );
}

/* ───────────── desktop / tablet: right sheet ───────────── */

function DesktopRequest({ request }: { request: EvidenceRequest }) {
  const { model: m, remind, afterCapture, canCapture, canClose } = useRequestModel(request);
  const captureRef = useRef<HTMLDivElement>(null);
  const [capturing, setCapturing] = useState(false);
  const [area, setArea] = useState(() => request.reference[0]?.area ?? "");
  const [wipe, setWipe] = useState(0);
  const [rings, setRings] = useState(0);
  const lb = useLightbox();
  // tablets are touch: the tap bubble is still there, but the reasons are also printed like on the phone flow
  const touch = useMediaQuery("(hover: none)");

  if (!m) return <SheetTitle className="sr-only">Solicitud no disponible</SheetTitle>;
  const { order, jornada, client, serviceType } = m;
  const captureArea = area || m.areaChoices[0] || "Área general";

  const startCapture = () => {
    setCapturing(true);
    requestAnimationFrame(() => captureRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  };

  return (
    <>
      <SheetHeader className="gap-0 border-b border-hairline p-6 pr-14">
        <div className="flex flex-wrap items-center gap-2">
          <TonePill tone={m.statusTone} live={!m.resolved && request.overdue}>
            {m.statusLabel}
          </TonePill>
          <span className="text-[12.5px] text-subtle tabular">
            {order.folio} · J{jornada.dayIndex}/{order.plannedDays}
          </span>
        </div>
        <SheetTitle className="mt-3 font-serif text-[26px] font-medium leading-tight tracking-[-0.01em] text-ink">
          Foto {m.kindLabel} para {order.folio}
        </SheetTitle>
        <SheetDescription className="mt-1 text-[14px] text-subtle">
          {serviceType.name} · {client.shortName} · Jornada {jornada.dayIndex}
        </SheetDescription>
      </SheetHeader>

      <div className="flex-1 space-y-7 overflow-y-auto p-6">
        <PersonCard m={m} />
        <RequestFacts m={m} />
        <NeededBox m={m} wipe={wipe} onPreview={lb.open} />

        <AnimatePresence initial={false} mode="popLayout">
          {m.resolved && m.latest ? (
            <ReceivedCard key="received" m={m} onPreview={lb.open} />
          ) : capturing && canCapture ? (
            <motion.section
              key="capture"
              ref={captureRef}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.35, ease: EASE }}
              className="overflow-hidden"
            >
              <div className="rounded-[18px] border border-dashed border-blue-line bg-blue-wash p-4">
                <AreaChips choices={m.areaChoices} value={captureArea} onChange={setArea} />
                <PhotoCaptureButtons
                  className="mt-4"
                  meta={{ orderId: order.id, jornadaId: jornada.id, kind: request.kind, area: captureArea, serviceTypeId: order.serviceTypeId, selectedForReport: true }}
                  onCaptured={(ids) => {
                    if (!ids.length) return;
                    setCapturing(false);
                    setWipe((n) => n + 1);
                    afterCapture(ids, { toast: true });
                  }}
                />
              </div>
            </motion.section>
          ) : null}
        </AnimatePresence>

        <History m={m} />
      </div>

      <SheetFooter className="flex-row flex-wrap items-center justify-end gap-2 border-t border-hairline p-4">
        {m.resolved ? (
          <>
            <Button asChild variant="outline" className="h-11 rounded-[12px] border-line px-4 font-semibold">
              <Link href={`/jornada/${jornada.id}`}>
                Ver jornada <ArrowUpRight />
              </Link>
            </Button>
            <Button asChild className="h-11 rounded-[12px] px-5 font-semibold">
              {m.readyToClose && canClose ? (
                <Link href={`/ordenes/${order.folio}?cerrar=1`}>Validar cierre</Link>
              ) : (
                <Link href={`/ordenes/${order.folio}`}>Ver orden</Link>
              )}
            </Button>
          </>
        ) : (
          <>
            {!m.isMine && (
              <p className="order-last w-full text-right text-[12px] text-subtle">
                {touch && !m.supervisor?.phone ? NO_PHONE_REASON : "Recordatorio manual por WhatsApp · sin alertas automáticas"}
              </p>
            )}
            {touch && !canCapture && <p className="order-last w-full text-right text-[12px] leading-snug text-subtle">{CAPTURE_REASON}</p>}
            <Guarded reason={canCapture ? null : CAPTURE_REASON}>
              <Button
                variant={m.isMine ? "default" : "outline"}
                disabled={!canCapture || capturing}
                onClick={startCapture}
                className={cn("h-11 rounded-[12px] px-4 font-semibold", !m.isMine && "border-line")}
              >
                <Camera /> {m.isMine ? `Subir foto ${m.kindLabel}` : "Subirla yo"}
              </Button>
            </Guarded>
            {!m.isMine && (
              <Guarded reason={m.supervisor?.phone ? null : NO_PHONE_REASON}>
                <Button disabled={!m.supervisor?.phone} onClick={() => remind() && setRings((n) => n + 1)} className="h-11 rounded-[12px] px-4 font-semibold">
                  <RingingBell rings={rings} />
                  Recordar a {m.supFirst}
                </Button>
              </Guarded>
            )}
          </>
        )}
      </SheetFooter>

      <PhotoLightbox photos={lb.list} index={lb.index} onIndexChange={lb.setIndex} pairPool={m.photos} />
    </>
  );
}

/* ───────────── phone: full-screen flow ───────────── */

function PhoneRequest({
  request,
  open,
  onOpenChange,
  remaining,
}: {
  request: EvidenceRequest;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  remaining: number;
}) {
  const { model: m, remind, afterCapture, canCapture, canClose } = useRequestModel(request);
  const { capture, simulate, busy } = usePhotoCapture();
  const camRef = useRef<HTMLInputElement>(null);
  const galRef = useRef<HTMLInputElement>(null);
  const [area, setArea] = useState(() => request.reference[0]?.area ?? "");
  const [rings, setRings] = useState(0);
  const lb = useLightbox();
  const close = () => onOpenChange(false);

  if (!m)
    return (
      <FlowScreen open={open} onOpenChange={onOpenChange} title="Evidencia">
        <p className="py-10 text-center text-[15px] text-subtle">Esta solicitud ya no está disponible.</p>
      </FlowScreen>
    );

  const { order, jornada, client, serviceType } = m;
  const captureArea = area || m.areaChoices[0] || "Área general";
  const meta = { orderId: order.id, jornadaId: jornada.id, kind: request.kind, area: captureArea, serviceTypeId: order.serviceTypeId, selectedForReport: true };

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const ids = await capture(files, meta);
    afterCapture(ids, { toast: false });
  };

  /* success screen */
  if (m.resolved && m.latest) {
    // `remaining` is derived live from the store, so it already excludes this request.
    const left = Math.max(0, remaining);
    return (
      <FlowScreen
        open={open}
        onOpenChange={onOpenChange}
        closeSide="right"
        description="Evidencia recibida"
        footer={
          <div className="space-y-2.5">
            {m.readyToClose && canClose ? (
              <BigButton href={`/ordenes/${order.folio}?cerrar=1`}>Validar cierre</BigButton>
            ) : (
              <BigButton href={`/ordenes/${order.folio}`}>Ver orden</BigButton>
            )}
            <div className="grid grid-cols-2 gap-2.5">
              <BigButton variant="outline" href={`/jornada/${jornada.id}`} className="h-12 px-3 text-center text-[15px] leading-tight">
                Ver jornada
              </BigButton>
              <BigButton variant="outline" onClick={close} className="h-12 px-3 text-center text-[15px] leading-tight">
                Volver a evidencias
              </BigButton>
            </div>
          </div>
        }
      >
        <SuccessHero title="Evidencia recibida">
          Foto {m.kindLabel} de {m.latest.area} para {order.folio}.{" "}
          {m.evidenceComplete ? "La orden ya tiene evidencia completa." : plural(m.blocks.length, "requisito sigue pendiente.", "requisitos siguen pendientes.")}
        </SuccessHero>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE, delay: 0.35 }} className="mt-7">
          {m.pair ? <BeforeAfter before={m.pair.before} after={m.pair.after} /> : <PhotoThumb photo={m.latest} className="rounded-[20px]" />}
        </motion.div>
        <ItemCard
          className="mt-4"
          leading={<ClientMark name={client.name} hue={client.hue} size={44} />}
          title={order.title}
          sub={`${order.folio} · ${client.shortName}`}
          status={<OrderStatusPill status={order.status} />}
        />
        <AuroraStat
          className="mt-4"
          label="Solicitudes abiertas"
          value={<AnimatedNumber value={left} />}
          sub={left ? `${plural(left, "foto sigue pendiente", "fotos siguen pendientes")} de subir.` : "Toda la evidencia está al día. ¡Impecable!"}
        />
      </FlowScreen>
    );
  }

  const footer = (
    <div className="space-y-2.5">
      {canCapture ? (
        <>
          <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => void onFiles(e.target.files).then(() => (e.target.value = ""))} />
          <input ref={galRef} type="file" accept="image/*" multiple hidden onChange={(e) => void onFiles(e.target.files).then(() => (e.target.value = ""))} />
          <BigButton onClick={() => camRef.current?.click()} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Camera />} Tomar foto {m.kindLabel}
          </BigButton>
          <div className="grid grid-cols-2 gap-2.5">
            <Button variant="outline" disabled={busy} onClick={() => galRef.current?.click()} className="h-12 rounded-[14px] border-line-strong text-[15px] font-semibold">
              <ImagePlus /> Galería
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                const id = simulate(meta);
                toast.success("Foto de ejemplo agregada");
                afterCapture([id], { toast: false });
              }}
              className="h-12 rounded-[14px] border-line-strong text-[15px] font-semibold"
            >
              <Wand2 /> Simular
            </Button>
          </div>
        </>
      ) : (
        <p className="rounded-[14px] bg-soft px-4 py-3 text-[13.5px] leading-snug text-subtle">{CAPTURE_REASON}</p>
      )}
      {!m.isMine && (
        <>
          <BigButton variant={canCapture ? "outline" : "primary"} disabled={!m.supervisor?.phone} onClick={() => remind() && setRings((n) => n + 1)}>
            <RingingBell rings={rings} /> Recordar a {m.supFirst}
          </BigButton>
          <p className="text-center text-[12px] text-subtle">
            {m.supervisor?.phone ? "Recordatorio manual por WhatsApp · sin alertas automáticas" : NO_PHONE_REASON}
          </p>
        </>
      )}
    </div>
  );

  return (
    <FlowScreen open={open} onOpenChange={onOpenChange} title="Evidencia" description="Solicitud de evidencia fotográfica" footer={footer}>
      <FlowHeading
        eyebrow={
          <>
            <ClientMark name={client.name} hue={client.hue} size={22} className="rounded-[7px]" />
            <span className="tabular">
              {order.folio} · Jornada {jornada.dayIndex}
            </span>
          </>
        }
        title={`Foto ${m.kindLabel} para ${order.folio}`}
      >
        {serviceType.name} · {client.shortName}
      </FlowHeading>
      <TonePill tone={m.statusTone} live={request.overdue}>
        {request.overdue ? dueLabel(request) : `${m.statusLabel} · ${dueLabel(request).toLowerCase()}`}
      </TonePill>

      <div className="mt-6 space-y-7">
        <PersonCard m={m} />
        <NeededBox m={m} onPreview={lb.open}>
          {canCapture && (
            <div className="mt-4 border-t border-line pt-4">
              <AreaChips choices={m.areaChoices} value={captureArea} onChange={setArea} />
            </div>
          )}
        </NeededBox>
        <RequestFacts m={m} />
        <History m={m} />
      </div>

      <PhotoLightbox photos={lb.list} index={lb.index} onIndexChange={lb.setIndex} pairPool={m.photos} />
    </FlowScreen>
  );
}
