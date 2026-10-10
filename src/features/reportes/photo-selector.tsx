"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, CloudOff, Images, Lock, TriangleAlert, WandSparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { plural } from "@/lib/format";
import type { Photo } from "@/lib/types";
import { PhotoThumb } from "@/components/pk/scene-photo";
import { Segmented } from "@/components/pk/page";
import { EmptyState } from "@/components/pk/feedback";
import { Button } from "@/components/ui/button";
import { RECOMMENDED_MAX_PHOTOS } from "./report-model";
import { SparkleBurst } from "./fx";
import { REASON, WithReason } from "./guard";

type Filter = "todas" | "antes" | "despues" | "elegidas";

/** Suggested selection: the first ANTES + DESPUÉS of every area, up to the recommended max. */
export function suggestedSelection(photos: Photo[]) {
  const byArea = new Map<string, { antes?: Photo; despues?: Photo }>();
  [...photos]
    .sort((a, b) => a.takenAt.localeCompare(b.takenAt))
    .forEach((p) => {
      const g = byArea.get(p.area) ?? {};
      if (p.kind === "antes" && !g.antes) g.antes = p;
      if (p.kind === "despues" && !g.despues) g.despues = p;
      byArea.set(p.area, g);
    });
  const ids: string[] = [];
  byArea.forEach((g) => {
    const pair = [g.antes, g.despues].filter((x): x is Photo => !!x);
    if (ids.length + pair.length <= RECOMMENDED_MAX_PHOTOS) ids.push(...pair.map((p) => p.id));
  });
  return new Set(ids);
}

