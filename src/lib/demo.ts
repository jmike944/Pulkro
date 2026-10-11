import { isSupabaseConfigured } from "./supabase/config";

/**
 * Demo controls (in-app "Ver la app como…" role switch and "Restablecer datos demo").
 * NEXT_PUBLIC_DEMO is inlined at build time: unset (default) keeps the demo on; "0" builds a pilot / production app without them.
 * They never apply to an account session (session.mode "supabase"), whatever the build.
 */
export const DEMO_ENABLED = process.env.NEXT_PUBLIC_DEMO !== "0";

/**
 * The login screen's demo role picker (and the demo dataset behind it). Offered while the demo is on, and always when the
 * build has no Supabase project (then the demo is the only way in). A pilot build (NEXT_PUBLIC_DEMO=0 + Supabase) has none.
 */
export const DEMO_SIGN_IN = DEMO_ENABLED || !isSupabaseConfigured;
