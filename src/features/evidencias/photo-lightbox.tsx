"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AnimatePresence, motion, type Variants } from "motion/react";
import { ArrowUpRight, ChevronLeft, ChevronRight, CloudOff, MapPin, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore, useLookups, useShallow } from "@/lib/hooks";
import { mapsLink } from "@/lib/domain";
import { fmtCoords, fmtDateTime, fmtLongDay, fmtTime } from "@/lib/format";
import { PHOTO_KIND, toneDot } from "@/lib/status";
import type { Photo } from "@/lib/types";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { BeforeAfter, PhotoImage } from "@/components/pk/scene-photo";
import { KeyValues, PersonAvatar } from "@/components/pk/bits";
import { SoftBadge } from "@/components/pk/status";
import { Segmented } from "@/components/pk/page";
import { EASE } from "@/components/pk/motion";
import { findPair } from "./evidence-data";

const slide: Variants = {
  enter: (dir: number) => ({ x: dir * 72, opacity: 0, scale: 0.985 }),
  center: { x: 0, opacity: 1, scale: 1, transition: { duration: 0.42, ease: EASE } },
  exit: (dir: number) => ({ x: dir * -72, opacity: 0, transition: { duration: 0.28, ease: EASE } }),
};

/**
 * Full-size photo viewer with prev/next (buttons, ← → keys, swipe), capture metadata
 * (área, hora, GPS + mapa, capturó, orden) and an ANTES/DESPUÉS squeegee view when a pair exists.
 * `pairPool` is where the matching pair is looked up (defaults to `photos`).
 */
export function PhotoLightbox({
  photos,
  index,
  onIndexChange,
  pairPool,
}: {
  photos: Photo[];
  index: number | null;
  onIndexChange: (i: number | null) => void;
  pairPool?: Photo[];
}) {
  const open = index !== null && index >= 0 && index < photos.length;
  // Keep the last photo mounted while the dialog animates out.
  const [lastIndex, setLastIndex] = useState<number | null>(index);
  if (open && index !== lastIndex) setLastIndex(index);
  const [dir, setDir] = useState(0);
  const [compare, setCompare] = useState(false);

  const current = open ? index : lastIndex;
  const photo = current !== null ? photos[current] : undefined;
  const total = photos.length;

  const go = (delta: number) => {
    if (current === null || total < 2) return;
    setDir(delta);
    onIndexChange((current + delta + total) % total);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).closest('[role="slider"]')) return; // the squeegee slider owns ← →
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      go(-1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      go(1);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onIndexChange(null)}>
      <DialogContent
        showCloseButton={false}
        onKeyDown={onKeyDown}
        className="max-h-[94dvh] gap-0 overflow-y-auto rounded-[26px] p-0 ring-edge sm:max-w-[min(1100px,calc(100%-3rem))] lg:grid-cols-[minmax(0,1fr)_340px] lg:overflow-hidden"
      >
        {photo ? (
          <LightboxBody
            photo={photo}
            index={current ?? 0}
            total={total}
            dir={dir}
            compare={compare}
            onCompare={setCompare}
            go={go}
            pool={pairPool ?? photos}
          />
        ) : (
          <DialogTitle className="sr-only">Foto</DialogTitle>
        )}
      </DialogContent>
    </Dialog>
  );
}

