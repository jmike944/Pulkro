"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChevronRight, ClipboardList, KeyRound, UserMinus, WifiOff } from "lucide-react";
import { useAppStore, useCan, useLookups } from "@/lib/hooks";
import { plural } from "@/lib/format";
import { OPEN_STATUSES, ROLE_LABEL } from "@/lib/status";
import type { User } from "@/lib/types";
import { IconTile } from "@/components/pk/bits";
import { ModalCancel, ModalShell } from "@/components/pk/modal-shell";
import { NEEDS_CONNECTION, NEEDS_CONNECTION_DETAIL, REAUTH, REAUTH_DETAIL, newOpId, setUserActive, useAccountAdmin } from "./account-admin";
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
 *
 * Demo: `onConfirm` applies it locally. Account session (not deferred): the dialog itself asks the server (admin-users:
 * profile off, sessions revoked, access banned), stays open with the reason if that fails, and hands the server's list of
 * open orders left to reassign to `onDeactivated`. Offline it explains that it needs a connection.
 */
export function DeactivateUserDialog({
  user,
  open,
  onOpenChange,
  onConfirm,
  onDeactivated,
  deferred,
}: {
  user: User | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: (user: User) => void;
  /** account sessions: the server deactivated the account; `openOrders` = folios it still supervises */
  onDeactivated?: (user: User, openOrders: string[]) => void;
  deferred?: boolean;
}) {
  const lk = useLookups();
  const openOrdersBy = useOpenOrdersBy();
  const { account, offline, reauth } = useAccountAdmin();
  const server = account && !deferred;
  // Dirección (users.admin) cannot edit orders: Administración reassigns them.
  const reassignHere = useCan("order.edit");
  const [error, setError] = useState<string | null>(null);
  // One op id per opening: a second click after a lost answer is a retry the server answers, not a new deactivation.
  const op = useRef<{ userId: string; id: string } | null>(null);

  const openOrders = user ? (openOrdersBy.get(user.id) ?? 0) : 0;
  const notes =
    openOrders > 0 || deferred || (server && (offline || reauth || error)) ? (
      <div className="space-y-3">
        {server && offline && (
          <p className="flex gap-2.5 rounded-[14px] bg-soft px-4 py-3 text-[13.5px] leading-snug text-ink-soft">
            <WifiOff className="mt-0.5 size-4 shrink-0 text-subtle" aria-hidden />
            <span>{NEEDS_CONNECTION_DETAIL}</span>
          </p>
        )}
        {server && reauth && !offline && (
          <p className="flex gap-2.5 rounded-[14px] bg-soft px-4 py-3 text-[13.5px] leading-snug text-ink-soft">
            <KeyRound className="mt-0.5 size-4 shrink-0 text-subtle" aria-hidden />
            <span>{REAUTH_DETAIL}</span>
          </p>
        )}
        {openOrders > 0 && (
          <p className="rounded-[14px] bg-amber-soft px-4 py-3 text-[13.5px] leading-snug text-amber-ink">
            {reassignHere
              ? "Tiene órdenes abiertas. Reasígnelas desde el detalle de cada orden para que no queden sin supervisor."
              : "Tiene órdenes abiertas. Pida a Administración de la unidad que las reasigne para que no queden sin supervisor."}
          </p>
        )}
        {deferred && <p className="text-[13px] leading-snug text-subtle">La cuenta se desactiva al guardar los cambios del usuario.</p>}
        {server && error && (
          <p role="alert" className="rounded-[14px] bg-red-soft px-4 py-3 text-[13.5px] font-medium leading-snug text-red-fg">
            {error}
          </p>
        )}
      </div>
    ) : null;

  const confirmOnServer = async (u: User): Promise<boolean> => {
    if (op.current?.userId !== u.id) op.current = { userId: u.id, id: newOpId() };
    setError(null);
    const result = await setUserActive(u, false, op.current.id);
    if (!result.ok) {
      setError(result.message);
      return false;
    }
    op.current = null;
    if (result.active) {
      // a retried answer from before someone reactivated it: the next click is a new operation
      setError("La cuenta sigue activa: otra persona de Dirección la reactivó mientras tanto. Vuelva a confirmar para desactivarla.");
      return false;
    }
    // after this dialog has started closing, so whatever comes next (the open-orders notice) opens on top of nothing
    const folios = result.open_orders;
    setTimeout(() => onDeactivated?.(u, folios), 0);
    return true;
  };

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          setError(null);
          op.current = null;
        }
        onOpenChange(v);
      }}
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
      busyLabel="Desactivando…"
      confirmDisabled={server && (offline || reauth)}
      disabledHint={offline ? NEEDS_CONNECTION : REAUTH}
      destructive
      onConfirm={() => {
        if (!user) return;
        if (server) return confirmOnServer(user);
        onConfirm(user);
      }}
    >
      {notes}
    </ConfirmDialog>
  );
}

/**
 * After an account deactivation: the open orders the server says the person still supervises (also in the audit reason),
 * each a link to the order, where Administración reassigns it (Dirección, who deactivates, cannot edit orders).
 */
export function OpenOrdersNotice({
  target,
  open,
  onOpenChange,
}: {
  target: { user: User; folios: string[] } | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const orders = useAppStore((s) => s.orders);
  const titles = useMemo(() => new Map(orders.map((o) => [o.folio, o.title])), [orders]);
  if (!target) return null;
  const { user, folios } = target;
  return (
    <ModalShell
      open={open}
      onOpenChange={onOpenChange}
      size="sm"
      icon={
        <IconTile tone="amber" className="size-11 rounded-[14px] [&_svg]:size-5">
          <ClipboardList />
        </IconTile>
      }
      title="Órdenes por reasignar"
      description={
        <>
          <b className="font-semibold text-ink">{user.name}</b> ya no tiene acceso y aún supervisa{" "}
          {plural(folios.length, "orden abierta", "órdenes abiertas")}. Pida a Administración de la unidad que las reasigne para
          que no queden sin supervisor.
        </>
      }
      footer={<ModalCancel>Cerrar</ModalCancel>}
    >
      <ul className="mt-2 divide-y divide-hairline rounded-[18px] border border-hairline">
        {folios.map((folio) => (
          <li key={folio}>
            <Link
              href={`/ordenes/${encodeURIComponent(folio)}`}
              onClick={() => onOpenChange(false)}
              className="flex min-h-12 items-center gap-3 px-4 py-3 text-[14px] outline-none transition-colors hover:bg-wash focus-visible:bg-wash"
            >
              <span className="shrink-0 font-semibold text-ink tabular">{folio}</span>
              <span className="min-w-0 flex-1 truncate text-subtle">{titles.get(folio) ?? ""}</span>
              <ChevronRight className="size-4 shrink-0 text-faint" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </ModalShell>
  );
}
