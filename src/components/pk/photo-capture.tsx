"use client";

import { useRef, useState } from "react";
import { Camera, ImagePlus, Loader2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/lib/store";
import { savePhotoFile } from "@/lib/photo-store";
import { SCENE_AREAS, SCENES_BY_SERVICE } from "@/lib/seed";
import type { Photo, PhotoKind, SceneKind } from "@/lib/types";
import { Button } from "@/components/ui/button";


export function areaSuggestions(serviceTypeId: string) {
  return (SCENES_BY_SERVICE[serviceTypeId] ?? ["oficina"]).flatMap((s) => SCENE_AREAS[s]);
}

export type CaptureMeta = {
  orderId: string;
  kind: PhotoKind;
  area: string;
  jornadaId?: string;
  incidentId?: string;
  caseId?: string;
  serviceTypeId?: string;
  lat?: number;
  lng?: number;
  selectedForReport?: boolean;
};

/**
 * Photo capture helpers. Real captures are compressed and stored in IndexedDB; `simulate` adds a
 * procedural scene photo (handy on desktop demos without a camera).
 * Returns the created photo ids.
 */
export function usePhotoCapture() {
  const addPhoto = useAppStore((s) => s.addPhoto);
  const [busy, setBusy] = useState(false);

  async function capture(files: FileList | File[], meta: CaptureMeta) {
    setBusy(true);
    const ids: string[] = [];
    try {
      for (const file of Array.from(files)) {
        const { key, width, height, bytes } = await savePhotoFile(file);
        ids.push(
          addPhoto({
            orderId: meta.orderId, jornadaId: meta.jornadaId, incidentId: meta.incidentId, caseId: meta.caseId,
            kind: meta.kind, area: meta.area || "Sin área", lat: meta.lat, lng: meta.lng,
            source: { type: "idb", key, width, height }, selectedForReport: meta.selectedForReport ?? true, bytes,
          }),
        );
      }
      if (ids.length) toast.success(ids.length === 1 ? "Foto guardada en el dispositivo" : `${ids.length} fotos guardadas en el dispositivo`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar la foto");
    } finally {
      setBusy(false);
    }
    return ids;
  }

  function simulate(meta: CaptureMeta, opts: { scene?: SceneKind; seed?: number } = {}) {
    const scenes = SCENES_BY_SERVICE[meta.serviceTypeId ?? ""] ?? ["oficina"];
    const scene = opts.scene ?? scenes[Math.floor(Math.random() * scenes.length)];
    const id = addPhoto({
      orderId: meta.orderId, jornadaId: meta.jornadaId, incidentId: meta.incidentId, caseId: meta.caseId,
      kind: meta.kind, area: meta.area || SCENE_AREAS[scene][0], lat: meta.lat, lng: meta.lng,
      source: { type: "scene", scene, seed: opts.seed ?? Math.floor(Math.random() * 997) },
      selectedForReport: meta.selectedForReport ?? true,
    });
    return id;
  }

  return { capture, simulate, busy };
}

/**
 * Capture control: "Tomar foto" (opens rear camera on phones), "Galería", and "Simular" for demos.
 */
export function PhotoCaptureButtons({
  meta,
  onCaptured,
  className,
  compact,
  disabled,
}: {
  meta: CaptureMeta;
  onCaptured?: (ids: string[]) => void;
  className?: string;
  compact?: boolean;
  disabled?: boolean;
}) {
  const camRef = useRef<HTMLInputElement>(null);
  const galRef = useRef<HTMLInputElement>(null);
  const { capture, simulate, busy } = usePhotoCapture();
  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const ids = await capture(files, meta);
    onCaptured?.(ids);
  };
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => void onFiles(e.target.files).then(() => (e.target.value = ""))} />
      <input ref={galRef} type="file" accept="image/*" multiple hidden onChange={(e) => void onFiles(e.target.files).then(() => (e.target.value = ""))} />
      <Button type="button" disabled={disabled || busy} onClick={() => camRef.current?.click()} className="h-10 rounded-[12px] px-4 font-semibold">
        {busy ? <Loader2 className="animate-spin" /> : <Camera />} {compact ? "Foto" : "Tomar foto"}
      </Button>
      <Button type="button" variant="outline" disabled={disabled || busy} onClick={() => galRef.current?.click()} className="h-10 rounded-[12px] px-3.5">
        <ImagePlus /> {!compact && "Galería"}
      </Button>
      <Button
        type="button"
        variant="ghost"
        disabled={disabled || busy}
        onClick={() => {
          const id = simulate(meta);
          onCaptured?.([id]);
          toast.success("Foto de ejemplo agregada");
        }}
        className="h-10 rounded-[12px] px-3 text-subtle"
        title="Agregar una foto de ejemplo (demo sin cámara)"
      >
        <Wand2 /> {!compact && "Simular"}
      </Button>
    </div>
  );
}

export type { Photo };
