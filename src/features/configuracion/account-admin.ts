"use client";

/**
 * Account administration for account sessions (Dirección): invite, deactivate, reactivate and change e-mail go through the
 * `admin-users` Edge Function (supabase/functions/admin-users), which holds the Auth admin key. They are ONLINE-ONLY
 * actions: nothing is queued for later (an invitation or a ban cannot wait in a phone's queue), so the UI says
 * "Necesita conexión" while offline. A success applies the server's profile on the device (applyServerUser) and asks for a
 * pull, which also brings the audit entries the server wrote. The demo keeps using the store's upsertUser.
 * The function acts as whoever the browser's Supabase session belongs to: nothing is sent while that is not the account on
 * the device (an invite or recovery link opened here replaces it: "Vuelva a entrar" first), so no change is made, or
 * audited, in another person's name.
 */
import { useCallback, useMemo, useRef } from "react";
import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError, isAuthRetryableFetchError } from "@supabase/supabase-js";
import { isOffline } from "@/lib/store";
import { verifyAccount } from "@/lib/sync/pull";
import { useAppStore, useIsOffline } from "@/lib/hooks";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { mapProfile, type ProfileFields } from "@/lib/sync/map";
import type { Role, User } from "@/lib/types";

export const NEEDS_CONNECTION = "Necesita conexión";
export const NEEDS_CONNECTION_DETAIL =
  "Invitar, desactivar, reactivar y cambiar el correo de una cuenta se hace en el servidor: conéctese e intente de nuevo.";

const NETWORK_MESSAGE = "No hay conexión con el servidor. Revise su señal o su red e intente de nuevo.";
/** The device says it is online, yet the request never got an answer (the service down, a blocked origin, DNS…). */
const UNREACHABLE_MESSAGE =
  "No se pudo contactar al servicio de cuentas. Intente de nuevo en unos minutos; si sigue igual, avise a quien administra el sistema.";
const TIMEOUT_MESSAGE = "El servidor no confirmó la respuesta a tiempo. Vuelva a intentarlo: si el cambio ya se aplicó, no se repetirá.";
const EXPIRED_MESSAGE = "Su sesión venció. Vuelva a iniciar sesión e intente de nuevo.";
export const REAUTH = "Vuelva a entrar con su cuenta";
export const REAUTH_DETAIL =
  "La sesión de su cuenta ya no está abierta en este dispositivo: vuelva a entrar con su cuenta para invitar, desactivar, reactivar o cambiar correos.";
const GENERIC_MESSAGE = "El servicio de cuentas no respondió. Intente de nuevo en unos minutos.";
const MISSING_MESSAGE = "El servicio de cuentas todavía no está disponible en el servidor. Avise a quien administra el sistema.";
const TIMEOUT_MS = 30_000;

export type AdminFailure = { ok: false; code: string; message: string };

/**
 * No answer, a timeout or a server error: the change may have been applied anyway. Sending the same operation again (same op
 * id and payload) completes it or answers the stored result; nothing is repeated.
 */
export const isUnknownOutcome = (failure: AdminFailure) =>
  ["network", "timeout", "unknown", "bad_response", "unavailable", "server_error"].includes(failure.code) || /^http_5\d\d$/.test(failure.code);
type Base = { ok: true; duplicate: boolean; user_id: string; profile: ProfileFields | null };
export type InviteResult = Base | AdminFailure;
export type ActiveResult = (Base & { active: boolean; open_orders: string[] }) | AdminFailure;
export type EmailResult = (Base & { email: string; invite_pending: boolean }) | AdminFailure;

export type InviteInput = { email: string; name: string; role: Role; unitId: string; title: string; phone: string; hue: number };

/** A fresh idempotency key (the RPC op id). Keep one per attempt of the same action so a resend is answered, not redone. */
export const newOpId = () => crypto.randomUUID();

/**
 * Op ids for one dialog: the same action with the same payload keeps its id (sending again after a lost answer gets the
 * server's stored result instead of a second change); a different payload gets a new id (the server binds an op id to its
 * arguments and would refuse it).
 */
export function useOpIds() {
  const ids = useRef(new Map<string, { key: string; id: string }>());
  return useCallback((scope: string, payload: unknown) => {
    const key = JSON.stringify(payload);
    const current = ids.current.get(scope);
    if (current?.key === key) return current.id;
    const id = newOpId();
    ids.current.set(scope, { key, id });
    return id;
  }, []);
}

