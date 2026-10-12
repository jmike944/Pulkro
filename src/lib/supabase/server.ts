import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "./database.types";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, isSupabaseConfigured } from "./config";

export { isSupabaseConfigured };

/**
 * A server client for one request (Server Components, Server Functions, Route Handlers): create it per request, never share
 * it. Verify the user with `supabase.auth.getClaims()`, never `getSession()` (it trusts the cookie without checking it).
 */
export async function createSupabaseServerClient() {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase no está configurado: faltan NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.");
  }
  const cookieStore = await cookies();
  return createServerClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component, which cannot set cookies: the proxy (src/proxy.ts) refreshes the session on
          // every request instead. Server Functions and Route Handlers do write them.
        }
      },
    },
  });
}
