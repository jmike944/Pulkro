import { isAuthError, isAuthRetryableFetchError, isAuthSessionMissingError, isAuthWeakPasswordError } from "@supabase/supabase-js";

/**
 * Supabase Auth errors → what the person reads (usted, and what to do next). The codes are the stable `error.code` values of
 * Supabase Auth; the HTTP status is the fallback for servers that send no code.
 */

export const NETWORK_MESSAGE = "No hay conexión con el servidor. Revise su señal o su red e intente de nuevo.";
export const NO_ACCESS_MESSAGE = "Su cuenta no tiene acceso activo a Pulkro Cuadrillas. Si cree que es un error, comuníquese con Dirección.";
/** RLS hides a missing AND an inactive profile alike (private.my_role() is null for both): one message covers the two. */
export const NO_PROFILE_MESSAGE =
  "Su cuenta no tiene un perfil activo en Pulkro Cuadrillas: aún no la dan de alta o está desactivada. Comuníquese con Dirección.";
const RATE_LIMIT_MESSAGE = "Demasiados intentos seguidos. Espere unos minutos e intente de nuevo.";
const SERVER_MESSAGE = "El servidor de cuentas no respondió. Intente de nuevo en unos minutos.";

/** The request never reached Supabase (no signal, DNS, captive portal…). */
export function isNetworkFailure(error: unknown): boolean {
  if (isAuthRetryableFetchError(error)) return true;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  // fetch() rejects with a TypeError; postgrest-js reports it as "TypeError: Failed to fetch" with an empty code.
  if (error instanceof TypeError) return true;
  const message = typeof error === "object" && error && "message" in error ? String((error as { message: unknown }).message) : "";
  return /failed to fetch|fetch failed|networkerror|load failed|network request failed/i.test(message);
}

function codeOf(error: unknown): { code?: string; status?: number } {
  return isAuthError(error) ? { code: error.code, status: error.status } : {};
}

/** signInWithPassword. An invited account without a password answers invalid_credentials too, so that text covers it. */
export function signInErrorMessage(error: unknown): string {
  if (isNetworkFailure(error))
    return "No hay conexión con el servidor. La primera vez que entra en este dispositivo necesita señal: revise su conexión e intente de nuevo.";
  const { code, status } = codeOf(error);
  switch (code) {
    case "invalid_credentials":
      return "El correo o la contraseña no coinciden. Revíselos e intente de nuevo. Si recibió una invitación y aún no define su contraseña, use el enlace de ese correo.";
    case "email_not_confirmed":
    case "invite_not_found":
      return "Su cuenta todavía no está activada: abra el enlace del correo de invitación para definir su contraseña. Si ya no funciona, pida a Dirección un nuevo enlace.";
    case "user_banned":
      return NO_ACCESS_MESSAGE;
    case "over_request_rate_limit":
      return RATE_LIMIT_MESSAGE;
    case "validation_failed":
    case "email_address_invalid":
      return "Escriba el correo completo de su cuenta, como nombre@empresa.com.";
  }
  if (status === 429) return RATE_LIMIT_MESSAGE;
  // The access-token hook refuses a missing or inactive profile with a 403.
  if (status === 403) return NO_ACCESS_MESSAGE;
  if (status && status >= 500) return SERVER_MESSAGE;
  return "No se pudo iniciar sesión. Intente de nuevo en unos minutos.";
}

/** resetPasswordForEmail ("¿Olvidó su contraseña?"). */
export function recoveryErrorMessage(error: unknown): string {
  if (isNetworkFailure(error)) return NETWORK_MESSAGE;
  const { code, status } = codeOf(error);
  if (code === "over_email_send_rate_limit" || code === "over_request_rate_limit" || status === 429)
    return "Ya se envió un correo hace poco. Espere unos minutos antes de pedir otro y revise también la carpeta de correo no deseado.";
  if (code === "validation_failed" || code === "email_address_invalid") return "Escriba el correo completo de su cuenta, como nombre@empresa.com.";
  if (status && status >= 500) return SERVER_MESSAGE;
  return "No se pudo enviar el enlace. Intente de nuevo en unos minutos.";
}

/**
 * "no-access": the link is fine but the account may not enter (banned, or no active profile): a new link would not help.
 * "other-browser": a PKCE recovery link (`?code=`) opened without this browser's code verifier: it was asked for in another
 * browser or app, or this browser already spent it.
 * "unfinished" (set by the link page, never by the mappers below): a PKCE exchange that failed after reaching auth-js, which
 * drops the code verifier on any outcome, so the code can no longer be exchanged in this browser.
 */
export type LinkFailure = { kind: "expired" | "other-browser" | "unfinished" | "network" | "no-access" | "other"; message: string };

/**
 * Used, expired or altered: otp_expired / flow_state_* (verifyOtp, the code exchange, Auth's /verify redirect); a spent or
 * revoked session and a forged token (setSession of an implicit-flow link); the account deleted since.
 */
