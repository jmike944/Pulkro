"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { can, type Action } from "@/lib/permissions";
import { fmtHours, plural } from "@/lib/format";
import { useMediaQuery } from "@/lib/hooks";
import type { Jornada, Role } from "@/lib/types";
import { EASE } from "@/components/pk/motion";
import { ReasonTip } from "@/components/pk/reason-tip";
import { StatusDot } from "@/components/pk/status";
import { Button } from "@/components/ui/button";
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
  const outline = "border-line shadow-[0_1px_2px_rgb(16_24_40/0.05)]";

  if (!allowed) {
    // The role only consults: offer the detail and explain who acts.
    return (
      <ViewOnlyAction row={row} who={rule.who}>
        <Button asChild size="lg" variant="outline" className={cn(base, outline, className)}>
          <Link href={`/ordenes/${row.order.folio}`} aria-label={`Ver ${row.order.folio}. ${a.status}: ${rule.who}`}>
            Ver
          </Link>
        </Button>
      </ViewOnlyAction>
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

/**
 * Explains who acts next. Hover devices get a tooltip; on touch a tap on the link navigates, so a tip
 * would never be read: the sentence is printed under the card's button instead (the table row keeps it
 * out, it only shows below the container breakpoint where the cards render).
 */
function ViewOnlyAction({ row, who, children }: { row: OrderRow; who: string; children: React.ReactElement }) {
  const touch = useMediaQuery("(hover: none)");
  if (touch)
    return (
      <>
        {children}
        <p className="mt-2 flex items-center justify-center gap-1.5 text-center text-[12.5px] leading-snug text-subtle @4xl:hidden">
          <Lock className="size-3.5 shrink-0" />
          {who}
        </p>
      </>
    );
  return (
    <ReasonTip reason={`${row.action.status} · ${who}`} side="left" contentClassName="max-w-[240px]">
      {children}
    </ReasonTip>
  );
}

/* ───────────── jornadas progress ───────────── */

const SEG_CLASS: Record<Jornada["status"], string> = {
  cerrada: "bg-azure",
  en_curso: "bg-sky",
  pendiente: "bg-track",
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
                className="absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-surface/80 to-transparent"
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
    ? "bg-amber-soft text-amber-fg ring-1 ring-inset ring-amber-line"
    : count > 0
      ? label === "ANTES"
        ? "bg-blue-soft text-link"
        : "bg-teal-soft text-teal-fg"
      : "bg-tile text-faint";
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

/* ───────────── card breakdown ───────────── */

/**
 * The words behind the card's bar, chips and hours. The table cells keep them in `title=`, which touch
 * never shows, and the bar alone tells closed / in progress / pending apart by colour. Only what is
 * not obvious from the numbers is printed: mixed jornada states, missing photos, live hours.
 */
export function RowBreakdown({ row, className }: { row: OrderRow; className?: string }) {
  const total = row.jornadas.length || row.order.plannedDays;
  const pending = Math.max(0, total - row.closedDays - row.liveDays);
  const states = [row.closedDays, row.liveDays, pending].filter((n) => n > 0).length;
  const jornadas =
    states > 1 || row.liveDays > 0
      ? [
          row.closedDays > 0 && plural(row.closedDays, "cerrada", "cerradas"),
          row.liveDays > 0 && `${row.liveDays} en curso`,
          pending > 0 && plural(pending, "pendiente", "pendientes"),
        ]
          .filter(Boolean)
          .join(" · ")
      : "";
  const missing = [row.antesMissing && "ANTES", row.despuesMissing && "DESPUÉS"].filter(Boolean).join(" y ");
  const liveHours = row.live && row.minutes > 0;
  if (!jornadas && !missing && !liveHours) return null;
  return (
    <ul className={cn("space-y-0.5 border-t border-hairline pt-2.5 text-[12.5px] leading-snug text-subtle", className)}>
      {jornadas && <li>Jornadas: {jornadas}</li>}
      {missing && <li className="font-medium text-amber-fg">Falta foto {missing}</li>}
      {liveHours && <li>Las horas incluyen la jornada en curso</li>}
    </ul>
  );
}

/* ───────────── real hours ───────────── */

export function RealHours({ row, className }: { row: OrderRow; className?: string }) {
  if (!row.minutes) return <span className={cn("text-[15px] text-faint", className)}>—</span>;
  return (
    <span className={cn("inline-flex items-center justify-end gap-1.5 text-[15px] font-semibold text-ink tabular", className)} title={row.live ? "Incluye la jornada en curso" : "Σ salida − entrada"}>
      {row.live && <StatusDot tone="sky" live />}
      {fmtHours(row.minutes)}
    </span>
  );
}
