-- 00 · Schema-level guarantees: RLS everywhere, least-privilege grants, function security, permission matrix,
-- FK indexes, storage bucket and auth hook wiring.
do $$
declare
  r record;
  v_tables text[] := array[
    'units', 'profiles', 'workers', 'clients', 'sites', 'service_types', 'materials', 'orders', 'jornadas', 'crew_changes',
    'jornada_checks', 'jornada_notes', 'incidents', 'post_sale_cases', 'case_events', 'photos', 'order_closures', 'reports',
    'report_shares', 'surveys', 'survey_tokens', 'audit_log'];
  v_rpcs text[] := array[
    'create_order', 'update_order', 'set_order_status', 'cancel_order', 'reopen_order', 'archive_order', 'assign_crew',
    'schedule_jornadas', 'check_in', 'check_out', 'add_jornada_note', 'log_reminder', 'set_jornada_breakdown', 'add_photo',
    'update_photo', 'delete_photo', 'set_photo_selected', 'add_incident', 'update_incident', 'resolve_incident',
    'validate_closure', 'generate_report', 'log_share', 'create_case', 'update_case', 'add_case_note', 'create_survey',
    'record_manual_survey', 'upsert_unit', 'upsert_client', 'upsert_site', 'upsert_worker', 'upsert_service_type',
    'upsert_material', 'provision_profile', 'update_profile', 'update_my_contact'];
  v_history text[] := array[
    'crew_changes', 'jornada_checks', 'jornada_notes', 'case_events', 'order_closures', 'reports', 'report_shares',
    'survey_tokens', 'audit_log'];
  v_count integer;
  v_t text;
