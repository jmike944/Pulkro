"use client";

import { useRef, useState } from "react";
import { Camera, ImagePlus, Loader2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { PermissionDeniedError, useAppStore } from "@/lib/store";
import { DEMO_ENABLED } from "@/lib/demo";
import { photoTimingIssues } from "@/lib/domain";
import { fmtDateTime } from "@/lib/format";
import { currentPosition } from "@/lib/geo";
import { deletePhotoFile, describeCapture, savePhotoFile, type CaptureInput } from "@/lib/photo-store";
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
  /**
   * Fixed position for DEMO scene photos only (`simulate`). Real captures never use it: they carry the photo's own EXIF
   * position, else the device's current position (when available), else no coordinates at all.
   */
  lat?: number;
  lng?: number;
  selectedForReport?: boolean;
};

/** One-line help shown next to capture buttons: exactly what a real capture stores (see `usePhotoCapture`). */
export const CAPTURE_HELP =
  "Cada foto guarda la hora real de la toma, si es de cámara o de galería y su ubicación: la de la foto si la trae o, si no, la del teléfono al adjuntarla.";

/**
 * Photo capture helpers. Real captures are compressed and stored in IndexedDB; `simulate` adds a
 * procedural scene photo (demo only, handy on desktop without a camera). Returns the created photo ids.
 *
 * What a real capture stores on top of the picture (doc §4.2 evidence integrity):
 *  - takenAt: the shot time (EXIF DateTimeOriginal) → the file's date for gallery picks → the moment it was attached (camera);
 *  - origin: camera vs gallery (a camera-input file minutes older than now is flagged as gallery);
 *  - position: the photo's own EXIF GPS, else a fresh read of the device GPS (≤ 3 s, never blocks the capture), else none.
 *    The device position is where the phone was when the photo was ATTACHED; for a gallery pick that can differ from the shot.
 */
