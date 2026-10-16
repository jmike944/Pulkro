"use client";

import { useId, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Camera, Check, CircleCheck, EyeOff, ImagePlus, LoaderCircle, Lock, Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { SCENE_AREAS } from "@/lib/seed";
import { useDemoSession } from "@/lib/hooks";
import { PermissionDeniedError } from "@/lib/store";
import type { Photo, SceneKind } from "@/lib/types";
import { ClockWarning } from "@/components/pk/clock-warning";
import { useEdgeFade } from "@/components/pk/edge-fade";
import { CAPTURE_HELP, areaSuggestions, usePhotoCapture, type CaptureMeta } from "@/components/pk/photo-capture";
import { PhotoThumb } from "@/components/pk/scene-photo";
import { SoftBadge } from "@/components/pk/status";
import { EASE, rowVariants, staggerContainer } from "@/components/pk/motion";
import { BigButton, FieldCaption, FlowHeading, FlowScreen } from "@/components/pk/mobile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Chip, FieldSectionTitle } from "./field-bits";
import { FlowEyebrow } from "./flow-bits";
import { PhotoLightbox } from "./photo-lightbox";
import type { FieldReady } from "./use-field-state";

type Kind = "antes" | "despues";

/** `hint` instructs whoever takes the photos; `viewHint` describes them to a read-only role. */
const COPY: Record<Kind, { title: string; id: string; hint: string; viewHint: string; empty: string }> = {
  antes: {
    title: "Fotos ANTES",
    id: "fotos-antes",
    hint: "Antes de iniciar los trabajos, una por área. Son obligatorias para el cierre.",
    viewHint: "Tomadas antes de iniciar los trabajos, una por área. Son obligatorias para el cierre.",
    empty: "Sin fotos ANTES todavía",
  },
  despues: {
    title: "Fotos DESPUÉS",
    id: "fotos-despues",
    hint: "Al terminar, desde el mismo ángulo que la foto ANTES. Son obligatorias para el cierre.",
    viewHint: "Tomadas al terminar, desde el mismo ángulo que la foto ANTES. Son obligatorias para el cierre.",
    empty: "Sin fotos DESPUÉS todavía",
  },
};

/** Areas to suggest: for DESPUÉS, first the ANTES areas still missing their DESPUÉS shot. */
function useAreaOptions(f: FieldReady, kind: Kind) {
  return useMemo(() => {
    const base = areaSuggestions(f.order.serviceTypeId);
    const antesAreas = f.antes.map((p) => p.area);
    const despuesAreas = new Set(f.despues.map((p) => p.area));
    const used = new Set((kind === "antes" ? f.antes : f.despues).map((p) => p.area));
    const missing = kind === "despues" ? antesAreas.filter((a) => !despuesAreas.has(a)) : [];
    const all = [...new Set([...missing, ...(kind === "despues" ? antesAreas : []), ...base, ...used])];
    return { all, missing: new Set(missing), used };
  }, [f.order.serviceTypeId, f.antes, f.despues, kind]);
}

/** Area input + suggestion chips + capture buttons. Shared by the page section and the quick-capture sheet. */
export function CaptureComposer({ f, kind, onCaptured, className }: { f: FieldReady; kind: Kind; onCaptured?: (ids: string[]) => void; className?: string }) {
  const { all, missing, used } = useAreaOptions(f, kind);
  const [area, setArea] = useState(() => [...missing][0] ?? all.find((a) => !used.has(a)) ?? all[0] ?? "");
  const inputId = useId();
  const { ref: chipRef, style: chipStyle } = useEdgeFade();

  return (
    <div className={className}>
      <label htmlFor={inputId} className="mb-2 block text-[13px] font-semibold text-ink">
        Área
      </label>
      <Input
        id={inputId}
        value={area}
        onChange={(e) => setArea(e.target.value)}
        placeholder="Ej. Baños planta baja"
        className="h-12 rounded-[14px] bg-surface text-[16px] sm:text-[15px]"
        autoComplete="off"
      />
      <div ref={chipRef} style={chipStyle} className="scrollbar-none -mx-1 mt-2.5 flex gap-2 overflow-x-auto px-1 pb-1">
        {all.slice(0, 10).map((a) => (
          <Chip key={a} active={area === a} onClick={() => setArea(a)} hint={missing.has(a) ? "falta" : undefined}>
            {a}
            {used.has(a) && <Check className={area === a ? "size-3.5 text-sky" : "size-3.5 text-teal-fg"} aria-label="ya tiene foto" />}
          </Chip>
        ))}
      </div>
      <FieldCaptureButtons f={f} kind={kind} area={area} onCaptured={onCaptured} className="mt-3.5" />
    </div>
  );
}

/** The procedural scene that matches a catalog area name ("Baños planta baja" → baño). */
function sceneForArea(area: string): SceneKind | undefined {
  return (Object.keys(SCENE_AREAS) as SceneKind[]).find((k) => SCENE_AREAS[k].includes(area));
}

/**
 * Camera / gallery / demo capture. Real shots are compressed into IndexedDB (works offline).
 * The demo shot for DESPUÉS reuses the ANTES scene of the same area, so the squeegee comparison lines up.
 */
function FieldCaptureButtons({
  f,
  kind,
  area,
  onCaptured,
  className,
}: {
  f: FieldReady;
  kind: Kind;
  area: string;
  onCaptured?: (ids: string[]) => void;
  className?: string;
}) {
  const camRef = useRef<HTMLInputElement>(null);
  const galRef = useRef<HTMLInputElement>(null);
  const { capture, simulate, busy } = usePhotoCapture();
  const demo = useDemoSession();
  const meta: CaptureMeta = {
    orderId: f.order.id,
    jornadaId: f.jornada.id,
    kind,
    area: area.trim(),
    serviceTypeId: f.order.serviceTypeId,
    ...f.photoGeo(kind),
  };

  const onFiles = async (input: HTMLInputElement) => {
    const files = input.files;
    if (files?.length) {
      const ids = await capture(files, meta, input === galRef.current ? "gallery" : "camera");
      if (ids.length) onCaptured?.(ids);
    }
    input.value = "";
  };

  const addSample = () => {
    const twin = kind === "despues" ? f.antes.find((p) => p.area === meta.area && p.source.type === "scene") : undefined;
    const opts = twin?.source.type === "scene" ? { scene: twin.source.scene, seed: twin.source.seed } : { scene: sceneForArea(meta.area) };
    try {
      const id = simulate(meta, opts);
      onCaptured?.([id]);
      toast.success(`Foto ${kind === "antes" ? "ANTES" : "DESPUÉS"} de ejemplo`, { description: meta.area || "Sin área" });
    } catch (e) {
      // The store already told the user why it refused.
      if (!(e instanceof PermissionDeniedError)) throw e;
    }
  };

  return (
    <div className={className}>
      <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => void onFiles(e.currentTarget)} />
      <input ref={galRef} type="file" accept="image/*" multiple hidden onChange={(e) => void onFiles(e.currentTarget)} />
      <div className="flex gap-2">
        <Button type="button" disabled={busy} onClick={() => camRef.current?.click()} className="h-12 flex-1 rounded-[14px] px-4 text-[15px] font-semibold">
          {busy ? <LoaderCircle className="animate-spin" /> : <Camera />} Tomar foto
        </Button>
        <Button type="button" variant="outline" disabled={busy} onClick={() => galRef.current?.click()} aria-label="Elegir de la galería" className="h-12 rounded-[14px] bg-surface px-3.5">
          <ImagePlus /> <span className="hidden min-[420px]:inline">Galería</span>
        </Button>
        {demo && (
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={addSample}
            aria-label="Agregar una foto de ejemplo (demo sin cámara)"
            title="Agregar una foto de ejemplo (demo sin cámara)"
            className="h-12 rounded-[14px] px-3.5 text-subtle"
          >
            <Wand2 /> <span className="hidden min-[420px]:inline">Simular</span>
          </Button>
        )}
      </div>
      <p className="mt-2.5 text-[12.5px] leading-snug text-subtle">{CAPTURE_HELP}</p>
    </div>
  );
}

