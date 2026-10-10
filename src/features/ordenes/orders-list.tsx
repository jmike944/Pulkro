"use client";

import Link from "next/link";
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, Flame, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Role } from "@/lib/types";
import { AnimatedNumber, AvatarStack, DateBadge, PersonAvatar, ProgressLine } from "@/components/pk/bits";
import { OrderStatusPill, SoftBadge, ToneText } from "@/components/pk/status";
import { ORDER_STATUS } from "@/lib/status";
import { EASE, rowVariants, staggerContainer } from "@/components/pk/motion";
import { Button } from "@/components/ui/button";
import type { OrderRow } from "./order-rows";
import { EvidenceBadges, JornadaProgress, NextActionButton, RealHours } from "./row-bits";

export const PAGE_SIZE = 30;

/* Container-query layouts: cards below 56rem of available width, full table from 64rem. */
const GRID_MD = "@4xl:grid-cols-[52px_minmax(0,1fr)_128px_172px_80px_96px]";
const GRID_LG = "@5xl:grid-cols-[52px_minmax(0,1fr)_128px_172px_80px_100px_60px_96px]";

const rowExit = { opacity: 0, scale: 0.98, transition: { duration: 0.18 } };

/**
 * Orders table (wide) / rich cards (narrow), staggered entrance, springy reflow on filter
 * changes and client-side "Mostrar más" pagination. Re-key it to restart the stagger.
 */
