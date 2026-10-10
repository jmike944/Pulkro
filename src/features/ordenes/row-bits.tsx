"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { can, type Action } from "@/lib/permissions";
import { fmtHours } from "@/lib/format";
import type { Jornada, Role } from "@/lib/types";
import { EASE } from "@/components/pk/motion";
import { StatusDot } from "@/components/pk/status";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { OrderRow } from "./order-rows";

/* ───────────── next action (role-aware) ───────────── */

/** Which permission each nextAction() verb needs, and who can do it (doc §2). */
const ACTION_RULES: Record<string, { action: Action; who: string }> = {
  Asignar: { action: "crew.assign", who: "La cuadrilla la asigna el supervisor." },
  Entrada: { action: "field.capture", who: "La entrada con GPS la registra el supervisor en sitio." },
  Continuar: { action: "field.capture", who: "La jornada la captura el supervisor en sitio." },
  Solicitar: { action: "field.capture", who: "Las fotos de evidencia las captura el supervisor." },
  Cerrar: { action: "closure.authorize", who: "Solo el supervisor autoriza el cierre." },
  Generar: { action: "report.share", who: "El reporte lo genera el supervisor." },
  Compartir: { action: "report.share", who: "El reporte lo comparte el supervisor." },
  Resolver: { action: "field.capture", who: "Las incidencias las resuelve el supervisor." },
  Encuesta: { action: "postventa.manage", who: "Las encuestas las gestionan Administración y supervisores." },
  Atender: { action: "postventa.manage", who: "Los casos los atienden Administración y supervisores." },
  Confirmar: { action: "crew.assign", who: "Las fechas las confirma el supervisor." },
};

export function NextActionButton({ row, role, className }: { row: OrderRow; role: Role; className?: string }) {
  const a = row.action;
  const rule = ACTION_RULES[a.label];
  const allowed = !rule || can(role, rule.action);
  const base = "relative z-10 h-10 min-w-[84px] rounded-[12px] px-4 text-[14px] font-semibold";
  const outline = "border-[#dfe3ea] shadow-[0_1px_2px_rgb(16_24_40/0.05)]";

  if (!allowed) {
    // The role only consults: offer the detail and explain who acts.
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button asChild size="lg" variant="outline" className={cn(base, outline, className)}>
            <Link href={`/ordenes/${row.order.folio}`} aria-label={`Ver ${row.order.folio}. ${a.status}: ${rule.who}`}>
              Ver
            </Link>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left" className="max-w-[240px]">
          {a.status} · {rule.who}
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Button asChild size="lg" variant={a.variant === "primary" ? "default" : "outline"} className={cn(base, a.variant !== "primary" && outline, className)}>
      <Link href={a.href} aria-label={`${a.label} · ${row.order.folio}`}>
        {a.label}
      </Link>
    </Button>
  );
}

/* ───────────── jornadas progress ───────────── */

const SEG_CLASS: Record<Jornada["status"], string> = {
  cerrada: "bg-[#1667e0]",
  en_curso: "bg-sky",
  pendiente: "bg-[#e4e8ee]",
};

/** "2/3" + tiny segmented bar: closed · in progress · pending. */
export function JornadaProgress({ row, className, compact }: { row: OrderRow; className?: string; compact?: boolean }) {
  const total = row.jornadas.length || row.order.plannedDays;
  const pending = total - row.closedDays - row.liveDays;
  const label = `${row.closedDays} cerradas, ${row.liveDays} en curso, ${Math.max(0, pending)} pendientes`;
  return (
    <div className={cn("min-w-0", className)} title={label} aria-label={`Jornadas: ${label}`}>
      <p className={cn("font-semibold text-ink tabular", compact ? "text-[13px]" : "text-[14px]")}>
        {row.closedDays}
        <span className="font-medium text-subtle">/{total}</span>
      </p>
      <div className="mt-1.5 flex max-w-[72px] gap-[3px]">
        {(row.jornadas.length ? row.jornadas : Array.from({ length: total }, () => null)).map((j, i) => (
          <motion.span
            key={j?.id ?? i}
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.45, ease: EASE, delay: 0.25 + i * 0.08 }}
            style={{ originX: 0 }}
            className={cn("relative h-[5px] flex-1 overflow-hidden rounded-full", SEG_CLASS[j?.status ?? "pendiente"])}
          >
            {j?.status === "en_curso" && (
              <motion.span
                className="absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-white/80 to-transparent"
                animate={{ x: ["-100%", "220%"] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
              />
            )}
          </motion.span>
        ))}
      </div>
    </div>
  );
}

/* ───────────── evidence badges ───────────── */

function EvidenceChip({ label, count, missing, required }: { label: string; count: number; missing: boolean; required: boolean }) {
  const tone = missing
    ? "bg-[#fff6e6] text-[#b86e00] ring-1 ring-inset ring-[#f6d9a8]"
    : count > 0
      ? label === "ANTES"
        ? "bg-[#edf4ff] text-link"
        : "bg-[#e7f7f4] text-st-teal"
      : "bg-[#f2f4f7] text-[#98a2b3]";
  return (
    <span
      className={cn("inline-flex h-[22px] items-center gap-1 rounded-md px-1.5 text-[10.5px] font-bold tracking-[0.06em] tabular", tone)}
      title={missing ? `Falta foto ${label}` : required ? `${count} foto(s) ${label}` : `${label}: aún no requerida`}
    >
      {label}
      <span className={cn(count === 0 && !missing && "opacity-60")}>{missing && count === 0 ? "!" : count}</span>
    </span>
  );
}

export function EvidenceBadges({ row, className }: { row: OrderRow; className?: string }) {
  const required = row.executed > 0;
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      <EvidenceChip label="ANTES" count={row.antes} missing={row.antesMissing} required={required} />
      <EvidenceChip label="DESPUÉS" count={row.despues} missing={row.despuesMissing} required={row.closedDays > 0} />
    </div>
  );
}

/* ───────────── real hours ───────────── */

export function RealHours({ row, className }: { row: OrderRow; className?: string }) {
  if (!row.minutes) return <span className={cn("text-[15px] text-[#98a2b3]", className)}>—</span>;
  return (
    <span className={cn("inline-flex items-center justify-end gap-1.5 text-[15px] font-semibold text-ink tabular", className)} title={row.live ? "Incluye la jornada en curso" : "Σ salida − entrada"}>
      {row.live && <StatusDot tone="sky" live />}
      {fmtHours(row.minutes)}
    </span>
  );
}
