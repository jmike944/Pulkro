"use client";

import { AnimatePresence, motion } from "motion/react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtDay, fmtRelativeDay, fmtTime } from "@/lib/format";
import { INCIDENT_TYPE, SEVERITY, toneSoftBg, toneText } from "@/lib/status";
import type { Incident, Photo } from "@/lib/types";
import { SoftBadge, TonePill } from "@/components/pk/status";
import { PhotoImage } from "@/components/pk/scene-photo";
import { INCIDENT_ICONS } from "@/components/pk/incident-sheet";
import { MobileRow } from "@/components/pk/mobile";
import { rowVariants, staggerContainer } from "@/components/pk/motion";
import type { IncidentRow } from "./incident-data";

const GRID = "lg:grid-cols-[124px_minmax(0,1fr)_84px_124px_64px] xl:grid-cols-[132px_minmax(0,1fr)_minmax(0,160px)_84px_124px_68px]";

/** Incident register: table on desktop (lg+), MobileRow list on phones and tablets. */
export function IncidentList({ rows, selectedId, onOpen }: { rows: IncidentRow[]; selectedId: string | null; onOpen: (id: string) => void }) {
  return (
    <div>
      <div className={cn("hidden gap-4 border-b border-hairline pb-3 text-[12px] font-semibold uppercase tracking-[0.1em] text-subtle lg:grid", GRID)}>
        <span>Folio</span>
        <span>Descripción</span>
        <span className="hidden xl:block">Orden</span>
        <span>Severidad</span>
        <span>Estado</span>
        <span className="text-right">Fecha</span>
      </div>
      <motion.ul variants={staggerContainer(0.04, 0.08)} initial="hidden" animate="show">
        <AnimatePresence mode="popLayout">
          {rows.map((r) => (
            <Row key={r.inc.id} r={r} selected={selectedId === r.inc.id} onOpen={() => onOpen(r.inc.id)} />
          ))}
        </AnimatePresence>
      </motion.ul>
    </div>
  );
}

export function TypeTile({ type, size = 32, className }: { type: Incident["type"]; size?: number; className?: string }) {
  const meta = INCIDENT_TYPE[type];
  const Icon = INCIDENT_ICONS[type];
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center", toneSoftBg[meta.tone], toneText[meta.tone], className)}
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.32) }}
    >
      <Icon style={{ width: size * 0.5, height: size * 0.5 }} />
    </span>
  );
}

export function StatePill({ inc }: { inc: Incident }) {
  return inc.status === "abierta" ? (
    <TonePill tone="red" live={inc.blocksClosure}>
      Abierta
    </TonePill>
  ) : (
    <TonePill tone="teal">Resuelta</TonePill>
  );
}

function Thumbs({ photos, size = 36 }: { photos: Photo[]; size?: number }) {
  if (!photos.length) return null;
  const shown = photos.slice(0, 3);
  return (
    <span className="flex items-center gap-1.5">
      {shown.map((p) => (
        <span key={p.id} className="relative overflow-hidden rounded-[8px] ring-1 ring-black/5" style={{ width: size, height: Math.round(size * 0.75) }}>
          <PhotoImage photo={p} />
        </span>
      ))}
      {photos.length > shown.length && <span className="text-[12px] font-medium text-subtle tabular">+{photos.length - shown.length}</span>}
    </span>
  );
}

function Row({ r, selected, onOpen }: { r: IncidentRow; selected: boolean; onOpen: () => void }) {
  const { inc, order, client, photos } = r;
  const type = INCIDENT_TYPE[inc.type];
  const sev = SEVERITY[inc.severity];
  const open = inc.status === "abierta";
  return (
    <motion.li layout="position" variants={rowVariants} exit={{ opacity: 0, x: 24, transition: { duration: 0.22 } }}>
      {/* phones & tablets */}
      <MobileRow
        className="lg:hidden"
        onClick={onOpen}
        leading={<TypeTile type={inc.type} size={44} />}
        title={inc.description}
        meta={
          <span className="truncate">
            {inc.folio} · {type.label} · {order?.folio ?? "—"}
          </span>
        }
        status={
          open
            ? { tone: inc.blocksClosure ? "red" : sev.tone === "slate" ? "amber" : sev.tone, label: inc.blocksClosure ? "Abierta · impide el cierre" : `Abierta · severidad ${sev.label.toLowerCase()}`, live: inc.blocksClosure }
            : { tone: "teal", label: `Resuelta ${inc.resolvedAt ? fmtRelativeDay(inc.resolvedAt).toLowerCase() : ""}`.trim() }
        }
        trailing={
          <span className="flex shrink-0 items-center gap-2">
            {photos[0] && (
              <span className="relative size-11 overflow-hidden rounded-[12px] ring-1 ring-black/5">
                <PhotoImage photo={photos[0]} />
              </span>
            )}
            <ChevronRight className="size-[18px] text-[#98a2b3]" />
          </span>
        }
      />

      {/* desktop table row */}
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${inc.folio} · ${type.label}`}
        className={cn(
          "group -mx-3 hidden w-[calc(100%+1.5rem)] items-center gap-4 rounded-[14px] border-b border-hairline px-3 py-4 text-left transition-colors hover:bg-[#fafbfc] lg:grid",
          GRID,
          selected && "bg-[#f4f8fe] hover:bg-[#f4f8fe]",
        )}
      >
        <span className="flex min-w-0 items-center gap-3">
          <TypeTile type={inc.type} size={34} />
          <span className="min-w-0">
            <span className="block text-[14.5px] font-semibold text-ink tabular group-hover:text-link">{inc.folio}</span>
            <span className="block truncate text-[12px] text-subtle">{type.label}</span>
          </span>
        </span>
        <span className="min-w-0">
          <span className="line-clamp-2 text-[14px] leading-snug text-ink">{inc.description}</span>
          <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <Thumbs photos={photos} />
            <span className="truncate text-[12.5px] text-subtle xl:hidden">
              {order?.folio} · {client?.shortName}
            </span>
          </span>
        </span>
        <span className="hidden min-w-0 xl:block">
          <span className="block truncate text-[14px] font-medium text-ink tabular">{order?.folio ?? "—"}</span>
          <span className="block truncate text-[12.5px] text-subtle">{client?.shortName}</span>
        </span>
        <span>
          <SoftBadge tone={sev.tone}>{sev.label}</SoftBadge>
        </span>
        <span className="min-w-0">
          <StatePill inc={inc} />
          <span className={cn("mt-1 block truncate text-[12px]", open && inc.blocksClosure ? "font-medium text-st-red" : "text-subtle")}>
            {open ? (inc.blocksClosure ? "Impide el cierre" : "No bloquea") : inc.resolvedAt ? fmtRelativeDay(inc.resolvedAt) : ""}
          </span>
        </span>
        <span className="text-right">
          <span className="block text-[14px] text-ink tabular">{fmtDay(inc.createdAt)}</span>
          <span className="block text-[12px] text-subtle tabular">{fmtTime(inc.createdAt)}</span>
        </span>
      </button>
    </motion.li>
  );
}