export function OrdersList({ rows, role, filterSig, empty }: { rows: OrderRow[]; role: Role; filterSig: string; empty: React.ReactNode }) {
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [sig, setSig] = useState(filterSig);
  if (sig !== filterSig) {
    // new filters → back to the first page (adjusting state while rendering, no effect needed)
    setSig(filterSig);
    setLimit(PAGE_SIZE);
  }

  if (rows.length === 0) return <>{empty}</>;

  const shown = rows.slice(0, limit);
  const remaining = rows.length - shown.length;

  return (
    <div className="@container mt-2">
      <div
        className={cn(
          "hidden gap-x-3 border-b border-hairline pb-3 pt-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-subtle @4xl:grid",
          GRID_MD,
          GRID_LG,
        )}
      >
        <span>Fecha</span>
        <span>Orden</span>
        <span>Supervisor</span>
        <span>Estado</span>
        <span>Jornadas</span>
        <span className="hidden @5xl:block">Evidencia</span>
        <span className="hidden text-right @5xl:block">Horas</span>
        <span />
      </div>

      <motion.ul
        variants={staggerContainer(0.035, 0.08)}
        initial="hidden"
        animate="show"
        className="grid gap-3 pt-3 @xl:grid-cols-2 @4xl:grid-cols-1 @4xl:gap-0 @4xl:pt-0"
      >
        <AnimatePresence mode="popLayout">
          {shown.map((r) => (
            <motion.li key={r.order.id} layout="position" variants={rowVariants} exit={rowExit} className="min-w-0">
              <OrderTableRow row={r} role={role} />
              <OrderCard row={r} role={role} />
            </motion.li>
          ))}
        </AnimatePresence>
      </motion.ul>

      <div className="mx-auto mt-8 flex max-w-xs flex-col items-center gap-3 text-center">
        <p className="text-[13.5px] text-subtle" aria-live="polite">
          Mostrando <AnimatedNumber value={shown.length} className="font-semibold text-ink" /> de{" "}
          <AnimatedNumber value={rows.length} className="font-semibold text-ink" />
        </p>
        <ProgressLine value={shown.length / rows.length} className="h-[4px] w-40" />
        {remaining > 0 && (
          <Button
            type="button"
            variant="outline"
            onClick={() => setLimit((l) => l + PAGE_SIZE)}
            className="group mt-1 h-11 rounded-[14px] border-[#dfe3ea] px-5 text-[14px] font-semibold shadow-[0_1px_2px_rgb(16_24_40/0.05)]"
          >
            Mostrar más
            <span className="rounded-md bg-[#f2f4f7] px-1.5 text-[12px] tabular text-subtle">+{Math.min(PAGE_SIZE, remaining)}</span>
            <ChevronDown className="size-4 transition-transform group-hover:translate-y-0.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

/* ───────────── pieces ───────────── */

const shortName = (name?: string) => {
  if (!name) return "Sin supervisor";
  const [first, last] = name.split(" ");
  return last ? `${first} ${last[0]}.` : first;
};

function OrderLine({ row, className }: { row: OrderRow; className?: string }) {
  return (
    <p className={cn("mt-0.5 flex min-w-0 items-center gap-1.5 text-[13px] text-subtle", className)}>
      <span className="shrink-0 font-medium text-ink/80 tabular">{row.order.folio}</span>
      <span className="truncate">
        · {row.client?.shortName ?? "Cliente"} · {row.site?.municipality ?? ""}
      </span>
    </p>
  );
}

function AltaChip() {
  return (
    <SoftBadge tone="red" className="shrink-0">
      <Flame className="size-3" />
      Alta
    </SoftBadge>
  );
}

/** The next-step hint under the pill, unless it only repeats the status label. */
function StatusHint({ row, className }: { row: OrderRow; className?: string }) {
  const { action, order } = row;
  if (action.status === ORDER_STATUS[order.status].label) return null;
  return (
    <ToneText tone={action.tone} className={className}>
      {action.status}
    </ToneText>
  );
}

function dateTone(row: OrderRow) {
  if (row.today) return "today" as const;
  if (row.late) return "late" as const;
  return undefined;
}

function OrderTableRow({ row, role }: { row: OrderRow; role: Role }) {
  const { order } = row;
  return (
    <div
      className={cn(
        "group relative -mx-3 hidden items-center gap-x-3 rounded-[16px] border-b border-hairline px-3 py-4 transition-[background-color,box-shadow,transform,border-color] duration-300 ease-out hover:-translate-y-0.5 hover:border-transparent hover:bg-white hover:shadow-[0_12px_30px_-16px_rgb(16_24_40/0.25),0_0_0_1px_rgb(16_24_40/0.04)] @4xl:grid",
        GRID_MD,
        GRID_LG,
      )}
    >
      <DateBadge date={order.scheduledStart} tone={dateTone(row)} />
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <Link
            href={`/ordenes/${order.folio}`}
            title={order.title}
            className="truncate text-[15px] font-semibold text-ink outline-none transition-colors after:absolute after:inset-0 after:rounded-[16px] group-hover:text-link focus-visible:after:ring-3 focus-visible:after:ring-ring/50"
          >
            {order.title}
          </Link>
          {order.priority === "alta" && <AltaChip />}
        </div>
        <OrderLine row={row} />
      </div>
      <div className="min-w-0">
        <p className="flex items-center gap-2 truncate text-[13.5px] text-ink">
          {row.supervisor && <PersonAvatar name={row.supervisor.name} initials={row.supervisor.initials} hue={row.supervisor.hue} size={22} />}
          <span className="truncate">{shortName(row.supervisor?.name)}</span>
        </p>
        <div className="mt-1.5 h-6">
          {row.crew.length ? (
            <AvatarStack people={row.crew} size={26} max={3} />
          ) : (
            <span className="text-[12.5px] font-medium text-[#b86e00]">Sin cuadrilla</span>
          )}
        </div>
      </div>
      <div className="min-w-0">
        <OrderStatusPill status={order.status} />
        <StatusHint row={row} className="mt-1 block truncate text-[12.5px]" />
      </div>
      <JornadaProgress row={row} />
      <EvidenceBadges row={row} className="hidden @5xl:flex" />
      <RealHours row={row} className="hidden @5xl:flex" />
      <div className="flex justify-end">
        <NextActionButton row={row} role={role} />
      </div>
    </div>
  );
}

function OrderCard({ row, role }: { row: OrderRow; role: Role }) {
  const { order } = row;
  return (
    <motion.article
      whileTap={{ scale: 0.99 }}
      transition={{ type: "spring", stiffness: 420, damping: 30 }}
      className="relative flex h-full flex-col rounded-[22px] border border-hairline bg-white p-4 shadow-[0_1px_2px_rgb(16_24_40/0.04),0_10px_24px_-18px_rgb(16_24_40/0.2)] transition-shadow duration-300 hover:shadow-lift @4xl:hidden"
    >
      {row.live && (
        <motion.span
          aria-hidden
          className="absolute inset-x-6 top-0 h-[2px] rounded-full bg-gradient-to-r from-transparent via-sky to-transparent"
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: EASE }}
        />
      )}
      <div className="flex gap-3">
        <DateBadge date={order.scheduledStart} tone={dateTone(row)} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <Link
              href={`/ordenes/${order.folio}`}
              className="line-clamp-2 text-[16px] font-semibold leading-snug text-ink outline-none after:absolute after:inset-0 after:rounded-[22px] focus-visible:after:ring-3 focus-visible:after:ring-ring/50"
            >
              {order.title}
            </Link>
            {order.priority === "alta" && <AltaChip />}
          </div>
          <OrderLine row={row} className="mt-1 text-[13.5px]" />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <OrderStatusPill status={order.status} />
        <StatusHint row={row} className="text-[13.5px]" />
      </div>

      <div className="mt-3.5 grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.5fr)_minmax(0,0.7fr)] gap-3 rounded-[16px] bg-sand/70 px-3.5 py-3">
        <div className="min-w-0">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-subtle">Jornadas</p>
          <JornadaProgress row={row} compact className="mt-1" />
        </div>
        <div className="min-w-0">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-subtle">Evidencia</p>
          <EvidenceBadges row={row} className="mt-1 gap-1" />
        </div>
        <div className="min-w-0 text-right">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-subtle">Horas</p>
          <RealHours row={row} className="mt-1 text-[14px]" />
        </div>
      </div>

      <div className="mt-3.5 flex items-center justify-between gap-3">
        <p className="flex min-w-0 items-center gap-2 text-[13.5px] text-subtle">
          {row.supervisor && <PersonAvatar name={row.supervisor.name} initials={row.supervisor.initials} hue={row.supervisor.hue} size={32} />}
          <span className="min-w-0">
            <span className="block truncate font-medium text-ink">{shortName(row.supervisor?.name)}</span>
            {row.site && (
              <span className="flex items-center gap-1 truncate text-[12.5px]">
                <MapPin className="size-3 shrink-0" />
                <span className="truncate">{row.site.name}</span>
              </span>
            )}
          </span>
        </p>
        {row.crew.length ? (
          <AvatarStack people={row.crew} size={30} max={3} className="shrink-0" />
        ) : (
          <span className="shrink-0 text-[12.5px] font-medium text-[#b86e00]">Sin cuadrilla</span>
        )}
      </div>

      <div className="mt-auto pt-3.5">
        <NextActionButton row={row} role={role} className="h-12 w-full rounded-[14px] text-[15.5px]" />
      </div>
    </motion.article>
  );
}
