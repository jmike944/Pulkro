"use client";

import { cn } from "@/lib/utils";
import { ReasonTip } from "@/components/pk/reason-tip";

/** Wraps a (disabled) control with a tooltip (tap bubble on touch) that explains who can do it / why it is blocked. */
export function WithReason({ reason, children, className }: { reason?: string | null; children: React.ReactNode; className?: string }) {
  if (!reason) return <>{children}</>;
  return (
    <ReasonTip reason={reason} contentClassName="max-w-[280px] text-[12.5px] leading-snug">
      <span tabIndex={0} className={cn("inline-flex rounded-[12px] outline-none focus-visible:ring-3 focus-visible:ring-sky/50", className)}>
        {children}
      </span>
    </ReasonTip>
  );
}

export const REASON = {
  share: "Solo el supervisor asignado genera y comparte el reporte (Autorizar cierre y envío).",
  export: "Su rol no tiene permiso para exportar PDF.",
  sync: "Hay registros de esta orden sin sincronizar. El PDF definitivo se comparte cuando todo esté en el servidor.",
  noReport: "Genere el PDF primero.",
  close: "Solo el supervisor asignado valida el cierre.",
} as const;
