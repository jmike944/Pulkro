"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CloudOff } from "lucide-react";
import { toast } from "sonner";
import { endSessionOnDevice } from "@/lib/supabase/client";
import { WIPE_PENDING_TOAST, useAppStore } from "@/lib/store";
import { capturesInProgress, ownerOf, whenCapturesSettled } from "@/lib/device-storage";
import { flagReauth } from "@/lib/sync/pull";
import { fmtNum, plural } from "@/lib/format";
import { ConfirmDialog } from "@/features/configuracion/shared";
import { BusyDialog } from "./busy-dialog";
import { CAPTURE_WAIT_MS, deviceUnsent } from "./session";

/** The account's unsent changes on this device: this tab's and what is saved on the device. */
const collectUnsent = (): Promise<ReadonlySet<string>> => deviceUnsent(ownerOf(useAppStore.getState().session));

/** Changes that were not in the set the person agreed to lose. */
const newSince = (now: ReadonlySet<string>, accepted: ReadonlySet<string>) => [...now].some((id) => !accepted.has(id));

const NONE: ReadonlySet<string> = new Set();

/**
 * "ok": signed out and wiped. "again": new unsent changes, nothing changed. "kept": session ended, data kept (re-auth).
 * "unsaved": session ended, but the device has not stored the wipe yet (full, failing, or another window holds it): the
 * account's data is still on it.
 */
export type SignOutOutcome = { result: "ok" | "kept" | "unsaved" } | { result: "again"; ids: ReadonlySet<string> };

/**
 * The end of an account sign-out the person confirmed (`accepted`: the unsent changes they agreed to lose). A photo still
 * being stored is no queue item yet: it is waited for, so it counts as a change the person has not seen — the wipe never runs
 * while one is being stored.
 */
export async function endAccountOnDevice(accepted: ReadonlySet<string>): Promise<SignOutOutcome> {
  if (!(await whenCapturesSettled(CAPTURE_WAIT_MS))) return { result: "again", ids: await collectUnsent() };
  // Changes made since the person confirmed (a push answer, a capture) are not part of what they agreed to lose.
  const before = await collectUnsent();
  if (newSince(before, accepted)) return { result: "again", ids: before };
  // This device only. Online, Auth revokes this session's refresh token; the cookies are removed here in any case, because
  // signOut() keeps them when it cannot refresh an expired access token first (offline for over an hour, Auth down).
  await endSessionOnDevice({ revoke: !useAppStore.getState().sync.browserOffline });
  // Last count, right before the wipe. The Supabase session is gone by now: keep the data and ask to sign in again.
  const settled = await whenCapturesSettled(CAPTURE_WAIT_MS);
  if (!settled || newSince(await collectUnsent(), accepted) || capturesInProgress() > 0) {
    flagReauth(useAppStore);
    return { result: "kept" };
  }
  const saved = await useAppStore.getState().clearDeviceData();
  return saved === "committed" ? { result: "ok" } : { result: "unsaved" };
}

/**
 * "Cerrar sesión" for both kinds of session.
 *  - Demo: as before (the store session ends, the device keeps the demo data).
 *  - Account: when the queue still holds unsent changes, warn first and keep everything unless the person confirms. Then,
 *    behind a blocking "Cerrando sesión…": end the Supabase session on this device and wipe the account's data (store,
 *    IndexedDB, photo blobs). Changes that appear meanwhile stop the wipe.
 * Render `signOutDialog` next to the control that calls `requestSignOut`.
 */
export function useSignOut({ redirectTo = "/login" }: { redirectTo?: string | null } = {}) {
  const router = useRouter();
  // The ids stay set after closing, so the dialog's exit animation keeps its content.
  const [confirm, setConfirm] = useState<{ open: boolean; ids: ReadonlySet<string> }>({ open: false, ids: NONE });
  const [busy, setBusy] = useState(false);
  const starting = useRef(false);
  const accountName = useAppStore((s) => (s.session.mode === "supabase" ? s.users.find((u) => u.id === s.session.userId)?.name : undefined));

  const leave = () => {
    if (redirectTo) router.push(redirectTo);
  };

  const signOutAccount = async (accepted: ReadonlySet<string>) => {
    setBusy(true);
    let outcome: SignOutOutcome;
    try {
      outcome = await endAccountOnDevice(accepted);
    } finally {
      setBusy(false);
    }
    if (outcome.result === "again") {
      toast.warning("Hay cambios nuevos sin enviar", { description: "Revíselos antes de cerrar sesión." });
      setConfirm({ open: true, ids: outcome.ids });
    } else if (outcome.result === "kept") {
      toast.warning("Sus datos siguen en este dispositivo", {
        description: "Aparecieron cambios sin enviar mientras se cerraba la sesión. Entre de nuevo para enviarlos, o cierre sesión otra vez para borrarlos.",
      });
    } else if (outcome.result === "unsaved") {
      // Never «se borraron» while the device still holds the account's data: the wipe is retried (this toast goes once stored).
      toast.error("No se pudieron borrar sus datos", {
        id: WIPE_PENDING_TOAST,
        duration: Infinity,
        description:
          "Su sesión se cerró, pero los datos de su cuenta siguen en este dispositivo: no se pudo guardar el borrado. No cierre la app mientras se reintenta y, si el teléfono está lleno, libere espacio. Si la cierra antes, ábrala y cierre sesión de nuevo.",
      });
    } else {
      toast.success("Sesión cerrada", { description: "Los datos de su cuenta se borraron de este dispositivo." });
      leave();
    }
  };

  const start = async () => {
    const s = useAppStore.getState();
    if (s.session.mode !== "supabase") {
      s.signOut();
      leave();
      return;
    }
    // A photo still being stored counts once it is queued (it would be wiped unseen otherwise).
    await whenCapturesSettled(CAPTURE_WAIT_MS);
    const ids = await collectUnsent();
    if (ids.size > 0) setConfirm({ open: true, ids });
    else await signOutAccount(NONE);
  };

  const requestSignOut = () => {
    if (busy || starting.current) return;
    starting.current = true;
    void start().finally(() => {
      starting.current = false;
    });
  };

  const unsent = confirm.ids.size;
  const signOutDialog = (
    <>
      <ConfirmDialog
        open={confirm.open}
        onOpenChange={(open) => setConfirm((c) => ({ ...c, open }))}
        icon={<CloudOff />}
        title="¿Cerrar sesión con cambios sin enviar?"
        description={
          <>
            Hay <b>{plural(unsent, "cambio sin enviar", "cambios sin enviar")}</b> en este dispositivo. Si cierra sesión ahora, se borrarán sin
            llegar al servidor.
          </>
        }
        rows={[
          { k: "Cuenta", v: accountName ?? "—" },
          { k: "Cambios sin enviar", v: <span className="text-amber-fg">{fmtNum(unsent)}</span> },
        ]}
        checkboxLabel="Entiendo que esos cambios se perderán."
        confirmLabel="Cerrar sesión y borrar"
        destructive
        onConfirm={() => {
          const accepted = confirm.ids;
          if (starting.current) return;
          starting.current = true;
          void signOutAccount(accepted).finally(() => {
            starting.current = false;
          });
        }}
      >
        <p className="text-[13.5px] leading-snug text-subtle">Para conservarlos, elija Cancelar: seguirán guardados en este dispositivo.</p>
      </ConfirmDialog>
      <BusyDialog open={busy} title="Cerrando sesión…" description="Se cierra su sesión y se borran los datos de su cuenta de este dispositivo. No cierre esta ventana." />
    </>
  );

  return { requestSignOut, signOutDialog, signingOut: busy };
}
