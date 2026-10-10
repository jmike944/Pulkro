"use client";

import { motion } from "motion/react";
import { Eye, ShieldQuestion } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCurrentUser } from "@/lib/hooks";
import { PERMISSION_ROWS, can, type Action } from "@/lib/permissions";
import { ROLE_LABEL } from "@/lib/status";
import type { Role } from "@/lib/types";
import { SectionHeader } from "@/components/pk/bits";
import { EASE } from "@/components/pk/motion";
import { ReasonTip } from "@/components/pk/reason-tip";
import { DOC_STATUS, DocTag, ROLES, ROLE_SHORT, type DocStatus } from "./shared";

/**
 * Cells the doc marks as "Consulta" (read-only) or partial scope, so the matrix tells the
 * difference between "can see it" and "no access" (doc §2).
 */
const PARTIAL: Partial<Record<Action, Partial<Record<Role, string>>>> = {
  "order.create": { direccion: "Consulta" },
  "order.edit": { direccion: "Consulta" },
  "order.editOperational": { direccion: "Consulta" },
  "crew.assign": { direccion: "Consulta", administracion: "Consulta" },
  "field.capture": { direccion: "Consulta", administracion: "Consulta" },
  "closure.authorize": { direccion: "Consulta", administracion: "Consulta" },
  "postventa.manage": { direccion: "Consulta" },
  "view.allUnits": { administracion: "Su unidad", supervisor: "Sus asignaciones" },
};

export function consultaFor(action: Action, role: Role) {
  return PARTIAL[action]?.[role] ?? null;
}

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
    now: "Reabrir deja la orden en estado Reabierta, exige motivo y genera una nueva versión del reporte.",
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
        subtitle="Roles y acciones del documento maestro (§2). La columna resaltada es tu rol actual."
      />

      <div className="overflow-hidden rounded-[22px] border border-hairline bg-white shadow-soft">
        <div className="grid grid-cols-[minmax(0,1fr)_repeat(3,46px)] items-end gap-x-1 border-b border-hairline px-4 pb-3 pt-4 text-[12px] font-semibold uppercase tracking-[0.1em] text-subtle sm:grid-cols-[minmax(0,1fr)_repeat(3,96px)] sm:px-5 md:grid-cols-[minmax(0,1fr)_repeat(3,112px)_124px]">
          <span>Acción</span>
          {ROLES.map((r) => (
            <span key={r} className={cn("relative flex flex-col items-center gap-1 text-center", r === me.role && "text-ink")}>
              {r === me.role && (
                <motion.span layoutId="matrix-you" className="rounded-md bg-sky-soft px-1.5 py-0.5 text-[10px] tracking-[0.08em] text-[#1667e0]">
                  TÚ
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
                <DocTag status={row.status} className="mt-1.5 md:hidden" />
              </div>
              {ROLES.map((r, ci) => (
                <div key={r} className={cn("flex h-full items-center justify-center py-3.5", r === me.role && "bg-sky-soft/60")}>
                  <Mark yes={can(r, row.action)} partial={consultaFor(row.action, r)} role={r} label={row.label} delay={0.15 + ri * 0.035 + ci * 0.06} />
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
          <MarkGlyph kind="partial" /> Consulta o alcance parcial
        </span>
        <span className="flex items-center gap-2">
          <MarkGlyph kind="no" /> Sin acceso
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
        El ojo es solo consulta, salvo en «Ver todas las unidades»: Administración ve únicamente su unidad y Supervisor únicamente sus asignaciones.
      </p>

      <div className="mt-8 rounded-[22px] bg-[#fff8eb] p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-[#ffe7bd] text-[#b86e00]">
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
              className="rounded-[16px] bg-white/80 p-4 ring-1 ring-[#f6e2bd]"
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

function Mark({ yes, partial, role, label, delay }: { yes: boolean; partial: string | null; role: Role; label: string; delay: number }) {
  const text = yes ? "Permitido" : partial ?? "Sin acceso";
  return (
    <ReasonTip reason={`${ROLE_LABEL[role]} · ${text}`} icon={null} contentClassName="text-[12.5px]">
      <span tabIndex={0} aria-label={`${ROLE_LABEL[role]} · ${label}: ${text}`} className="inline-flex size-10 items-center justify-center rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
        <MarkGlyph kind={yes ? "yes" : partial ? "partial" : "no"} delay={delay} animated />
      </span>
    </ReasonTip>
  );
}

/** Check / eye / minus mark. Animated variant draws the stroke in when scrolled into view. */
function MarkGlyph({ kind, delay = 0, animated }: { kind: "yes" | "partial" | "no"; delay?: number; animated?: boolean }) {
  const draw = animated
    ? { initial: { pathLength: 0 }, whileInView: { pathLength: 1 }, viewport: { once: true }, transition: { duration: 0.45, ease: EASE, delay: delay + 0.12 } }
    : {};
  const pop = animated
    ? { initial: { scale: 0.4, opacity: 0 }, whileInView: { scale: 1, opacity: 1 }, viewport: { once: true }, transition: { type: "spring" as const, stiffness: 520, damping: 26, delay } }
    : {};
  if (kind === "partial")
    return (
      <motion.span {...pop} className="inline-flex size-[26px] items-center justify-center rounded-full bg-[#edf4ff] text-link ring-1 ring-[#d6e6fd]">
        <Eye className="size-3.5" />
      </motion.span>
    );
  return (
    <motion.span
      {...pop}
      className={cn("inline-flex size-[26px] items-center justify-center rounded-full", kind === "yes" ? "bg-brand-deep text-white shadow-[0_4px_10px_-4px_rgb(2_58_99/0.6)]" : "bg-[#f2f4f7] text-[#a8b1bf]")}
    >
      <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {kind === "yes" ? <motion.path d="M5 12.5l4.5 4.5L19 7.5" {...draw} /> : <motion.path d="M6 12h12" {...draw} />}
      </svg>
    </motion.span>
  );
}
