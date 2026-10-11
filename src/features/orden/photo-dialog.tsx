"use client";

import { useAppStore } from "@/lib/store";
import { fmtCoords, fmtDateTime } from "@/lib/format";
import { PHOTO_KIND } from "@/lib/status";
import { PhotoImage } from "@/components/pk/scene-photo";
import { photoProvenanceRows } from "@/components/pk/photo-flags";
import { SoftBadge } from "@/components/pk/status";
import { Switch } from "@/components/ui/switch";
import { useOrder } from "./order-context";
import { Gated, OrderDialog, SummaryRows } from "./ui";

/** Photo detail with its capture metadata (doc §4.2: coordinates, device time, user). */
export function PhotoDialog({ photoId, onOpenChange }: { photoId: string | null; onOpenChange: (v: boolean) => void }) {
  const { d } = useOrder();
  const toggle = useAppStore((s) => s.togglePhotoForReport);
  const photo = photoId ? d.photos.find((p) => p.id === photoId) : undefined;
  const j = photo?.jornadaId ? d.jornadas.find((x) => x.id === photo.jornadaId) : undefined;
  const inc = photo?.incidentId ? d.incidents.find((x) => x.id === photo.incidentId) : undefined;
  const kind = photo ? PHOTO_KIND[photo.kind] : undefined;

  return (
    <OrderDialog
      open={!!photo}
      onOpenChange={onOpenChange}
      size="lg"
      eyebrow={kind ? `Foto ${kind.label.toUpperCase()}${j ? ` · Jornada ${j.dayIndex}` : ""}` : undefined}
      title={photo?.area ?? "Foto"}
    >
      {photo && (
        <div className="space-y-4">
          <div className="relative aspect-[4/3] overflow-hidden rounded-[20px] bg-well ring-1 ring-edge">
            <PhotoImage photo={photo} />
            {d.pendingIds.has(photo.id) && (
              <SoftBadge tone="amber" className="absolute right-3 top-3">
                Pendiente de sincronizar
              </SoftBadge>
            )}
          </div>
          <SummaryRows
            rows={[
              { k: "Tomada", v: fmtDateTime(photo.takenAt) },
              { k: "Capturó", v: d.lk.users.get(photo.by)?.name ?? "Usuario" },
              { k: "Ubicación", v: photo.lat != null && photo.lng != null ? fmtCoords(photo.lat, photo.lng) : "Sin coordenadas" },
              // Evidence provenance (real captures only): camera or gallery, where the time and the position come from.
              ...photoProvenanceRows(photo),
              ...(inc ? [{ k: "Incidencia", v: inc.folio }] : []),
              { k: "Sincronización", v: d.pendingIds.has(photo.id) ? "Pendiente" : "Sincronizada", tone: d.pendingIds.has(photo.id) ? ("warn" as const) : ("ok" as const) },
            ]}
          />
          {photo.note && <p className="rounded-[14px] bg-soft px-4 py-3 text-[14px] text-ink">{photo.note}</p>}
          {photo.kind !== "postventa" && (
            <Gated gate={d.gates.photos} className="flex w-full">
              <label className="flex min-h-12 w-full cursor-pointer items-center justify-between gap-3 rounded-[16px] border border-hairline px-4 py-3">
                <span className="text-[14px]">
                  <span className="block font-semibold text-ink">Incluir en el reporte</span>
                  <span className="text-[12.5px] text-subtle">Las fotos seleccionadas aparecen en el PDF del cliente.</span>
                </span>
                <Switch checked={photo.selectedForReport} disabled={!d.gates.photos.ok} onCheckedChange={() => toggle(photo.id)} aria-label="Incluir en el reporte" />
              </label>
            </Gated>
          )}
        </div>
      )}
    </OrderDialog>
  );
}
