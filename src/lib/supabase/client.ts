import { createBrowserClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { jwtIssuedAt, reportServerTime } from "@/lib/sync/clock";
import type { Database } from "./database.types";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, isSupabaseConfigured } from "./config";

export { isSupabaseConfigured };

export type SupabaseBrowserClient = ReturnType<typeof createBrowserClient<Database>>;

let client: SupabaseBrowserClient | undefined;

/**
 * A sign-in or refresh answer (`/auth/v1/token`, `/auth/v1/verify`) carries an access token the Auth server issued while the
 * request was under way: its `iat` reads the server's clock (sync/clock.ts). Read from a copy of the answer, never delaying
 * or changing what auth-js gets.
 */
async function timedTokenFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const sent = Date.now();
  const res = await fetch(input, init);
  const got = Date.now();
  if (res.ok) {
    try {
      void res
        .clone()
        .json()
        .then((body: { access_token?: unknown } | null) => {
          const iat = jwtIssuedAt(body?.access_token);
          if (iat !== undefined) reportServerTime({ kind: "between", server: iat * 1000, sent, got, resolution: 1000 });
        })
        .catch(() => undefined);
    } catch {
      // a body that cannot be copied: no clock reading this time
    }
  }
  return res;
}

/** The browser client's fetch: token answers also read the server's clock. */
const clientFetch: typeof fetch = (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (/\/auth\/v1\/(token|verify)(\?|$)/.test(url)) return timedTokenFetch(input, init);
  return fetch(input, init);
};

/**
 * The one browser client (store, sync engine, auth screens). The session lives in cookies, so the proxy and server code
 * read the same session. Call it from event handlers and effects only (never while rendering on the server).
 *
 * It never takes a session from the address bar (`detectSessionInUrl: false`; @supabase/ssr turns it on in browsers).
 * /acceso/definir-contrasena is the only place that turns an e-mail link into a session (features/auth/auth-link.ts). With
 * detection on and the PKCE flow @supabase/ssr forces, the first use of this client on any page would:
 *  - reject an invite's implicit-flow fragment ("Not a valid PKCE flow url") and skip loading the stored session;
 *  - exchange a recovery `?code=` itself before the page could. A code works once, and exchangeCodeForSession waits for that
 *    detection, so the page's own exchange would always lose.
 * No other flow needs detection: the app has no OAuth, magic-link or sign-up callbacks.
 */
export function getSupabaseBrowserClient(): SupabaseBrowserClient {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase no está configurado: faltan NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.");
  }
  client ??= createBrowserClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { detectSessionInUrl: false }, global: { fetch: clientFetch } });
  return client;
}

let bound: { token: string; client: SupabaseBrowserClient } | undefined;

/** A signal that aborts when either does (AbortSignal.any where the browser has it: iOS 17.4+). */
function eitherSignal(a: AbortSignal, b: AbortSignal): AbortSignal {
  if (typeof AbortSignal.any === "function") return AbortSignal.any([a, b]);
  const either = new AbortController();
  const abort = () => either.abort();
  if (a.aborted || b.aborted) abort();
  else {
    a.addEventListener("abort", abort, { once: true });
    b.addEventListener("abort", abort, { once: true });
  }
  return either.signal;
}

/**
 * A data client (tables, RPCs, Storage) whose every request carries `accessToken`, whatever session the cookies hold by the
 * time the request goes out. The shared client reads the cookies on each request, and they are shared by every tab: an
 * e-mail link or a sign-in in another tab can put another account's session there in the middle of a pull or a push. The
 * sync engine checks the session once per run and binds the run's requests to that session's token. It has no `auth`
 * (sessions are read and refreshed through getSupabaseBrowserClient): a token that expires answers 401, and the engine
 * refreshes and binds again.
 *
 * `signal`: a client for one request whose library call takes no signal of its own — a photo upload (storage-js' `upload`
 * has none). Its fetch adds `signal` to the request, so aborting it cancels the request itself: a deadline, a sign-out or a
 * discarded item does not leave a credentialed upload running that could land later as a file nothing links. Not cached.
 */
export function getTokenClient(accessToken: string, signal?: AbortSignal): SupabaseBrowserClient {
  if (signal) {
    const abortable: typeof fetch = (input, init) => fetch(input, { ...init, signal: init?.signal ? eitherSignal(init.signal, signal) : signal });
    return createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { accessToken: async () => accessToken, global: { fetch: abortable } });
  }
  if (bound?.token !== accessToken) {
    const client = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { accessToken: async () => accessToken });
    bound = { token: accessToken, client };
  }
  return bound.client;
}

/** supabase-js' storage key (`sb-<first label of the project host>-auth-token`): the session cookie and the ones derived from it. */
const AUTH_COOKIE_PREFIX = (() => {
  if (!isSupabaseConfigured) return "";
  try {
    return `sb-${new URL(SUPABASE_URL).hostname.split(".")[0]}-auth-token`;
  } catch {
    return "";
  }
})();

