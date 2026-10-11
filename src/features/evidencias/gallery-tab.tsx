"use client";

import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { CalendarRange, ChevronDown, CloudOff, ImageOff } from "lucide-react";
import { endOfDay, isWithinInterval, startOfDay, startOfYear, subDays } from "date-fns";
import type { DateRange } from "react-day-picker";
import { es } from "react-day-picker/locale";
import { cn } from "@/lib/utils";
import { useAppStore, useLookups, useMediaQuery } from "@/lib/hooks";
import { fmtDay, fmtNum, fmtTime, plural } from "@/lib/format";
import { PHOTO_KIND, toneDot } from "@/lib/status";
import type { Order, Photo, PhotoKind } from "@/lib/types";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { PhotoImage } from "@/components/pk/scene-photo";
import { PhotoFlags } from "@/components/pk/photo-flags";
import { PersonAvatar } from "@/components/pk/bits";
import { ClientMark } from "@/components/pk/client-mark";
import { EmptyState } from "@/components/pk/feedback";
import { EASE } from "@/components/pk/motion";
import { MODAL_DESKTOP_QUERY, ModalShell } from "@/components/pk/modal-shell";
import { tileShape } from "./evidence-data";
import { ALL, ClearFilters, FilterPill, pillClass } from "./filter-pill";
import { PhotoLightbox } from "./photo-lightbox";

const PAGE = 24;

type Preset = "todo" | "hoy" | "7d" | "30d" | "anio" | "custom";
const PRESETS: { value: Exclude<Preset, "custom">; label: string }[] = [
  { value: "todo", label: "Todas las fechas" },
  { value: "hoy", label: "Hoy" },
  { value: "7d", label: "Últimos 7 días" },
  { value: "30d", label: "Últimos 30 días" },
  { value: "anio", label: "Este año" },
];

type Filters = { kind: string; client: string; sup: string; preset: Preset; range?: DateRange };
const EMPTY: Filters = { kind: ALL, client: ALL, sup: ALL, preset: "todo" };

