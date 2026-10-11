-- Pulkro Cuadrillas · backend 01 · foundation
-- Schemas, default privileges (nothing reaches the Data API unless a migration grants it), enum types and
-- the shared helpers every later migration uses. See docs/backend/architecture.md.

------------------------------------------------------------------------------------------------------------------------
-- Schemas
------------------------------------------------------------------------------------------------------------------------
-- `private` is NOT exposed through the Data API. It holds RLS helpers, the business-rule implementations behind
-- the public RPC wrappers, idempotency records and folio sequences. Functions in it are revoked from PUBLIC one by
-- one and granted explicitly; tables in it get no grants at all.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated, service_role;

------------------------------------------------------------------------------------------------------------------------
-- Default privileges: new objects in `public` are not reachable by the API roles until a migration grants them.
-- (Supabase used to auto-grant every new table/function to anon + authenticated; this project opts out explicitly.)
------------------------------------------------------------------------------------------------------------------------
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated, service_role;
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated, service_role;

------------------------------------------------------------------------------------------------------------------------
-- Enum types (values mirror src/lib/types.ts exactly, so the client maps them 1:1)
------------------------------------------------------------------------------------------------------------------------
create type public.user_role as enum ('direccion', 'administracion', 'supervisor');
create type public.client_segment as enum ('Industrial', 'Comercial', 'Residencial');
create type public.order_status as enum (
  'borrador', 'programada', 'en_ejecucion', 'jornada_cerrada', 'pendiente_validacion', 'finalizada',
  'reporte_enviado', 'seguimiento', 'archivada', 'cancelada', 'reprogramada', 'con_incidencia', 'reabierta'
);
create type public.order_priority as enum ('normal', 'alta');
create type public.jornada_status as enum ('pendiente', 'en_curso', 'cerrada');
create type public.check_kind as enum ('entrada', 'salida');
create type public.geo_source as enum ('gps', 'manual', 'remota');
create type public.photo_kind as enum ('antes', 'despues', 'incidencia', 'postventa');
create type public.photo_origin as enum ('camera', 'gallery');
create type public.taken_at_source as enum ('exif', 'file', 'device');
create type public.photo_geo_source as enum ('exif', 'device');
create type public.incident_type as enum (
  'danos', 'faltante_material', 'faltante_personal', 'trabajo_adicional', 'retraso_ausencia', 'solicitud_queja', 'otra'
);
create type public.severity as enum ('baja', 'media', 'alta');
create type public.incident_status as enum ('abierta', 'resuelta');
create type public.share_channel as enum ('whatsapp', 'email', 'descarga');
create type public.conformity_method as enum ('firma', 'verbal', 'correo');
create type public.case_category as enum ('calidad', 'puntualidad', 'personal', 'danos', 'faltante', 'facturacion', 'otro');
create type public.case_channel as enum ('telefono', 'whatsapp', 'correo', 'encuesta', 'presencial');
create type public.case_status as enum ('abierto', 'en_proceso', 'resuelto', 'cerrado');
create type public.audit_entity as enum (
  'orden', 'jornada', 'foto', 'incidencia', 'reporte', 'caso', 'encuesta', 'catalogo', 'usuario'
);
create type public.actor_kind as enum ('usuario', 'cliente', 'sistema');

------------------------------------------------------------------------------------------------------------------------
-- Errors. RPCs raise PostgREST "PTnnn" SQLSTATEs so the HTTP status is meaningful; `hint` carries a stable,
-- machine-readable reason for the sync engine (e.g. 'closure_blocked', 'out_of_scope').
--   PT401 no active session/profile · PT403 role not allowed · PT404 not found or outside the caller's scope
--   PT409 state conflict (closed order, duplicate check-in…) · PT422 invalid input
------------------------------------------------------------------------------------------------------------------------
create function private.fail(p_code text, p_message text, p_hint text default null)
returns void
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = p_code, message = p_message, hint = coalesce(p_hint, '');
end;
$$;

