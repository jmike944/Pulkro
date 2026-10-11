"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronRight, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCurrentUser, useLookups } from "@/lib/hooks";
import { fmtDay, fmtNum, fmtPct, fmtTime, plural } from "@/lib/format";
import { PersonAvatar, AnimatedNumber } from "@/components/pk/bits";
import { SoftBadge, StatusDot, ToneText } from "@/components/pk/status";
import { EmptyState } from "@/components/pk/feedback";
import { MobileRow } from "@/components/pk/mobile";
import { rowVariants, staggerContainer } from "@/components/pk/motion";
import { dueLabel, lagParts, neededLabel, type EvidenceRequest, type despuesResponse } from "./evidence-data";
import { ALL, ClearFilters, FilterPill } from "./filter-pill";
import { RequestSheet } from "./request-sheet";

type Estado = "abiertas" | "vencidas";

export function PendingTab({
  requests,
  response,
}: {
  requests: EvidenceRequest[];
  response: ReturnType<typeof despuesResponse>;
}) {
  const lk = useLookups();
  const user = useCurrentUser();
  const [sup, setSup] = useState<string>(ALL);
  const [estado, setEstado] = useState<Estado>("abiertas");
  const [active, setActive] = useState<EvidenceRequest | null>(null);
  const [open, setOpen] = useState(false);

  const supOptions = useMemo(() => {
    const counts = new Map<string, number>();
    requests.forEach((r) => counts.set(r.supervisorId, (counts.get(r.supervisorId) ?? 0) + 1));
    return Array.from(counts.entries())
      .map(([id, n]) => ({ id, n, user: lk.users.get(id) }))
      .sort((a, b) => b.n - a.n || (a.user?.name ?? "").localeCompare(b.user?.name ?? ""))
      .map(({ id, n, user }) => ({
        value: id,
        label: user?.name ?? "Supervisor",
        hint: n,
        icon: user ? <PersonAvatar initials={user.initials} hue={user.hue} size={22} /> : undefined,
      }));
  }, [requests, lk.users]);

  const bySup = useMemo(() => (sup === ALL ? requests : requests.filter((r) => r.supervisorId === sup)), [requests, sup]);
  const shown = useMemo(() => (estado === "vencidas" ? bySup.filter((r) => r.overdue) : bySup), [bySup, estado]);
  const stats = useMemo(
    () => ({
      open: bySup.length,
      orders: new Set(bySup.map((r) => r.order.id)).size,
      overdue: bySup.filter((r) => r.overdue).length,
    }),
    [bySup],
  );
  // Prefer the live request (due dates tick with `now`); keep the snapshot once it's resolved and leaves the list.
  const liveActive = (active && requests.find((r) => r.key === active.key)) ?? active;
  const lag = lagParts(response.avgLateMinutes);
  const filtered = sup !== ALL || estado !== "abiertas";

  const openRequest = (r: EvidenceRequest) => {
    setActive(r);
    setOpen(true);
  };

  return (
    <div>
      {/* filters */}
      <div className="flex flex-wrap items-center gap-2.5">
        {(supOptions.length > 1 || sup !== ALL) && (
          <FilterPill label="Supervisor" value={sup} onChange={setSup} options={supOptions} allLabel="Todos los supervisores" />
        )}
        <FilterPill
          label="Estado"
          value={estado}
          onChange={(v) => setEstado(v as Estado)}
          options={[
            { value: "abiertas", label: "Abiertas", hint: bySup.length },
            { value: "vencidas", label: "Vencidas", hint: stats.overdue },
          ]}
        />
        {filtered && (
          <ClearFilters
            onClick={() => {
              setSup(ALL);
              setEstado("abiertas");
            }}
          />
        )}
      </div>

      {/* stat columns */}
      <div className="mt-7 grid grid-cols-3 divide-x divide-hairline">
        <Stat label="Abiertas" dot="amber">
          <AnimatedNumber value={stats.open} className="text-[30px] font-medium leading-none tracking-[-0.04em] text-ink sm:text-[40px]" />
          <StatSub>{plural(stats.orders, "orden afectada", "órdenes afectadas")}</StatSub>
        </Stat>
        <Stat label="Vencidas" dot="red" className="px-3 sm:px-7">
          <AnimatedNumber value={stats.overdue} className="text-[30px] font-medium leading-none tracking-[-0.04em] text-ink sm:text-[40px]" />
          <StatSub>
            {stats.overdue > 0 ? (
              <span className="inline-flex items-center gap-1.5 font-medium text-red-fg">
                <StatusDot tone="red" live /> {user.role === "supervisor" ? "Súbalas hoy" : "Recordar hoy"}
              </span>
            ) : (
              "Ninguna fuera de plazo"
            )}
          </StatSub>
        </Stat>
        <Stat label="Respuesta" dot="blue" className="pl-3 sm:pl-7">
          {response.late > 0 ? (
            <>
              <span className="flex items-baseline gap-1.5">
                <AnimatedNumber
                  value={lag.value}
                  format={{ maximumFractionDigits: 1 }}
                  className="text-[30px] font-medium leading-none tracking-[-0.04em] text-ink sm:text-[40px]"
                />
                <span className="text-[15px] text-subtle">{lag.unit}</span>
              </span>
              <StatSub>promedio · últimos 30 días</StatSub>
            </>
          ) : (
            <>
              <span className="block text-[26px] font-medium leading-none tracking-[-0.03em] text-ink sm:text-[34px]">En sitio</span>
              <StatSub>{response.samples ? `${fmtPct(response.onSiteRate)} antes de la salida` : "Sin salidas en 30 días"}</StatSub>
            </>
          )}
        </Stat>
      </div>

      {/* list */}
      <div className="mt-8">
        {requests.length === 0 ? (
          <EmptyState icon={<Sparkles />} title="Evidencia al día">
            Cada jornada ejecutada tiene sus fotos ANTES y DESPUÉS. ¡Impecable!
          </EmptyState>
        ) : shown.length === 0 ? (
          <EmptyState
            icon={<Sparkles />}
            title="Nada con estos filtros"
            action={
              <ClearFilters
                onClick={() => {
                  setSup(ALL);
                  setEstado("abiertas");
                }}
              />
            }
          >
            {estado === "vencidas" ? "No hay solicitudes vencidas para este filtro." : "No hay solicitudes para este supervisor."}
          </EmptyState>
        ) : (
          <>
            <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)_minmax(0,1.35fr)_132px_20px] gap-5 border-b border-hairline pb-3 text-[12px] font-semibold uppercase tracking-[0.1em] text-subtle lg:grid">
              <span>Supervisor</span>
              <span>Se necesita</span>
              <span>Orden</span>
              <span>Desde</span>
              <span />
            </div>
            <motion.ul variants={staggerContainer(0.05, 0.1)} initial="hidden" animate="show">
              <AnimatePresence mode="popLayout">
                {shown.map((r) => (
                  <RequestRow key={r.key} r={r} selected={open && active?.key === r.key} onOpen={() => openRequest(r)} />
                ))}
              </AnimatePresence>
            </motion.ul>
            <p className="mt-4 text-[12.5px] text-subtle">
              Plazo: fin del día siguiente a la entrada (ANTES) o a la salida (DESPUÉS). {fmtNum(shown.length)} de {fmtNum(requests.length)} solicitudes.
            </p>
          </>
        )}
      </div>

      <RequestSheet request={liveActive} open={open} onOpenChange={setOpen} remaining={requests.length} />
    </div>
  );
}

