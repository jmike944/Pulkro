"use client";

import { StatFilter } from "@/components/pk/stat-filter";
import { STAGES, type Stage } from "./order-rows";

export type StageStat = { count: number; sub: string };

/** The four stage counters of Órdenes, each a quick filter (the same tray as the Mapa statuses: `StatFilter`). */
export function OrdersSummary({
  stats,
  active,
  onSelect,
}: {
  stats: Record<Stage, StageStat>;
  active: Stage | null;
  onSelect: (s: Stage | null) => void;
}) {
  return (
    <StatFilter
      id="orders-stage"
      label="Filtros rápidos por etapa"
      items={STAGES.map((s) => ({ value: s.value, label: s.label, tone: s.tone, ...stats[s.value] }))}
      active={active}
      onSelect={onSelect}
    />
  );
}
