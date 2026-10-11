"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronRight, Info, Search, UserPlus, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtDay, fmtHours } from "@/lib/format";
import { PersonAvatar } from "@/components/pk/bits";
import { EmptyState } from "@/components/pk/feedback";
import { Segmented } from "@/components/pk/page";
import { TonePill } from "@/components/pk/status";
import { EASE } from "@/components/pk/motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Gate } from "@/features/agenda/gate";
import { isAssigned, isAvailableToday, type TeamData, type WorkerStat } from "./use-team";

type Avail = "todos" | "disponibles" | "asignados";

export const REASON_CATALOG = "Solo Dirección y Administración administran el catálogo de personal.";

/**
 * Rows drive their own entrance (initial/animate on the <motion.li>, stagger via `custom` index) instead of inheriting "show" from the <ul>.
 * The inner <AnimatePresence> resets the presence context, so under the page's `<AnimatePresence initial={false}>` a parent-driven list
 * deadlocks: the <ul> is initial-blocked (never animates) while its rows start hidden and wait for it to push "show".
 */
const rowIn = {
  hidden: { opacity: 0, y: 8 },
  show: (i: number = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE, delay: Math.min(0.5, i * 0.03) } }),
};

/** Personal: searchable / filterable cleaning staff with today's availability and assigned hours. */
export function PersonalTab({
  data,
  onOpen,
  canCatalog,
  onAdd,
}: {
  data: TeamData;
  onOpen: (workerId: string) => void;
  canCatalog: boolean;
  onAdd: () => void;
}) {
  const [q, setQ] = useState("");
  const [unit, setUnit] = useState("all");
  const [spec, setSpec] = useState("all");
  const [avail, setAvail] = useState<Avail>("todos");
  const [showInactive, setShowInactive] = useState(false);

  const specialties = useMemo(() => Array.from(new Set(data.team.map((w) => w.specialty))).sort((a, b) => a.localeCompare(b)), [data.team]);
  const units = useMemo(() => Array.from(new Map(data.stats.map((s) => [s.worker.unitId, s.unit] as const)).entries()), [data.stats]);
  const inactive = data.stats.filter((s) => !s.worker.active).length;

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return data.stats.filter((s) => {
      if (!showInactive && !s.worker.active) return false;
      if (unit !== "all" && s.worker.unitId !== unit) return false;
      if (spec !== "all" && s.worker.specialty !== spec) return false;
      if (avail === "disponibles" && !isAvailableToday(s.today.kind)) return false;
      if (avail === "asignados" && !isAssigned(s.today.kind)) return false;
      if (needle && !`${s.worker.name} ${s.worker.specialty} ${s.worker.phone}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [data.stats, q, unit, spec, avail, showInactive]);

  // Phone cards have no room for the number: show it when the search is by phone so the match is explainable.
  const phoneQuery = /\d{3,}/.test(q);
  const filtered = q || unit !== "all" || spec !== "all" || avail !== "todos";
  const reset = () => {
    setQ("");
    setUnit("all");
    setSpec("all");
    setAvail("todos");
  };

  const lgCols = data.multiUnit
    ? "lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_88px_172px_76px_104px_minmax(0,1fr)_20px]"
    : "lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_172px_76px_104px_minmax(0,1fr)_20px]";
  const mdCols = "md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_164px_72px_96px_20px]";

  return (
    <div>
      {/* toolbar */}
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-subtle" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nombre, especialidad o teléfono"
            aria-label="Buscar personal"
            className="h-11 rounded-[14px] bg-surface pl-10 text-[15px]"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {data.multiUnit && (
            <Select value={unit} onValueChange={setUnit}>
              <SelectTrigger aria-label="Unidad" className="h-11 min-w-[150px] rounded-[14px] bg-surface px-3.5 text-[14px] data-[size=default]:h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                <SelectItem value="all">Todas las unidades</SelectItem>
                {units.map(([id, u]) => (
                  <SelectItem key={id} value={id}>
                    {u?.name ?? id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={spec} onValueChange={setSpec}>
            <SelectTrigger aria-label="Especialidad" className="h-11 min-w-[170px] rounded-[14px] bg-surface px-3.5 text-[14px] data-[size=default]:h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectItem value="all">Todas las especialidades</SelectItem>
              {specialties.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Gate allowed={canCatalog} reason={REASON_CATALOG}>
            <Button onClick={onAdd} disabled={!canCatalog} className="h-11 rounded-[14px] px-4 text-[14px] font-semibold">
              <UserPlus className="size-4" /> Nuevo
            </Button>
          </Gate>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Segmented
          id="equipo-avail"
          items={[
            { value: "todos", label: "Todos" },
            { value: "disponibles", label: "Disponibles hoy" },
            { value: "asignados", label: "Asignados hoy" },
          ]}
          value={avail}
          onChange={setAvail}
          className="[&>button]:min-h-10 sm:[&>button]:min-h-0"
        />
        <div className="flex items-center gap-4">
          <span className="text-[13px] text-subtle tabular">
            <b className="font-semibold text-ink">{rows.length}</b> de {data.stats.length}
          </span>
          {inactive > 0 && (
            <label className="flex min-h-10 items-center gap-2 text-[13px] text-subtle">
              <Switch checked={showInactive} onCheckedChange={setShowInactive} aria-label="Mostrar inactivos" />
              Inactivos ({inactive})
            </label>
          )}
        </div>
      </div>

      {data.user.role === "supervisor" && (
        <p className="mb-4 flex items-start gap-2 rounded-[14px] bg-blue-wash px-4 py-3 text-[13px] leading-snug text-ink/80">
          <Info className="mt-0.5 size-4 shrink-0 text-azure-fg" />
          Jornadas, horas y último servicio consideran solo sus órdenes. La disponibilidad de hoy considera a toda la unidad.
        </p>
      )}

      {rows.length === 0 ? (
        <EmptyState
          icon={<Users />}
          title="Sin coincidencias"
          action={
            filtered ? (
              <Button variant="outline" onClick={reset} className="h-10 rounded-[12px] px-4 font-semibold">
                Limpiar filtros
              </Button>
            ) : undefined
          }
        >
          Nadie del personal coincide con la búsqueda o los filtros.
        </EmptyState>
      ) : (
        <div>
          <div
            className={cn(
              "hidden gap-4 border-b border-hairline px-2 pb-3 text-[12px] font-semibold uppercase tracking-[0.1em] text-subtle md:grid",
              mdCols,
              lgCols,
            )}
          >
            <span>Persona</span>
            <span>Especialidad</span>
            {data.multiUnit && <span className="hidden lg:block">Unidad</span>}
            <span>Hoy</span>
            <span className="text-right">Semana</span>
            <span className="text-right" title="Suma de la duración de las jornadas donde la persona está en la cuadrilla">
              Horas asig.
            </span>
            <span className="hidden lg:block">Último servicio</span>
            <span />
          </div>
          <ul className="max-md:space-y-2.5">
            <AnimatePresence>
              {rows.map((s, i) => (
                <WorkerRow key={s.worker.id} s={s} i={i} onOpen={onOpen} multiUnit={data.multiUnit} showPhone={phoneQuery} cols={cn(mdCols, lgCols)} />
              ))}
            </AnimatePresence>
          </ul>
          <p className="mt-4 text-[12.5px] text-subtle">
            <b className="font-semibold text-ink">Horas asig.</b> = horas de jornada asignada: suma de la duración de las jornadas de la semana donde la persona está en la cuadrilla (real si
            la jornada cerró, planeada si no). No mide tiempo individual.
          </p>
        </div>
      )}
    </div>
  );
}

function WorkerRow({ s, i, onOpen, multiUnit, showPhone, cols }: { s: WorkerStat; i: number; onOpen: (id: string) => void; multiUnit: boolean; showPhone: boolean; cols: string }) {
  const { worker: w, today } = s;
  return (
    <motion.li
      layout="position"
      custom={i}
      variants={rowIn}
      initial="hidden"
      animate="show"
      exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.15 } }}
      transition={{ type: "spring", stiffness: 420, damping: 34 }}
    >
      <button
        type="button"
        onClick={() => onOpen(w.id)}
        aria-label={`Ver perfil de ${w.name}`}
        className={cn(
          "group w-full text-left outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
          // phones: card
          "flex items-center gap-3 rounded-[18px] border border-hairline bg-surface p-3.5 shadow-[0_1px_2px_rgb(16_24_40/0.04)]",
          // tablet+: table row
          "md:grid md:items-center md:gap-4 md:rounded-[12px] md:border-0 md:border-b md:border-hairline md:bg-transparent md:px-2 md:py-3.5 md:shadow-none md:hover:bg-wash",
          cols,
          !w.active && "opacity-60",
        )}
      >
        <span className="flex min-w-0 flex-1 items-center gap-3 md:flex-none">
          <PersonAvatar name={w.name} initials={w.initials} hue={w.hue} size={40} />
          <span className="min-w-0">
            <span className="block truncate text-[15px] font-semibold text-ink transition-colors group-hover:text-link">{w.name}</span>
            <span className="block truncate text-[12.5px] text-subtle md:tabular">
              <span className="md:hidden">
                {w.specialty}
                {multiUnit && s.unit ? ` · ${s.unit.code}` : ""}
              </span>
              <span className="hidden md:inline">{w.phone}</span>
            </span>
            {showPhone && <span className="block truncate text-[12.5px] text-subtle tabular md:hidden">{w.phone}</span>}
            {/* the md grid has no Unidad column and the Persona cell is too narrow to share the phone's line */}
            {multiUnit && s.unit && <span className="hidden truncate text-[12.5px] text-subtle md:block lg:hidden">{s.unit.name}</span>}
            <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 md:hidden">
              <TonePill tone={today.tone} live={today.live} className="text-[12px]">
                {today.label}
              </TonePill>
              <span className="text-[12px] text-subtle tabular">
                {s.weekJornadas} jor. · {fmtHours(s.weekMinutes)}
              </span>
            </span>
            {/* phones: the order(s) behind today's pill (from md the "Hoy" cell has it) */}
            {today.detail && <span className="mt-1 block text-[12.5px] leading-snug text-subtle tabular md:hidden">{today.detail}</span>}
            {/* phones: the "Último servicio" column only exists from lg (at md it rides the "Hoy" cell) */}
            <span className="mt-1 line-clamp-2 text-[12.5px] leading-snug text-subtle tabular md:hidden">
              {s.last ? `Último: ${[s.last.client, fmtDay(s.last.date), s.last.folio].filter(Boolean).join(" · ")}` : "Último: sin servicios"}
            </span>
          </span>
        </span>
        <span className="hidden truncate text-[14px] text-ink md:block">{w.specialty}</span>
        {multiUnit && <span className="hidden text-[13.5px] text-subtle lg:block">{s.unit?.code}</span>}
        <span className="hidden min-w-0 md:block">
          <TonePill tone={today.tone} live={today.live} className="max-w-full">
            <span className="truncate">{today.label}</span>
          </TonePill>
          {today.detail && <span className="mt-1 block truncate text-[12px] text-subtle">{today.detail}</span>}
          {/* md only: date first so it survives the truncation */}
          <span className="mt-0.5 block truncate text-[12px] text-subtle tabular lg:hidden">
            {s.last ? `Último: ${[fmtDay(s.last.date), s.last.client].filter(Boolean).join(" · ")}` : "Último: sin servicios"}
          </span>
        </span>
        <span className="hidden text-right text-[15px] font-semibold text-ink tabular md:block">{s.weekJornadas || "—"}</span>
        <span className="hidden text-right text-[15px] font-semibold text-ink tabular md:block">{s.weekMinutes ? fmtHours(s.weekMinutes) : "—"}</span>
        <span className="hidden min-w-0 text-[13px] lg:block">
          {s.last ? (
            <>
              <span className="block truncate text-ink">{s.last.client}</span>
              <span className="block truncate text-subtle tabular">
                {fmtDay(s.last.date)} · {s.last.folio}
              </span>
            </>
          ) : (
            <span className="text-subtle">Sin servicios</span>
          )}
        </span>
        <ChevronRight className="size-4 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5" />
      </button>
    </motion.li>
  );
}
