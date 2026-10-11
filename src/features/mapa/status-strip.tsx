"use client";

import { cn } from "@/lib/utils";
import type { Tone } from "@/lib/status";
import { AnimatedNumber } from "@/components/pk/bits";
import { StatusDot } from "@/components/pk/status";
import { useEdgeFade } from "@/components/pk/edge-fade";
import { INCIDENT_TONE, SERVICE_STATUS, type StatusFilter, type statusCounts } from "./mapa-model";

const ITEMS: { value: StatusFilter; label: string; tone?: Tone; live?: boolean }[] = [
  { value: "todos", label: "Todos" },
  { value: "en_curso", label: SERVICE_STATUS.en_curso.plural, tone: SERVICE_STATUS.en_curso.tone, live: true },
  { value: "terminada", label: SERVICE_STATUS.terminada.plural, tone: SERVICE_STATUS.terminada.tone },
  { value: "por_iniciar", label: SERVICE_STATUS.por_iniciar.plural, tone: SERVICE_STATUS.por_iniciar.tone },
  { value: "incidencia", label: "Con incidencia", tone: INCIDENT_TONE },
];

/**
 * Summary of the day that doubles as the status filter (map and list). Phones: a scrolling row of 44px pills;
 * desktop: five count tiles. Tapping the active filter again goes back to "Todos".
 */
export function StatusStrip({
  counts,
  value,
  onChange,
  className,
}: {
  counts: ReturnType<typeof statusCounts>;
  value: StatusFilter;
  onChange: (v: StatusFilter) => void;
  className?: string;
}) {
  const { ref, style } = useEdgeFade<HTMLDivElement>();
  return (
    <div
      ref={ref}
      style={style}
      role="group"
      aria-label="Filtrar por estado"
      className={cn(
        "scrollbar-none -mx-5 flex gap-2 overflow-x-auto px-5 sm:-mx-7 sm:px-7 lg:mx-0 lg:grid lg:grid-cols-5 lg:gap-3 lg:overflow-visible lg:px-0",
        className,
      )}
    >
      {ITEMS.map((it) => {
        const active = value === it.value;
        const n = counts[it.value];
        return (
          <button
            key={it.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(active && it.value !== "todos" ? "todos" : it.value)}
            className={cn(
              "inline-flex h-11 shrink-0 items-center gap-2 rounded-full border px-3.5 text-[14px] font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
              "lg:h-auto lg:min-w-0 lg:flex-col lg:items-start lg:gap-1.5 lg:rounded-[18px] lg:px-4 lg:py-3.5 lg:text-left",
              active ? "border-ink bg-ink text-on-ink" : "border-hairline bg-surface text-ink hover:border-line-strong active:bg-muted",
              !active && n === 0 && it.value !== "todos" && "lg:text-subtle",
            )}
          >
            <span className={cn("flex items-center gap-2 lg:text-[13px]", active ? "lg:text-on-ink/75" : "lg:text-subtle")}>
              {it.tone && <StatusDot tone={it.tone} live={it.live && n > 0} />}
              {it.label}
            </span>
            <AnimatedNumber
              value={n}
              className={cn(
                "text-[12.5px] lg:text-[30px] lg:font-medium lg:leading-none lg:tracking-[-0.04em]",
                active ? "text-on-ink/70 lg:text-on-ink" : "text-subtle lg:text-ink",
              )}
            />
          </button>
        );
      })}
    </div>
  );
}
