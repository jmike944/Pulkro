"use client";

import { CrewModal } from "@/features/jornada/crew-flow";
import { useOrder } from "./order-context";

/**
 * Variable crew per service (doc §4.1). Without a jornada it applies to every pending jornada
 * (or the one in progress when nothing is pending); with one, only to that jornada.
 * The editor is the shared `CrewModal` (the same one the field view and the agenda open).
 */
export function CrewDialog({ open, onOpenChange, jornadaId }: { open: boolean; onOpenChange: (v: boolean) => void; jornadaId?: string }) {
  const { d } = useOrder();
  return <CrewModal open={open} onOpenChange={onOpenChange} order={d.order} jornadas={d.jornadas} jornadaId={jornadaId} />;
}
