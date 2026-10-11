"use client";

import { useCallback, useLayoutEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion, type Variants } from "motion/react";
import { addDays, startOfDay } from "date-fns";
import { ChevronLeft, ChevronRight, Info, MapIcon, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMediaQuery, useNow } from "@/lib/hooks";
import { fmtTime, plural } from "@/lib/format";
import { toneDot } from "@/lib/status";
import { PageHeader } from "@/components/pk/page";
import { PersonAvatar } from "@/components/pk/bits";
import { StatusDot } from "@/components/pk/status";
import { EmptyState } from "@/components/pk/feedback";
import { EASE } from "@/components/pk/motion";
import { ReasonTip } from "@/components/pk/reason-tip";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { DocTag } from "@/features/configuracion/shared";
import { dayKey, longDay, parseFecha } from "@/features/agenda/agenda-model";
import { INCIDENT_TONE, SERVICE_STATUS, matchesStatus, siteNudges, statusCounts, type StatusFilter } from "./mapa-model";
import { useMapaData } from "./use-mapa-data";
import { ServiceMap, type MapaPin } from "./service-map";
import { ServiceList } from "./service-list";
import { ServiceSheet } from "./service-sheet";
import { StatusStrip } from "./status-strip";

const labelSlide: Variants = {
  hidden: (d: number) => ({ opacity: 0, y: d * 8 }),
  show: { opacity: 1, y: 0, transition: { duration: 0.28, ease: EASE } },
  exit: (d: number) => ({ opacity: 0, y: d * -8, transition: { duration: 0.12 } }),
};

const ALL = "all";

/**
 * Mapa del día (PROPUESTO — beyond the requirements doc; supports §4.2 "supervisión presencial y remota"): every service of a day
 * at its site, colored by status (por iniciar · en curso · terminada) with an open-incident badge, next to the list of the same
 * services. Role-scoped through useScopedData. `?dia=yyyy-MM-dd` picks the day (missing = today). Honest by design: pins are the
 * sites, and status/locations come from the entrada/salida stamps — never live tracking.
 */
