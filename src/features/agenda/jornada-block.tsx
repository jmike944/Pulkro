"use client";

import { motion, type Variants } from "motion/react";
import { Check, ChevronRight, MapPin, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { toneHex } from "@/lib/status";
import { fmtTime } from "@/lib/format";
import { AvatarStack, PersonAvatar } from "@/components/pk/bits";
import { StatusDot, ToneText } from "@/components/pk/status";
import { EASE, rowVariants } from "@/components/pk/motion";
import { dayLabel, isMultiDay, timeRange, type AgendaItem } from "./agenda-model";

/** Springy entrance; `custom` = position in the wave (column + row) so the grid fills diagonally. */
export const blockVariants: Variants = {
  hidden: { opacity: 0, y: 10, scale: 0.97 },
  show: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: "spring", stiffness: 420, damping: 30, delay: Math.min(0.55, i * 0.035) },
  }),
};

const ariaLabel = (it: AgendaItem) =>
  `${it.order.folio}, ${it.client?.shortName ?? ""}, ${timeRange(it.start, it.end)}, ${it.visual.label}${it.conflictIds.length ? ", doble asignación" : ""}`;

/**
 * Jornada block used in the week grid (compact) and the day timeline (fills its positioned box).
 * Status = colored rail + dot (en curso pulses and turns navy, like the dashboard live card).
 */
export function JornadaBlock({
  item,
  onOpen,
  wave = 0,
  showSupervisor,
  highlight,
  variant = "compact",
  heightPx,
}: {
  item: AgendaItem;
  onOpen: (jornadaId: string) => void;
  wave?: number;
  showSupervisor?: boolean;
  highlight?: boolean;
  variant?: "compact" | "timeline";
  /** timeline only: rendered height, to condense short jornadas */
  heightPx?: number;
}) {
  const { j, order, client, crew, visual, supervisor } = item;
  const live = visual.live;
  const done = visual.kind === "done";
  const tiny = variant === "timeline" && (heightPx ?? 999) < 62;
  const roomy = variant === "timeline" && (heightPx ?? 0) >= 120;

  return (
    <motion.button
      type="button"
      variants={blockVariants}
      custom={wave}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 420, damping: 30 }}
      onClick={() => onOpen(j.id)}
      aria-label={ariaLabel(item)}
      data-order-id={order.id}
      className={cn(
        "group relative flex w-full flex-col overflow-hidden rounded-[14px] border text-left outline-none transition-shadow duration-300 hover:shadow-lift focus-visible:ring-3 focus-visible:ring-ring/60",
        variant === "timeline" && "h-full",
        live
          ? "border-transparent bg-brand-deep text-white shadow-[0_10px_24px_-14px_rgb(2_58_99/0.7)]"
          : visual.kind === "nocrew"
            ? "border-dashed border-[#cfd6df] bg-[#fafbfc] text-ink"
            : done
              ? "border-hairline bg-[#fbfcfd] text-ink"
              : "border-hairline bg-white text-ink shadow-[0_1px_2px_rgb(16_24_40/0.04)]",
        highlight && "ring-2 ring-sky ring-offset-2 ring-offset-white",
      )}
    >
      <span aria-hidden className="absolute inset-y-0 left-0 w-[3px]" style={{ background: toneHex[visual.tone] }} />
      {live && <span aria-hidden className="pointer-events-none absolute -right-10 -top-10 size-28 rounded-full bg-sky/25 blur-2xl" />}

      <div className={cn("@container relative flex min-h-0 flex-1 flex-col pl-2.5 pr-2", tiny ? "justify-center py-1" : "py-2")}>
        <div className={cn("flex items-center justify-between gap-1.5 tabular", variant === "compact" ? "text-[11px]" : "text-[11.5px]")}>
          <span className={cn("flex min-w-0 items-center gap-1.5 font-semibold tracking-[-0.01em]", live ? "text-sky" : "text-ink/80")}>
            <StatusDot tone={visual.tone} live={live} />
            <span className="truncate">{timeRange(item.start, item.end)}</span>
          </span>
          {(showSupervisor || tiny) && (
            <span className={cn("flex shrink-0 items-center gap-1", live ? "text-white/60" : "text-subtle")}>
              {showSupervisor && supervisor && (
                <>
                  <PersonAvatar name={supervisor.name} initials={supervisor.initials} hue={supervisor.hue} size={18} />
                  {/* touch has no title: show the first name whenever the block is wide enough for it */}
                  <span className="hidden max-w-[88px] truncate font-medium @[176px]:inline">{supervisor.name.split(" ")[0]}</span>
                </>
              )}
              {tiny && isMultiDay(j, order) && dayLabel(j, order)}
            </span>
          )}
        </div>

        {!tiny && (
          <>
            <p className="mt-1 truncate text-[13.5px] font-semibold leading-tight">{client?.shortName ?? order.title}</p>
            <p className={cn("truncate text-[11.5px] tabular", live ? "text-white/65" : "text-subtle")}>
              {order.folio}
              {isMultiDay(j, order) ? ` · ${dayLabel(j, order)}` : ""}
              {roomy && item.site ? ` · ${item.site.municipality}` : ""}
            </p>
            {roomy && (
              <p className={cn("mt-1 line-clamp-2 text-[12px] leading-snug", live ? "text-white/75" : "text-ink/70")}>{order.title}</p>
            )}
            <div className="mt-auto flex items-center justify-between gap-2 pt-2">
              {crew.length ? (
                <AvatarStack people={crew} size={20} max={3} interactive={false} />
              ) : (
                <span className="text-[11.5px] font-medium text-subtle">Sin cuadrilla</span>
              )}
              <span className="flex items-center gap-1">
                {item.conflictIds.length > 0 && (
                  <span title="Doble asignación" className={cn("inline-flex items-center gap-0.5 text-[11px] font-semibold", live ? "text-[#ffd48a]" : "text-[#b86e00]")}>
                    <TriangleAlert className="size-3.5" />
                    {item.conflictIds.length}
                  </span>
                )}
                {done && <Check className="size-3.5 text-st-teal" strokeWidth={2.6} />}
              </span>
            </div>
          </>
        )}
      </div>

      {highlight && (
        // squeegee wipe across freshly scheduled / moved work
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/2 bg-gradient-to-r from-transparent via-sky/45 to-transparent"
          initial={{ x: "0%", skewX: -14 }}
          animate={{ x: "320%" }}
          transition={{ duration: 1.05, ease: EASE, repeat: 1, repeatDelay: 0.35 }}
        />
      )}
      {live && (
        <motion.span
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-[2px] bg-gradient-to-r from-transparent via-sky to-transparent"
          animate={{ x: ["-100%", "100%"] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: EASE }}
        />
      )}
    </motion.button>
  );
}

