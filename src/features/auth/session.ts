"use client";

import type { SupabaseBrowserClient } from "@/lib/supabase/client";
import { unsentIds, useAppStore } from "@/lib/store";
import { askOtherTabsUnsent, ownerOf, persistedUnsent, type DeviceOwner } from "@/lib/device-storage";
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

/** The account session the store holds on this device (data, maybe unsent changes), whatever the state of its Supabase session. */
export function accountOnDevice(): { userId: string; name: string } | null {
  const s = useAppStore.getState();
  if (s.session.mode !== "supabase" || !s.session.signedIn) return null;
  return { userId: s.session.userId, name: s.users.find((u) => u.id === s.session.userId)?.name ?? "otra cuenta" };
}

/**
 * The unsent changes of `owner` on this device: this tab's queue, the queues of its other open tabs (their memory may be
 * ahead of the device) and the queue saved on the device (tabs that are closed, frozen in the background or discarded).
 */
export async function deviceUnsent(owner: DeviceOwner): Promise<ReadonlySet<string>> {
  const s = useAppStore.getState();
  const ids = new Set(ownerOf(s.session) === owner ? unsentIds(s.sync.queue) : []);
  const [others, saved] = await Promise.all([askOtherTabsUnsent(owner), persistedUnsent(owner)]);
  for (const id of [...others, ...saved]) ids.add(id);
  return ids;
}

/** Another account's session on this device that still holds unsent changes (they would be lost by signing in). */
export async function otherAccountOnDevice(userId: string): Promise<{ name: string; ids: ReadonlySet<string> } | null> {
  const s = useAppStore.getState();
  if (s.session.mode !== "supabase" || s.session.userId === userId) return null;
  const ids = await deviceUnsent(ownerOf(s.session));
  if (!ids.size) return null;
  return { name: s.users.find((u) => u.id === s.session.userId)?.name ?? "otra cuenta", ids };
}

/** Demo-only controls (role switch, demo reset): never for an account session, whatever the build. */
export { useDemoSession as useDemoControls } from "@/lib/hooks";