------------------------------------------------------------------------------------------------------------------------
-- Server time stamping. Every table carries created_at / updated_at (server clock, never the client's) and the
-- mutable ones a row_version that the offline client uses to merge pulled rows.
------------------------------------------------------------------------------------------------------------------------
create function private.stamp_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_at := now();
  new.updated_at := now();
  return new;
end;
$$;

create function private.stamp_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_at := old.created_at;
  new.updated_at := now();
  new.row_version := old.row_version + 1;
  return new;
end;
$$;

-- Append-only tables reject updates outright (history must not be rewritten, even by mistake in an RPC).
create function private.reject_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = 'PT409', message = format('%s es un registro histórico y no se modifica.', tg_table_name), hint = 'append_only';
end;
$$;

------------------------------------------------------------------------------------------------------------------------
-- Folio sequences (server-generated: offline devices never invent folios, they show "pendiente" until synced)
------------------------------------------------------------------------------------------------------------------------
create sequence private.order_folio_seq;
create sequence private.incident_folio_seq;
create sequence private.case_folio_seq;

------------------------------------------------------------------------------------------------------------------------
-- Idempotency: one row per client operation (the offline queue item id). A retried call returns the stored result.
------------------------------------------------------------------------------------------------------------------------
create table private.sync_ops (
  op_id uuid primary key,
  actor_id uuid,
  action text not null,
  result jsonb,
  created_at timestamptz not null default now()
);
create index sync_ops_created_at_idx on private.sync_ops (created_at);
create index sync_ops_actor_id_idx on private.sync_ops (actor_id);
alter table private.sync_ops enable row level security; -- no policies: only the RPC implementations touch it

------------------------------------------------------------------------------------------------------------------------
-- RPC exposure. Business rules live in SECURITY DEFINER functions in `private` (not reachable over HTTP).
-- private.expose_rpc(name, roles) creates a thin SECURITY INVOKER wrapper `public.<name>` with the exact same
-- signature and grants EXECUTE on both to the listed roles only. Changing a signature later: drop the old
-- public wrapper first (an overload would make PostgREST calls ambiguous), then call expose_rpc again.
------------------------------------------------------------------------------------------------------------------------
create function private.expose_rpc(p_name text, p_roles text[] default array['authenticated'])
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_fn oid;
  v_args text;
  v_ident text;
  v_result text;
  v_call text;
  v_volatility text;
  v_role text;
begin
  select p.oid into strict v_fn
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private' and p.proname = p_name;

  v_args := pg_catalog.pg_get_function_arguments(v_fn);
  v_ident := pg_catalog.pg_get_function_identity_arguments(v_fn);
  v_result := pg_catalog.pg_get_function_result(v_fn);
  v_volatility := case (select provolatile from pg_catalog.pg_proc where oid = v_fn)
                    when 's' then 'stable' when 'i' then 'immutable' else 'volatile' end;
  select string_agg(format('%1$I => %1$I', a.name), ', ' order by a.ord) into v_call
  from unnest((select proargnames from pg_catalog.pg_proc where oid = v_fn)) with ordinality as a(name, ord);

  execute format(
    'create or replace function public.%1$I(%2$s) returns %3$s language sql %4$s security invoker set search_path = '''' '
    'as $rpc$ select private.%1$I(%5$s) $rpc$',
    p_name, v_args, v_result, v_volatility, coalesce(v_call, ''));
  execute format('comment on function public.%I(%s) is %L', p_name, v_ident,
    format('RPC (security invoker) → private.%s. Rules, scope checks, audit and idempotency live there.', p_name));

  execute format('revoke all on function public.%I(%s) from public, anon, authenticated, service_role', p_name, v_ident);
  execute format('revoke all on function private.%I(%s) from public, anon, authenticated, service_role', p_name, v_ident);
  foreach v_role in array p_roles loop
    if v_role not in ('anon', 'authenticated') then
      raise exception 'expose_rpc: unexpected role %', v_role;
    end if;
    execute format('grant execute on function public.%I(%s) to %I', p_name, v_ident, v_role);
    execute format('grant execute on function private.%I(%s) to %I', p_name, v_ident, v_role);
  end loop;
end;
$$;

revoke all on function private.fail(text, text, text) from public, anon, authenticated, service_role;
revoke all on function private.stamp_insert() from public, anon, authenticated, service_role;
revoke all on function private.stamp_update() from public, anon, authenticated, service_role;
revoke all on function private.reject_update() from public, anon, authenticated, service_role;
revoke all on function private.expose_rpc(text, text[]) from public, anon, authenticated, service_role;
