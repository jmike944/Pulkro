"use client";

import { useMemo } from "react";
import { UserMinus } from "lucide-react";
import { useAppStore, useLookups } from "@/lib/hooks";
import { OPEN_STATUSES, ROLE_LABEL } from "@/lib/status";
import type { User } from "@/lib/types";
import { ConfirmDialog } from "./shared";

/** Open orders per supervisor (a deactivated supervisor leaves these without an owner until they are reassigned). */
export function useOpenOrdersBy() {
  const orders = useAppStore((s) => s.orders);
  return useMemo(() => {
    const open = new Map<string, number>();
    orders.forEach((o) => {
      if (OPEN_STATUSES.includes(o.status)) open.set(o.supervisorId, (open.get(o.supervisorId) ?? 0) + 1);
    });
    return open;
  }, [orders]);
}

/**
 * THE confirmation for turning a user account off: the users list and the "Cuenta activa" switch of the user editor both go
 * through it. `deferred` is for the editor, where the change is only stored with "Guardar cambios".
 */
export function DeactivateUserDialog({
  user,
  open,
  onOpenChange,
  onConfirm,
  deferred,
}: {
  user: User | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: (user: User) => void;
  deferred?: boolean;
}) {
  const lk = useLookups();
  const openOrdersBy = useOpenOrdersBy();
  const openOrders = user ? (openOrdersBy.get(user.id) ?? 0) : 0;
  const notes =
    openOrders > 0 || deferred ? (
      <div className="space-y-3">
        {openOrders > 0 && (
          <p className="rounded-[14px] bg-amber-soft px-4 py-3 text-[13.5px] leading-snug text-amber-ink">
            Tiene órdenes abiertas. Reasígnelas desde el detalle de cada orden para que no queden sin supervisor.
          </p>
        )}
        {deferred && <p className="text-[13px] leading-snug text-subtle">La cuenta se desactiva al guardar los cambios del usuario.</p>}
      </div>
    ) : null;
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      icon={<UserMinus />}
      iconTone="red"
      title="Desactivar usuario"
      description="La cuenta deja de iniciar sesión. Su historial, bitácora y órdenes se conservan."
      rows={
        user
          ? [
              { k: "Usuario", v: user.name },
              { k: "Rol", v: ROLE_LABEL[user.role] },
              { k: "Unidad", v: lk.units.get(user.unitId)?.name ?? "—" },
              { k: "Órdenes abiertas asignadas", v: openOrders },
            ]
          : []
      }
      checkboxLabel={`Entiendo que ${user?.name.split(" ")[0] ?? "la persona"} ya no podrá iniciar sesión.`}
      confirmLabel="Desactivar usuario"
      destructive
      onConfirm={() => user && onConfirm(user)}
    >
      {notes}
    </ConfirmDialog>
  );
}
