"use client";

import Link from "next/link";
import { useId, useMemo, useState } from "react";
import { AnimatePresence, motion, type Variants } from "motion/react";
import { ArrowUpRight, ChevronLeft, ChevronRight, CloudOff, Lock, MapPin, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore, useLookups, useShallow } from "@/lib/hooks";
import { mapsLink } from "@/lib/domain";
import { fmtCoords, fmtDateTime, fmtLongDay, fmtTime } from "@/lib/format";
import { PHOTO_KIND, toneDot } from "@/lib/status";
import type { Photo } from "@/lib/types";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { BeforeAfter, PhotoImage } from "@/components/pk/scene-photo";
import { photoGeoLabel, photoOriginLabel, photoTimeLabel } from "@/components/pk/photo-flags";
import { KeyValues, PersonAvatar } from "@/components/pk/bits";
import { SoftBadge } from "@/components/pk/status";
import { Segmented } from "@/components/pk/page";
import { EASE } from "@/components/pk/motion";
import { useCanSeeRoute } from "@/components/shell/use-can-see-route";
import { findPair } from "./evidence-data";

const slide: Variants = {
  enter: (dir: number) => ({ x: dir * 72, opacity: 0, scale: 0.985 }),
  center: { x: 0, opacity: 1, scale: 1, transition: { duration: 0.42, ease: EASE } },
  exit: (dir: number) => ({ x: dir * -72, opacity: 0, transition: { duration: 0.28, ease: EASE } }),
};

/**
 * Where the lightbox is opened from. It only decides which links the details repeat:
 * `global` (gallery, incidents, requests) links to the order and the jornada; `orden` is already on the order, so it
 * drops the order/client rows and the "Evidencia de la orden" button; `jornada` keeps the order and client rows (the
 * photo may be opened from a jornada page) and the button, but drops the jornada row since it is already there.
 */
export type LightboxScope = "global" | "orden" | "jornada";

/** Extra controls for one photo (report toggle, delete…), drawn under the details. `index` is the photo's place in `photos`. */
export type LightboxActions = (photo: Photo, ctx: { index: number; total: number; close: () => void }) => React.ReactNode;

/**
 * THE photo viewer of the app (gallery, order, jornada, incidents, evidence requests): full-size photo with prev/next
 * (buttons, ← → keys, swipe), capture metadata (área, hora, GPS + mapa, capturó, orden) and an ANTES/DESPUÉS squeegee
 * view when a pair exists. `pairPool` is where the matching pair is looked up (defaults to `photos`); `actions` adds
 * per-photo controls under the details (see `LightboxReportToggle`).
 */
