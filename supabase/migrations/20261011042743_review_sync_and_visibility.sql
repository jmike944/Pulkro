-- Pulkro Cuadrillas · backend 09 · review round (2026-10-11): sync protocol and order visibility
-- F07 op ids bound to their exact request · F03 scope gain (scope_changed_at + assignment history) · F14 visibility
-- through indexes. See docs/backend/architecture.md §4, §5 and §8.

------------------------------------------------------------------------------------------------------------------------
-- F07 · An op id identifies ONE request. The public wrapper digests every argument except p_op_id and hands the digest
-- to private.begin_op through a transaction-local setting; a replay with the same op id but other arguments is refused
-- (PT409 op_id_reused) instead of answering {"duplicate": true} for something that was never applied.
------------------------------------------------------------------------------------------------------------------------
alter table private.sync_ops add column args_hash text;

create or replace function private.begin_op(p_op_id uuid, p_actor uuid, p_action text, p_device_at timestamptz default null)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v private.sync_ops;
  v_bound text := coalesce(current_setting('pulkro.op_args', true), '');
  v_hash text;
begin
  if p_op_id is null then
    perform private.fail('PT422', 'Falta el identificador de la operación (op_id).', 'op_id_required');
  end if;
  -- set by the public wrapper as '<op id>:<md5 of the other arguments>'; absent when called without the wrapper
  if left(v_bound, 37) = p_op_id::text || ':' then
    v_hash := nullif(substr(v_bound, 38), '');
  end if;
  perform set_config('pulkro.op_id', p_op_id::text, true);
  perform set_config('pulkro.device_at', coalesce(p_device_at::text, ''), true);
  insert into private.sync_ops (op_id, actor_id, action, args_hash) values (p_op_id, p_actor, p_action, v_hash)
  on conflict (op_id) do nothing;
  if found then
    return null;
  end if;
  select * into v from private.sync_ops s where s.op_id = p_op_id;
  if v.actor_id is distinct from p_actor or v.action <> p_action then
    perform private.fail('PT409', 'Ese identificador de operación ya se usó para otra acción.', 'op_id_reused');
  end if;
  if v.args_hash is not null and v_hash is not null and v.args_hash <> v_hash then
    perform private.fail('PT409', 'Ese identificador de operación ya se usó con otros datos: este envío no se aplicó.', 'op_id_reused');
  end if;
  return coalesce(v.result, '{}'::jsonb) || jsonb_build_object('ok', true, 'duplicate', true);
end;
$$;

-- Same contract as before (thin SECURITY INVOKER wrapper public.<name> → private.<name>, EXECUTE only for p_roles),
-- plus the argument digest for mutations (first argument p_op_id). timestamptz arguments are digested as epoch seconds
-- so the digest does not depend on the session TimeZone; jsonb arguments are digested in canonical form.
create or replace function private.expose_rpc(p_name text, p_roles text[] default array['authenticated'])
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
  v_bind text := '';
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

  if v_volatility = 'volatile' and (select proargnames[1] from pg_catalog.pg_proc where oid = v_fn) = 'p_op_id' then
    select format(
      'select pg_catalog.set_config(''pulkro.op_args'', coalesce(p_op_id::text, '''') || '':'' || '
      'pg_catalog.md5(pg_catalog.jsonb_build_array(%s)::text), true); ',
      string_agg(
        case when a.typ = 'pg_catalog.timestamptz'::pg_catalog.regtype::oid then format('extract(epoch from %I)', a.name)
             else format('%I', a.name) end,
        ', ' order by a.ord))
    into v_bind
    from unnest(
      (select proargnames from pg_catalog.pg_proc where oid = v_fn),
      (select proargtypes::oid[] from pg_catalog.pg_proc where oid = v_fn)
    ) with ordinality as a(name, typ, ord)
    where a.ord > 1;
  end if;

  execute format(
    'create or replace function public.%1$I(%2$s) returns %3$s language sql %4$s security invoker set search_path = '''' '
    'as $rpc$ %6$sselect private.%1$I(%5$s) $rpc$',
    p_name, v_args, v_result, v_volatility, coalesce(v_call, ''), coalesce(v_bind, ''));
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
revoke all on function private.expose_rpc(text, text[]) from public, anon, authenticated, service_role;

-- Regenerate every staff wrapper (signatures unchanged; the anon survey wrappers have no op id and stay as they are).
do $$
declare
  v_name text;
