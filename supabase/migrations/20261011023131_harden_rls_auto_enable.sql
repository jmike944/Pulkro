-- Pulkro Cuadrillas · backend 07 · close advisor lints 0028/0029 on the platform's RLS auto-enable helper
-- public.rls_auto_enable() was created with the project (event trigger `ensure_rls`: enables RLS on every table
-- created in `public`). It is SECURITY DEFINER and, like every new function, executable by PUBLIC/anon/authenticated,
-- so the advisors flag it as callable through /rest/v1/rpc. It is an event-trigger function: Postgres never checks
-- EXECUTE when the event trigger fires, so revoking it from the API roles keeps the safeguard working.
revoke all on function public.rls_auto_enable() from public, anon, authenticated, service_role;