/**
 * Removes this project's Supabase session from the browser by hand: the `sb-<ref>-auth-token` cookie, its `.0…n` chunks, the
 * PKCE `-code-verifier` cookies and any `-user` copy (same path and SameSite as @supabase/ssr sets them).
 */
export function removeAuthCookies() {
  if (!AUTH_COOKIE_PREFIX || typeof document === "undefined") return;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  for (const pair of document.cookie.split(";")) {
    const name = pair.split("=", 1)[0].trim();
    if (name.startsWith(AUTH_COOKIE_PREFIX)) document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax${secure}`;
  }
}

/** base64url → UTF-8 text. */
const fromBase64Url = (b64: string) => {
  const bin = atob(b64.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(b64.length / 4) * 4, "="));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
};

/**
 * Whose session the auth cookies hold now: the `sub` of its access token (undefined: none, or unreadable). @supabase/ssr
 * writes the session JSON, `base64-` + base64url, URI-encoded, in one cookie or in chunks `.0…n`.
 */
export function cookieSessionUser(): string | undefined {
  if (!AUTH_COOKIE_PREFIX || typeof document === "undefined") return undefined;
  const jar = new Map<string, string>();
  for (const pair of document.cookie.split(";")) {
    const at = pair.indexOf("=");
    if (at > 0) jar.set(pair.slice(0, at).trim(), pair.slice(at + 1).trim());
  }
  try {
    const chunks: string[] = [];
    for (let i = 0; jar.has(`${AUTH_COOKIE_PREFIX}.${i}`); i++) chunks.push(jar.get(`${AUTH_COOKIE_PREFIX}.${i}`)!);
    const value = (jar.has(AUTH_COOKIE_PREFIX) ? [jar.get(AUTH_COOKIE_PREFIX)!] : chunks).map(decodeURIComponent).join("");
    if (!value) return undefined;
    const json = value.startsWith("base64-") ? fromBase64Url(value.slice("base64-".length)) : value;
    const token = (JSON.parse(json) as { access_token?: unknown }).access_token;
    if (typeof token !== "string") return undefined;
    const sub = (JSON.parse(fromBase64Url(token.split(".")[1] ?? "")) as { sub?: unknown }).sub;
    return typeof sub === "string" ? sub : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Ends the Supabase session on this device only (scope "local": the account's other devices keep their sessions), within
 * `timeoutMs` whatever the network does.
 *  - It never calls auth-js's signOut(): that one first refreshes an expired access token — a request with no time limit —
 *    and, whenever it settles, revokes and removes whatever session the cookies hold by then: the next person's, if they
 *    signed in meanwhile. Nothing of a sign-out keeps running after this returns.
 *  - Online (and with `revoke`), the session is read once under the deadline (getSession never revokes or removes one; a
 *    refresh that answers late is discarded by auth-js, the cookies having changed) and, while its access token is still
 *    valid, revoked straight with Auth with that token. One AbortController ends both at the deadline (iOS 15 has no
 *    AbortSignal.timeout). Offline there is nobody to tell.
 *  - Then the auth cookies are removed — only while they still hold the session that was there when the sign-out started:
 *    a session that landed meanwhile (the next person signing in, an e-mail link opened) stays.
 * `userId`: end that account's session only (the cookies may hold another account's by now: nothing is done then).
 */
export async function endSessionOnDevice({ revoke = true, timeoutMs = 8000, userId }: { revoke?: boolean; timeoutMs?: number; userId?: string } = {}): Promise<void> {
  if (!isSupabaseConfigured) return;
  const owner = cookieSessionUser();
  if (userId && owner && owner !== userId) return;
  if (revoke && (typeof navigator === "undefined" || navigator.onLine !== false)) {
    const deadline = new AbortController();
    const timer = setTimeout(() => deadline.abort(), timeoutMs);
    try {
      const expired = new Promise<null>((resolve) => deadline.signal.addEventListener("abort", () => resolve(null), { once: true }));
      const session = await Promise.race([
        getSupabaseBrowserClient()
          .auth.getSession()
          .then(({ data }) => data.session)
          .catch(() => null),
        expired,
      ]);
      // The session the sign-out started with (a cookie this code cannot read: whatever auth-js read), still valid — and, for
      // `userId`, that account's (never another account's, even when the cookie could not be read).
      if (
        session &&
        (owner === undefined || session.user.id === owner) &&
        (!userId || session.user.id === userId) &&
        (session.expires_at ?? 0) * 1000 > Date.now()
      ) {
        await fetch(`${SUPABASE_URL}/auth/v1/logout?scope=local`, {
          method: "POST",
          headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${session.access_token}` },
          signal: deadline.signal,
        }).catch(() => undefined);
      }
    } finally {
      clearTimeout(timer);
    }
  }
  if (cookieSessionUser() === owner) removeAuthCookies();
}