export function MapaView() {
  const searchParams = useSearchParams();
  const now = useNow(30_000);
  const todayK = dayKey(now);
  const day = parseFecha(searchParams.get("dia"), now);
  const key = dayKey(day);
  const isToday = key === todayK;
  const desktop = useMediaQuery("(min-width: 1024px)");
  const coarse = useMediaQuery("(pointer: coarse)");

  const { user, services, supervisors, scopeLabel } = useMapaData(key, todayK);
  const manager = user.role !== "supervisor";

  const [dir, setDir] = useState(1);
  const [status, setStatus] = useState<StatusFilter>("todos");
  const [supChoice, setSupChoice] = useState<string>(ALL);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Activity keeps this route alive in the background: drop transient overlays when it hides.
  useLayoutEffect(
    () => () => {
      setSheetOpen(false);
      setHoverId(null);
    },
    [],
  );

  /* ── filters (supervisor first: the status counts follow it) ── */
  const showSupFilter = manager && supervisors.length > 1;
  const sup = showSupFilter && supervisors.some((s) => s.id === supChoice) ? supChoice : ALL;
  const bySup = useMemo(() => (sup === ALL ? services : services.filter((s) => s.order.supervisorId === sup)), [services, sup]);
  const counts = useMemo(() => statusCounts(bySup), [bySup]);
  const visible = useMemo(() => bySup.filter((s) => matchesStatus(s, status)), [bySup, status]);

  const selected = services.find((s) => s.id === selectedId) ?? null;
  const activeId = hoverId ?? (selected && visible.includes(selected) ? selected.id : null);

  const pins = useMemo<MapaPin[]>(() => {
    const nudges = siteNudges(visible);
    return visible.flatMap((s) => {
      if (!s.site) return [];
      const st = SERVICE_STATUS[s.status];
      const alert = s.openIncidents.length > 0;
      const name = s.client?.shortName ?? s.order.folio;
      return [
        {
          id: s.id,
          lat: s.site.lat,
          lng: s.site.lng,
          tone: st.tone,
          live: s.status === "en_curso",
          alert,
          label: `${fmtTime(s.j.plannedStart)} · ${name}`,
          title: `${name}, ${s.site.name}: ${st.label.toLowerCase()}${alert ? ", con incidencia abierta" : ""}`,
          nudge: nudges.get(s.id) ?? 0,
        },
      ];
    });
  }, [visible]);
  const fitKey = pins.map((p) => `${p.id}@${p.lat},${p.lng}`).join("|");

  /* ── day navigation (URL ?dia=, replaceState like the Agenda) ── */
  const go = (d: Date) => {
    const k = dayKey(d);
    setDir(k >= key ? 1 : -1);
    setHoverId(null);
    setSheetOpen(false);
    setSelectedId(null);
    const params = new URLSearchParams(window.location.search);
    if (k === todayK) params.delete("dia");
    else params.set("dia", k);
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
  };

  const select = useCallback(
    (id: string) => {
      setSelectedId(id);
      setSheetOpen(true);
    },
    [setSelectedId, setSheetOpen],
  );

  /* ── copy ── */
  const when = isToday ? "hoy" : `el ${longDay(day).toLowerCase()}`;
  const description =
    counts.todos === 0 ? (
      <>Sin servicios {when} en su alcance.</>
    ) : (
      <>
        <b>{counts.en_curso} en curso</b>, <b>{plural(counts.terminada, "terminada", "terminadas")}</b> y <b>{counts.por_iniciar} por iniciar</b> {when}
        {counts.incidencia > 0 ? (
          <>
            ; <b>{counts.incidencia} con incidencia abierta</b>.
          </>
        ) : (
          "."
        )}
      </>
    );

  const listKey = `${key}-${status}-${sup}`;

  return (
    <div>
      <PageHeader
        title="Mapa del día"
        titleAddon={<ProposedTag />}
        description={description}
        actions={
          <>
            <Button variant="outline" onClick={() => go(startOfDay(now))} className="h-11 rounded-[12px] border-line px-4 text-[14px] font-semibold shadow-[0_1px_2px_rgb(16_24_40/0.05)] lg:h-10">
              Hoy
            </Button>
            <div className="flex items-center rounded-[12px] border border-line bg-surface p-0.5 shadow-[0_1px_2px_rgb(16_24_40/0.05)]">
              <button
                type="button"
                onClick={() => go(addDays(day, -1))}
                aria-label="Día anterior"
                className="inline-flex size-11 items-center justify-center rounded-[10px] text-ink transition hover:bg-muted active:scale-95 lg:size-10"
              >
                <ChevronLeft className="size-[18px]" />
              </button>
              <span className="h-5 w-px bg-hairline" />
              <button
                type="button"
                onClick={() => go(addDays(day, 1))}
                aria-label="Día siguiente"
                className="inline-flex size-11 items-center justify-center rounded-[10px] text-ink transition hover:bg-muted active:scale-95 lg:size-10"
              >
                <ChevronRight className="size-[18px]" />
              </button>
            </div>
          </>
        }
      />

      {/* ── day + supervisor ── */}
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <AnimatePresence mode="wait" initial={false} custom={dir}>
            <motion.h2
              key={key}
              custom={dir}
              variants={labelSlide}
              initial="hidden"
              animate="show"
              exit="exit"
              aria-live="polite"
              className="text-[22px] font-medium tracking-[-0.02em] text-ink sm:text-[24px]"
            >
              {isToday ? `Hoy, ${longDay(day).toLowerCase()}` : longDay(day)}
            </motion.h2>
          </AnimatePresence>
          <p className="mt-0.5 text-[13px] text-subtle">
            {scopeLabel} · {plural(bySup.length, "servicio", "servicios")}
          </p>
        </div>
        {showSupFilter && <SupervisorSelect supervisors={supervisors} value={sup} onChange={setSupChoice} />}
      </div>

      <StatusStrip counts={counts} value={status} onChange={setStatus} />

      {/* ── map + list ── */}
      <div className="mt-5 grid gap-6 lg:mt-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] lg:items-start lg:gap-8">
        <div className="min-w-0 lg:sticky lg:top-6">
          <ServiceMap
            pins={pins}
            fitKey={fitKey}
            activeId={activeId}
            selectedId={selected?.id ?? null}
            onSelect={select}
            onHover={setHoverId}
            className="h-[45dvh] min-h-[260px] lg:h-[clamp(420px,calc(var(--pk-pane-h)-150px),700px)]"
          />
          <MapCaption touch={coarse} />
        </div>

        <section aria-label="Servicios del día" className="min-w-0">
          {services.length === 0 ? (
            <EmptyState
              icon={<MapIcon />}
              title={isToday ? "Sin servicios hoy" : "Sin servicios este día"}
              action={
                !isToday && (
                  <Button variant="outline" onClick={() => go(startOfDay(now))} className="h-11 rounded-[12px] border-line px-4 font-semibold">
                    Ir a hoy
                  </Button>
                )
              }
            >
              No hay jornadas programadas {when} en su alcance.
            </EmptyState>
          ) : visible.length === 0 ? (
            <EmptyState
              icon={<SlidersHorizontal />}
              title="Nada con este filtro"
              action={
                <Button variant="outline" onClick={() => setStatus("todos")} className="h-11 rounded-[12px] border-line px-4 font-semibold">
                  Ver todos
                </Button>
              }
            >
              Ningún servicio {when} coincide con el estado elegido.
            </EmptyState>
          ) : (
            <ServiceList
              services={visible}
              now={now}
              activeId={activeId}
              selectedId={selected?.id ?? null}
              onSelect={select}
              onHover={setHoverId}
              showSupervisor={manager}
              revealSelected={desktop}
              animKey={listKey}
            />
          )}
        </section>
      </div>

      <ServiceSheet service={selected} open={sheetOpen && !!selected} onOpenChange={setSheetOpen} now={now} />
    </div>
  );
}

