"use client";

import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { motion } from "motion/react";
import { Cloud, CloudOff, History, LoaderCircle, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/lib/store";
import { fmtAgo, fmtRelativeDay, fmtTime } from "@/lib/format";
import type { AuditEntity, AuditEntry, SyncState } from "@/lib/types";
import { PersonAvatar } from "@/components/pk/bits";
import { EmptyState } from "@/components/pk/feedback";
import { rowVariants, staggerContainer } from "@/components/pk/motion";
import { Segmented } from "@/components/pk/page";
import { useOrder } from "./order-context";

type Filter = "todo" | "orden" | "campo" | "evidencia" | "reporte" | "postventa";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "todo", label: "Todo" },
  { value: "orden", label: "Orden" },
  { value: "campo", label: "Campo" },
  { value: "evidencia", label: "Evidencia" },
  { value: "reporte", label: "Reporte" },
  { value: "postventa", label: "Postventa" },
];

const GROUP: Record<AuditEntity, Filter> = {
  orden: "orden",
  jornada: "campo",
  incidencia: "campo",
  foto: "evidencia",
  reporte: "reporte",
  caso: "postventa",
  encuesta: "postventa",
  catalogo: "orden",
  usuario: "orden",
};

const SYNC: Record<SyncState, { label: string; cls: string; icon: React.ReactNode }> = {
  sincronizado: { label: "Sincronizado", cls: "bg-[#e7f7f4] text-st-teal", icon: <Cloud className="size-3" /> },
  sincronizando: { label: "Sincronizando", cls: "bg-[#edf4ff] text-link", icon: <LoaderCircle className="size-3 animate-spin" /> },
  pendiente: { label: "Pendiente", cls: "bg-[#fff6e6] text-[#b86e00]", icon: <CloudOff className="size-3" /> },
  error: { label: "Error", cls: "bg-[#fdeeee] text-st-red", icon: <TriangleAlert className="size-3" /> },
};

/** Actividad: audit trail — who, what, why and when, plus its sync state (doc §3, §6). */
export function ActivityTab() {
  const { d } = useOrder();
  const { audit, lk } = d;
  const queue = useAppStore((s) => s.sync.queue);
  const [filter, setFilter] = useState<Filter>("todo");

  const syncOf = useMemo(() => {
    const m = new Map<string, SyncState>();
    queue.forEach((q) => m.set(`${q.entityId}|${q.at}`, q.state));
    return m;
  }, [queue]);

  const groups = useMemo(() => {
    const rows = [...audit].sort((a, b) => b.at.localeCompare(a.at)).filter((a) => filter === "todo" || GROUP[a.entity] === filter);
    const out: { day: string; label: string; rows: AuditEntry[] }[] = [];
    rows.forEach((r) => {
      const day = format(parseISO(r.at), "yyyy-MM-dd");
      const last = out.at(-1);
      if (last?.day === day) last.rows.push(r);
      else out.push({ day, label: fmtRelativeDay(r.at), rows: [r] });
    });
    return out;
  }, [audit, filter]);

  const pending = audit.filter((a) => {
    const s = syncOf.get(`${a.entityId}|${a.at}`);
    return s === "pendiente" || s === "error";
  }).length;

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-[19px] font-medium tracking-[-0.01em] text-ink">Actividad · {audit.length}</h2>
          <p className="mt-1 text-[13.5px] text-subtle">
            Cada cambio queda registrado con usuario, fecha y motivo.
            {pending > 0 && <b className="ml-1 font-semibold text-[#b86e00]">{pending} sin sincronizar.</b>}
          </p>
        </div>
        <div className="scrollbar-none -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <Segmented id="actividad-filtro" items={FILTERS} value={filter} onChange={setFilter} />
        </div>
      </div>

      {groups.length === 0 ? (
        <EmptyState icon={<History />} title="Sin movimientos">
          No hay registros para este filtro.
        </EmptyState>
      ) : (
        <div className="space-y-8">
          {groups.map((g) => (
            <section key={g.day}>
              <p className="mb-1 text-[12px] font-semibold uppercase tracking-[0.1em] text-subtle">{g.label}</p>
              <motion.ul variants={staggerContainer(0.035, 0.05)} initial="hidden" animate="show">
                {g.rows.map((a) => {
                  const user = a.by === "cliente" ? undefined : lk.users.get(a.by);
                  const name = a.by === "cliente" ? "Cliente" : (user?.name ?? "Usuario");
                  const state = syncOf.get(`${a.entityId}|${a.at}`) ?? "sincronizado";
                  const s = SYNC[state];
                  return (
                    <motion.li key={a.id} variants={rowVariants} className="grid grid-cols-[36px_minmax(0,1fr)] gap-3 border-b border-hairline py-4 last:border-b-0 sm:grid-cols-[36px_minmax(0,1fr)_auto] sm:gap-4">
                      {user ? (
                        <PersonAvatar name={user.name} initials={user.initials} hue={user.hue} size={36} />
                      ) : (
                        <span className="inline-flex size-9 items-center justify-center rounded-full bg-sky-soft text-[11px] font-semibold text-[#1667e0]">CL</span>
                      )}
                      <div className="min-w-0">
                        <p className="text-[14.5px] leading-snug text-ink">
                          <span className="font-semibold">{name}</span> <span className="text-ink/85">{lowerFirst(a.action)}</span>
                        </p>
                        {a.reason && (
                          <p className="mt-1.5 border-l-2 border-[#d6e6fb] pl-3 text-[13.5px] leading-relaxed text-subtle">
                            <span className="font-medium text-ink/70">Motivo:</span> {a.reason}
                          </p>
                        )}
                        <p className="mt-1.5 flex flex-wrap items-center gap-2 text-[12.5px] text-subtle sm:hidden">
                          <span className="tabular">{fmtTime(a.at)}</span>
                          <SyncChip s={s} />
                        </p>
                      </div>
                      <div className="hidden flex-col items-end gap-1.5 text-right sm:flex">
                        <span className="text-[13.5px] font-medium text-ink tabular" title={fmtAgo(a.at)}>
                          {fmtTime(a.at)}
                        </span>
                        <SyncChip s={s} />
                      </div>
                    </motion.li>
                  );
                })}
              </motion.ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function SyncChip({ s }: { s: (typeof SYNC)[SyncState] }) {
  return <span className={cn("inline-flex h-[22px] items-center gap-1 rounded-md px-2 text-[11.5px] font-semibold", s.cls)}>{s.icon}{s.label}</span>;
}

/** "Cambió estado a…" → "cambió estado a…" so it reads after the user's name. */
function lowerFirst(s: string) {
  return s.charAt(0).toLowerCase() + s.slice(1);
}