begin
  -- 1. exactly the expected public tables, all with RLS, none forced (definer RPCs own the writes)
  perform pg_temp.eq('public tables',
    (select string_agg(tablename, ',' order by tablename) from pg_tables where schemaname = 'public'),
    (select string_agg(t, ',' order by t) from unnest(v_tables) t));
  for r in select c.relname, c.relrowsecurity, c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname in ('public', 'private') and c.relkind = 'r' loop
    perform pg_temp.check('RLS enabled on ' || r.relname, r.relrowsecurity);
    perform pg_temp.check('RLS not forced on ' || r.relname, not r.relforcerowsecurity);
  end loop;

  -- 2. grants: anon nothing, authenticated SELECT only, service_role full on mutable tables and read + append on
  --    history (append-only tables also reject DELETE/TRUNCATE by trigger, even for the owner); private tables reach no API role
  foreach v_t in array v_tables loop
    perform pg_temp.check('anon has no privilege on ' || v_t,
      not has_table_privilege('anon', 'public.' || v_t, 'select,insert,update,delete,truncate,references,trigger'));
    perform pg_temp.check('authenticated can select ' || v_t, has_table_privilege('authenticated', 'public.' || v_t, 'select'));
    perform pg_temp.check('authenticated cannot write ' || v_t,
      not has_table_privilege('authenticated', 'public.' || v_t, 'insert,update,delete,truncate,references,trigger'));
    perform pg_temp.check('service_role can read and append ' || v_t,
      has_table_privilege('service_role', 'public.' || v_t, 'select') and has_table_privilege('service_role', 'public.' || v_t, 'insert'));
    if v_t = any (v_history) then
      perform pg_temp.check('service_role cannot rewrite history ' || v_t,
        not has_table_privilege('service_role', 'public.' || v_t, 'update,delete,truncate'));
      perform pg_temp.eq('history triggers on ' || v_t,
        (select string_agg(tgname, ',' order by tgname) from pg_trigger
         where tgrelid = ('public.' || v_t)::regclass and tgname in ('reject_update', 'reject_delete', 'reject_truncate')),
        'reject_delete,reject_truncate,reject_update');
    else
      perform pg_temp.check('service_role can update and delete ' || v_t,
        has_table_privilege('service_role', 'public.' || v_t, 'update') and has_table_privilege('service_role', 'public.' || v_t, 'delete'));
    end if;
  end loop;
  -- private tables (sync_ops, order_assignments, …): no privilege at all for any API role, service_role included
  for r in select c.oid, c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'private' and c.relkind = 'r' loop
    perform pg_temp.check('private.' || r.relname || ' unreachable by API roles',
      not has_table_privilege('anon', r.oid, 'select,insert,update,delete,truncate,references,trigger')
      and not has_table_privilege('authenticated', r.oid, 'select,insert,update,delete,truncate,references,trigger')
      and not has_table_privilege('service_role', r.oid, 'select,insert,update,delete,truncate,references,trigger'));
  end loop;
  perform pg_temp.check('private tables present (sync_ops, order_assignments)',
    to_regclass('private.sync_ops') is not null and to_regclass('private.order_assignments') is not null);
  perform pg_temp.check('folio sequences not usable by API roles',
    not has_sequence_privilege('authenticated', 'private.order_folio_seq', 'usage,select,update'));
  -- default privileges: future tables/functions in public are not auto-granted to the API roles
  select count(*) into v_count from pg_default_acl d join pg_namespace n on n.oid = d.defaclnamespace
  where n.nspname = 'public' and pg_get_userbyid(d.defaclrole) = 'postgres'
    and (d.defaclacl::text like '%anon=%' or d.defaclacl::text like '%authenticated=%');
  perform pg_temp.eq('no default grants to anon/authenticated for postgres objects in public', v_count::text, '0');
  -- global default: functions created by postgres in ANY schema are not executable by PUBLIC (per-schema entries cannot
  -- revoke the built-in PUBLIC grant)
  perform pg_temp.check('global default revokes EXECUTE from PUBLIC for postgres functions', exists (
    select 1 from pg_default_acl d
    where d.defaclrole = 'postgres'::regrole and d.defaclnamespace = 0 and d.defaclobjtype = 'f'
      and not exists (select 1 from aclexplode(d.defaclacl) a where a.grantee = 0)));

  -- 3. functions: nothing SECURITY DEFINER in public except the platform event trigger (not executable by API roles);
  --    every function we own pins search_path; EXECUTE only where intended
  for r in select p.oid, p.proname, n.nspname, p.prosecdef, p.proconfig, pg_get_function_result(p.oid) as res
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public', 'private') loop
    perform pg_temp.check(format('%s.%s pins search_path', r.nspname, r.proname),
      exists (select 1 from unnest(r.proconfig) c where c like 'search_path=%'));
    if r.nspname = 'public' and r.prosecdef then
      perform pg_temp.check('only rls_auto_enable may be definer in public: ' || r.proname, r.proname = 'rls_auto_enable');
    end if;
    if r.nspname = 'public' and r.proname not in ('get_survey', 'submit_survey') then
      perform pg_temp.check('anon cannot execute public.' || r.proname, not has_function_privilege('anon', r.oid, 'execute'));
    end if;
    if r.nspname = 'private' and r.proname not in ('get_survey', 'submit_survey') then
      perform pg_temp.check('anon cannot execute private.' || r.proname, not has_function_privilege('anon', r.oid, 'execute'));
    end if;
    if r.nspname = 'private' and r.proname not in (select unnest(v_rpcs)) and r.proname not in
       ('my_role', 'my_unit', 'can', 'visible_order_ids', 'crew_worker_ids', 'evidence_order_id', 'evidence_kind', 'can_upload_evidence') then
      perform pg_temp.check('authenticated cannot execute helper private.' || r.proname, not has_function_privilege('authenticated', r.oid, 'execute'));
    end if;
  end loop;
  perform pg_temp.check('rls_auto_enable not executable by API roles',
    not has_function_privilege('anon', 'public.rls_auto_enable()', 'execute')
    and not has_function_privilege('authenticated', 'public.rls_auto_enable()', 'execute'));

  -- 4. every RPC: invoker wrapper in public with the same identity args as its definer implementation in private
  foreach v_t in array v_rpcs || array['get_survey', 'submit_survey'] loop
    select count(*) into v_count
    from pg_proc pub join pg_namespace pn on pn.oid = pub.pronamespace and pn.nspname = 'public'
    join pg_proc prv on prv.proname = pub.proname
    join pg_namespace vn on vn.oid = prv.pronamespace and vn.nspname = 'private'
    where pub.proname = v_t and not pub.prosecdef and prv.prosecdef
      and pg_get_function_identity_arguments(pub.oid) = pg_get_function_identity_arguments(prv.oid);
    perform pg_temp.eq('wrapper pair for ' || v_t, v_count::text, '1');
  end loop;
  -- every mutation wrapper binds its op id to a digest of the other arguments (private.begin_op compares it)
  foreach v_t in array v_rpcs loop
    perform pg_temp.check('wrapper binds op args: ' || v_t, exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = v_t and p.prosrc like '%pulkro.op_args%'));
  end loop;
  foreach v_t in array v_rpcs loop
    perform pg_temp.check('authenticated can execute ' || v_t,
      exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = v_t and has_function_privilege('authenticated', p.oid, 'execute')));
  end loop;
  perform pg_temp.check('staff cannot submit the public survey',
    not has_function_privilege('authenticated', 'public.submit_survey(text,integer,integer,integer,integer,integer,text,text)', 'execute'));
  perform pg_temp.check('anon can submit the public survey',
    has_function_privilege('anon', 'public.submit_survey(text,integer,integer,integer,integer,integer,text,text)', 'execute')
    and has_function_privilege('anon', 'public.get_survey(text)', 'execute'));

  -- 5. auth hook: executable by supabase_auth_admin only
  perform pg_temp.check('hook executable by supabase_auth_admin', has_function_privilege('supabase_auth_admin', 'private.custom_access_token_hook(jsonb)', 'execute'));
  perform pg_temp.check('hook not executable by API roles',
    not has_function_privilege('authenticated', 'private.custom_access_token_hook(jsonb)', 'execute')
    and not has_function_privilege('anon', 'private.custom_access_token_hook(jsonb)', 'execute'));
  perform pg_temp.check('auth admin can read profiles', has_table_privilege('supabase_auth_admin', 'public.profiles', 'select'));

  -- 6. every foreign key is covered by an index whose leading column is the FK's first column
  for r in
    select c.conrelid::regclass::text as tbl, c.conname, a.attname
    from pg_constraint c
    join pg_namespace n on n.oid = c.connamespace and n.nspname = 'public'
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f'
      and not exists (select 1 from pg_index i where i.indrelid = c.conrelid and i.indkey[0] = c.conkey[1])
  loop
    raise exception 'FAIL [FK without index]: %.% (%)', r.tbl, r.attname, r.conname;
  end loop;

  -- 7. storage: private bucket with limits; clients may only insert/select (no update → no overwrite, no delete)
  perform pg_temp.check('bucket evidencias private with limits', exists (
    select 1 from storage.buckets where id = 'evidencias' and not public and file_size_limit = 10485760
      and allowed_mime_types @> array['image/jpeg', 'image/png', 'image/webp'] and cardinality(allowed_mime_types) = 3));
  perform pg_temp.eq('storage policies for evidencias',
    (select string_agg(policyname || ':' || cmd || ':' || array_to_string(roles, '|'), ',' order by policyname)
     from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'evidencias%'),
    'evidencias_insert:INSERT:authenticated,evidencias_select:SELECT:authenticated');

  -- 8. every policy on public tables is a permissive SELECT policy scoped to a role (no write policies, no PUBLIC)
  perform pg_temp.check('only SELECT policies on public tables',
    not exists (select 1 from pg_policies where schemaname = 'public' and (cmd <> 'SELECT' or permissive <> 'PERMISSIVE' or 'public' = any(roles))));
  perform pg_temp.eq('one policy per table for authenticated',
    (select count(*)::text from pg_policies where schemaname = 'public' and 'authenticated' = any(roles)),
    array_length(v_tables, 1)::text);