begin
  foreach v_name in array array[
    'create_order', 'update_order', 'set_order_status', 'cancel_order', 'reopen_order', 'archive_order', 'assign_crew',
    'schedule_jornadas', 'check_in', 'check_out', 'add_jornada_note', 'log_reminder', 'set_jornada_breakdown', 'add_photo',
    'update_photo', 'delete_photo', 'set_photo_selected', 'add_incident', 'update_incident', 'resolve_incident',
    'validate_closure', 'generate_report', 'log_share', 'create_case', 'update_case', 'add_case_note', 'create_survey',
    'record_manual_survey', 'upsert_unit', 'upsert_client', 'upsert_site', 'upsert_worker', 'upsert_service_type',
    'upsert_material', 'provision_profile', 'update_profile', 'update_my_contact'
  ] loop
    perform private.expose_rpc(v_name);
  end loop;
end;
$$;

------------------------------------------------------------------------------------------------------------------------
-- F03 · Scope gain. Rows that were already on the server but only now became visible to a device never show up in an
-- updated_at cursor. The pull protocol (architecture.md §8) fetches them by reference; the server provides:
--   orders.scope_changed_at — server time of the last change of WHO sees the order (creation, supervisor or unit
--   change). A device that has no copy of the order, or an older scope_changed_at, re-fetches the order's subtree.
-- F04 · private.order_assignments — previous supervisors of each order, so a former supervisor's offline captures are
--   answered "order_reassigned" (a sync conflict) instead of "out_of_scope". Written by the trigger only.
------------------------------------------------------------------------------------------------------------------------
alter table public.orders add column scope_changed_at timestamptz not null default now();
comment on column public.orders.scope_changed_at is
  'Server time of the last change of who can see the order (creation, supervisor or unit change). Devices with an older copy re-fetch the order subtree.';

create table private.order_assignments (
  order_id uuid not null references public.orders (id),
  supervisor_id uuid not null references public.profiles (id),
  unassigned_at timestamptz not null default now(),
  constraint order_assignments_pkey primary key (order_id, supervisor_id, unassigned_at)
);
create index order_assignments_supervisor_id_idx on private.order_assignments (supervisor_id);
alter table private.order_assignments enable row level security; -- no policies: only definer code touches it
revoke all on table private.order_assignments from public, anon, authenticated, service_role;

-- SECURITY DEFINER so a direct UPDATE by service_role (no grant on private tables) still records the history.
create function private.track_order_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.scope_changed_at := now();
  elsif new.supervisor_id is distinct from old.supervisor_id or new.unit_id is distinct from old.unit_id then
    new.scope_changed_at := now();
    if new.supervisor_id is distinct from old.supervisor_id then
      insert into private.order_assignments (order_id, supervisor_id, unassigned_at)
      values (old.id, old.supervisor_id, now())
      on conflict do nothing;
    end if;
  else
    new.scope_changed_at := old.scope_changed_at;
  end if;
  return new;
end;
$$;
revoke all on function private.track_order_scope() from public, anon, authenticated, service_role;
create trigger track_scope before insert or update on public.orders for each row execute function private.track_order_scope();

------------------------------------------------------------------------------------------------------------------------
-- F14 · canSeeOrder through indexes. The OR of the three role branches made every orders read (and every child-table
-- read through `order_id in (select … from orders)`) a sequential scan. private.visible_order_ids() resolves the
-- caller's orders once per statement with the role's own index (Dirección: every order); the policies compare against
-- that array, which the planner serves from orders_pkey / <child>_order_id_idx.
------------------------------------------------------------------------------------------------------------------------
create function private.visible_order_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select case p.role
    when 'direccion' then (select coalesce(array_agg(o.id), '{}') from public.orders o)
    when 'administracion' then (select coalesce(array_agg(o.id), '{}') from public.orders o where o.unit_id = p.unit_id)
    when 'supervisor' then (select coalesce(array_agg(o.id), '{}') from public.orders o where o.supervisor_id = p.id)
  end
  from public.profiles p
  where p.id = (select auth.uid()) and p.active;
$$;
revoke all on function private.visible_order_ids() from public, anon, authenticated, service_role;
grant execute on function private.visible_order_ids() to authenticated;

drop policy orders_select on public.orders;
create policy orders_select on public.orders for select to authenticated
using (id = any ((select private.visible_order_ids())::uuid[]));

do $$
declare
  t text;
begin
  foreach t in array array[
    'jornadas', 'crew_changes', 'jornada_checks', 'jornada_notes', 'incidents', 'post_sale_cases', 'case_events',
    'photos', 'order_closures', 'reports', 'report_shares', 'surveys'
  ] loop
    execute format('drop policy %I on public.%I', t || '_select', t);
    execute format(
      'create policy %1$I on public.%2$I for select to authenticated using (order_id = any ((select private.visible_order_ids())::uuid[]))',
      t || '_select', t);
  end loop;
end;
$$;

drop policy survey_tokens_select on public.survey_tokens;
create policy survey_tokens_select on public.survey_tokens for select to authenticated
using (
  (select private.my_role()) in ('administracion', 'supervisor')
  and order_id = any ((select private.visible_order_ids())::uuid[])
);
