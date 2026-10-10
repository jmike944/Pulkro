"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronLeft, ChevronRight, CloudCheck, CloudOff, MapPin, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAppStore, useLookups } from "@/lib/hooks";
import { deletePhotoFile } from "@/lib/photo-store";
import { fmtCoords, fmtDateTime } from "@/lib/format";
import { PHOTO_KIND, toneDot } from "@/lib/status";
import type { Photo } from "@/lib/types";
import { PhotoImage } from "@/components/pk/scene-photo";
import { KeyValues } from "@/components/pk/bits";
import { EASE } from "@/components/pk/motion";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Gate } from "./field-bits";
import type { FieldReady } from "./use-field-state";

/** Full-size photo with swipe/arrow navigation, "Incluir en reporte" toggle and delete (with confirmation). */
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
  const open = index !== null && photos.length > 0;
  const i = index === null ? 0 : Math.min(index, photos.length - 1);
  const photo = photos[i];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onIndexChange(null)}>
      <DialogContent
        showCloseButton={false}
        className="max-h-[94dvh] max-w-[calc(100%-1.25rem)] gap-0 overflow-y-auto rounded-[26px] p-0 sm:max-w-[760px]"
        onKeyDown={(e) => {
          if (e.key === "ArrowRight" && i < photos.length - 1) onIndexChange(i + 1);
          if (e.key === "ArrowLeft" && i > 0) onIndexChange(i - 1);
        }}
      >
        {photo && <LightboxBody key={photo.id} f={f} photo={photo} i={i} count={photos.length} onIndexChange={onIndexChange} />}
      </DialogContent>
    </Dialog>
  );
}

