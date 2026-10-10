"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { Inbox } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { CASE_STATUS } from "@/lib/status";
import type { CaseStatus } from "@/lib/types";
import { StatusDot } from "@/components/pk/status";
import { EmptyState } from "@/components/pk/feedback";
import { useEdgeFade } from "@/components/pk/edge-fade";
import { EASE } from "@/components/pk/motion";
import { CaseCard } from "./case-card";
import { CaseStatusDialog, moveNeedsDialog, quickMove, type CaseMove } from "./case-status-dialog";
import { CASE_FLOW, isCaseOpen } from "./lib";
import type { CaseRow } from "./use-postventa";
import { FilterChip } from "./ui";

/** Cards visible per column before "Ver N más" (closed work piles up fast). */
const COLUMN_CAP: Record<CaseStatus, number> = { abierto: 40, en_proceso: 40, resuelto: 4, cerrado: 4 };

/**
 * Post-sale cases: 4-column board on tablet/desktop (springy layout transitions when a card
 * changes status), filterable list on phones.
 */
export function CaseBoard({ rows, canManage, focusOrderId }: { rows: CaseRow[]; canManage: boolean; focusOrderId?: string }) {
  const updateCase = useAppStore((s) => s.updateCase);
  const [move, setMove] = useState<CaseMove | null>(null);

  const onMove = (row: CaseRow, to: CaseStatus) => {
    if (!canManage) return;
    if (moveNeedsDialog(row.c, to)) setMove({ c: row.c, client: row.client, owner: row.owner, to });
    else quickMove(updateCase, row.c, to);
  };

  if (rows.length === 0) {
    return (
      <EmptyState icon={<Inbox />} title={focusOrderId ? "Sin casos para esta orden" : "Sin casos postventa"} className="mt-6">
        {focusOrderId ? "La orden no tiene quejas ni seguimientos registrados." : "Cuando un cliente reporte algo, regístrelo con “Nuevo caso”."}
      </EmptyState>
    );
  }

  return (
    <>
      <LayoutGroup id="case-board">
        <div className="mt-6 hidden gap-3 md:grid md:grid-cols-2 xl:grid-cols-4">
          {CASE_FLOW.map((st, i) => (
            <BoardColumn
              key={st}
              status={st}
              index={i}
              rows={rows.filter((r) => r.c.status === st)}
              canManage={canManage}
              onMove={onMove}
              focusOrderId={focusOrderId}
            />
          ))}
        </div>
      </LayoutGroup>
      <MobileCaseList rows={rows} canManage={canManage} onMove={onMove} focusOrderId={focusOrderId} />
      <CaseStatusDialog move={move} onOpenChange={(v) => !v && setMove(null)} />
    </>
  );
}

function BoardColumn({
  status,
  index,
  rows,
  canManage,
  onMove,
  focusOrderId,
}: {
  status: CaseStatus;
  index: number;
  rows: CaseRow[];
  canManage: boolean;
  onMove: (row: CaseRow, to: CaseStatus) => void;
  focusOrderId?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const meta = CASE_STATUS[status];
  const cap = COLUMN_CAP[status];
  const shown = expanded ? rows : rows.slice(0, cap);
  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE, delay: 0.1 + index * 0.07 }}
      className="flex min-w-0 flex-col rounded-[22px] bg-soft p-2.5"
      aria-label={`${meta.label}: ${rows.length}`}
    >
      <header className="flex items-center justify-between px-2 pb-3 pt-1.5">
        <span className="flex items-center gap-2 text-[14px] font-semibold text-ink">
          <StatusDot tone={meta.tone} live={meta.live && rows.length > 0} />
          {meta.label}
        </span>
        <motion.span
          key={rows.length}
          initial={{ scale: 1.35 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 500, damping: 18 }}
          className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-surface px-2 text-[12px] font-semibold text-subtle shadow-[0_1px_2px_rgb(16_24_40/0.06)] tabular"
        >
          {rows.length}
        </motion.span>
      </header>
      <div className="flex flex-col gap-2.5">
        {shown.map((r) => (
          <CaseCard key={r.c.id} layoutId={`case-${r.c.id}`} row={r} canManage={canManage} onMove={onMove} highlight={!!focusOrderId && r.c.orderId === focusOrderId} />
        ))}
        {rows.length === 0 && (
          <motion.div layout className="flex min-h-[120px] flex-col items-center justify-center gap-2 rounded-[18px] border border-dashed border-line-strong px-4 text-center text-[13px] text-subtle">
            <span className="relative">
              <span className="absolute -left-3 -top-1 size-2.5 rounded-full border border-sky/60 bg-sky-soft animate-float" />
              <span className="inline-block size-4 rounded-full border border-sky/60 bg-sky-soft animate-float [animation-delay:1.1s]" />
            </span>
            {status === "abierto" ? "Nada pendiente de atender" : "Sin casos"}
          </motion.div>
        )}
        {rows.length > cap && (
          <motion.button
            layout
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="h-10 rounded-[14px] text-[13.5px] font-semibold text-link transition hover:bg-surface"
          >
            {expanded ? "Mostrar menos" : `Ver ${rows.length - cap} más`}
          </motion.button>
        )}
      </div>
    </motion.section>
  );
}