function LightboxBody({
  photo,
  index,
  total,
  dir,
  compare,
  onCompare,
  go,
  pool,
}: {
  photo: Photo;
  index: number;
  total: number;
  dir: number;
  compare: boolean;
  onCompare: (v: boolean) => void;
  go: (delta: number) => void;
  pool: Photo[];
}) {
  const lk = useLookups();
  const { orders, jornadas, incidents, queue } = useAppStore(
    useShallow((s) => ({ orders: s.orders, jornadas: s.jornadas, incidents: s.incidents, queue: s.sync.queue })),
  );
  const order = useMemo(() => orders.find((o) => o.id === photo.orderId), [orders, photo.orderId]);
  const jornada = useMemo(() => (photo.jornadaId ? jornadas.find((j) => j.id === photo.jornadaId) : undefined), [jornadas, photo.jornadaId]);
  const incident = useMemo(
    () => incidents.find((i) => i.id === photo.incidentId || i.photoIds.includes(photo.id)),
    [incidents, photo.incidentId, photo.id],
  );
  const pending = useMemo(() => queue.some((q) => q.entity === "foto" && q.entityId === photo.id && q.state !== "sincronizado"), [queue, photo.id]);
  const pair = useMemo(() => findPair(photo, pool), [photo, pool]);
  const showCompare = compare && !!pair;
  const kind = PHOTO_KIND[photo.kind];
  const by = lk.users.get(photo.by);
  const client = order ? lk.clients.get(order.clientId) : undefined;

  type Row = { k: string; v: React.ReactNode };
  const rows = ([
    order && {
      k: "Orden",
      v: (
        <Link href={`/ordenes/${order.folio}`} className="text-link hover:underline">
          {order.folio}
        </Link>
      ),
    },
    client && { k: "Cliente", v: client.shortName },
    jornada && {
      k: "Jornada",
      v: (
        <Link href={`/jornada/${jornada.id}`} className="text-link hover:underline">
          Jornada {jornada.dayIndex}
          {order ? ` de ${order.plannedDays}` : ""}
        </Link>
      ),
    },
    {
      k: "Capturó",
      v: by ? (
        <span className="inline-flex items-center gap-2">
          <PersonAvatar name={by.name} initials={by.initials} hue={by.hue} size={22} />
          <span className="truncate">{by.name}</span>
        </span>
      ) : (
        "—"
      ),
    },
    { k: "Hora", v: <span className="tabular">{fmtDateTime(photo.takenAt)}</span> },
    {
      k: "GPS",
      v:
        photo.lat != null && photo.lng != null ? (
          <a
            href={mapsLink(photo.lat, photo.lng)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-link tabular hover:underline"
          >
            <MapPin className="size-3.5" />
            {fmtCoords(photo.lat, photo.lng)}
          </a>
        ) : (
          <span className="text-subtle">Sin coordenadas</span>
        ),
    },
    incident && {
      k: "Incidencia",
      v: (
        <Link href={`/incidencias?i=${incident.id}`} className="text-link hover:underline">
          {incident.folio}
        </Link>
      ),
    },
  ] as (Row | undefined)[]).filter((r): r is Row => !!r);

  return (
    <>
      {/* stage */}
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-[#0d1b2a] max-lg:max-h-[60dvh] lg:self-start">
        <AnimatePresence initial={false} custom={dir} mode="popLayout">
          <motion.div
            key={showCompare && pair ? `cmp-${pair.before.id}-${pair.after.id}` : photo.id}
            custom={dir}
            variants={slide}
            initial="enter"
            animate="center"
            exit="exit"
            drag={showCompare || total < 2 ? false : "x"}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.22}
            onDragEnd={(_, info) => {
              if (info.offset.x < -70) go(1);
              else if (info.offset.x > 70) go(-1);
            }}
            className={cn("absolute inset-0 [&_img]:pointer-events-none", !showCompare && total > 1 && "cursor-grab active:cursor-grabbing")}
          >
            {showCompare && pair ? (
              <BeforeAfter before={pair.before} after={pair.after} className="h-full rounded-none ring-0" />
            ) : (
              <PhotoImage photo={photo} className="object-contain" />
            )}
          </motion.div>
        </AnimatePresence>

        {!showCompare && (
          <span className="pointer-events-none absolute left-3.5 top-3.5 inline-flex items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-bold tracking-[0.08em] text-ink backdrop-blur">
            <span className={cn("size-1.5 rounded-full", toneDot[kind.tone])} />
            {kind.label.toUpperCase()}
          </span>
        )}
        {total > 1 && (
          <>
            <span className="pointer-events-none absolute bottom-3.5 left-3.5 rounded-full bg-black/45 px-2.5 py-1 text-[12px] font-semibold text-white tabular backdrop-blur">
              {index + 1} / {total}
            </span>
            <StageButton side="left" onClick={() => go(-1)} label="Foto anterior" />
            <StageButton side="right" onClick={() => go(1)} label="Foto siguiente" />
          </>
        )}
      </div>

      {/* metadata */}
      <aside className="relative min-w-0 bg-white">
        <div className="p-5 sm:p-6 lg:absolute lg:inset-0 lg:overflow-y-auto">
          <div className="flex flex-wrap items-center gap-2 pr-12">
            <SoftBadge tone={kind.tone}>{kind.label.toUpperCase()}</SoftBadge>
            {photo.selectedForReport && <SoftBadge tone="navy">En reporte</SoftBadge>}
            {pending && (
              <SoftBadge tone="amber">
                <CloudOff className="size-3" /> Sin sincronizar
              </SoftBadge>
            )}
          </div>
          <DialogTitle className="mt-3 font-serif text-[26px] font-medium leading-tight text-ink">{photo.area}</DialogTitle>
          <DialogDescription className="mt-1 text-[14px] text-subtle first-letter:uppercase">
            {fmtLongDay(photo.takenAt)} · {fmtTime(photo.takenAt)}
          </DialogDescription>

          {pair && (
            <Segmented
              id="lightbox-mode"
              className="mt-5"
              items={[
                { value: "foto", label: "Foto" },
                { value: "comparar", label: "Antes y después" },
              ]}
              value={showCompare ? "comparar" : "foto"}
              onChange={(v) => onCompare(v === "comparar")}
            />
          )}
          {showCompare && <p className="mt-2 text-[12.5px] text-subtle">Arrastra el jalador para comparar.</p>}

          <KeyValues className="mt-6" rows={rows} />
          {photo.note && <p className="mt-5 rounded-[14px] bg-soft p-3.5 text-[13.5px] leading-relaxed text-ink">{photo.note}</p>}

          {order && (
            <Button asChild variant="outline" className="mt-6 h-10 rounded-[12px] border-line px-4 font-semibold">
              <Link href={`/ordenes/${order.folio}?tab=evidencia`}>
                Evidencia de la orden <ArrowUpRight />
              </Link>
            </Button>
          )}
          {total > 1 && <p className="mt-6 hidden text-[12px] text-subtle lg:block">Usa ← → para recorrer las fotos.</p>}
        </div>
      </aside>

      <DialogClose asChild>
        <button
          type="button"
          aria-label="Cerrar"
          className="absolute right-3 top-3 z-10 inline-flex size-11 items-center justify-center rounded-full bg-white/95 text-ink shadow-[0_2px_10px_rgb(16_24_40/0.18)] transition hover:bg-white lg:size-10"
        >
          <X className="size-[18px]" />
        </button>
      </DialogClose>
    </>
  );
}

function StageButton({ side, onClick, label }: { side: "left" | "right"; onClick: () => void; label: string }) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-label={label}
      whileHover={{ scale: 1.06 }}
      whileTap={{ scale: 0.94 }}
      className={cn(
        "absolute top-1/2 z-[2] inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-ink shadow-[0_6px_20px_-6px_rgb(0_0_0/0.45)] backdrop-blur",
        side === "left" ? "left-3" : "right-3",
      )}
    >
      <Icon className="size-5" />
    </motion.button>
  );
}

/** Local state for a lightbox opened from a list of photos. */
export function useLightbox() {
  const [list, setList] = useState<Photo[]>([]);
  const [index, setIndex] = useState<number | null>(null);
  return {
    list,
    index,
    setIndex,
    open: (photos: Photo[], i: number) => {
      setList(photos);
      setIndex(i);
    },
  };
}