/** List view row (table on desktop, card on phones). */
export function JornadaRow({
  item,
  onOpen,
  showSupervisor,
  highlight,
}: {
  item: AgendaItem;
  onOpen: (jornadaId: string) => void;
  showSupervisor?: boolean;
  highlight?: boolean;
}) {
  const { j, order, client, site, crew, visual, supervisor } = item;
  return (
    <motion.li variants={rowVariants} layout="position">
      <button
        type="button"
        onClick={() => onOpen(j.id)}
        aria-label={ariaLabel(item)}
        data-order-id={order.id}
        className={cn(
          "group grid w-full grid-cols-[52px_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 rounded-[14px] border-b border-hairline px-1 py-4 text-left outline-none transition-colors hover:bg-[#fafbfc] focus-visible:ring-3 focus-visible:ring-ring/50 md:grid-cols-[64px_minmax(0,1fr)_120px_150px_20px]",
          highlight && "bg-sky-soft/60",
        )}
      >
        <span className="flex flex-col leading-tight tabular">
          <span className="text-[15px] font-semibold text-ink">{fmtTime(item.start)}</span>
          <span className="text-[12.5px] text-subtle">{fmtTime(item.end)}</span>
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[15px] font-semibold text-ink transition-colors group-hover:text-link">{order.title}</span>
          <span className="mt-0.5 flex items-center gap-1.5 truncate text-[13px] text-subtle">
            <span className="truncate">
              {order.folio} · {client?.shortName}
            </span>
            {isMultiDay(j, order) && (
              <>
                <span className="text-[#c5ccd6]">·</span>
                <span className="tabular">{dayLabel(j, order)}</span>
              </>
            )}
            {site && (
              // phones show the municipality on the status line instead: this line would clip it
              <span className="hidden items-center gap-1 md:inline-flex">
                <span className="text-[#c5ccd6]">·</span>
                <MapPin className="size-3.5" />
                {site.municipality}
              </span>
            )}
          </span>
        </span>
        <span className="flex items-center justify-end gap-2 md:justify-start">
          {showSupervisor && supervisor && (
            <PersonAvatar name={`Supervisor: ${supervisor.name}`} initials={supervisor.initials} hue={supervisor.hue} size={26} className="ring-2 ring-sky/40 max-lg:hidden" />
          )}
          {crew.length ? <AvatarStack people={crew} size={26} max={3} interactive={false} /> : <span className="text-[13px] text-subtle">Sin cuadrilla</span>}
        </span>
        {/* phones: full width under the title; wraps so status, place and owner never clip (from lg it stays one line) */}
        <span className="col-span-2 col-start-2 flex flex-wrap items-center gap-x-3 gap-y-1 md:col-span-1 md:col-start-auto md:gap-x-2 lg:flex-nowrap">
          <span className="inline-flex items-center gap-2">
            <StatusDot tone={visual.tone} live={visual.live} />
            <ToneText tone={visual.tone === "sky" ? "blue" : visual.tone} className="text-[13.5px]">
              {visual.label}
            </ToneText>
          </span>
          {item.conflictIds.length > 0 && (
            <span className="inline-flex items-center gap-1 text-[12.5px] font-medium text-[#b86e00]">
              <TriangleAlert className="size-3.5" /> {item.conflictIds.length} doble
            </span>
          )}
          {site && (
            <span className="inline-flex min-w-0 items-center gap-1 text-[13px] text-subtle md:hidden">
              <MapPin className="size-3.5 shrink-0" />
              <span className="truncate">{site.municipality}</span>
            </span>
          )}
          {showSupervisor && supervisor && (
            // from lg the 26px avatar in the crew column carries this (hover title); below it, touch needs the name in plain sight
            <span className="inline-flex min-w-0 items-center gap-1.5 text-[13px] text-subtle lg:hidden">
              <PersonAvatar initials={supervisor.initials} hue={supervisor.hue} size={18} />
              <span className="truncate">Sup. {supervisor.name.split(" ")[0]}</span>
            </span>
          )}
        </span>
        <ChevronRight className="hidden size-4 text-subtle transition-transform group-hover:translate-x-0.5 md:block" />
      </button>
    </motion.li>
  );
}