function Stat({ label, dot, className, children }: { label: string; dot: "amber" | "red" | "blue"; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("min-w-0 pr-3 sm:pr-7", className)}>
      <p className="mb-2.5 flex items-center gap-2 text-[13px] text-subtle sm:text-[14px]">
        <span className={cn("size-[6px] rounded-full", { amber: "bg-st-amber", red: "bg-st-red", blue: "bg-st-blue" }[dot])} />
        {label}
      </p>
      {children}
    </div>
  );
}

function StatSub({ children }: { children: React.ReactNode }) {
  return <span className="mt-2 block text-[12.5px] leading-snug text-subtle sm:text-[13.5px]">{children}</span>;
}

function RequestRow({ r, selected, onOpen }: { r: EvidenceRequest; selected: boolean; onOpen: () => void }) {
  const lk = useLookups();
  const sup = lk.users.get(r.supervisorId);
  const client = lk.clients.get(r.order.clientId);
  const st = lk.serviceTypes.get(r.order.serviceTypeId);
  const tone = r.overdue ? "red" : r.dueInDays === 0 ? "amber" : "slate";
  const need = r.closed ? "Cierre validado sin esta foto" : "Requerido para cierre";
  const supShort = sup?.name.split(" ").slice(0, 2).join(" ");
  return (
    <motion.li layout="position" variants={rowVariants} exit={{ opacity: 0, x: 24, transition: { duration: 0.25 } }}>
      {/* phones & tablets */}
      <MobileRow
        className="lg:hidden"
        onClick={onOpen}
        leading={sup && <PersonAvatar name={sup.name} initials={sup.initials} hue={sup.hue} size={44} />}
        title={
          <>
            {neededLabel(r)}
            {/* compliance exception: the order was already validated without this photo */}
            {r.closed && (
              <>
                {/* a plain space (not a margin) so the badge sits flush left when it wraps to the second line */}{" "}
                <SoftBadge tone="amber" className="whitespace-nowrap align-middle">
                  {need}
                </SoftBadge>
              </>
            )}
          </>
        }
        meta={
          // two lines so the "since" time is never ellipsized (MobileRow meta is single-line); service type goes last so it truncates first
          <span className="min-w-0 whitespace-normal">
            <span className="block truncate">
              {r.order.folio} · {client?.shortName}
              {st ? ` · ${st.name}` : ""}
            </span>
            <span className="block tabular">
              Desde {fmtDay(r.since)}, {fmtTime(r.since)}
            </span>
          </span>
        }
        status={{ tone, label: `${dueLabel(r)} · ${supShort ?? "Supervisor"}`, live: r.overdue }}
      />
      {/* desktop table row */}
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${neededLabel(r)} · ${r.order.folio}`}
        className={cn(
          "group -mx-3 hidden w-[calc(100%+1.5rem)] grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)_minmax(0,1.35fr)_132px_20px] items-center gap-5 rounded-[14px] border-b border-hairline px-3 py-4 text-left transition-colors hover:bg-wash lg:grid",
          selected && "bg-blue-wash hover:bg-blue-wash",
        )}
      >
        <span className="flex min-w-0 items-center gap-3">
          {sup && <PersonAvatar name={sup.name} initials={sup.initials} hue={sup.hue} size={34} />}
          <span className="min-w-0">
            <span className="block truncate text-[14.5px] font-medium text-ink">{supShort}</span>
            <span className="block truncate text-[12.5px] text-subtle">{sup ? lk.units.get(sup.unitId)?.name : ""}</span>
          </span>
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[14.5px] font-semibold text-ink transition-colors group-hover:text-link">{neededLabel(r)}</span>
          <span className="block truncate text-[12.5px] text-subtle">{need}</span>
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[14.5px] font-medium text-ink tabular">{r.order.folio}</span>
          <span className="block truncate text-[12.5px] text-subtle">
            {st?.name} · {client?.shortName}
          </span>
        </span>
        <span>
          <span className="block text-[14px] text-ink tabular">
            {fmtDay(r.since)}, {fmtTime(r.since)}
          </span>
          <ToneText tone={tone} className="flex items-center gap-1.5 text-[12.5px] font-medium">
            {r.overdue && <StatusDot tone="red" live />}
            {dueLabel(r)}
          </ToneText>
        </span>
        <ChevronRight className="size-4 text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-ink" />
      </button>
    </motion.li>
  );
}
