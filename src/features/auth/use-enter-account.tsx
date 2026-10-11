"use client";

import { useCallback, useRef, useState } from "react";
import { UserRoundX } from "lucide-react";
import { toast } from "sonner";
import { endSessionOnDevice, type SupabaseBrowserClient } from "@/lib/supabase/client";
import { useAppStore } from "@/lib/store";
import { flagReauth } from "@/lib/sync/pull";
import { fmtNum, plural } from "@/lib/format";
import type { Unit, User } from "@/lib/types";
import { ConfirmDialog } from "@/features/configuracion/shared";
import { NO_PROFILE_MESSAGE } from "./auth-errors";
import { loadOwnProfile, otherAccountOnDevice, whenHydrated } from "./session";

/**
 * Ends the session that was just opened and was not let in; the account the store holds has no session now either.
 * `inactiveUserId`: that account was refused for having no active profile — if it is the one on the device, it has no access.
 */
async function leaveSession(inactiveUserId?: string) {
  try {
    await endSessionOnDevice();
  } finally {
    await whenHydrated();
    flagReauth(useAppStore, { noAccess: !!inactiveUserId && useAppStore.getState().session.userId === inactiveUserId });
  }
}

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
        await leaveSession(profile.message === NO_PROFILE_MESSAGE ? userId : undefined);
        return { status: "refused", message: profile.message };
      }
      await whenHydrated();
      // Every tab and the device itself: a tab that never saw the other account's latest captures must not wipe them unasked.
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
      await leaveSession();
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
        // Changes made since the dialog opened (here or in another tab) are not part of what the person agreed to lose.
        const now = await otherAccountOnDevice(pending.user.id);
        if (now && [...now.ids].some((id) => !pending.other.ids.has(id))) {
          setPending({ ...pending, other: now });
          toast.warning("Hay cambios nuevos sin enviar", { description: `Revise cuántos cambios de ${now.name} se borrarían antes de entrar.` });
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
