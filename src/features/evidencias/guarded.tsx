"use client";

import { ReasonTip } from "@/components/pk/reason-tip";

/**
 * Wraps a (disabled) control so it still shows a tooltip (tap bubble on touch) explaining who can perform the action.
 * Disabled buttons don't emit pointer events, so the tip is anchored to a focusable span.
 */
export function Guarded({ reason, children, className }: { reason?: string | null; children: React.ReactNode; className?: string }) {
  if (!reason) return <>{children}</>;
  return (
    <ReasonTip reason={reason} contentClassName="max-w-[260px] text-center text-[12.5px] leading-snug">
      <span tabIndex={0} className={className ?? "inline-flex rounded-[12px] outline-none focus-visible:ring-3 focus-visible:ring-ring/50"}>
        {children}
      </span>
    </ReasonTip>
  );
}

export const CAPTURE_REASON = "Solo el supervisor asignado captura fotos e incidencias. Dirección y Administración tienen acceso de consulta.";
