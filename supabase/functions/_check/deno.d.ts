/**
 * Declarations for type-checking the Edge Functions without Deno (scripts/check-edge-functions.mjs; Deno itself ignores this
 * folder: a name starting with "_" is no function). They stand in for what Deno resolves at deploy time:
 *  - `Deno`: only the globals the functions use (the web APIs — Request, Response, fetch, crypto — come from lib "dom");
 *  - `npm:@supabase/supabase-js@<pin>`: the supabase-js installed in node_modules, the same version (the script checks
 *    that the pin and node_modules agree);
 *  - `npm:@supabase/server@<pin>`: not installed here — hand-written for the part the functions use. A change in that
 *    package's API is not caught by this check; bump the pin and these declarations together.
 */

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

declare module "npm:@supabase/supabase-js@2.117.2" {
  export * from "@supabase/supabase-js";
}

declare module "npm:@supabase/supabase-js@2.117.2/cors" {
  export * from "@supabase/supabase-js/cors";
}

declare module "npm:@supabase/server@1.9.1" {
  import type { SupabaseClient } from "@supabase/supabase-js";

  export type SupabaseContext = {
    /** Acts as the caller (their JWT): RLS and the RPCs' own checks apply. */
    supabase: SupabaseClient;
    /** The secret key: bypasses RLS (auth.admin, the caller's own profile row). */
    supabaseAdmin: SupabaseClient;
    /** The verified JWT's claims (`auth: "user"`), or null. */
    userClaims?: { id?: string } | null;
  };

  export type SupabaseContextOptions = {
    auth: "user" | "none";
    env?: { publishableKeys?: Record<string, string>; secretKeys?: Record<string, string> };
  };

  export function createSupabaseContext(
    req: Request,
    options: SupabaseContextOptions,
  ): Promise<{ data: SupabaseContext; error: null } | { data: null; error: { status?: number; code?: string; message?: string } }>;
}
