import { createBrowserClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, isSupabaseConfigured } from "./config";

export { isSupabaseConfigured };

export type SupabaseBrowserClient = ReturnType<typeof createBrowserClient<Database>>;

let client: SupabaseBrowserClient | undefined;

/** How long the revoke request of a sign-out may take (endSessionOnDevice sets it below its own wait). */
let logoutBudgetMs = 7000;

/**
 * The browser client's fetch. The revoke request a sign-out makes (`/auth/v1/logout`) gives up within endSessionOnDevice's
 * wait: left running on a weak connection, it would settle after the next person signed in, and auth-js would then remove
 * *their* session from the cookies (and broadcast SIGNED_OUT to every tab).
 */
const clientFetch: typeof fetch = (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (!/\/auth\/v1\/logout(\?|$)/.test(url) || typeof AbortSignal === "undefined" || !("timeout" in AbortSignal)) return fetch(input, init);
  const limit = AbortSignal.timeout(logoutBudgetMs);
  const signal = init?.signal && "any" in AbortSignal ? AbortSignal.any([init.signal, limit]) : limit;
  return fetch(input, { ...init, signal });
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

/**
 * A data client (tables, RPCs, Storage) whose every request carries `accessToken`, whatever session the cookies hold by the
 * time the request goes out. The shared client reads the cookies on each request, and they are shared by every tab: an
 * e-mail link or a sign-in in another tab can put another account's session there in the middle of a pull or a push. The
 * sync engine checks the session once per run and binds the run's requests to that session's token. It has no `auth`
 * (sessions are read and refreshed through getSupabaseBrowserClient): a token that expires answers 401, and the engine
 * refreshes and binds again.
 */
export function getTokenClient(accessToken: string): SupabaseBrowserClient {
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

/**
 * Ends the Supabase session on this device only (scope "local": the account's other devices keep their sessions).
 *  - Online, signOut() asks Auth to revoke this session's refresh token, waiting at most `timeoutMs`; the request itself is
 *    abandoned before that (clientFetch), so signOut never removes a session from the cookies after this returns. Offline
 *    (or with `revoke: false`) it is not tried: there is nobody to tell.
 *  - Then the session is always removed here. signOut() does not throw when it cannot first refresh an expired access token
 *    (offline for over an hour, Auth unreachable): it resolves with that error and leaves every auth cookie in place.
 */
export async function endSessionOnDevice({ revoke = true, timeoutMs = 8000 }: { revoke?: boolean; timeoutMs?: number } = {}): Promise<void> {
  if (!isSupabaseConfigured) return;
  if (revoke && (typeof navigator === "undefined" || navigator.onLine !== false)) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    logoutBudgetMs = Math.max(1000, timeoutMs - 1000);
    try {
      const outcome = await Promise.race([
        getSupabaseBrowserClient().auth.signOut({ scope: "local" }),
        new Promise<"timeout">((resolve) => (timer = setTimeout(() => resolve("timeout"), timeoutMs))),
      ]);
      // `{ error }` (or no answer in time): the session is still in the cookies — removed below.
      if (outcome !== "timeout" && outcome.error) console.warn("[auth] signOut:", outcome.error.message);
    } catch {
      // removed below
    } finally {
      clearTimeout(timer);
    }
  }
  removeAuthCookies();
}
