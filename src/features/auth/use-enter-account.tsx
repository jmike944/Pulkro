"use client";

import { useCallback, useRef, useState } from "react";
import { UserRoundX } from "lucide-react";
import { getSupabaseBrowserClient, type SupabaseBrowserClient } from "@/lib/supabase/client";
import { useAppStore } from "@/lib/store";
import { fmtNum, plural } from "@/lib/format";
import type { Unit, User } from "@/lib/types";
import { ConfirmDialog } from "@/features/configuracion/shared";
import { loadOwnProfile, otherAccountOnDevice, whenHydrated } from "./session";

export type EnterResult = { status: "entered" } | { status: "confirm" } | { status: "refused"; message: string };

type Pending = { user: User; unit?: Unit; other: { name: string; unsent: number } };

/**
 * After Supabase Auth has a session (password sign-in, or an invite / recovery link): read the account's own profile, refuse
 * (and sign out) when it is missing or inactive, and put the session into the store as an account session. When another
 * account left unsent changes on this device, ask before they are wiped (the dialog is rendered by the caller).
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
        await supabase.auth.signOut({ scope: "local" });
        return { status: "refused", message: profile.message };
      }
      await whenHydrated();
      const other = otherAccountOnDevice(profile.user.id);
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
      await getSupabaseBrowserClient().auth.signOut({ scope: "local" });
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
            Hay <b>{plural(pending.other.unsent, "cambio sin enviar", "cambios sin enviar")}</b> de {pending.other.name}. Si entra con su cuenta,
            se borrarán de este dispositivo.
          </>
        )
      }
      rows={pending ? [{ k: "Cuenta anterior", v: pending.other.name }, { k: "Cambios sin enviar", v: fmtNum(pending.other.unsent) }] : []}
      checkboxLabel="Entiendo que esos cambios se borrarán."
      confirmLabel="Borrar y entrar"
      destructive
      onConfirm={() => {
        if (!pending) return;
        confirmed.current = true;
        useAppStore.getState().startSupabaseSession(pending.user, pending.unit);
        onEntered();
      }}
    />
  );

  return { enter, replaceDialog };
}