export function PhotoLightbox({
  photos,
  index,
  onIndexChange,
  pairPool,
  scope = "global",
  actions,
}: {
  photos: Photo[];
  index: number | null;
  onIndexChange: (i: number | null) => void;
  pairPool?: Photo[];
  scope?: LightboxScope;
  actions?: LightboxActions;
}) {
  const live = index !== null ? photos[index] : undefined;
  const open = !!live;
  // Keep the last photo mounted while the dialog animates out: no blank frame, and the title does not flip to "Foto".
  const [last, setLast] = useState<{ photo: Photo; index: number } | null>(live && index !== null ? { photo: live, index } : null);
  if (live && index !== null && (last?.photo !== live || last.index !== index)) setLast({ photo: live, index });
  const [dir, setDir] = useState(0);
  const [compare, setCompare] = useState(false);

  const view = live && index !== null ? { photo: live, index } : last;
  const total = photos.length;

  const close = () => onIndexChange(null);
  const go = (delta: number) => {
    if (!open || index === null || total < 2) return;
    setDir(delta);
    onIndexChange((index + delta + total) % total);
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
    <Dialog open={open} onOpenChange={(v) => !v && close()}>
      <DialogContent
        showCloseButton={false}
        onKeyDown={onKeyDown}
        {...(view ? {} : { "aria-describedby": undefined })}
        className="max-h-[94dvh] gap-0 overflow-y-auto rounded-[26px] p-0 ring-edge sm:max-w-[min(1100px,calc(100%-3rem))] lg:grid-cols-[minmax(0,1fr)_340px] lg:overflow-hidden"
      >
        {view ? (
          <LightboxBody
            photo={view.photo}
            index={view.index}
            total={total}
            dir={dir}
            compare={compare}
            onCompare={setCompare}
            go={go}
            pool={pairPool ?? photos}
            scope={scope}
            actions={actions}
            close={close}
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
  scope,
  actions,
  close,
}: {
  photo: Photo;
  index: number;
  total: number;
  dir: number;
  compare: boolean;
  onCompare: (v: boolean) => void;
  go: (delta: number) => void;
  pool: Photo[];
  scope: LightboxScope;
  actions?: LightboxActions;
  close: () => void;
}) {
  const lk = useLookups();
  const canSee = useCanSeeRoute();
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
  const showOrder = scope !== "orden" && !!order;
  const showJornada = scope !== "jornada" && !!jornada;
  // The incident screen is the supervisor's; the other roles read the incident in the order's Incidencias tab.
  const incidentHref = incident
    ? canSee("/incidencias")
      ? `/incidencias?i=${incident.id}`
      : order
        ? `/ordenes/${order.folio}?tab=incidencias`
        : undefined
    : undefined;

  // What a screen reader hears when the dialog opens (the visible details are read as the user moves through them).
  const spoken = [
    `Foto ${kind.label.toUpperCase()}${order ? ` de la orden ${order.folio}` : ""}.`,
    `Tomada el ${fmtLongDay(photo.takenAt)} a las ${fmtTime(photo.takenAt)}.`,
    total > 1 ? `Foto ${index + 1} de ${total}.` : null,
  ]
    .filter(Boolean)
    .join(" ");

  type Row = { k: string; v: React.ReactNode };
  const rows = ([
    showOrder && {
      k: "Orden",
      v: (
        <Link href={`/ordenes/${order.folio}`} className="text-link hover:underline">
          {order.folio}
        </Link>
      ),
    },
    showOrder && client && { k: "Cliente", v: client.shortName },
    showJornada && {
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
    {
      k: "Hora",
      v: (
        <span className="block">
          <span className="tabular">{fmtDateTime(photo.takenAt)}</span>
          {photoTimeLabel(photo) && <span className="block text-[12px] leading-snug text-subtle">{photoTimeLabel(photo)}</span>}
        </span>
      ),
    },
    photoOriginLabel(photo) && { k: "Origen", v: photoOriginLabel(photo) },
    {
      k: "GPS",
      v:
        photo.lat != null && photo.lng != null ? (
          <span className="block">
            <a
              href={mapsLink(photo.lat, photo.lng)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-link tabular hover:underline"
            >
              <MapPin className="size-3.5" />
              {fmtCoords(photo.lat, photo.lng)}
            </a>
            {photoGeoLabel(photo) && <span className="block text-[12px] leading-snug text-subtle">{photoGeoLabel(photo)}</span>}
          </span>
        ) : (
          <span className="text-subtle">Sin coordenadas</span>
        ),
    },
    incident && {
      k: "Incidencia",
      v: incidentHref ? (
        <Link href={incidentHref} className="text-link hover:underline">
          {incident.folio}
        </Link>
      ) : (
        incident.folio
      ),
    },
  ] as (Row | false | undefined)[]).filter((r): r is Row => !!r);

  return (
    <>
      {/* stage: a photo matte stays dark in both themes */}
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-black max-lg:max-h-[60dvh] lg:self-start">
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
            className={cn("absolute inset-0 touch-pan-y [&_img]:pointer-events-none", !showCompare && total > 1 && "cursor-grab active:cursor-grabbing")}
          >
            {showCompare && pair ? (
              <BeforeAfter before={pair.before} after={pair.after} className="h-full rounded-none ring-0" />
            ) : (
              <PhotoImage photo={photo} className="object-contain" />
            )}
          </motion.div>
        </AnimatePresence>

        {!showCompare && (
          <span className="pointer-events-none absolute left-3.5 top-3.5 inline-flex items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-bold tracking-[0.08em] text-ink backdrop-blur dark:text-on-light">
            <span className={cn("size-1.5 rounded-full", toneDot[kind.tone])} />
            {kind.label.toUpperCase()}
          </span>
        )}
        {total > 1 && (
          <>
            <span aria-hidden className="pointer-events-none absolute bottom-3.5 left-3.5 rounded-full bg-black/45 px-2.5 py-1 text-[12px] font-semibold text-white tabular backdrop-blur">
              {index + 1} / {total}
            </span>
            <StageButton side="left" onClick={() => go(-1)} label="Foto anterior" />
            <StageButton side="right" onClick={() => go(1)} label="Foto siguiente" />
          </>
        )}
        {/* the arrows keep focus on themselves: say which photo is showing now */}
        <p className="sr-only" aria-live="polite" aria-atomic>
          {total > 1 ? `Foto ${index + 1} de ${total}: ${photo.area}` : ""}
        </p>
      </div>

      {/* metadata */}
      <aside className="relative min-w-0 bg-surface">
        <div className="p-5 sm:p-6 lg:absolute lg:inset-0 lg:overflow-y-auto">
          <div className="flex flex-wrap items-center gap-2 lg:pr-12">
            <SoftBadge tone={kind.tone}>{kind.label.toUpperCase()}</SoftBadge>
            {photo.selectedForReport && <SoftBadge tone="navy">En reporte</SoftBadge>}
            {pending && (
              <SoftBadge tone="amber">
                <CloudOff className="size-3" /> Sin sincronizar
              </SoftBadge>
            )}
          </div>
          <DialogTitle className="mt-3 font-serif text-[26px] font-medium leading-tight text-ink">{photo.area}</DialogTitle>
          <DialogDescription className="sr-only">{spoken}</DialogDescription>
          <p className="mt-1 text-[14px] text-subtle first-letter:uppercase">
            {fmtLongDay(photo.takenAt)} · {fmtTime(photo.takenAt)}
          </p>

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
          {showCompare && <p className="mt-2 text-[12.5px] text-subtle">Deslice el control para comparar.</p>}

          <KeyValues className="mt-6" rows={rows} />
          {photo.note && <p className="mt-5 rounded-[14px] bg-soft p-3.5 text-[13.5px] leading-relaxed text-ink">{photo.note}</p>}

          {actions && <div key={photo.id}>{actions(photo, { index, total, close })}</div>}

          {showOrder && (
            <Button asChild variant="outline" className="mt-6 h-11 rounded-[12px] border-line px-4 font-semibold">
              <Link href={`/ordenes/${order.folio}?tab=evidencia`}>
                Evidencia de la orden <ArrowUpRight />
              </Link>
            </Button>
          )}
          {total > 1 && <p className="mt-6 hidden text-[12px] text-subtle lg:block">Las flechas ← → recorren las fotos.</p>}
        </div>
      </aside>

      <DialogClose asChild>
        <button
          type="button"
          aria-label="Cerrar"
          className="absolute right-3 top-3 z-10 inline-flex size-11 items-center justify-center rounded-full bg-surface/95 text-ink shadow-lift outline-none transition hover:bg-surface focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-tile dark:ring-1 dark:ring-edge-strong dark:hover:bg-well lg:size-10"
        >
          <X className="size-[18px]" aria-hidden />
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
        "absolute top-1/2 z-[2] inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-ink shadow-[0_6px_20px_-6px_rgb(0_0_0/0.45)] backdrop-blur outline-none focus-visible:ring-3 focus-visible:ring-ring/50 dark:text-on-light",
        side === "left" ? "left-3" : "right-3",
      )}
    >
      <Icon className="size-5" aria-hidden />
    </motion.button>
  );
}

/**
 * "Incluir en el reporte" row for the lightbox `actions` slot (order and jornada use it). `blockedReason` is why the
 * current role cannot change it: printed under the switch instead of a hover tip, so it also reads on a phone.
 */
export function LightboxReportToggle({ photo, blockedReason }: { photo: Photo; blockedReason?: string | null }) {
  const toggle = useAppStore((s) => s.togglePhotoForReport);
  const id = useId();
  const blocked = !!blockedReason;
  return (
    <div className="mt-6">
      <label
        className={cn(
          "flex min-h-14 w-full items-center justify-between gap-4 rounded-[16px] border border-hairline px-4 py-3",
          blocked ? "cursor-not-allowed opacity-60" : "cursor-pointer",
        )}
      >
        <span className="min-w-0">
          <span id={`${id}-l`} className="block text-[14px] font-semibold text-ink">
            Incluir en el reporte
          </span>
          <span id={`${id}-d`} className="block text-[12.5px] leading-snug text-subtle">
            Aparece en el PDF que recibe el cliente.
          </span>
        </span>
        <Switch
          checked={photo.selectedForReport}
          disabled={blocked}
          onCheckedChange={() => toggle(photo.id)}
          aria-labelledby={`${id}-l`}
          aria-describedby={`${id}-d`}
        />
      </label>
      {blocked && (
        <p className="mt-2 flex items-start gap-1.5 text-[12.5px] leading-snug text-subtle">
          <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {blockedReason}
        </p>
      )}
    </div>
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