export function PhotoSection({ f, kind }: { f: FieldReady; kind: Kind }) {
  const copy = COPY[kind];
  const photos = kind === "antes" ? f.antes : f.despues;
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [fresh, setFresh] = useState<string[]>([]);
  const has = photos.length > 0;
  const readOnly = !f.permissions.capture;

  return (
    <section id={copy.id} className="scroll-mt-24">
      <FieldSectionTitle
        title={copy.title}
        addon={
          <AnimatePresence mode="wait" initial={false}>
            <motion.span key={has ? "ok" : "req"} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={{ type: "spring", stiffness: 500, damping: 26 }}>
              {has ? (
                <SoftBadge tone="teal">
                  <CircleCheck className="size-3.5" /> {photos.length} {photos.length === 1 ? "foto" : "fotos"}
                </SoftBadge>
              ) : (
                <SoftBadge tone="amber">Obligatoria</SoftBadge>
              )}
            </motion.span>
          </AnimatePresence>
        }
        subtitle={readOnly ? copy.viewHint : copy.hint}
      />

      {!readOnly &&
        (f.photoBlock ? (
          <p className="mb-4 flex items-start gap-2.5 rounded-[16px] bg-soft px-4 py-3 text-[13.5px] text-subtle">
            <Lock className="mt-0.5 size-4 shrink-0" />
            {f.photoBlock}
          </p>
        ) : (
          <CaptureComposer
            f={f}
            kind={kind}
            onCaptured={(ids) => setFresh(ids)}
            className="mb-4 rounded-[20px] border border-hairline bg-wash p-4"
          />
        ))}

      {has ? (
        <motion.ul variants={staggerContainer(0.05, 0.05)} initial="hidden" animate="show" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {photos.map((p, i) => (
            <motion.li key={p.id} variants={rowVariants} layout>
              <PhotoThumb photo={p} pending={f.pendingIds.has(p.id)} onClick={() => setLightbox(i)} className="w-full">
                {!p.selectedForReport && (
                  <span className="absolute inset-0 flex items-center justify-center bg-surface/45 backdrop-grayscale">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-surface/95 px-2.5 py-1 text-[11px] font-semibold text-subtle shadow-sm">
                      <EyeOff className="size-3.5" /> Fuera del reporte
                    </span>
                  </span>
                )}
                {fresh.includes(p.id) && <FreshSparkle />}
              </PhotoThumb>
            </motion.li>
          ))}
        </motion.ul>
      ) : (
        <div className="flex items-center gap-4 rounded-[20px] border border-dashed border-line-strong px-5 py-6">
          <span className="relative inline-flex size-12 shrink-0 items-center justify-center rounded-[16px] bg-sky-soft text-azure-fg">
            {kind === "antes" ? <Camera className="size-5" /> : <Sparkles className="size-5" />}
            <span className="absolute -right-1 -top-1 size-3 rounded-full border border-sky/60 bg-surface animate-float" />
          </span>
          <div className="min-w-0">
            <p className="text-[15px] font-semibold text-ink">{copy.empty}</p>
            <p className="text-[13.5px] text-subtle">
              {f.locked
                ? "La orden ya no admite captura en campo."
                : readOnly
                  ? "El supervisor las captura desde su teléfono."
                  : f.photoBlock
                    ? "Se habilitan al registrar la entrada."
                    : "Elija el área y tome la foto; se guarda aunque no haya señal."}
            </p>
          </div>
        </div>
      )}

      <PhotoLightbox f={f} photos={photos} index={lightbox} onIndexChange={setLightbox} />
    </section>
  );
}

