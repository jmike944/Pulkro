"use client";

import type { SupabaseBrowserClient } from "@/lib/supabase/client";
import { unsentCount, useAppStore } from "@/lib/store";
import { mapProfile, mapUnit } from "@/lib/sync/map";
import type { Unit, User } from "@/lib/types";
import { NETWORK_MESSAGE, NO_PROFILE_MESSAGE, isNetworkFailure } from "./auth-errors";

/**
 * Authorization lives in the database: RLS reads public.profiles. The access-token hook (pulkro_role / pulkro_unit_id) may
 * not be enabled, so the app never relies on those claims: it reads the signed-in account's own profile row.
 */

export type ProfileResult = { ok: true; user: User; unit?: Unit } | { ok: false; message: string };

/** The signed-in account's profile (`profiles where id = auth.uid()`), mapped to the app's User, plus its unit. */
export async function loadOwnProfile(supabase: SupabaseBrowserClient, userId: string): Promise<ProfileResult> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, name, initials, role, title, unit_id, email, phone, hue, active")
    .eq("id", userId)
    .maybeSingle();
  if (error) return { ok: false, message: isNetworkFailure(error) ? NETWORK_MESSAGE : "No se pudo leer su perfil. Intente de nuevo en unos minutos." };
  if (!data || !data.active) return { ok: false, message: NO_PROFILE_MESSAGE };
  const user = mapProfile(data);
  // The unit names the account's scope in the shell; the session works without it (RLS lets every role read its own unit).
  const { data: unit } = await supabase.from("units").select("id, name, code, city").eq("id", data.unit_id).maybeSingle();
  return { ok: true, user, unit: unit ? mapUnit(unit) : undefined };
}

/** Resolves once the store has been read back from IndexedDB (writing before that would be overwritten by the rehydration). */
export function whenHydrated(): Promise<void> {
  if (useAppStore.getState().hydrated) return Promise.resolve();
  return new Promise((resolve) => {
    const stop = useAppStore.subscribe((s) => {
      if (!s.hydrated) return;
      stop();
      resolve();
    });
  });
}

/** Another account's session on this device that still holds unsent changes (they would be lost by signing in). */
export function otherAccountOnDevice(userId: string): { name: string; unsent: number } | null {
  const s = useAppStore.getState();
  if (s.session.mode !== "supabase" || s.session.userId === userId) return null;
  const unsent = unsentCount(s.sync.queue);
  if (!unsent) return null;
  return { name: s.users.find((u) => u.id === s.session.userId)?.name ?? "otra cuenta", unsent };
}

/** Demo-only controls (role switch, demo reset): never for an account session, whatever the build. */
export { useDemoSession as useDemoControls } from "@/lib/hooks";