export function GalleryTab({ photos, orders, now }: { photos: Photo[]; orders: Order[]; now: Date }) {
  const lk = useLookups();
  const queue = useAppStore((s) => s.sync.queue);
  const [f, setF] = useState<Filters>(EMPTY);
  const [limit, setLimit] = useState(PAGE);
  const [index, setIndex] = useState<number | null>(null);
  const sm = useMediaQuery("(min-width: 640px)");
  const xl = useMediaQuery("(min-width: 1280px)");
  const cols = xl ? 4 : sm ? 3 : 2;

  const update = (patch: Partial<Filters>) => {
    setF((cur) => ({ ...cur, ...patch }));
    setLimit(PAGE);
  };

  const orderById = useMemo(() => new Map(orders.map((o) => [o.id, o] as const)), [orders]);
  const pendingIds = useMemo(
    () => new Set(queue.filter((q) => q.entity === "foto" && q.state !== "sincronizado").map((q) => q.entityId)),
    [queue],
  );

  const sorted = useMemo(() => [...photos].sort((a, b) => b.takenAt.localeCompare(a.takenAt)), [photos]);

  const options = useMemo(() => {
    const kinds = new Map<PhotoKind, number>();
    const clients = new Map<string, number>();
    const sups = new Map<string, number>();
    sorted.forEach((p) => {
      kinds.set(p.kind, (kinds.get(p.kind) ?? 0) + 1);
      const o = orderById.get(p.orderId);
      if (!o) return;
      clients.set(o.clientId, (clients.get(o.clientId) ?? 0) + 1);
      sups.set(o.supervisorId, (sups.get(o.supervisorId) ?? 0) + 1);
    });
    return {
      kinds: (Object.keys(PHOTO_KIND) as PhotoKind[])
        .filter((k) => kinds.has(k))
        .map((k) => ({
          value: k,
          label: PHOTO_KIND[k].label,
          hint: fmtNum(kinds.get(k) ?? 0),
          icon: <span className={cn("size-2 rounded-full", toneDot[PHOTO_KIND[k].tone])} />,
        })),
      clients: Array.from(clients.entries())
        .map(([id, n]) => ({ c: lk.clients.get(id), id, n }))
        .filter((x) => x.c)
        .sort((a, b) => a.c!.shortName.localeCompare(b.c!.shortName))
        .map(({ c, id, n }) => ({ value: id, label: c!.shortName, hint: fmtNum(n), icon: <ClientMark name={c!.name} hue={c!.hue} size={22} className="rounded-[7px]" /> })),
      sups: Array.from(sups.entries())
        .map(([id, n]) => ({ u: lk.users.get(id), id, n }))
        .filter((x) => x.u)
        .sort((a, b) => a.u!.name.localeCompare(b.u!.name))
        .map(({ u, id, n }) => ({ value: id, label: u!.name, hint: fmtNum(n), icon: <PersonAvatar initials={u!.initials} hue={u!.hue} size={22} /> })),
    };
  }, [sorted, orderById, lk.clients, lk.users]);

  const interval = useMemo(() => {
    switch (f.preset) {
      case "hoy":
        return { start: startOfDay(now), end: endOfDay(now) };
      case "7d":
        return { start: startOfDay(subDays(now, 6)), end: endOfDay(now) };
      case "30d":
        return { start: startOfDay(subDays(now, 29)), end: endOfDay(now) };
      case "anio":
        return { start: startOfYear(now), end: endOfDay(now) };
      case "custom":
        return f.range?.from ? { start: startOfDay(f.range.from), end: endOfDay(f.range.to ?? f.range.from) } : null;
      default:
        return null;
    }
  }, [f.preset, f.range, now]);

  const filtered = useMemo(
    () =>
      sorted.filter((p) => {
        if (f.kind !== ALL && p.kind !== f.kind) return false;
        const o = orderById.get(p.orderId);
        if (f.client !== ALL && o?.clientId !== f.client) return false;
        if (f.sup !== ALL && o?.supervisorId !== f.sup) return false;
        if (interval && !isWithinInterval(new Date(p.takenAt), interval)) return false;
        return true;
      }),
    [sorted, f.kind, f.client, f.sup, interval, orderById],
  );

  // Photos in the chosen dates alone (type, client and supervisor aside): what the date sheet's hint talks about.
  const dateCount = useMemo(
    () => (interval ? sorted.filter((p) => isWithinInterval(new Date(p.takenAt), interval)).length : sorted.length),
    [sorted, interval],
  );

  const visible = useMemo(() => filtered.slice(0, limit), [filtered, limit]);
  // Greedy shortest-column placement: appending a page never moves existing tiles.
  const columns = useMemo(() => {
    const out = Array.from({ length: cols }, () => ({ h: 0, items: [] as { p: Photo; i: number }[] }));
    visible.forEach((p, i) => {
      const col = out.reduce((min, c) => (c.h < min.h ? c : min), out[0]);
      col.items.push({ p, i });
      col.h += tileShape(p.id).h + 0.08;
    });
    return out;
  }, [visible, cols]);

  const active = f.kind !== ALL || f.client !== ALL || f.sup !== ALL || f.preset !== "todo";
  const orderCount = useMemo(() => new Set(filtered.map((p) => p.orderId)).size, [filtered]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2.5">
        <FilterPill label="Tipo" value={f.kind} onChange={(v) => update({ kind: v })} options={options.kinds} allLabel="Todos los tipos" />
        <FilterPill label="Cliente" value={f.client} onChange={(v) => update({ client: v })} options={options.clients} allLabel="Todos los clientes" />
        {(options.sups.length > 1 || f.sup !== ALL) && (
          <FilterPill label="Supervisor" value={f.sup} onChange={(v) => update({ sup: v })} options={options.sups} allLabel="Todos los supervisores" />
        )}
        <DatePill filters={f} onChange={update} now={now} count={filtered.length} dateCount={dateCount} />
        {active && <ClearFilters onClick={() => update(EMPTY)} />}
        <p className="ml-auto hidden text-[13.5px] text-subtle sm:block">
          <b className="font-semibold text-ink tabular">{fmtNum(filtered.length)}</b> {filtered.length === 1 ? "foto" : "fotos"} · {plural(orderCount, "orden", "órdenes")}
        </p>
      </div>
      <p className="mt-3 text-[13px] text-subtle sm:hidden">
        {plural(filtered.length, "foto", "fotos")} · {plural(orderCount, "orden", "órdenes")}
      </p>

      <div className="mt-6">
        {filtered.length === 0 ? (
          <EmptyState
            icon={<ImageOff />}
            title={photos.length ? "Sin fotos con estos filtros" : "Aún no hay fotos"}
            action={active ? <ClearFilters onClick={() => update(EMPTY)} /> : undefined}
          >
            {photos.length ? "Pruebe con otro tipo, cliente o rango de fechas." : "Las fotos ANTES, DESPUÉS y de incidencias aparecerán aquí al capturarse."}
          </EmptyState>
        ) : (
          <>
            <div className="flex gap-3 sm:gap-4">
              {columns.map((c, ci) => (
                <div key={ci} className="flex min-w-0 flex-1 flex-col gap-3 sm:gap-4">
                  {c.items.map(({ p, i }) => (
                    <GalleryTile
                      key={p.id}
                      photo={p}
                      order={orderById.get(p.orderId)}
                      pending={pendingIds.has(p.id)}
                      delay={(i % PAGE) * 0.025}
                      onOpen={() => setIndex(i)}
                    />
                  ))}
                </div>
              ))}
            </div>
            {limit < filtered.length && (
              <div className="mt-8 flex flex-col items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => setLimit((n) => n + PAGE)}
                  className="h-11 rounded-full border-line px-6 font-semibold shadow-[0_1px_2px_rgb(16_24_40/0.05)]"
                >
                  Mostrar más <ChevronDown />
                </Button>
                <span className="text-[12.5px] text-subtle tabular">
                  {fmtNum(visible.length)} de {fmtNum(filtered.length)}
                </span>
              </div>
            )}
          </>
        )}
      </div>

      <PhotoLightbox photos={filtered} index={index} onIndexChange={setIndex} pairPool={photos} />
    </div>
  );
}