end $$;

-- 9. permission matrix = src/lib/permissions.ts PERMISSIONS (19 actions × 3 roles)
do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('order.create', false, true, false),
      ('order.edit', false, true, false),
      ('order.editOperational', false, true, true),
      ('order.reschedule', false, false, true),
      ('order.reopen', false, false, true),
      ('order.archive', false, true, true),
      ('crew.assign', false, false, true),
      ('field.capture', false, false, true),
      ('closure.authorize', false, false, true),
      ('report.share', false, false, true),
      ('postventa.manage', false, true, true),
      ('export.pdf', true, true, true),
      ('export.excel', true, true, false),
      ('export.kpis', true, true, false),
      ('export.backup', true, true, false),
      ('users.admin', true, false, false),
      ('catalogs.admin', true, true, false),
      ('view.allUnits', true, false, false),
      ('view.kpis', true, true, false)
    ) as m(action, direccion, administracion, supervisor)
  loop
    perform pg_temp.eq(r.action || ' / direccion', private.can('direccion', r.action)::text, r.direccion::text);
    perform pg_temp.eq(r.action || ' / administracion', private.can('administracion', r.action)::text, r.administracion::text);
    perform pg_temp.eq(r.action || ' / supervisor', private.can('supervisor', r.action)::text, r.supervisor::text);
  end loop;
  perform pg_temp.eq('unknown action denied', private.can('direccion', 'nope')::text, 'false');
  perform pg_temp.eq('null role denied', private.can(null, 'export.pdf')::text, 'false');
end $$;

-- 10. auth hook behaviour (called directly; Auth calls it as supabase_auth_admin)
do $$
declare
  v jsonb;
begin
  v := private.custom_access_token_hook(jsonb_build_object(
    'user_id', '22222222-0000-4000-8000-000000000004',
    'claims', jsonb_build_object('sub', '22222222-0000-4000-8000-000000000004', 'role', 'authenticated',
      'app_metadata', jsonb_build_object('provider', 'email')),
    'authentication_method', 'password'));
  perform pg_temp.eq('hook adds pulkro_role', v #>> '{claims,app_metadata,pulkro_role}', 'supervisor');
  perform pg_temp.eq('hook adds pulkro_unit_id', v #>> '{claims,app_metadata,pulkro_unit_id}', '11111111-0000-4000-8000-000000000001');
  perform pg_temp.eq('hook keeps existing app_metadata', v #>> '{claims,app_metadata,provider}', 'email');
  perform pg_temp.eq('hook keeps role claim', v #>> '{claims,role}', 'authenticated');
  v := private.custom_access_token_hook(jsonb_build_object('user_id', '22222222-0000-4000-8000-000000000007', 'claims', '{}'::jsonb));
  perform pg_temp.eq('hook refuses deactivated accounts', v #>> '{error,http_code}', '403');
  v := private.custom_access_token_hook(jsonb_build_object('user_id', '22222222-0000-4000-8000-000000000008', 'claims', '{}'::jsonb));
  perform pg_temp.eq('hook refuses accounts without profile', v #>> '{error,http_code}', '403');
end $$;