const EXPIRED_LINK_CODES = new Set([
  "otp_expired",
  "flow_state_expired",
  "flow_state_not_found",
  "refresh_token_not_found",
  "refresh_token_already_used",
  "session_not_found",
  "session_expired",
  "bad_jwt",
  "invalid_jwt",
  "user_not_found",
]);
/** exchangeCodeForSession: no verifier in this browser (auth-js), or a verifier from another request (Auth). */
const OTHER_BROWSER_CODES = new Set(["pkce_code_verifier_not_found", "bad_code_verifier"]);
const EXPIRED_LINK_MESSAGE = "Este enlace ya se usó o venció.";

function linkFailureOf(code: string | undefined, status: number | undefined, fallback: string): LinkFailure {
  if ((code && EXPIRED_LINK_CODES.has(code)) || (!code && status === 404)) return { kind: "expired", message: EXPIRED_LINK_MESSAGE };
  if (code && OTHER_BROWSER_CODES.has(code))
    return { kind: "other-browser", message: "Este enlace solo funciona una vez y en el navegador donde se pidió." };
  if (code === "user_banned") return { kind: "no-access", message: NO_ACCESS_MESSAGE };
  if (!code && status === 403) return { kind: "no-access", message: NO_PROFILE_MESSAGE };
  if (code === "over_request_rate_limit" || status === 429) return { kind: "other", message: RATE_LIMIT_MESSAGE };
  if (status && status >= 500) return { kind: "other", message: SERVER_MESSAGE };
  return { kind: "other", message: fallback };
}

/**
 * Verifying an invite / recovery / confirmation link (verifyOtp, setSession, exchangeCodeForSession). A used, expired or
 * altered link answers otp_expired (403); a 403 without a code is the access-token hook refusing an account without an
 * active profile, which no new link fixes.
 */
export function linkErrorOf(error: unknown): LinkFailure {
  if (isNetworkFailure(error)) return { kind: "network", message: NETWORK_MESSAGE };
  const { code, status } = codeOf(error);
  return linkFailureOf(code, status, "No se pudo comprobar el enlace. Intente de nuevo en unos minutos.");
}

/** The OAuth `error` of Auth's redirect, set from the HTTP status of the failure. */
const REDIRECT_ERROR_STATUS = new Map([
  ["invalid_request", 400],
  ["unauthorized_client", 401],
  ["access_denied", 403],
  ["server_error", 500],
  ["temporarily_unavailable", 503],
]);

/**
 * A link Auth refused at its /verify step and reported in the redirect (`#error=access_denied&error_code=otp_expired&
 * error_description=…`; in the query too for PKCE), read like linkErrorOf. The English description is never shown, and a
 * new link is the way out: retrying this one would read the same error again.
 */
export function linkRedirectErrorOf(error: string, errorCode: string): LinkFailure {
  return linkFailureOf(errorCode || undefined, REDIRECT_ERROR_STATUS.get(error), "No se pudo abrir este enlace. Pida a Dirección un nuevo enlace.");
}

const WEAK_REASON: Record<string, string> = {
  length: "Use al menos 12 caracteres.",
  characters: "Combine minúsculas, mayúsculas y números.",
  pwned: "Esa contraseña aparece en filtraciones conocidas: elija otra.",
};

const NEW_LINK = "En la entrada, pida uno nuevo con «¿Olvidó su contraseña?»; si no le llega, comuníquese con Dirección.";

/** updateUser({ password }) after an invite / recovery link. */
export function setPasswordErrorMessage(error: unknown): string {
  if (isNetworkFailure(error)) return NETWORK_MESSAGE;
  if (isAuthWeakPasswordError(error)) {
    const reasons = error.reasons.map((r) => WEAK_REASON[r]).filter(Boolean);
    return reasons.length ? `La contraseña no cumple la política. ${reasons.join(" ")}` : "La contraseña no cumple la política: elija otra.";
  }
  // Invitation or recovery alike, a new password link comes from «¿Olvidó su contraseña?» (it also completes an invitation
  // never accepted); Dirección only when it does not arrive — as the expired-link notice says.
  if (isAuthSessionMissingError(error)) return `El enlace ya no tiene una sesión válida. ${NEW_LINK}`;
  const { code, status } = codeOf(error);
  switch (code) {
    case "same_password":
      return "Elija una contraseña distinta de la anterior.";
    case "weak_password":
      return "La contraseña no cumple la política: use al menos 12 caracteres y combine minúsculas, mayúsculas y números.";
    case "session_not_found":
    case "session_expired":
    case "reauthentication_needed":
      return `La sesión del enlace venció. ${NEW_LINK}`;
    case "over_request_rate_limit":
      return RATE_LIMIT_MESSAGE;
  }
  if (status === 429) return RATE_LIMIT_MESSAGE;
  if (status && status >= 500) return SERVER_MESSAGE;
  return "No se pudo guardar la contraseña. Intente de nuevo en unos minutos.";
}
