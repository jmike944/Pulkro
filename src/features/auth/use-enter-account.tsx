"use client";

import { useCallback, useRef, useState } from "react";
import { UserRoundX } from "lucide-react";
import { toast } from "sonner";
import { endSessionOnDevice, type SupabaseBrowserClient } from "@/lib/supabase/client";
import { useAppStore } from "@/lib/store";
import { capturesInProgress, whenCapturesSettled } from "@/lib/device-storage";
import { flagReauth } from "@/lib/sync/pull";
import { fmtNum, plural } from "@/lib/format";
import type { Unit, User } from "@/lib/types";
import { ConfirmDialog } from "@/features/configuracion/shared";
import { NO_PROFILE_MESSAGE } from "./auth-errors";
import { CAPTURE_WAIT_MS, loadOwnProfile, otherAccountOnDevice, whenHydrated } from "./session";

/**
 * Ends the session that was just opened for `userId` and was not let in; the account the store holds has no session now
 * either. Only that account's session ends: the profile read and the confirmation can take long, and by then another tab may
 * have put another account's session in the shared cookies (a sign-in, an e-mail link) — that one stays.
 * `inactive`: `userId` was refused for having no active profile — if it is the one on the device, it has no access.
 */
async function leaveSession(userId: string, inactive = false) {
  try {
    await endSessionOnDevice({ userId });
  } finally {
    await whenHydrated();
    flagReauth(useAppStore, { noAccess: inactive && useAppStore.getState().session.userId === userId });
  }
}

const CAPTURES_BUSY = "Se están guardando fotos en este dispositivo. Espere a que terminen y vuelva a entrar.";

/** The store holds this account already (startSupabaseSession keeps its data). */
const holdsAccount = (userId: string) => {
  const s = useAppStore.getState().session;
  return s.mode === "supabase" && s.userId === userId;
};

export type EnterResult = { status: "entered" } | { status: "confirm" } | { status: "refused"; message: string };

type Pending = { user: User; unit?: Unit; other: { name: string; ids: ReadonlySet<string> } };

/**
 * After Supabase Auth has a session (password sign-in, or an invite / recovery link): read the account's own profile, refuse
 * (and sign out) when it is missing or inactive, and put the session into the store as an account session. When another
 * account left unsent changes on this device, ask before they are wiped (the dialog is rendered by the caller).
 *
 * The new session replaced the cookies of whatever account the store still holds. When the person is refused or cancels, that
 * session ends here too, so the account on the device (if any) is flagged "Vuelva a entrar": its data stays, it syncs again
 * once its owner signs in.
 */
export function useEnterAccount({ onEntered, onCancelled }: { onEntered: () => void; onCancelled: (message: string) => void }) {
  // The pending account stays set after closing, so the dialog's exit animation keeps its content.
  const [pending, setPending] = useState<Pending | null>(null);
  const [open, setOpen] = useState(false);
  const confirmed = useRef(false);

  const enter = useCallback(
    async (supabase: SupabaseBrowserClient, userId: string): Promise<EnterResult> => {
      const profile = await loadOwnProfile(supabase, userId);
      if (!profile.ok) {
        await leaveSession(userId, profile.message === NO_PROFILE_MESSAGE);
        return { status: "refused", message: profile.message };
      }
      await whenHydrated();
      // A photo still being stored is no unsent change yet: wait for it, so another account's is counted, never wiped unseen.
      if (!(await whenCapturesSettled(CAPTURE_WAIT_MS)) && !holdsAccount(profile.user.id)) {
        await leaveSession(profile.user.id);
        return { status: "refused", message: CAPTURES_BUSY };
      }
      // This tab's memory and what is saved on the device: a write of this tab that failed may have left another account there.
      const other = await otherAccountOnDevice(profile.user.id);
      if (other) {
        confirmed.current = false;
        setPending({ user: profile.user, unit: profile.unit, other });
        setOpen(true);
        return { status: "confirm" };
      }
      useAppStore.getState().startSupabaseSession(profile.user, profile.unit);
      onEntered();
      return { status: "entered" };
    },
    [onEntered],
  );

  const cancel = async (p: Pending) => {
    try {
      await leaveSession(p.user.id);
    } finally {
      onCancelled(`No entró: los cambios sin enviar de ${p.other.name} siguen en este dispositivo. Pídale que entre para enviarlos.`);
    }
  };

  const replaceDialog = (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next || !pending || confirmed.current) return;
        confirmed.current = true; // the cancellation runs once
        void cancel(pending);
      }}
      icon={<UserRoundX />}
      title="Este dispositivo tiene cambios de otra cuenta"
      description={
        pending && (
          <>
            Hay <b>{plural(pending.other.ids.size, "cambio sin enviar", "cambios sin enviar")}</b> de {pending.other.name}. Si entra con su
            cuenta, se borrarán de este dispositivo.
          </>
        )
      }
      rows={pending ? [{ k: "Cuenta anterior", v: pending.other.name }, { k: "Cambios sin enviar", v: fmtNum(pending.other.ids.size) }] : []}
      checkboxLabel="Entiendo que esos cambios se borrarán."
      confirmLabel="Borrar y entrar"
      destructive
      onConfirm={async () => {
        if (!pending) return;
        // A photo still being stored becomes one more change of that account: wait for it, then count again.
        const settled = await whenCapturesSettled(CAPTURE_WAIT_MS);
        // Changes made since the dialog opened are not part of what the person agreed to lose.
        const now = await otherAccountOnDevice(pending.user.id);
        if (now && [...now.ids].some((id) => !pending.other.ids.has(id))) {
          setPending({ ...pending, other: now });
          toast.warning("Hay cambios nuevos sin enviar", { description: `Revise cuántos cambios de ${now.name} se borrarían antes de entrar.` });
          return false;
        }
        // Never while a photo is being stored (it would be wiped unseen).
        if (!settled || capturesInProgress() > 0) {
          toast.warning("Se están guardando fotos", { description: `Espere a que terminen las fotos de ${pending.other.name} y vuelva a intentarlo.` });
          return false;
        }
        confirmed.current = true;
        useAppStore.getState().startSupabaseSession(pending.user, pending.unit);
        onEntered();
      }}
    />
  );

  return { enter, replaceDialog };
}
