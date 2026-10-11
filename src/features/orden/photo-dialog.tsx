"use client";

import { useMemo, useState } from "react";
import type { Jornada, Photo, PhotoKind } from "@/lib/types";
import { LightboxReportToggle, PhotoLightbox } from "@/features/evidencias/photo-lightbox";
import { useOrder } from "./order-context";

const KIND_ORDER: Record<PhotoKind, number> = { antes: 0, despues: 1, incidencia: 2, postventa: 3 };

/**
 * Order of the evidence tab: jornada by jornada (ANTES, then DESPUÉS), then all incident photos and finally post-sale
 * photos, each by capture time. An incident photo that is linked to a jornada still goes after ALL the jornada evidence.
 */
function inOrderOfEvidence(photos: Photo[], jornadas: Jornada[]): Photo[] {
  const day = new Map(jornadas.map((j) => [j.id, j.dayIndex] as const));
  const perJornada = (p: Photo) => p.kind === "antes" || p.kind === "despues";
  const dayOf = (p: Photo) => {
    if (!perJornada(p)) return 0; // incident / post-sale photos are not grouped by jornada
    return p.jornadaId ? (day.get(p.jornadaId) ?? Number.MAX_SAFE_INTEGER - 1) : Number.MAX_SAFE_INTEGER;
  };
  return [...photos].sort(
    (a, b) =>
      Number(!perJornada(a)) - Number(!perJornada(b)) ||
      dayOf(a) - dayOf(b) ||
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
      a.takenAt.localeCompare(b.takenAt),
  );
}

/**
 * Photo detail of an order: the app's one lightbox (prev/next through the order's photos, capture metadata with
 * coordinates, device time and user — doc §4.2) plus "Incluir en el reporte" behind the order's photo gate.
 * The page only tells us which photo was tapped, so prev/next move a local cursor that restarts when it changes.
 */
export function PhotoDialog({ photoId, onOpenChange }: { photoId: string | null; onOpenChange: (v: boolean) => void }) {
  const { d } = useOrder();
  const photos = useMemo(() => inOrderOfEvidence(d.photos, d.jornadas), [d.photos, d.jornadas]);
  const [cursor, setCursor] = useState<{ from: string | null; id: string | null }>({ from: photoId, id: photoId });
  if (cursor.from !== photoId) setCursor({ from: photoId, id: photoId });

  const current = cursor.from === photoId ? cursor.id : photoId;
  const found = current ? photos.findIndex((p) => p.id === current) : -1;
  const gate = d.gates.photos;

  return (
    <PhotoLightbox
      photos={photos}
      index={found >= 0 ? found : null}
      onIndexChange={(i) => {
        if (i === null) onOpenChange(false);
        else setCursor({ from: photoId, id: photos[i]?.id ?? null });
      }}
      pairPool={d.photos}
      scope="orden"
      // post-sale photos are not report material
      actions={(photo) => (photo.kind === "postventa" ? null : <LightboxReportToggle photo={photo} blockedReason={gate.ok ? null : (gate.reason ?? "No puede cambiar esto ahora.")} />)}
    />
  );
}