/** Tiny sparkle that plays once on a freshly captured photo. */
function FreshSparkle() {
  return (
    <motion.span
      aria-hidden
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, 1, 0] }}
      transition={{ duration: 1.4, ease: EASE }}
      className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[radial-gradient(circle,rgb(255_255_255/0.75),transparent_65%)]"
    >
      <motion.span initial={{ scale: 0.3, rotate: -40 }} animate={{ scale: 1.2, rotate: 0 }} transition={{ type: "spring", stiffness: 400, damping: 14 }} className="text-[34px] text-white drop-shadow">
        ✦
      </motion.span>
    </motion.span>
  );
}

/* ───────────── quick capture (from the hero quick actions) ───────────── */

/** Focused one-handed capture flow opened from the hero quick actions. */
export function QuickCaptureFlow({ f, kind, open, onOpenChange }: { f: FieldReady; kind: Kind; open: boolean; onOpenChange: (v: boolean) => void }) {
  const [taken, setTaken] = useState<string[]>([]);
  const all = kind === "antes" ? f.antes : f.despues;
  const shots: Photo[] = taken.map((id) => all.find((p) => p.id === id)).filter((p): p is Photo => !!p);
  const shown = shots.length ? shots : all.slice(-6).reverse();
  const label = kind === "antes" ? "ANTES" : "DESPUÉS";

  return (
    <FlowScreen
      open={open}
      onOpenChange={onOpenChange}
      title={`Foto ${label}`}
      description={`Capturar fotos ${label} de la Jornada ${f.jornada.dayIndex}`}
      footer={
        <BigButton variant={shots.length ? "primary" : "outline"} onClick={() => onOpenChange(false)}>
          {shots.length ? `Listo · ${shots.length} ${shots.length === 1 ? "foto" : "fotos"}` : "Volver a la jornada"}
        </BigButton>
      }
    >
      <FlowHeading eyebrow={<FlowEyebrow f={f} />} title={`Fotos ${label}`}>
        {COPY[kind].hint}
      </FlowHeading>
      {f.photoBlock ? (
        <p className="flex items-start gap-2.5 rounded-[16px] bg-sand px-4 py-3 text-[14px] text-subtle">
          <Lock className="mt-0.5 size-4 shrink-0" />
          {f.photoBlock}
        </p>
      ) : (
        <>
          <ClockWarning className="mb-4" />
          <CaptureComposer f={f} kind={kind} onCaptured={(ids) => setTaken((t) => [...ids, ...t])} />
        </>
      )}
      <div className="mt-7">
        <FieldCaption>{shots.length ? `Tomadas ahora · ${shots.length}` : `En esta jornada · ${all.length}`}</FieldCaption>
        {shown.length === 0 ? (
          <p className="text-[14px] text-subtle">Aún no hay fotos {label} en esta jornada.</p>
        ) : (
          <ul className="grid grid-cols-3 gap-2">
            {shown.map((p) => (
              <li key={p.id}>
                <PhotoThumb photo={p} meta={false} pending={f.pendingIds.has(p.id)} className="rounded-[12px]">
                  {taken.includes(p.id) && <FreshSparkle />}
                </PhotoThumb>
              </li>
            ))}
          </ul>
        )}
      </div>
    </FlowScreen>
  );
}
