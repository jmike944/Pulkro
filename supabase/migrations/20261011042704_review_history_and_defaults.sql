-- Pulkro Cuadrillas · backend 08 · review round (2026-10-11): function default privileges, append-only DELETE
-- Findings F13 and F12 of supabase/tests/09_review_findings.sql. See docs/backend/architecture.md §6 and §13.

------------------------------------------------------------------------------------------------------------------------
-- F13 · Postgres grants EXECUTE on every new function to PUBLIC. The per-schema default privileges of the foundation
-- migration cannot take that built-in grant away (per-schema entries only add to the global ones); a global entry can.
-- From here on a function created by `postgres` in any schema is executable by its owner only: every migration grants
-- EXECUTE explicitly (private.expose_rpc for RPCs, explicit grants for RLS helpers). Trigger functions need no grant.
------------------------------------------------------------------------------------------------------------------------
alter default privileges for role postgres revoke execute on functions from public;

------------------------------------------------------------------------------------------------------------------------
-- F12 · History is append-only for DELETE and TRUNCATE too, not only UPDATE — even for the table owner (SQL editor,
-- a mistaken migration). Escape hatch for a vetted retention job only (server-side, never an API role, see §14):
--   begin; set local pulkro.history_purge = 'on'; delete from public.audit_log where at < …; commit;
-- service_role (secret key) keeps SELECT + INSERT on these tables and loses UPDATE / DELETE / TRUNCATE.
------------------------------------------------------------------------------------------------------------------------
create function private.reject_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(current_setting('pulkro.history_purge', true), '') = 'on' then
    if tg_level = 'ROW' then
      return old;
    end if;
    return null;
  end if;
  raise exception using errcode = 'PT409',
    message = format('%s es un registro histórico y no se elimina.', tg_table_name), hint = 'append_only';
end;
$$;
revoke all on function private.reject_delete() from public, anon, authenticated, service_role;

do $$
declare
  t text;
begin
  foreach t in array array[
    'crew_changes', 'jornada_checks', 'jornada_notes', 'case_events', 'order_closures', 'reports', 'report_shares',
    'survey_tokens', 'audit_log'
  ] loop
    execute format('create trigger reject_delete before delete on public.%I for each row execute function private.reject_delete()', t);
    execute format('create trigger reject_truncate before truncate on public.%I for each statement execute function private.reject_delete()', t);
    execute format('revoke update, delete, truncate on table public.%I from service_role', t);
  end loop;
end;
$$;
