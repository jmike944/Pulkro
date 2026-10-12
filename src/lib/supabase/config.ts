/**
 * Supabase project values (public: the publishable key maps to `anon` / `authenticated`, RLS does the protecting).
 * Read with literal `process.env.NEXT_PUBLIC_…` references so Next inlines them at build time (a dynamic lookup is not inlined).
 * Without both values the app runs demo-only: no account sign-in, no proxy session refresh.
 */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
export const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ?? "";

export const isSupabaseConfigured = SUPABASE_URL.length > 0 && SUPABASE_PUBLISHABLE_KEY.length > 0;
