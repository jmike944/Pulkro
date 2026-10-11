"use client";

import { Images, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/lib/store";
import { photoTimingIssues } from "@/lib/domain";
import type { Jornada, Photo } from "@/lib/types";

/** "Cámara de la app" / "Galería del dispositivo"; undefined for seed and demo photos. */
export function photoOriginLabel(photo: Pick<Photo, "origin">): string | undefined {
  if (!photo.origin) return undefined;
  return photo.origin === "gallery" ? "Galería del dispositivo" : "Cámara de la app";
}

/**
 * What the position stored with a photo really is (see `usePhotoCapture`): its own EXIF GPS, or the phone's when it was attached.
 * For a camera shot the phone was where the picture was taken; for a gallery pick it can be anywhere, so it says so.
 */
export function photoGeoLabel(photo: Pick<Photo, "geoSource" | "lat" | "lng" | "origin">): string | undefined {
  if (photo.lat === undefined || photo.lng === undefined) return undefined;
  if (photo.geoSource === "exif") return "GPS guardado en la foto";
  if (photo.geoSource === "device")
    return photo.origin === "gallery" ? "Ubicación del teléfono al adjuntar: puede no ser la de la toma" : "Ubicación del teléfono al tomar la foto";
  return undefined;
}

/** Where the capture time comes from, in words (real captures only; seed and demo photos have no source). */
export function photoTimeLabel(photo: Pick<Photo, "takenAtSource">): string | undefined {
  if (photo.takenAtSource === "exif") return "Hora de la toma guardada en la foto";
  if (photo.takenAtSource === "file") return "Fecha del archivo: la foto no trae la hora de la toma";
  if (photo.takenAtSource === "device") return "Hora en que se adjuntó: la foto no trae la hora de la toma";
  return undefined;
}

/**
 * Provenance rows for a photo detail (lightbox, dialog): camera vs gallery, where the time comes from and what the position is.
 * Empty for seed/demo photos, which carry none of these fields. Detail views that already print the time and the GPS can
 * compose `photoOriginLabel` / `photoTimeLabel` / `photoGeoLabel` inline instead.
 */
export function photoProvenanceRows(photo: Photo): { k: string; v: string }[] {
  const rows: { k: string; v: string }[] = [];
  const origin = photoOriginLabel(photo);
  if (origin) rows.push({ k: "Origen", v: origin });
  const time = photoTimeLabel(photo);
  if (time) rows.push({ k: "Fuente de la hora", v: time });
  const geo = photoGeoLabel(photo);
  if (geo) rows.push({ k: "Fuente de la ubicación", v: geo });
  return rows;
}

/** The jornada to check a photo against: the one passed in, else the photo's own jornada from the store (same object, never a new one). */
function useJornadaOf(photo: Photo, given?: Pick<Jornada, "checkIn" | "checkOut">) {
  const stored = useAppStore((s) => (given || !photo.jornadaId ? undefined : s.jornadas.find((j) => j.id === photo.jornadaId)));
  return given ?? stored;
}

/**
 * Evidence flags drawn over a thumbnail (put it inside `PhotoThumb`, which already does): "Galería" when the picture was picked
 * from the device instead of taken in the app, and "Revisar hora" when its real capture time falls outside the jornada (an ANTES
 * taken after the check-out, a DESPUÉS taken before the check-in). `compact` = icons only, for the small 3-column strips without a
 * kind badge. The jornada is looked up from the photo when not given.
 */
export function PhotoFlags({
  photo,
  jornada,
  compact,
  className,
}: {
  photo: Photo;
  jornada?: Pick<Jornada, "checkIn" | "checkOut">;
  compact?: boolean;
  className?: string;
}) {
  const j = useJornadaOf(photo, jornada);
  const gallery = photo.origin === "gallery";
  const issues = photoTimingIssues(photo, j);
  if (!gallery && issues.length === 0) return null;
  const chip = "inline-flex h-[22px] items-center gap-1 rounded-full px-2 text-[10.5px] font-semibold shadow-sm";
  const galleryTitle = [
    "Elegida de la galería: la hora es la de la toma, no la de la captura en la app.",
    photo.geoSource === "device" ? "Su ubicación es la del teléfono al adjuntar, no la de la toma." : undefined,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <span className={cn("pointer-events-none absolute left-2.5 flex flex-col items-start gap-1", compact ? "top-1.5" : "top-[34px]", className)}>
      {gallery && (
        <span className={cn(chip, "bg-surface/95 text-ink ring-1 ring-edge", compact && "px-1.5")} title={galleryTitle}>
          <Images className="size-3" aria-hidden />
          {compact ? <span className="sr-only">Galería</span> : "Galería"}
        </span>
      )}
      {issues.length > 0 && (
        <span className={cn(chip, "bg-amber-soft text-amber-fg ring-1 ring-amber-line", compact && "px-1.5")} title={issues.map((x) => x.label).join(" · ")}>
          <TriangleAlert className="size-3" aria-hidden />
          {compact ? <span className="sr-only">{issues[0].label}</span> : "Revisar hora"}
        </span>
      )}
    </span>
  );
}
