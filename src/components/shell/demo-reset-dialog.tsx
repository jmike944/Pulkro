"use client";

import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useAppStore, useSyncSummary } from "@/lib/hooks";
import { DEMO_ENABLED } from "@/lib/demo";
import { fmtNum } from "@/lib/format";
import { ConfirmDialog } from "@/features/configuracion/shared";

/**
 * "Restablecer datos demo" always goes through this confirmation (key-value summary + explicit checkbox): it replaces every
 * record on the device, including captures that have not reached the server. Renders nothing when the demo is off
 * (NEXT_PUBLIC_DEMO="0"). Used by the sidebar user menu; Perfil can reuse it.
 */
export function DemoResetDialog({ open, onOpenChange, onDone }: { open: boolean; onOpenChange: (v: boolean) => void; onDone?: () => void }) {
  const resetDemo = useAppStore((s) => s.resetDemo);
  const orders = useAppStore((s) => s.orders.length);
  const { pending, syncing } = useSyncSummary();
  if (!DEMO_ENABLED) return null;
  const unsynced = pending.length + syncing.length;
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      icon={<Sparkles />}
      iconTone="sky"
      title="Restablecer datos de demostración"
      description="Se reemplaza todo lo guardado en este dispositivo por el escenario de demostración, anclado a hoy."
      rows={[
        { k: "Órdenes en el dispositivo", v: fmtNum(orders) },
        { k: "Registros sin sincronizar", v: <span className={unsynced ? "text-amber-fg" : undefined}>{fmtNum(unsynced)}</span> },
      ]}
      checkboxLabel="Entiendo que se perderán los cambios hechos en este dispositivo, incluidos los registros sin sincronizar."
      confirmLabel="Restablecer"
      destructive
      onConfirm={() => {
        resetDemo();
        toast.success("Datos de demostración restablecidos");
        onDone?.();
      }}
    />
  );
}
