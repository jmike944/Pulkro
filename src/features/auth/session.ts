"use client";

import type { SupabaseBrowserClient } from "@/lib/supabase/client";
import { unsentIds, useAppStore } from "@/lib/store";
import { ownerOf, persistedUnsent, savedAccount, type DeviceOwner } from "@/lib/device-storage";
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

/**
 * How long a sign-out, or another account's sign-in, waits for photos still being stored (lib/device-storage
 * `whenCapturesSettled`) before it counts the unsent changes: a photo is no change until it is queued.
 */
export const CAPTURE_WAIT_MS = 20_000;

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
 * The unsent changes of `owner` on this device: this tab's queue and the queue saved on the device. One tab per device holds
 * the data (lib/device-storage), so no other tab holds any; the saved queue adds what a write of this tab that failed left
 * there.
 */
export async function deviceUnsent(owner: DeviceOwner): Promise<ReadonlySet<string>> {
  const s = useAppStore.getState();
  const ids = new Set(ownerOf(s.session) === owner ? unsentIds(s.sync.queue) : []);
  for (const id of await persistedUnsent(owner)) ids.add(id);
  return ids;
}

/**
 * Another account on this device that still holds unsent changes (they would be lost by signing in): the one this tab holds,
 * or — when this tab holds none (signed out, the demo) — the one saved on the device, which a write of this tab that the
 * device refused may have left there (a sign-out whose wipe failed, an account whose first write never landed).
 */
export async function otherAccountOnDevice(userId: string): Promise<{ name: string; ids: ReadonlySet<string> } | null> {
  const s = useAppStore.getState();
  if (s.session.mode === "supabase") {
    if (s.session.userId === userId) return null;
    const ids = await deviceUnsent(ownerOf(s.session));
    if (!ids.size) return null;
    return { name: s.users.find((u) => u.id === s.session.userId)?.name ?? "otra cuenta", ids };
  }
  const saved = await savedAccount();
  if (!saved || saved.userId === userId || !saved.ids.length) return null;
  return { name: saved.name ?? "otra cuenta", ids: new Set(saved.ids) };
}

/** Demo-only controls (role switch, demo reset): never for an account session, whatever the build. */
export { useDemoSession as useDemoControls } from "@/lib/hooks";