/** "activos" keeps the old combined view (abierto + en proceso); each status also has its own chip. */
type MobileFilter = "activos" | CaseStatus;

const CHIP_LABEL: Record<CaseStatus, string> = { abierto: "Abiertos", en_proceso: "En proceso", resuelto: "Resueltos", cerrado: "Cerrados" };
const EMPTY_COPY: Partial<Record<MobileFilter, string>> = {
  activos: "No hay casos abiertos ni en proceso. ¡Impecable!",
  abierto: "Nada pendiente de atender. ¡Impecable!",
  en_proceso: "Ningún caso en proceso.",
};

function MobileCaseList({
  rows,
  canManage,
  onMove,
  focusOrderId,
}: {
  rows: CaseRow[];
  canManage: boolean;
  onMove: (row: CaseRow, to: CaseStatus) => void;
  focusOrderId?: string;
}) {
  const counts = useMemo(() => {
    const by = Object.fromEntries(CASE_FLOW.map((st) => [st, rows.filter((r) => r.c.status === st).length])) as Record<CaseStatus, number>;
    return { ...by, activos: by.abierto + by.en_proceso };
  }, [rows]);
  const [filter, setFilter] = useState<MobileFilter>(() => (counts.activos || !counts.resuelto ? "activos" : "resuelto"));
  const shown = rows.filter((r) => (filter === "activos" ? isCaseOpen(r.c) : r.c.status === filter));

  // five chips overflow a phone: keep the tapped one in view
  const pick = (f: MobileFilter) => (e: React.MouseEvent<HTMLButtonElement>) => {
    setFilter(f);
    e.currentTarget.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  };

  const { ref: chipRef, style: chipStyle } = useEdgeFade();

  return (
    <div className="mt-5 md:hidden">
      <div ref={chipRef} style={chipStyle} className="scrollbar-none -mx-5 flex gap-2 overflow-x-auto px-5 pb-1 sm:-mx-7 sm:px-7">
        <FilterChip active={filter === "activos"} onClick={pick("activos")} count={counts.activos}>
          Activos
        </FilterChip>
        {CASE_FLOW.map((st) => (
          <FilterChip key={st} active={filter === st} onClick={pick(st)} count={counts[st]}>
            {CHIP_LABEL[st]}
          </FilterChip>
        ))}
      </div>
      <motion.div layout className="mt-4 flex flex-col gap-3">
        <AnimatePresence mode="popLayout" initial={false}>
          {shown.map((r, i) => (
            <motion.div
              key={r.c.id}
              layout
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0, transition: { duration: 0.35, ease: EASE, delay: Math.min(i, 6) * 0.04 } }}
              exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.2 } }}
            >
              <CaseCard row={r} canManage={canManage} onMove={onMove} highlight={!!focusOrderId && r.c.orderId === focusOrderId} />
            </motion.div>
          ))}
        </AnimatePresence>
        {shown.length === 0 && (
          <p className="rounded-[18px] border border-dashed border-line-strong px-4 py-8 text-center text-[14px] text-subtle">
            {EMPTY_COPY[filter] ?? "Sin casos en este estado."}
          </p>
        )}
      </motion.div>
    </div>
  );
}
