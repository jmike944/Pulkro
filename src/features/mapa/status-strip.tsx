"use client";

import { StatFilter } from "@/components/pk/stat-filter";
import { INCIDENT_TONE, SERVICE_STATUS, type StatusFilter, type statusStats } from "./mapa-model";

const ITEMS = [
  { value: "en_curso", label: SERVICE_STATUS.en_curso.plural, tone: SERVICE_STATUS.en_curso.tone, live: true },
  { value: "terminada", label: SERVICE_STATUS.terminada.plural, tone: SERVICE_STATUS.terminada.tone },
  { value: "por_iniciar", label: SERVICE_STATUS.por_iniciar.plural, tone: SERVICE_STATUS.por_iniciar.tone },
  { value: "incidencia", label: "Con incidencia", tone: INCIDENT_TONE },
] as const;

type Item = (typeof ITEMS)[number]["value"];

/**
 * Summary of the day that doubles as the status filter (map and list): the same tray as the Órdenes stages. Tapping the
 * active counter again clears the filter ("todos"); the day's total is in the line above.
 */
export function StatusStrip({
  stats,
  value,
  onChange,
  className,
}: {
  stats: ReturnType<typeof statusStats>;
  value: StatusFilter;
  onChange: (v: StatusFilter) => void;
  className?: string;
}) {
  return (
    <StatFilter<Item>
      id="mapa-status"
      label="Filtrar por estado"
      items={ITEMS.map((it) => ({ ...it, ...stats[it.value] }))}
      active={value === "todos" ? null : value}
      onSelect={(v) => onChange(v ?? "todos")}
      className={className}
    />
  );
}
