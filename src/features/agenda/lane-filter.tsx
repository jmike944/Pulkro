"use client";

import { cn } from "@/lib/utils";
import { PersonAvatar } from "@/components/pk/bits";
import { useEdgeFade } from "@/components/pk/edge-fade";
import type { Lane } from "./use-agenda";

/** First name; adds the surname initial when two lanes would read the same. */
function laneName(lane: Lane, lanes: Lane[]) {
  const parts = lane.user?.name.split(" ") ?? [];
  if (!parts.length) return "Sin supervisor";
  const clash = lanes.some((o) => o.id !== lane.id && o.user?.name.split(" ")[0] === parts[0]);
  return clash && parts[1] ? `${parts[0]} ${parts[1][0]}.` : parts[0];
}

/**
 * Phones / tablets: the desktop grid gives every supervisor a row, but below lg their jornadas share one
 * column per day. These pills narrow the calendar to a single supervisor ("Todos" = everyone).
 */
export function LaneFilter({ lanes, total, value, onChange }: { lanes: Lane[]; total: number; value: string; onChange: (id: string) => void }) {
  const { ref, style } = useEdgeFade();
  return (
    <div
      ref={ref}
      style={style}
      role="group"
      aria-label="Filtrar por supervisor"
      className="scrollbar-none -mx-5 mb-4 flex gap-2 overflow-x-auto px-5 sm:-mx-7 sm:px-7 md:mx-0 md:px-0 lg:hidden"
    >
      <Pill active={value === "all"} onClick={() => onChange("all")} count={total}>
        Todos
      </Pill>
      {lanes.map((l) => (
        <Pill key={l.id} active={value === l.id} onClick={() => onChange(l.id)} count={l.items}>
          {l.user && <PersonAvatar initials={l.user.initials} hue={l.user.hue} size={22} />}
          {laneName(l, lanes)}
        </Pill>
      ))}
    </div>
  );
}

function Pill({ active, onClick, count, children }: { active: boolean; onClick: () => void; count: number; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-11 shrink-0 items-center gap-2 rounded-full border px-3.5 text-[14px] font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
        active ? "border-ink bg-ink text-white" : "border-hairline bg-white text-ink active:bg-muted",
      )}
    >
      {children}
      <span className={cn("text-[12.5px] tabular", active ? "text-white/70" : "text-subtle")}>{count}</span>
    </button>
  );
}
