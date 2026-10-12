"use client";

import { motion } from "motion/react";
import { Eye, ShieldQuestion } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCurrentUser } from "@/lib/hooks";
import { PERMISSION_ROWS, can, cellStatus, type PermissionRow } from "@/lib/permissions";
import { ROLE_LABEL } from "@/lib/status";
import type { Role } from "@/lib/types";
import { SectionHeader } from "@/components/pk/bits";
import { EASE } from "@/components/pk/motion";
import { ReasonTip } from "@/components/pk/reason-tip";
import { DOC_STATUS, DocTag, ROLES, ROLE_SHORT, type DocStatus } from "./shared";

const LEGEND: [DocStatus, string][] = [
  ["confirmado", "decidido por Pulkro"],
  ["propuesto", "sujeto a aprobación"],
  ["pendiente", "por definir"],
];

const PENDING_DECISIONS = [
  {
    q: "¿Quién crea usuarios y recupera cuentas?",
    now: "En el prototipo solo Dirección da de alta, edita y desactiva usuarios.",
  },
  {
    q: "¿Quién edita órdenes cerradas?",
    now: "Solo el supervisor de la orden la reabre: exige motivo, una nueva validación de cierre y genera una nueva versión del reporte. Administración y Dirección no reabren.",
  },
  {
    q: "¿Quién ve información de otras unidades?",
    now: "Dirección ve todas o filtra por unidad; Administración solo su unidad; Supervisor solo sus asignaciones.",
  },
];