export function PhotoSelector({
  photos,
  canEdit,
  pendingIds,
  onToggle,
  onApply,
  className,
}: {
  /** ANTES / DESPUÉS photos of the order */
  photos: Photo[];
  canEdit: boolean;
  pendingIds: Set<string>;
  onToggle: (photoId: string) => void;
  /** set the selection to exactly these ids */
  onApply: (ids: Set<string>) => void;
  className?: string;
}) {
  const [filter, setFilter] = useState<Filter>("todas");
  const selected = photos.filter((p) => p.selectedForReport);
  const over = selected.length > RECOMMENDED_MAX_PHOTOS;
  const noDespues = selected.length > 0 && !selected.some((p) => p.kind === "despues");
  const noAntes = selected.length > 0 && !selected.some((p) => p.kind === "antes");

  const groups = useMemo(() => {
    const visible = photos.filter((p) =>
      filter === "todas" ? true : filter === "elegidas" ? p.selectedForReport : p.kind === filter,
    );
    const map = new Map<string, Photo[]>();
    [...visible]
      .sort((a, b) => (a.kind === b.kind ? a.takenAt.localeCompare(b.takenAt) : a.kind === "antes" ? -1 : 1))
      .forEach((p) => map.set(p.area, [...(map.get(p.area) ?? []), p]));
    return [...map.entries()];
  }, [photos, filter]);

  if (photos.length === 0)
    return (
      <EmptyState icon={<Images />} title="Sin fotos ANTES / DESPUÉS" className={className}>
        Esta orden no tiene fotografías de evidencia para incluir en el reporte.
      </EmptyState>
    );

  return (
    <div className={className}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[15px] text-subtle">
            <b className="text-[22px] font-medium tracking-[-0.02em] text-ink tabular">{selected.length}</b> de {photos.length} seleccionadas
          </p>
          <SlotMeter count={selected.length} className="mt-2.5" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <WithReason reason={canEdit ? null : REASON.share}>
            <Button variant="outline" disabled={!canEdit} onClick={() => onApply(suggestedSelection(photos))} className="h-10 rounded-[12px] px-3.5 font-semibold">
              <WandSparkles /> Sugerir pares
            </Button>
          </WithReason>
          {selected.length > 0 && canEdit && (
            <Button variant="ghost" onClick={() => onApply(new Set())} className="h-10 rounded-[12px] px-3 text-subtle">
              <X /> Quitar todas
            </Button>
          )}
        </div>
      </div>

      <AnimatePresence initial={false}>
        {(over || noAntes || noDespues) && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-4 flex gap-3 rounded-[16px] bg-amber-soft px-4 py-3 text-[13.5px] leading-snug text-amber-ink">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              <p>
                {over ? (
                  <>
                    Ha elegido <b className="font-semibold">{selected.length} fotos</b>. Recomendamos hasta {RECOMMENDED_MAX_PHOTOS} para que el PDF sea ligero al
                    compartirlo por WhatsApp.
                  </>
                ) : noDespues ? (
                  <>El reporte no incluye ninguna foto DESPUÉS: el cliente no verá el resultado final.</>
                ) : (
                  <>El reporte no incluye ninguna foto ANTES para comparar el resultado.</>
                )}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div className="scrollbar-none -mx-1 max-w-full overflow-x-auto px-1">
        <Segmented<Filter>
          id="photo-filter"
          value={filter}
          onChange={setFilter}
          items={[
            { value: "todas", label: "Todas" },
            { value: "antes", label: "Antes" },
            { value: "despues", label: "Después" },
            { value: "elegidas", label: `Elegidas · ${selected.length}` },
          ]}
        />
        </div>
        {!canEdit && (
          <span className="inline-flex items-center gap-1.5 text-[13px] text-subtle">
            <Lock className="size-3.5" /> Solo el supervisor cambia la selección
          </span>
        )}
      </div>

      {groups.length === 0 ? (
        <EmptyState icon={<Images />} title="Nada por aquí" className="mt-5 py-9">
          No hay fotos con este filtro.
        </EmptyState>
      ) : (
        <div className="mt-5 space-y-6">
          {groups.map(([area, ps]) => (
            <section key={area}>
              <p className="mb-2.5 flex items-baseline justify-between gap-3 text-[14px]">
                <span className="truncate font-semibold text-ink">{area}</span>
                <span className="shrink-0 text-[12.5px] text-subtle">
                  {plural(ps.filter((p) => p.kind === "antes").length, "antes", "antes")} · {plural(ps.filter((p) => p.kind === "despues").length, "después", "después")}
                </span>
              </p>
              <motion.div layout className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                {ps.map((p) => (
                  <SelectableThumb key={p.id} photo={p} canEdit={canEdit} pending={pendingIds.has(p.id)} onToggle={() => onToggle(p.id)} />
                ))}
              </motion.div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function SelectableThumb({ photo, canEdit, pending, onToggle }: { photo: Photo; canEdit: boolean; pending: boolean; onToggle: () => void }) {
  const [burst, setBurst] = useState(0);
  const sel = photo.selectedForReport;
  return (
    <PhotoThumb
      photo={photo}
      selected={sel}
      onClick={
        canEdit
          ? () => {
              if (!sel) setBurst((b) => b + 1);
              onToggle();
            }
          : undefined
      }
      className={cn("w-full", !sel && "opacity-[0.88] saturate-[0.9] hover:opacity-100")}
    >
      <span className="sr-only">{sel ? "Incluida en el reporte. Toque para quitar." : "No incluida. Toque para incluir."}</span>
      <motion.span
        aria-hidden
        animate={{ scale: sel ? 1 : 0.86 }}
        transition={{ type: "spring", stiffness: 520, damping: 22 }}
        className={cn(
          "absolute right-2.5 top-2.5 inline-flex size-7 items-center justify-center rounded-full border-2 shadow-sm transition-colors",
          sel ? "border-white bg-link text-white" : "border-white/90 bg-black/25 text-transparent",
        )}
      >
        <Check className="size-4" strokeWidth={3} />
      </motion.span>
      {pending && (
        <span className="absolute right-11 top-3 inline-flex items-center gap-1 rounded-full bg-amber-soft px-1.5 py-0.5 text-[10px] font-semibold text-amber-fg">
          <CloudOff className="size-3" />
          <span className="sr-only">Pendiente de sincronizar</span>
        </span>
      )}
      {burst > 0 && <SparkleBurst key={burst} />}
    </PhotoThumb>
  );
}

/** Twelve capsules: how much of the recommended photo budget is used. */
function SlotMeter({ count, className }: { count: number; className?: string }) {
  const extra = Math.max(0, count - RECOMMENDED_MAX_PHOTOS);
  return (
    <div className={cn("flex items-center gap-1", className)} aria-label={`${count} de ${RECOMMENDED_MAX_PHOTOS} recomendadas`}>
      {Array.from({ length: RECOMMENDED_MAX_PHOTOS }).map((_, i) => (
        <motion.span
          key={i}
          className="h-[7px] w-[14px] rounded-full sm:w-[18px]"
          animate={{ backgroundColor: i < count ? (extra ? "#f0a020" : "#1667e0") : "#e3e8ef" }}
          transition={{ duration: 0.25, delay: i * 0.015 }}
        />
      ))}
      <span className={cn("ml-1.5 text-[12px] font-semibold tabular", extra ? "text-amber-fg" : "text-subtle")}>
        {extra ? `+${extra}` : `${Math.min(count, RECOMMENDED_MAX_PHOTOS)}/${RECOMMENDED_MAX_PHOTOS}`}
      </span>
    </div>
  );
}
