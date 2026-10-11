"use client";

import { useEffect } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { jornadaMinutes } from "@/lib/domain";
import { firstName, fmtDuration, fmtTime } from "@/lib/format";
import { toneDot } from "@/lib/status";
import { AvatarStack } from "@/components/pk/bits";
import { MobileRow, TimeTile } from "@/components/pk/mobile";
import { StatusDot } from "@/components/pk/status";
import { rowVariants, staggerContainer } from "@/components/pk/motion";
import { isMultiDay } from "@/features/agenda/agenda-model";
import { INCIDENT_TONE, SERVICE_STATUS, STATUS_ORDER, isLate, type MapaService } from "./mapa-model";

type ListProps = {
  services: MapaService[];
  now: Date;
  activeId: string | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  /** Dirección / Administración: name the supervisor on each row. */
  showSupervisor: boolean;
  /** Desktop: bring the row of a pin picked on the map into view (the map column is sticky, the list scrolls). */
  revealSelected: boolean;
  /** Re-runs the row stagger when the day or the filters change. */
  animKey: string;
};

/** "En curso · 2 h 10 min en sitio", "Terminada · 08:02–14:10", "Por iniciar · sin entrada" (+ open incident). */
function StatusLine({ s, now }: { s: MapaService; now: Date }) {
  const { j } = s;
  const meta = SERVICE_STATUS[s.status];
  const late = isLate(s, now);
  return (
    <>
      <span className="shrink-0">{meta.label}</span>
      {s.status === "en_curso" && <span className="truncate tabular">· {fmtDuration(jornadaMinutes(j, now))} en sitio</span>}
      {s.status === "terminada" && j.checkIn && j.checkOut && (
        <span className="truncate tabular">
          · {fmtTime(j.checkIn.deviceAt)}–{fmtTime(j.checkOut.deviceAt)}
        </span>
      )}
      {late && <span className="truncate font-medium text-amber-fg">· sin entrada</span>}
      {s.openIncidents.length > 0 && (
        <span className="inline-flex shrink-0 items-center gap-1 font-medium text-red-fg">
          · <span className={cn("inline-grid size-[15px] place-items-center rounded-full text-[9px] font-bold leading-none text-white", toneDot[INCIDENT_TONE])} aria-hidden>!</span>
          Incidencia
        </span>
      )}
    </>
  );
}

function rowTitle(s: MapaService) {
  return `${s.client?.shortName ?? s.order.folio} · ${s.site?.name ?? "Sitio sin registrar"}`;
}

function rowMeta(s: MapaService, showSupervisor: boolean) {
  const parts = [s.order.folio, s.serviceType?.short];
  if (isMultiDay(s.j, s.order)) parts.push(`J${s.j.dayIndex} de ${Math.max(s.order.plannedDays, s.j.dayIndex)}`);
  if (showSupervisor && s.supervisor) parts.push(firstName(s.supervisor.name));
  return parts.filter(Boolean).join(" · ");
}

/**
 * Every service of the day, grouped by status (en curso → por iniciar → terminadas) and ordered by planned start.
 * Phones: MobileRows (tap = detail). Desktop: rows that light up their pin on hover/focus and light up when their pin is hovered.
 */
export function ServiceList({ services, now, activeId, selectedId, onSelect, onHover, showSupervisor, revealSelected, animKey }: ListProps) {
  const reduced = useReducedMotion();
  const groups = STATUS_ORDER.map((st) => ({ st, items: services.filter((s) => s.status === st) })).filter((g) => g.items.length > 0);

  useEffect(() => {
    if (!revealSelected || !selectedId) return;
    const el = Array.from(document.querySelectorAll<HTMLElement>(`[data-service-id="${selectedId}"]`)).find((e) => e.getClientRects().length > 0);
    el?.scrollIntoView({ block: "nearest", behavior: reduced ? "auto" : "smooth" });
  }, [selectedId, revealSelected, reduced]);

  return (
    <motion.div key={animKey} variants={staggerContainer(0.035, 0.1)} initial="hidden" animate="show" className="space-y-6">
      {groups.map(({ st, items }) => {
        const meta = SERVICE_STATUS[st];
        return (
          <section key={st} aria-labelledby={`mapa-group-${st}`}>
            <h3 id={`mapa-group-${st}`} className="mb-1 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-subtle lg:mb-2 lg:px-3">
              <StatusDot tone={meta.tone} live={meta.live} />
              {meta.plural}
              <span className="font-medium tabular text-faint">{items.length}</span>
            </h3>

            {/* phones / tablets */}
            <ul className="lg:hidden">
              {items.map((s) => (
                <motion.li key={s.id} variants={rowVariants} data-service-id={s.id} className="border-b border-hairline last:border-0">
                  <MobileRow
                    onClick={() => onSelect(s.id)}
                    className={cn("-mx-2 min-h-[72px] w-[calc(100%+1rem)] rounded-[14px] border-0 px-2", s.id === selectedId && "bg-soft")}
                    leading={<TimeTile date={s.j.plannedStart} tone={s.status === "en_curso" ? "live" : undefined} />}
                    title={rowTitle(s)}
                    meta={<span className="truncate">{rowMeta(s, showSupervisor)}</span>}
                    status={{ tone: meta.tone, live: meta.live, label: <span className="flex min-w-0 items-center gap-1.5"><StatusLine s={s} now={now} /></span> }}
                  />
                </motion.li>
              ))}
            </ul>

            {/* desktop */}
            <ul className="hidden lg:block" onMouseLeave={() => onHover(null)}>
              {items.map((s) => {
                const active = s.id === activeId;
                return (
                  <motion.li key={s.id} variants={rowVariants} data-service-id={s.id} className="border-b border-hairline last:border-0">
                    <button
                      type="button"
                      onClick={() => onSelect(s.id)}
                      onMouseEnter={() => onHover(s.id)}
                      onFocus={() => onHover(s.id)}
                      onBlur={() => onHover(null)}
                      aria-current={s.id === selectedId ? "true" : undefined}
                      data-active={active ? "" : undefined}
                      className="my-1 grid w-full grid-cols-[54px_minmax(0,1fr)_auto] items-center gap-4 rounded-[16px] px-3 py-2.5 text-left outline-none transition-colors hover:bg-soft focus-visible:ring-3 focus-visible:ring-ring/50 data-[active]:bg-soft aria-[current=true]:bg-blue-wash"
                    >
                      <TimeTile date={s.j.plannedStart} tone={s.status === "en_curso" ? "live" : undefined} />
                      <span className="min-w-0">
                        <span className="block truncate text-[15px] font-semibold text-ink">{rowTitle(s)}</span>
                        <span className="mt-0.5 block truncate text-[13px] text-subtle">{rowMeta(s, showSupervisor)}</span>
                        <span className="mt-1 flex min-w-0 items-center gap-1.5 text-[13px] text-ink/80">
                          <StatusDot tone={meta.tone} live={meta.live} />
                          <StatusLine s={s} now={now} />
                        </span>
                      </span>
                      <span className="flex items-center gap-2">
                        {s.crew.length > 0 && <AvatarStack people={s.crew} size={26} max={3} interactive={false} className="max-xl:hidden" />}
                        <ChevronRight className="size-[18px] shrink-0 text-faint" />
                      </span>
                    </button>
                  </motion.li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </motion.div>
  );
}
