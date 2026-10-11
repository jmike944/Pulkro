"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CloudOff } from "lucide-react";
import { toast } from "sonner";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { unsentCount, useAppStore } from "@/lib/store";
import { fmtNum, plural } from "@/lib/format";
import { ConfirmDialog } from "@/features/configuracion/shared";

/**
 * "Cerrar sesión" for both kinds of session.
 *  - Demo: as before (the store session ends, the device keeps the demo data).
 *  - Account: when the queue still holds unsent changes, warn first and keep everything unless the person confirms. Then
 *    end the Supabase session and wipe the account's data from the device (store, IndexedDB, photo blobs).
 * Render `signOutDialog` next to the control that calls `requestSignOut`.
 */
export function useSignOut({ redirectTo = "/login" }: { redirectTo?: string | null } = {}) {
  const router = useRouter();
  // The count stays set after closing, so the dialog's exit animation keeps its content.
  const [confirm, setConfirm] = useState({ open: false, unsent: 0 });
  const [busy, setBusy] = useState(false);
  const accountName = useAppStore((s) => (s.session.mode === "supabase" ? s.users.find((u) => u.id === s.session.userId)?.name : undefined));

  const leave = () => {
    if (redirectTo) router.push(redirectTo);
  };

  const signOutAccount = async () => {
    setBusy(true);
    try {
      // This device only ("local"): the account's other devices keep their sessions and their unsent work. Supabase revokes
      // this session's refresh token; offline, it still drops the session from this browser.
      if (isSupabaseConfigured) await getSupabaseBrowserClient().auth.signOut({ scope: "local" });
    } catch {
      // The local session is removed even when the server cannot be reached.
    } finally {
      useAppStore.getState().clearDeviceData();
      setBusy(false);
    }
    toast.success("Sesión cerrada", { description: "Los datos de su cuenta se borraron de este dispositivo." });
    leave();
  };

  const requestSignOut = () => {
    if (busy) return;
    const s = useAppStore.getState();
    if (s.session.mode !== "supabase") {
      s.signOut();
      leave();
      return;
    }
    const n = unsentCount(s.sync.queue);
    if (n > 0) setConfirm({ open: true, unsent: n });
    else void signOutAccount();
  };

  const signOutDialog = (
    <ConfirmDialog
      open={confirm.open}
      onOpenChange={(open) => setConfirm((c) => ({ ...c, open }))}
      icon={<CloudOff />}
      title="¿Cerrar sesión con cambios sin enviar?"
      description={
        <>
          Hay <b>{plural(confirm.unsent, "cambio sin enviar", "cambios sin enviar")}</b> en este dispositivo. Si cierra sesión ahora, se borrarán
          sin llegar al servidor.
        </>
      }
      rows={[
        { k: "Cuenta", v: accountName ?? "—" },
        { k: "Cambios sin enviar", v: <span className="text-amber-fg">{fmtNum(confirm.unsent)}</span> },
      ]}
      checkboxLabel="Entiendo que esos cambios se perderán."
      confirmLabel="Cerrar sesión y borrar"
      destructive
      onConfirm={() => void signOutAccount()}
    >
      <p className="text-[13.5px] leading-snug text-subtle">Para conservarlos, elija Cancelar: seguirán guardados en este dispositivo.</p>
    </ConfirmDialog>
  );

  return { requestSignOut, signOutDialog, signingOut: busy };
}