function GalleryTile({
  photo,
  order,
  pending,
  delay,
  onOpen,
}: {
  photo: Photo;
  order?: Order;
  pending: boolean;
  delay: number;
  onOpen: () => void;
}) {
  const k = PHOTO_KIND[photo.kind];
  const shape = tileShape(photo.id);
  return (
    <motion.button
      type="button"
      onClick={onOpen}
      initial={{ opacity: 0, y: 14, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5, ease: EASE, delay }}
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.98 }}
      aria-label={`Foto ${k.label} · ${photo.area}${order ? ` · ${order.folio}` : ""}`}
      className={cn(
        "group relative w-full overflow-hidden rounded-[18px] bg-well text-left ring-1 ring-edge transition-shadow hover:shadow-lift",
        shape.cls,
      )}
    >
      <span className="absolute inset-0 transition-transform duration-700 ease-out group-hover:scale-[1.04]">
        <PhotoImage photo={photo} />
      </span>
      <span className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/60 via-black/15 to-transparent" />
      <span className="absolute left-2.5 top-2.5 inline-flex items-center gap-1.5 rounded-full bg-white/90 px-2 py-0.5 text-[10.5px] font-bold tracking-[0.08em] text-ink backdrop-blur dark:text-on-light">
        <span className={cn("size-1.5 rounded-full", toneDot[k.tone])} />
        {k.label.toUpperCase()}
      </span>
      <PhotoFlags photo={photo} />
      {pending ? (
        <span className="absolute right-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-amber-soft px-2 py-0.5 text-[10.5px] font-semibold text-amber-fg">
          <CloudOff className="size-3" /> Pendiente
        </span>
      ) : (
        order && (
          <span className="absolute right-2.5 top-2.5 rounded-full bg-black/40 px-2 py-0.5 text-[10.5px] font-semibold text-white opacity-0 backdrop-blur transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
            {order.folio}
          </span>
        )
      )}
      <span className="absolute inset-x-3 bottom-2.5 text-white">
        <span className="block truncate text-[12.5px] font-semibold">{photo.area}</span>
        {/* the hover pill never shows on touch, so there the folio rides in the caption */}
        {order && <span className="hidden truncate text-[11px] font-semibold tabular pointer-coarse:block">{order.folio}</span>}
        <span className="block text-[11px] opacity-80 tabular">
          {fmtDay(photo.takenAt)} · {fmtTime(photo.takenAt)}
        </span>
      </span>
    </motion.button>
  );
}

/**
 * Date filter. Desktop keeps the popover (presets on the left, calendar on the right, 36px cells for the mouse).
 * Below lg it is a bottom sheet instead: presets as 44px chips and a calendar with 44px cells, and the button at the
 * bottom says how many photos the filters and dates give ("Ver 38 fotos"). Presets apply and close; a range applies as you mark it.
 */
