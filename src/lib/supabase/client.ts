import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, isSupabaseConfigured } from "./config";

export { isSupabaseConfigured };

export type SupabaseBrowserClient = ReturnType<typeof createBrowserClient<Database>>;

let client: SupabaseBrowserClient | undefined;

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
  client ??= createBrowserClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { detectSessionInUrl: false } });
  return client;
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
 *  - Online, signOut() asks Auth to revoke this session's refresh token, waiting at most `timeoutMs`. Offline (or with
 *    `revoke: false`) it is not tried: there is nobody to tell.
 *  - Then the session is always removed here. signOut() does not throw when it cannot first refresh an expired access token
 *    (offline for over an hour, Auth unreachable): it resolves with that error and leaves every auth cookie in place.
 */
export async function endSessionOnDevice({ revoke = true, timeoutMs = 8000 }: { revoke?: boolean; timeoutMs?: number } = {}): Promise<void> {
  if (!isSupabaseConfigured) return;
  if (revoke && (typeof navigator === "undefined" || navigator.onLine !== false)) {
    let timer: ReturnType<typeof setTimeout> | undefined;
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
