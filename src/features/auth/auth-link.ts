/**
 * The e-mail links that land on /acceso/definir-contrasena, read from the address bar into one shape. Pure (no React, no
 * Supabase client): the page decides what to do with it.
 *
 * Supabase Auth sends one of these, depending on the e-mail template and on who asked for the link:
 *  - `?token_hash=…&type=…` (form "otp"): the Spanish templates in supabase/templates, which Supabase only uses with a custom
 *    SMTP server. The page verifies the token (verifyOtp).
 *  - `#access_token=…&refresh_token=…&type=invite|recovery|…` (form "session"): the default templates link to Auth's
 *    /verify ({{ .ConfirmationURL }}). For a link asked for without PKCE (an invite from the admin-users function or from the
 *    dashboard), Auth verifies it there and hands the session over in the fragment (implicit flow). The type comes from the
 *    fragment.
 *  - `?code=…` (form "code"): the default template for a recovery asked for in this app. The browser client uses PKCE, so
 *    the session comes back as a one-time code that only the browser that asked for it (it holds the code verifier) can
 *    exchange. Only recovery uses PKCE here, so a code is always a password link.
 *  - `#error=access_denied&error_code=otp_expired&error_description=…` (form "error", also in the query for PKCE): Auth
 *    refused the link. There is nothing to verify.
 * Anything else that looks like a link but cannot be used (a type outside the list, half a session, a token in the query) is
 * "invalid"; no link at all is "none".
 */

export const PASSWORD_LINKS = ["invite", "recovery"] as const;
export const CONFIRM_LINKS = ["email_change", "email", "signup"] as const;
export type LinkType = (typeof PASSWORD_LINKS)[number] | (typeof CONFIRM_LINKS)[number];

export const isLinkType = (t: string | null | undefined): t is LinkType =>
  !!t && ((PASSWORD_LINKS as readonly string[]).includes(t) || (CONFIRM_LINKS as readonly string[]).includes(t));
export const needsPassword = (t: LinkType) => (PASSWORD_LINKS as readonly string[]).includes(t);

export type AuthLink =
  | { form: "otp"; type: LinkType; tokenHash: string }
  | { form: "session"; type: LinkType; accessToken: string; refreshToken: string }
  | { form: "code"; type: "recovery"; code: string; flowId: string | null }
  | { form: "error"; type: LinkType | null; error: string; errorCode: string }
  | { form: "invalid" }
  | { form: "none" };

/** A link that carries a credential the page turns into a session. */
export type LinkCredential = Extract<AuthLink, { form: "otp" | "session" | "code" }>;
export const isCredential = (link: AuthLink): link is LinkCredential =>
  link.form === "otp" || link.form === "session" || link.form === "code";

const INVALID: AuthLink = { form: "invalid" };
const NONE: AuthLink = { form: "none" };

/** Visible ASCII only: no spaces, no control characters. */
const PRINTABLE = /^[\x21-\x7e]+$/;
const JWT = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
/** Auth's PKCE code is a UUID; a little room in case the format changes. */
const CODE = /^[A-Za-z0-9-]{8,128}$/;
/** auth-js' `sb_flow_id` (validatePKCEFlowId). */
const FLOW_ID = /^[A-Za-z0-9_-]{8,64}$/;

const isToken = (value: string | null, max = 1024): value is string => !!value && value.length <= max && PRINTABLE.test(value);

/** Three base64url parts whose middle one is a JSON object: anything else would only fail later, inside Supabase. */
function isJwt(value: string | null): value is string {
  if (!value || value.length > 16384 || !JWT.test(value)) return false;
  try {
    const part = value.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload: unknown = JSON.parse(atob(part.padEnd(Math.ceil(part.length / 4) * 4, "=")));
    return typeof payload === "object" && payload !== null && !Array.isArray(payload);
  } catch {
    return false;
  }
}

/** `search` and `hash` as in `window.location` (the leading "?" / "#" is optional). */
export function parseAuthLink(search: string, hash: string): AuthLink {
  const query = new URLSearchParams(search);
  const fragment = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  const either = (key: string) => query.get(key) ?? fragment.get(key);

  // A failure first, wherever Auth put it (auth-js reads it the same way): there is no session to take.
  const error = either("error");
  const errorCode = either("error_code");
  if (error !== null || errorCode !== null || either("error_description") !== null) {
    const type = either("type");
    return { form: "error", type: isLinkType(type) ? type : null, error: error ?? "", errorCode: errorCode ?? "" };
  }

  if (query.has("token_hash")) {
    const tokenHash = query.get("token_hash");
    const type = query.get("type");
    return isToken(tokenHash) && isLinkType(type) ? { form: "otp", type, tokenHash } : INVALID;
  }

  // Auth only ever puts a session in the fragment, which no server sees. One in the query has been sent to servers already.
  if (query.has("access_token") || query.has("refresh_token")) return INVALID;
  if (fragment.has("access_token") || fragment.has("refresh_token")) {
    const accessToken = fragment.get("access_token");
    const refreshToken = fragment.get("refresh_token");
    const type = fragment.get("type");
    return isJwt(accessToken) && isToken(refreshToken) && isLinkType(type) ? { form: "session", type, accessToken, refreshToken } : INVALID;
  }

  if (query.has("code")) {
    const code = query.get("code");
    const type = query.get("type");
    const flowId = query.get("sb_flow_id");
    if (!code || !CODE.test(code) || (type !== null && type !== "recovery")) return INVALID;
    return { form: "code", type: "recovery", code, flowId: flowId && FLOW_ID.test(flowId) ? flowId : null };
  }

  return query.has("type") || fragment.has("type") ? INVALID : NONE;
}