/** A non-2xx answer: the function's own `{ ok: false, code, message }`, or the gateway's (expired JWT, function missing). */
async function failureOf(error: unknown): Promise<AdminFailure> {
  if (error instanceof FunctionsHttpError) {
    const response = error.context as Response | undefined;
    let body: { ok?: unknown; code?: unknown; message?: unknown } | null = null;
    try {
      body = response ? await response.json() : null;
    } catch {
      body = null;
    }
    if (body?.ok === false && typeof body.code === "string" && typeof body.message === "string") {
      return { ok: false, code: body.code, message: body.message };
    }
    const status = response?.status ?? 0;
    if (status === 401) return { ok: false, code: "no_session", message: EXPIRED_MESSAGE };
    if (status === 404) return { ok: false, code: "not_deployed", message: MISSING_MESSAGE };
    return { ok: false, code: `http_${status}`, message: GENERIC_MESSAGE };
  }
  // functions-js aborts at `timeout` and wraps the AbortError; a refused CORS preflight is a TypeError like no signal at all.
  if (error instanceof FunctionsFetchError && (error.context as { name?: unknown } | undefined)?.name === "AbortError") {
    return { ok: false, code: "timeout", message: TIMEOUT_MESSAGE };
  }
  if (error instanceof FunctionsFetchError || error instanceof FunctionsRelayError) return networkFailure();
  return { ok: false, code: "unknown", message: GENERIC_MESSAGE };
}

const networkFailure = (): AdminFailure => ({
  ok: false,
  code: "network",
  message: typeof navigator !== "undefined" && navigator.onLine === false ? NETWORK_MESSAGE : UNREACHABLE_MESSAGE,
});

/**
 * The browser's Supabase session must be the device account's: the function takes the caller from the JWT, and an invite or
 * recovery link opened on this device swaps it for that other account's.
 */
async function sessionProblem(): Promise<AdminFailure | null> {
  const st = useAppStore.getState();
  const reauth: AdminFailure = { ok: false, code: "no_session", message: REAUTH_DETAIL };
  if (st.session.needsReauth) return reauth;
  try {
    const { data, error } = await getSupabaseBrowserClient().auth.getSession();
    if (error && isAuthRetryableFetchError(error)) return networkFailure();
    if (data.session?.user.id === st.session.userId) return null;
  } catch {
    return networkFailure();
  }
  // Missing, or another account's: the device account must sign in again (the shell says so too).
  void verifyAccount(useAppStore);
  return reauth;
}

async function invokeAdmin<T extends { ok: true }>(body: Record<string, unknown>): Promise<T | AdminFailure> {
  if (isOffline(useAppStore.getState())) return { ok: false, code: "offline", message: NEEDS_CONNECTION_DETAIL };
  const refused = await sessionProblem();
  if (refused) return refused;
  try {
    const { data, error } = await getSupabaseBrowserClient().functions.invoke("admin-users", { body, timeout: TIMEOUT_MS });
    if (error) return await failureOf(error);
    if (data && typeof data === "object" && (data as { ok?: unknown }).ok === true) return data as T;
    return { ok: false, code: "bad_response", message: GENERIC_MESSAGE };
  } catch {
    return networkFailure();
  } finally {
    // Success or not (a timeout may have reached the server anyway), read the server's state: profiles and audit.
    if (!isOffline(useAppStore.getState())) void useAppStore.getState().pullNow({ manual: true });
  }
}

/** The server's profile on the device: a new account whole, an existing one only in the fields the action changed. */
function apply(profile: ProfileFields | null, fields?: (keyof User)[]) {
  if (profile) useAppStore.getState().applyServerUser(mapProfile(profile), fields);
}

export async function inviteUser(input: InviteInput, opId: string): Promise<InviteResult> {
  const result = await invokeAdmin<Extract<InviteResult, { ok: true }>>({ action: "invite", opId, ...input });
  if (result.ok) apply(result.profile);
  return result;
}

export async function setUserActive(user: User, active: boolean, opId: string): Promise<ActiveResult> {
  const result = await invokeAdmin<Extract<ActiveResult, { ok: true }>>({
    action: active ? "reactivate" : "deactivate",
    opId,
    userId: user.id,
  });
  if (result.ok) {
    apply(result.profile, ["active"]);
    if (!result.open_orders) result.open_orders = [];
  }
  return result;
}

export async function changeUserEmail(user: User, email: string, opId: string): Promise<EmailResult> {
  const result = await invokeAdmin<Extract<EmailResult, { ok: true }>>({ action: "change_email", opId, userId: user.id, email });
  if (result.ok) apply(result.profile, ["email"]);
  return result;
}

/**
 * Whether user administration runs through the server (account session) and whether it can right now: `offline`, or
 * `reauth` (the browser's Supabase session is not this account's: sign in again first). In the demo `account` is false and
 * the store's local actions apply as before.
 */
export function useAccountAdmin() {
  const account = useAppStore((s) => s.session.mode === "supabase");
  const needsReauth = useAppStore((s) => s.session.mode === "supabase" && !!s.session.needsReauth);
  const offline = useIsOffline();
  return useMemo(() => ({ account, offline: account && offline, reauth: account && needsReauth }), [account, offline, needsReauth]);
}
