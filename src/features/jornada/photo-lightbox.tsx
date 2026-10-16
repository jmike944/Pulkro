"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAppStore } from "@/lib/hooks";
import { PHOTO_KIND } from "@/lib/status";
import type { Photo } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { LightboxReportToggle, PhotoLightbox as SharedLightbox } from "@/features/evidencias/photo-lightbox";
import { Gate } from "./field-bits";
import type { FieldReady } from "./use-field-state";

/**
 * Photo viewer of a jornada: the app's one lightbox (prev/next, swipe, metadata, ANTES/DESPUÉS compare) plus what only
 * the field screen does: "Incluir en el reporte" and "Eliminar foto" (with confirmation), each behind its permission.
 */
export function PhotoLightbox({
  f,
  photos,
  index,
  onIndexChange,
}: {
  f: FieldReady;
  photos: Photo[];
  index: number | null;
  onIndexChange: (i: number | null) => void;
}) {
  const canDelete = !f.locked;
  const deleteReason = f.locked;

  return (
    <SharedLightbox
      photos={photos}
      index={index}
      onIndexChange={onIndexChange}
      // the ANTES of one list pairs with the DESPUÉS of the other, so look the pair up in the whole order
      pairPool={f.photos}
      scope="jornada"
      actions={(photo, { index: i, total }) => (
        <>
          {/* Read-only roles get neither control disabled: the "En reporte" badge already shows the selection, and the
              header's Modo consulta note says the report photos and the evidence are the supervisor's. */}
          {f.permissions.select && <LightboxReportToggle photo={photo} />}
          {f.permissions.capture && (
            <DeletePhoto
              photo={photo}
              canDelete={canDelete}
              reason={deleteReason}
              onDelete={() => {
                // keep the viewer on a photo that still exists: close when it was the last one, step back from the end of the list
                if (total <= 1) onIndexChange(null);
                else if (i === total - 1) onIndexChange(i - 1);
              }}
            />
          )}
        </>
      )}
    />
  );
}

/** "Eliminar foto" → inline confirmation (keeps the photo in view) → delete, with the toast and the audit trail of the store action. */
function DeletePhoto({ photo, canDelete, reason, onDelete }: { photo: Photo; canDelete: boolean; reason?: string | null; onDelete: () => void }) {
  const deletePhoto = useAppStore((s) => s.deletePhoto);
  const [confirming, setConfirming] = useState(false);
  const kind = PHOTO_KIND[photo.kind];

  const remove = () => {
    onDelete();
    deletePhoto(photo.id); // the store also deletes the image blob
    toast.success("Foto eliminada", { description: `${kind.label.toUpperCase()} · ${photo.area}` });
  };

  return (
    <div className="mt-4">
      <AnimatePresence mode="wait" initial={false}>
        {confirming ? (
          <motion.div
            key="confirm"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="space-y-3 rounded-[16px] bg-red-soft p-4"
          >
            <p role="alert" className="text-[13.5px] leading-snug text-ink">
              <b className="font-semibold">¿Eliminar la foto de {photo.area}?</b> Se quita de la orden y del reporte. Queda registrado en la bitácora de auditoría.
            </p>
            <div className="flex gap-2">
              <Button autoFocus variant="outline" onClick={() => setConfirming(false)} className="h-11 flex-1 rounded-[12px] bg-surface px-4 font-semibold">
                Conservar
              </Button>
              <Button onClick={remove} className="h-11 flex-1 rounded-[12px] bg-st-red px-4 font-semibold text-white hover:bg-st-red/90">
                Eliminar foto
              </Button>
            </div>
          </motion.div>
        ) : (
          <motion.div key="actions" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Gate reason={reason}>
              <Button
                variant="ghost"
                disabled={!canDelete}
                onClick={() => setConfirming(true)}
                className="h-11 rounded-[12px] px-3.5 text-red-fg hover:bg-red-soft hover:text-red-fg"
              >
                <Trash2 /> Eliminar foto
              </Button>
            </Gate>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