function LightboxBody({
  f,
  photo,
  i,
  count,
  onIndexChange,
}: {
  f: FieldReady;
  photo: Photo;
  i: number;
  count: number;
  onIndexChange: (i: number | null) => void;
}) {
  const toggle = useAppStore((s) => s.togglePhotoForReport);
  const deletePhoto = useAppStore((s) => s.deletePhoto);
  const { users } = useLookups();
  const [confirming, setConfirming] = useState(false);
  const kind = PHOTO_KIND[photo.kind];
  const pending = f.pendingIds.has(photo.id);
  const canDelete = f.permissions.capture && !f.locked;
  const deleteReason = !f.permissions.capture ? `Solo el supervisor elimina evidencia · ${f.roleLabel} tiene acceso de consulta.` : f.locked;
  const selectReason = f.permissions.select ? null : `Solo el supervisor selecciona las fotos del reporte · ${f.roleLabel} tiene acceso de consulta.`;

  const go = (next: number) => {
    if (next >= 0 && next < count) onIndexChange(next);
  };

  const remove = () => {
    if (count <= 1) onIndexChange(null);
    else if (i === count - 1) onIndexChange(i - 1);
    deletePhoto(photo.id);
    if (photo.source.type === "idb") void deletePhotoFile(photo.source.key);
    toast.success("Foto eliminada", { description: `${kind.label.toUpperCase()} · ${photo.area}` });
  };

  return (
    <>
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-[#0b1422]">
        <motion.div
          className="absolute inset-0 touch-pan-y"
          initial={{ opacity: 0, scale: 1.02 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.35, ease: EASE }}
          drag={count > 1 ? "x" : false}
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.25}
          onDragEnd={(_, info) => {
            if (info.offset.x < -70) go(i + 1);
            if (info.offset.x > 70) go(i - 1);
          }}
        >
          <PhotoImage photo={photo} className="pointer-events-none" />
        </motion.div>

        <span className="absolute left-3.5 top-3.5 inline-flex items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-bold tracking-[0.08em] text-ink backdrop-blur">
          <span className={cn("size-1.5 rounded-full", toneDot[kind.tone])} />
          {kind.label.toUpperCase()}
        </span>
        <DialogClose aria-label="Cerrar" className="absolute right-3 top-3 inline-flex size-10 items-center justify-center rounded-full bg-white/90 text-ink backdrop-blur transition hover:bg-white">
          <X className="size-[18px]" />
        </DialogClose>

        {count > 1 && (
          <>
            <NavButton side="left" disabled={i === 0} onClick={() => go(i - 1)} />
            <NavButton side="right" disabled={i === count - 1} onClick={() => go(i + 1)} />
            <span className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/45 px-2.5 py-1 text-[12px] font-semibold text-white backdrop-blur tabular">
              {i + 1} / {count}
            </span>
          </>
        )}
      </div>

      <div className="space-y-5 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <DialogTitle className="truncate text-[19px] font-semibold text-ink">{photo.area}</DialogTitle>
            <DialogDescription className="mt-1 text-[13.5px] text-subtle">
              Jornada {f.jornada.dayIndex} · {f.order.folio}
            </DialogDescription>
          </div>
          <span
            className={cn(
              "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-semibold",
              pending ? "bg-[#fff6e6] text-[#b86e00]" : "bg-[#e7f7f4] text-st-teal",
            )}
          >
            {pending ? <CloudOff className="size-3.5" /> : <CloudCheck className="size-3.5" />}
            {pending ? "Pendiente de sincronizar" : "Sincronizada"}
          </span>
        </div>

        <KeyValues
          rows={[
            { k: "Tomada", v: <span className="tabular">{fmtDateTime(photo.takenAt)}</span> },
            { k: "Capturó", v: users.get(photo.by)?.name ?? "—" },
            {
              k: "Ubicación",
              v:
                photo.lat !== undefined && photo.lng !== undefined ? (
                  <span className="inline-flex items-center gap-1 tabular">
                    <MapPin className="size-3.5 text-subtle" /> {fmtCoords(photo.lat, photo.lng)}
                  </span>
                ) : (
                  "Sin coordenadas"
                ),
            },
          ]}
        />

        <Gate reason={selectReason} className="w-full">
          <label className={cn("flex min-h-12 w-full items-center justify-between gap-4 rounded-[16px] bg-[#f6f8fb] px-4 py-3", selectReason ? "opacity-60" : "cursor-pointer")}>
            <span className="min-w-0">
              <span className="block text-[14px] font-semibold text-ink">Incluir en reporte</span>
              <span className="block text-[12.5px] text-subtle">Se preselecciona para el PDF que recibe el cliente.</span>
            </span>
            <Switch checked={photo.selectedForReport} disabled={!!selectReason} onCheckedChange={() => toggle(photo.id)} aria-label="Incluir en reporte" />
          </label>
        </Gate>

        <AnimatePresence mode="wait" initial={false}>
          {confirming ? (
            <motion.div
              key="confirm"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="flex flex-col gap-3 rounded-[16px] bg-[#fdeeee] p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <p className="text-[13.5px] text-ink">
                <b className="font-semibold">¿Eliminar esta foto?</b> Queda registrado en la bitácora de auditoría.
              </p>
              <div className="flex shrink-0 gap-2">
                <Button variant="outline" onClick={() => setConfirming(false)} className="h-10 flex-1 rounded-[12px] bg-white px-4">
                  Cancelar
                </Button>
                <Button onClick={remove} className="h-10 flex-1 rounded-[12px] bg-st-red px-4 font-semibold text-white hover:bg-st-red/90">
                  Eliminar
                </Button>
              </div>
            </motion.div>
          ) : (
            <motion.div key="actions" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex justify-between gap-3">
              <Gate reason={deleteReason}>
                <Button variant="ghost" disabled={!canDelete} onClick={() => setConfirming(true)} className="h-10 rounded-[12px] px-3.5 text-st-red hover:bg-[#fdeeee] hover:text-st-red">
                  <Trash2 /> Eliminar foto
                </Button>
              </Gate>
              <DialogClose asChild>
                <Button variant="outline" className="h-10 rounded-[12px] px-5">
                  Cerrar
                </Button>
              </DialogClose>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}

function NavButton({ side, disabled, onClick }: { side: "left" | "right"; disabled: boolean; onClick: () => void }) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={side === "left" ? "Foto anterior" : "Foto siguiente"}
      className={cn(
        "absolute top-1/2 inline-flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-ink shadow-lift backdrop-blur transition hover:bg-white disabled:opacity-0",
        side === "left" ? "left-3" : "right-3",
      )}
    >
      <Icon className="size-5" />
    </button>
  );
}