export function usePhotoCapture() {
  const addPhoto = useAppStore((s) => s.addPhoto);
  const [busy, setBusy] = useState(false);

  /**
   * `input` is the file input the pictures came through. Callers that cannot tell pass nothing: a fresh file counts as a
   * camera shot and anything older than a few minutes as a gallery pick.
   */
  async function capture(files: FileList | File[], meta: CaptureMeta, input: CaptureInput = "camera") {
    setBusy(true);
    const ids: string[] = [];
    const warnings: string[] = [];
    let galleryNote: string | undefined;
    try {
      // One non-blocking position read per batch: a fix from the last two minutes is reused, no answer in 3 s = no coordinates.
      const position = currentPosition(3000, 120_000);
      for (const file of Array.from(files)) {
        const { key, width, height, bytes, exif } = await savePhotoFile(file);
        const when = describeCapture(file, input, exif);
        const geo =
          exif.lat !== undefined && exif.lng !== undefined
            ? { lat: exif.lat, lng: exif.lng, geoSource: "exif" as const }
            : await position.then((p) => (p ? { lat: p.lat, lng: p.lng, accuracy: p.accuracy, geoSource: "device" as const } : {}));
        let id: string;
        try {
          id = addPhoto({
            orderId: meta.orderId, jornadaId: meta.jornadaId, incidentId: meta.incidentId, caseId: meta.caseId,
            kind: meta.kind, area: meta.area || "Sin área",
            takenAt: when.takenAt, takenAtSource: when.takenAtSource, origin: when.origin, ...geo,
            source: { type: "idb", key, width, height }, selectedForReport: meta.selectedForReport ?? true, bytes,
          });
        } catch (e) {
          void deletePhotoFile(key); // never leave an orphan blob behind
          throw e;
        }
        ids.push(id);
        const st = useAppStore.getState();
        const photo = st.photos.find((p) => p.id === id);
        if (photo) {
          const jornada = meta.jornadaId ? st.jornadas.find((j) => j.id === meta.jornadaId) : undefined;
          photoTimingIssues(photo, jornada).forEach((x) => warnings.push(x.label));
          if (photo.origin === "gallery") {
            const when = photo.takenAtSource === "device" ? "sin fecha de la toma" : `tomada ${fmtDateTime(photo.takenAt)}`;
            // A gallery pick without GPS gets the phone's position at attach time: say so, it may not be where the picture was taken.
            galleryNote = `Desde la galería · ${when}${photo.geoSource === "device" ? " · ubicación del teléfono, no de la toma" : ""}`;
          }
        }
      }
      if (ids.length)
        toast.success(ids.length === 1 ? "Foto guardada en el dispositivo" : `${ids.length} fotos guardadas en el dispositivo`, { description: galleryNote });
      if (warnings.length)
        toast.warning([...new Set(warnings)].join(" · "), { description: "Se guardó, pero queda marcada para revisión en la bitácora." });
    } catch (e) {
      // The store already told the user why when it refused (PermissionDeniedError).
      if (!(e instanceof PermissionDeniedError)) toast.error(e instanceof Error ? e.message : "No se pudo guardar la foto. Intente de nuevo.");
    } finally {
      setBusy(false);
    }
    return ids;
  }

  /** DEMO photo (procedural scene). Throws PermissionDeniedError like addPhoto when the role may not capture. */
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
 * Capture control: "Tomar foto" (opens rear camera on phones), "Galería", and "Simular" for demos (hidden when the
 * build has NEXT_PUBLIC_DEMO=0: a pilot never mixes made-up pictures into real evidence).
 */
export function PhotoCaptureButtons({
  meta,
  onCaptured,
  className,
  compact,
  disabled,
  help = !compact,
}: {
  meta: CaptureMeta;
  onCaptured?: (ids: string[]) => void;
  className?: string;
  compact?: boolean;
  disabled?: boolean;
  /** Show `CAPTURE_HELP` under the buttons (default: yes, except in the compact variant). */
  help?: boolean;
}) {
  const camRef = useRef<HTMLInputElement>(null);
  const galRef = useRef<HTMLInputElement>(null);
  const { capture, simulate, busy } = usePhotoCapture();
  const onFiles = async (files: FileList | null, input: CaptureInput) => {
    if (!files?.length) return;
    const ids = await capture(files, meta, input);
    if (ids.length) onCaptured?.(ids);
  };
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => void onFiles(e.target.files, "camera").then(() => (e.target.value = ""))} />
      <input ref={galRef} type="file" accept="image/*" multiple hidden onChange={(e) => void onFiles(e.target.files, "gallery").then(() => (e.target.value = ""))} />
      <Button type="button" disabled={disabled || busy} onClick={() => camRef.current?.click()} className="h-10 rounded-[12px] px-4 font-semibold">
        {busy ? <Loader2 className="animate-spin" /> : <Camera />} {compact ? "Foto" : "Tomar foto"}
      </Button>
      <Button type="button" variant="outline" disabled={disabled || busy} onClick={() => galRef.current?.click()} className="h-10 rounded-[12px] px-3.5">
        <ImagePlus /> {!compact && "Galería"}
      </Button>
      {DEMO_ENABLED && (
        <Button
          type="button"
          variant="ghost"
          disabled={disabled || busy}
          onClick={() => {
            try {
              const id = simulate(meta);
              onCaptured?.([id]);
              toast.success("Foto de ejemplo agregada");
            } catch (e) {
              if (!(e instanceof PermissionDeniedError)) throw e;
            }
          }}
          className="h-10 rounded-[12px] px-3 text-subtle"
          title="Agregar una foto de ejemplo (demo sin cámara)"
        >
          <Wand2 /> {!compact && "Simular"}
        </Button>
      )}
      {help && <p className="basis-full text-[12.5px] leading-snug text-subtle">{CAPTURE_HELP}</p>}
    </div>
  );
}

export { PhotoFlags } from "./photo-flags";

export type { Photo };