function DatePill({
  filters,
  onChange,
  now,
  count,
  dateCount,
}: {
  filters: Filters;
  onChange: (patch: Partial<Filters>) => void;
  now: Date;
  /** Photos that pass every filter (what the button's "Ver N fotos" opens). */
  count: number;
  /** Photos in the chosen dates alone, ignoring the type, client and supervisor filters. */
  dateCount: number;
}) {
  const [open, setOpen] = useState(false);
  const desktop = useMediaQuery(MODAL_DESKTOP_QUERY);
  const active = filters.preset !== "todo";
  const label =
    filters.preset === "custom" && filters.range?.from
      ? `${fmtDay(filters.range.from)}${filters.range.to && filters.range.to.getTime() !== filters.range.from.getTime() ? ` – ${fmtDay(filters.range.to)}` : ""}`
      : PRESETS.find((p) => p.value === filters.preset)?.label;

  const pillBody = (
    <>
      <CalendarRange className="size-4 shrink-0 text-subtle" />
      <span className={cn("shrink-0", active ? "text-subtle" : "font-medium")}>Fechas</span>
      {active && (
        <span className="min-w-0 truncate font-semibold">
          <span className="text-subtle">:</span> {label}
        </span>
      )}
      <ChevronDown className="size-4 shrink-0 text-subtle" />
    </>
  );
  const pillCls = cn(pillClass, active ? "border-blue-mid bg-blue-wash" : "border-hairline");

  const choosePreset = (preset: Exclude<Preset, "custom">) => {
    onChange({ preset, range: undefined });
    setOpen(false);
  };
  const chooseRange = (range: DateRange | undefined) => onChange({ preset: range?.from ? "custom" : "todo", range });

  if (!desktop)
    return (
      <>
        <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open} aria-label="Filtrar por fechas" className={pillCls}>
          {pillBody}
        </button>
        <ModalShell
          open={open}
          onOpenChange={setOpen}
          title="Fechas"
          description="Elija un período o marque un rango de días en el calendario."
          size="sm"
          footerHint={
            filters.preset === "custom" && filters.range?.from && !filters.range.to
              ? "Hay un solo día marcado. Toque otro día para marcar un rango."
              : count > 0
                ? undefined
                : dateCount === 0
                  ? "Ninguna foto en estas fechas. Pruebe con otro rango."
                  : "Ninguna foto coincide con estas fechas y los demás filtros."
          }
          footer={
            <Button onClick={() => setOpen(false)} className="h-12 rounded-[12px] px-6 text-[15px] font-semibold">
              {count === 0 ? "Cerrar" : `Ver ${plural(count, "foto", "fotos")}`}
            </Button>
          }
        >
          <div role="group" aria-label="Períodos" className="flex flex-wrap gap-2 pt-1">
            {PRESETS.map((p) => (
              <button
                key={p.value}
                type="button"
                aria-pressed={filters.preset === p.value}
                onClick={() => choosePreset(p.value)}
                className={cn(
                  "inline-flex h-11 items-center rounded-full border px-4 text-[14px] outline-none transition focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.97]",
                  filters.preset === p.value ? "border-transparent bg-ink font-semibold text-on-ink" : "border-line bg-surface text-ink",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          <p className="mb-1 mt-5 text-[12px] font-semibold uppercase tracking-[0.1em] text-subtle">Rango de días</p>
          <Calendar
            mode="range"
            locale={es}
            selected={filters.preset === "custom" ? filters.range : undefined}
            onSelect={chooseRange}
            defaultMonth={filters.range?.from ?? now}
            disabled={{ after: now }}
            className="mx-auto bg-transparent p-0 [--cell-size:44px]"
          />
        </ModalShell>
      </>
    );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className={pillCls} aria-label="Filtrar por fechas">
        {pillBody}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto max-w-[calc(100vw-2rem)] rounded-[18px] p-2">
        <div className="flex flex-row gap-2">
          <div className="flex w-[168px] flex-col gap-1">
            {PRESETS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => choosePreset(p.value)}
                className={cn(
                  "min-h-10 rounded-[10px] px-3 text-left text-[13.5px] transition",
                  filters.preset === p.value ? "bg-ink font-semibold text-on-ink" : "text-ink hover:bg-muted",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="border-l border-hairline pl-2">
            <Calendar
              mode="range"
              locale={es}
              selected={filters.preset === "custom" ? filters.range : undefined}
              onSelect={chooseRange}
              defaultMonth={filters.range?.from ?? now}
              disabled={{ after: now }}
              className="[--cell-size:--spacing(9)]"
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
