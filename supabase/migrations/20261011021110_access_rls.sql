-- Pulkro Cuadrillas · backend 03 · access model
-- Role × action matrix (mirror of src/lib/permissions.ts), the RLS helpers, every SELECT policy (mirror of
-- canSeeOrder / useScopedCatalog / canSeeAuditEntry) and the custom access token hook.
--
-- Authorization source of truth = public.profiles (role, unit_id, active), read on every statement through
-- private.my_role() / private.my_unit(). JWT claims are never trusted for authorization: the hook only
-- copies role/unit into app_metadata for the UI (routing, menus) and refuses tokens for inactive accounts.

------------------------------------------------------------------------------------------------------------------------
-- Who is calling (SECURITY DEFINER so the lookup does not recurse into the profiles policy). Wrapped in
-- (select …) inside policies, so Postgres evaluates them once per statement (initPlan), not once per row.
------------------------------------------------------------------------------------------------------------------------
create function private.my_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role from public.profiles p where p.id = (select auth.uid()) and p.active;
$$;

create function private.my_unit()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.unit_id from public.profiles p where p.id = (select auth.uid()) and p.active;
$$;

------------------------------------------------------------------------------------------------------------------------
-- PERMISSIONS (src/lib/permissions.ts). Keep both in sync: supabase/tests/00_schema_and_matrix.sql asserts every cell.
------------------------------------------------------------------------------------------------------------------------
create function private.can(p_role public.user_role, p_action text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_role is not null and exists (
    select 1
    from (values
      ('order.create', 'administracion'),
      ('order.edit', 'administracion'),
      ('order.editOperational', 'administracion'), ('order.editOperational', 'supervisor'),
      ('order.reschedule', 'supervisor'),
      ('order.reopen', 'supervisor'),
      ('order.archive', 'administracion'), ('order.archive', 'supervisor'),
      ('crew.assign', 'supervisor'),
      ('field.capture', 'supervisor'),
      ('closure.authorize', 'supervisor'),
      ('report.share', 'supervisor'),
      ('postventa.manage', 'administracion'), ('postventa.manage', 'supervisor'),
      ('export.pdf', 'direccion'), ('export.pdf', 'administracion'), ('export.pdf', 'supervisor'),
      ('export.excel', 'direccion'), ('export.excel', 'administracion'),
      ('export.kpis', 'direccion'), ('export.kpis', 'administracion'),
      ('export.backup', 'direccion'), ('export.backup', 'administracion'),
      ('users.admin', 'direccion'),
      ('catalogs.admin', 'direccion'), ('catalogs.admin', 'administracion'),
      ('view.allUnits', 'direccion'),
      ('view.kpis', 'direccion'), ('view.kpis', 'administracion')
    ) as m(action, role)
    where m.action = p_action and m.role = p_role::text
  );
$$;

-- DENIED_REASON (store.ts): the message the UI shows when the server refuses an action.
create function private.denied_reason(p_action text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_action
    when 'order.create' then 'Solo Administración da de alta órdenes.'
    when 'order.edit' then 'Solo Administración edita los datos generales de la orden.'
    when 'order.editOperational' then 'Su rol solo consulta esta orden.'
    when 'order.reschedule' then 'Solo el supervisor reprograma jornadas y confirma fechas.'
    when 'order.reopen' then 'Solo el supervisor de la orden puede reabrirla.'
    when 'order.archive' then 'Su rol no archiva órdenes.'
    when 'crew.assign' then 'Solo el supervisor asigna la cuadrilla.'
    when 'field.capture' then 'Solo el supervisor captura en campo.'
    when 'closure.authorize' then 'Solo el supervisor autoriza el cierre.'
    when 'report.share' then 'Solo el supervisor genera y comparte el reporte con el cliente.'
    when 'postventa.manage' then 'Su rol solo consulta la postventa.'
    when 'users.admin' then 'Su rol no administra usuarios.'
    when 'catalogs.admin' then 'Su rol no administra catálogos.'
    when 'view.allUnits' then 'Su rol solo ve su propio alcance.'
    else 'Su rol no permite esta acción.'
  end;
$$;

------------------------------------------------------------------------------------------------------------------------
-- SELECT policies. One permissive policy per table and role (no overlapping permissive policies).
-- Child tables reuse the orders policy through `order_id in (select id from public.orders)`: the subquery runs
-- with the caller's RLS, so canSeeOrder is defined exactly once.
------------------------------------------------------------------------------------------------------------------------

-- units: Dirección all; everyone else their own unit.
create policy units_select on public.units for select to authenticated
using (
  (select private.my_role()) = 'direccion'
  or id = (select private.my_unit())
);

-- profiles (useScopedCatalog users): Dirección all · Administración own unit + Dirección accounts ·
-- supervisor self + the people on their orders and cases (creators, case owners). Audit rows carry actor_name.
create policy profiles_select on public.profiles for select to authenticated
using (
  (select private.my_role()) = 'direccion'
  or ((select private.my_role()) = 'administracion' and (unit_id = (select private.my_unit()) or role = 'direccion'))
  or (
    (select private.my_role()) = 'supervisor'
    and (
      id = (select auth.uid())
      or id in (select o.created_by from public.orders o)
      or id in (select c.owner_id from public.post_sale_cases c)
      or id in (select c.created_by from public.post_sale_cases c)
    )
  )
);

-- The auth hook runs as supabase_auth_admin and reads role/unit/active.
grant select on table public.profiles to supabase_auth_admin;
create policy profiles_select_auth_hook on public.profiles for select to supabase_auth_admin
using (true);

-- workers: the crews of the units in scope (supervisors plan with their unit's pool).
create policy workers_select on public.workers for select to authenticated
using (
  (select private.my_role()) = 'direccion'
  or unit_id = (select private.my_unit())
);

-- clients: Dirección all · Administración own unit · supervisor only clients of their own orders.
create policy clients_select on public.clients for select to authenticated
using (
  (select private.my_role()) = 'direccion'
  or ((select private.my_role()) = 'administracion' and unit_id = (select private.my_unit()))
  or ((select private.my_role()) = 'supervisor' and id in (select o.client_id from public.orders o))
);

-- sites: Dirección all · Administración every site of a visible client · supervisor only the sites they work at.
create policy sites_select on public.sites for select to authenticated
using (
  (select private.my_role()) = 'direccion'
  or ((select private.my_role()) = 'administracion' and client_id in (select c.id from public.clients c))
  or ((select private.my_role()) = 'supervisor' and id in (select o.site_id from public.orders o))
);

-- company-wide catalogs: any active staff member.
create policy service_types_select on public.service_types for select to authenticated
using ((select private.my_role()) is not null);

create policy materials_select on public.materials for select to authenticated
using ((select private.my_role()) is not null);

-- orders = canSeeOrder: supervisor → own assignments · Administración → own unit · Dirección → all.
create policy orders_select on public.orders for select to authenticated
using (
  (select private.my_role()) = 'direccion'
  or ((select private.my_role()) = 'administracion' and unit_id = (select private.my_unit()))
  or ((select private.my_role()) = 'supervisor' and supervisor_id = (select auth.uid()))
);

-- Everything that belongs to an order follows the order.
do $$
declare
  t text;
begin
  foreach t in array array[
    'jornadas', 'crew_changes', 'jornada_checks', 'jornada_notes', 'incidents', 'post_sale_cases', 'case_events',
    'photos', 'order_closures', 'reports', 'report_shares', 'surveys'
  ] loop
    execute format(
      'create policy %1$I on public.%2$I for select to authenticated using (order_id in (select o.id from public.orders o))',
      t || '_select', t);
  end loop;
end;
$$;

-- survey tokens: only roles that send surveys (postventa.manage), inside their scope. Dirección consults only.
create policy survey_tokens_select on public.survey_tokens for select to authenticated
using (
  (select private.my_role()) in ('administracion', 'supervisor')
  and order_id in (select o.id from public.orders o)
);

-- audit_log = canSeeAuditEntry: entries of visible orders; without an order, the unit of the touched record
-- (stored at write time); supervisors only their own actions.
create policy audit_log_select on public.audit_log for select to authenticated
using (
  (order_id is not null and order_id in (select o.id from public.orders o))
  or (
    order_id is null
    and (
      (select private.my_role()) = 'direccion'
      or ((select private.my_role()) = 'administracion' and unit_id = (select private.my_unit()))
      or ((select private.my_role()) = 'supervisor' and actor_id = (select auth.uid()))
    )
  )
);

------------------------------------------------------------------------------------------------------------------------
-- Custom access token hook (enable it in Dashboard → Authentication → Hooks, or config.toml:
--   [auth.hook.custom_access_token] enabled = true, uri = "pg-functions://postgres/private/custom_access_token_hook").
-- SECURITY INVOKER as the docs recommend: it runs as supabase_auth_admin with the grants below.
-- * Adds app_metadata.pulkro_role / pulkro_unit_id (UI hints only — RLS never reads them).
-- * Refuses to issue or refresh tokens for accounts without an active profile (deactivation takes effect at the
--   next refresh even for sessions we could not revoke).
------------------------------------------------------------------------------------------------------------------------
create function private.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_claims jsonb := coalesce(event -> 'claims', '{}'::jsonb);
  v_role public.user_role;
  v_unit uuid;
  v_active boolean;
begin
  select p.role, p.unit_id, p.active into v_role, v_unit, v_active
  from public.profiles p
  where p.id = (event ->> 'user_id')::uuid;

  if v_role is null or not v_active then
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 403,
      'message', 'Su cuenta no está activa en Pulkro Cuadrillas. Pida acceso a Dirección.'));
  end if;

  v_claims := jsonb_set(
    v_claims, '{app_metadata}',
    coalesce(v_claims -> 'app_metadata', '{}'::jsonb)
      || jsonb_build_object('pulkro_role', v_role, 'pulkro_unit_id', v_unit));
  return jsonb_build_object('claims', v_claims);
end;
$$;

------------------------------------------------------------------------------------------------------------------------
-- Function privileges (nothing in `private` is executable unless granted here or by expose_rpc)
------------------------------------------------------------------------------------------------------------------------
revoke all on function private.my_role() from public, anon, authenticated, service_role;
revoke all on function private.my_unit() from public, anon, authenticated, service_role;
revoke all on function private.can(public.user_role, text) from public, anon, authenticated, service_role;
revoke all on function private.denied_reason(text) from public, anon, authenticated, service_role;
revoke all on function private.custom_access_token_hook(jsonb) from public, anon, authenticated, service_role;

-- RLS policies (and the storage policies in 04) evaluate these as the calling role.
grant execute on function private.my_role() to authenticated;
grant execute on function private.my_unit() to authenticated;
grant execute on function private.can(public.user_role, text) to authenticated;

grant usage on schema public to supabase_auth_admin;
grant usage on schema private to supabase_auth_admin;
grant execute on function private.custom_access_token_hook(jsonb) to supabase_auth_admin;