/** "PROPUESTO" next to the title, with the reason on hover / tap. */
function ProposedTag() {
  return (
    <ReasonTip
      icon={null}
      reason="Pantalla propuesta: no está en el documento de requerimientos. Apoya la supervisión presencial y remota (§4.2)."
      contentClassName="max-w-[260px] text-[12.5px] leading-snug"
    >
      <span tabIndex={0} aria-label="Propuesto: pantalla fuera del documento de requerimientos" className="inline-flex rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
        <DocTag status="propuesto" />
      </span>
    </ReasonTip>
  );
}

/** Legend + the honest note: pins are sites; status and locations come from entrada/salida, not live tracking. */
function MapCaption({ touch }: { touch: boolean }) {
  return (
    <div className="mt-3 space-y-2 px-1 text-[12.5px] text-subtle">
      <ul aria-label="Leyenda del mapa" className="flex flex-wrap gap-x-4 gap-y-1.5">
        {(["en_curso", "terminada", "por_iniciar"] as const).map((st) => (
          <li key={st} className="flex items-center gap-1.5">
            <StatusDot tone={SERVICE_STATUS[st].tone} />
            {SERVICE_STATUS[st].label}
          </li>
        ))}
        <li className="flex items-center gap-1.5">
          <span aria-hidden className={cn("inline-grid size-[14px] place-items-center rounded-full text-[9px] font-bold leading-none text-white", toneDot[INCIDENT_TONE])}>
            !
          </span>
          Con incidencia abierta
        </li>
      </ul>
      <p className="flex items-start gap-1.5 leading-snug">
        <Info className="mt-px size-3.5 shrink-0" />
        <span>
          Cada punto es el sitio del servicio. El estado y las ubicaciones salen de los registros de entrada y salida; no es un rastreo en tiempo real.
          {touch && " Use dos dedos para mover el mapa."}
        </span>
      </p>
    </div>
  );
}

/** Dirección / Administración: narrow map, counts and list to one supervisor. */
function SupervisorSelect({
  supervisors,
  value,
  onChange,
}: {
  supervisors: { id: string; name: string; initials: string; hue: number; count: number }[];
  value: string;
  onChange: (v: string) => void;
}) {
  const current = supervisors.find((s) => s.id === value);
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        aria-label="Supervisor"
        className={cn(
          "w-full rounded-[12px] border-hairline bg-surface px-3 text-[14px] shadow-[0_1px_2px_rgb(16_24_40/0.03)] transition hover:border-line-strong data-[size=default]:h-11 sm:w-auto sm:min-w-[220px] lg:data-[size=default]:h-10",
          current && "border-blue-line bg-blue-wash hover:border-blue-line",
        )}
      >
        <span className="min-w-0 truncate text-left">
          <span className={cn(current ? "text-subtle" : "text-ink")}>Supervisor</span>
          <span className="text-subtle">: </span>
          <span className="font-semibold text-ink">{current?.name ?? "Todos"}</span>
        </span>
      </SelectTrigger>
      <SelectContent position="popper" align="end" className="max-h-[340px] min-w-[240px] rounded-[14px] p-1">
        <SelectItem value={ALL} className="h-10 rounded-[10px]">
          Todos
        </SelectItem>
        {supervisors.map((s) => (
          <SelectItem key={s.id} value={s.id} className="h-10 rounded-[10px]">
            <PersonAvatar initials={s.initials} hue={s.hue} size={22} />
            {s.name}
            <span className="text-[12.5px] text-subtle tabular">{s.count}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