/** Role × action matrix with animated marks and the doc's scope tag per row. */
export function PermissionMatrix() {
  const me = useCurrentUser();
  return (
    <section>
      <SectionHeader
        title="Matriz de permisos"
        subtitle="Roles y acciones del documento maestro. La columna resaltada es su rol actual."
      />

      <div className="overflow-hidden rounded-[22px] border border-hairline bg-surface shadow-soft">
        <div className="grid grid-cols-[minmax(0,1fr)_repeat(3,46px)] items-end gap-x-1 border-b border-hairline px-4 pb-3 pt-4 text-[12px] font-semibold uppercase tracking-[0.1em] text-subtle sm:grid-cols-[minmax(0,1fr)_repeat(3,96px)] sm:px-5 md:grid-cols-[minmax(0,1fr)_repeat(3,112px)_124px]">
          <span>Acción</span>
          {ROLES.map((r) => (
            <span key={r} className={cn("relative flex flex-col items-center gap-1 text-center", r === me.role && "text-ink")}>
              {r === me.role && (
                <motion.span layoutId="matrix-you" className="rounded-md bg-sky-soft px-1.5 py-0.5 text-[10px] tracking-[0.08em] text-azure-fg">
                  USTED
                </motion.span>
              )}
              <span className="sm:hidden">{ROLE_SHORT[r]}</span>
              <span className="hidden sm:inline">{ROLE_LABEL[r]}</span>
            </span>
          ))}
          <span className="hidden text-right md:block">Estado</span>
        </div>

        <ul>
          {PERMISSION_ROWS.map((row, ri) => (
            <motion.li
              key={row.action}
              initial={{ opacity: 0, y: 6 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.35, ease: EASE, delay: ri * 0.03 }}
              className="grid grid-cols-[minmax(0,1fr)_repeat(3,46px)] items-center gap-x-1 border-b border-hairline px-4 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_repeat(3,96px)] sm:px-5 md:grid-cols-[minmax(0,1fr)_repeat(3,112px)_124px]"
            >
              <div className="min-w-0 py-3.5">
                <p className="text-[14px] font-medium leading-snug text-ink">{row.label}</p>
                {row.note && <p className="mt-1 text-[12.5px] leading-snug text-subtle">{row.note}</p>}
                <DocTag status={row.status} className="mt-1.5 md:hidden" />
              </div>
              {ROLES.map((r, ci) => (
                <div key={r} className={cn("flex h-full items-center justify-center py-3.5", r === me.role && "bg-sky-soft/60")}>
                  <Mark row={row} role={r} delay={0.15 + ri * 0.035 + ci * 0.06} />
                </div>
              ))}
              <div className="hidden justify-end md:flex">
                <DocTag status={row.status} />
              </div>
            </motion.li>
          ))}
        </ul>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12.5px] text-subtle">
        <span className="flex items-center gap-2">
          <MarkGlyph kind="yes" /> Permitido
        </span>
        <span className="flex items-center gap-2">
          <MarkGlyph kind="partial" /> Solo consulta
        </span>
        <span className="flex items-center gap-2">
          <MarkGlyph kind="no" /> Sin acceso
        </span>
        <span className="flex items-center gap-2">
          <MarkGlyph kind="yes" pending /> Pendiente de decisión
        </span>
        <span className="hidden h-4 w-px bg-hairline sm:block" />
        {LEGEND.map(([k, text]) => (
          <span key={k} className="flex items-center gap-2" title={DOC_STATUS[k].hint}>
            <DocTag status={k} /> {text}
          </span>
        ))}
      </div>
      {/* the per-cell qualifier is a tap / hover bubble; this is the same information in plain text */}
      <p className="mt-2 text-[12.5px] leading-snug text-subtle">
        El ojo es solo consulta. Donde el permiso tiene alcance («Su unidad», «Solo propias», «Unidad seleccionada»), la burbuja de la marca lo dice.
        El borde punteado ámbar marca lo que el prototipo supone mientras Pulkro no lo decida.
      </p>

      <div className="mt-8 rounded-[22px] bg-amber-soft p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-amber-mid text-amber-fg">
            <ShieldQuestion className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 text-[15px] font-semibold text-ink">
              Decisiones pendientes de permisos <DocTag status="pendiente" />
            </p>
            <p className="mt-1 text-[13.5px] leading-relaxed text-ink/75">
              El documento pide definirlas antes de cotizar. Recomendación: permisos por rol y unidad, con auditoría de cada modificación.
            </p>
          </div>
        </div>
        <ul className="mt-5 grid gap-3 md:grid-cols-3">
          {PENDING_DECISIONS.map((d, i) => (
            <motion.li
              key={d.q}
              initial={{ opacity: 0, y: 8 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, ease: EASE, delay: i * 0.08 }}
              className="rounded-[16px] bg-surface/80 p-4 ring-1 ring-amber-line"
            >
              <p className="text-[14px] font-semibold leading-snug text-ink">{d.q}</p>
              <p className="mt-2 text-[13px] leading-relaxed text-subtle">
                <span className="font-semibold text-ink/80">Supuesto del prototipo: </span>
                {d.now}
              </p>
            </motion.li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** One cell: ✓ allowed · eye = consulta · − no access. A dashed amber ring marks a cell whose rule is still PENDIENTE. */
function Mark({ row, role, delay }: { row: PermissionRow; role: Role; delay: number }) {
  const yes = can(role, row.action);
  const scope = row.scope?.[role];
  const status = cellStatus(row, role);
  const pending = status === "pendiente";
  const kind = yes ? "yes" : scope ? "partial" : "no";
  const text = [yes ? "Permitido" : (scope ?? "Sin acceso"), yes && scope ? scope : null, pending ? "pendiente de decisión" : status === "propuesto" ? "propuesto" : null]
    .filter(Boolean)
    .join(" · ");
  return (
    <ReasonTip reason={`${ROLE_LABEL[role]} · ${text}`} icon={null} contentClassName="text-[12.5px]">
      <span tabIndex={0} role="button" aria-label={`${ROLE_LABEL[role]} · ${row.label}: ${text}`} className="inline-flex size-10 items-center justify-center rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
        <MarkGlyph kind={kind} pending={pending} delay={delay} animated />
      </span>
    </ReasonTip>
  );
}

/** Check / eye / minus mark. Animated variant draws the stroke in when scrolled into view. `pending` = amber dashed ring. */
function MarkGlyph({ kind, pending, delay = 0, animated }: { kind: "yes" | "partial" | "no"; pending?: boolean; delay?: number; animated?: boolean }) {
  const draw = animated
    ? { initial: { pathLength: 0 }, whileInView: { pathLength: 1 }, viewport: { once: true }, transition: { duration: 0.45, ease: EASE, delay: delay + 0.12 } }
    : {};
  const pop = animated
    ? { initial: { scale: 0.4, opacity: 0 }, whileInView: { scale: 1, opacity: 1 }, viewport: { once: true }, transition: { type: "spring" as const, stiffness: 520, damping: 26, delay } }
    : {};
  if (pending)
    return (
      <motion.span {...pop} className="inline-flex size-[26px] items-center justify-center rounded-full border-[1.5px] border-dashed border-amber-line-strong bg-amber-soft text-amber-fg">
        {kind === "partial" ? (
          <Eye className="size-3.5" />
        ) : (
          <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            {kind === "yes" ? <motion.path d="M5 12.5l4.5 4.5L19 7.5" {...draw} /> : <motion.path d="M6 12h12" {...draw} />}
          </svg>
        )}
      </motion.span>
    );
  if (kind === "partial")
    return (
      <motion.span {...pop} className="inline-flex size-[26px] items-center justify-center rounded-full bg-blue-soft text-link ring-1 ring-blue-mid">
        <Eye className="size-3.5" />
      </motion.span>
    );
  return (
    <motion.span
      {...pop}
      className={cn("inline-flex size-[26px] items-center justify-center rounded-full", kind === "yes" ? "bg-brand-deep text-white shadow-[0_4px_10px_-4px_rgb(2_58_99/0.6)]" : "bg-tile text-faint")}
    >
      <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {kind === "yes" ? <motion.path d="M5 12.5l4.5 4.5L19 7.5" {...draw} /> : <motion.path d="M6 12h12" {...draw} />}
      </svg>
    </motion.span>
  );
}
