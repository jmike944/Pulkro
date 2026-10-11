-- ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- Shared prelude (helpers + base fixtures). Everything lives inside the test's transaction and is rolled back.
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
set local client_min_messages = warning;

-- Persona switching: exactly what PostgREST does for a request (role + request.jwt.claims for auth.uid()).
create function pg_temp.as_user(p_id uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated', 'aud', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
create function pg_temp.as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  execute 'set local role anon';
end $$;
create function pg_temp.as_owner() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $$;

-- Assertions: every failure raises, which aborts the transaction and makes the whole file fail loudly.
create function pg_temp.check(p_label text, p_cond boolean) returns void language plpgsql as $$
begin
  if p_cond is not true then raise exception 'FAIL [%]', p_label; end if;
end $$;
create function pg_temp.eq(p_label text, p_actual text, p_expected text) returns void language plpgsql as $$
begin
  if p_actual is distinct from p_expected then
    raise exception 'FAIL [%]: expected <%> got <%>', p_label, p_expected, p_actual;
  end if;
end $$;
-- Runs SQL that must succeed; returns its first column as text.
create function pg_temp.ok(p_label text, p_sql text) returns text language plpgsql as $$
declare v text;
begin
  begin
    execute p_sql into v;
  exception when others then
    raise exception 'FAIL [%]: expected success, got % %', p_label, sqlstate, sqlerrm;
  end;
  return v;
end $$;
-- Runs SQL that must fail with p_state (and, when given, the machine-readable hint the RPCs set).
create function pg_temp.err(p_label text, p_sql text, p_state text, p_hint text default null) returns void language plpgsql as $$
declare v_state text; v_msg text; v_hint text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text, v_hint = pg_exception_hint;
    if v_state <> p_state or (p_hint is not null and coalesce(v_hint, '') <> p_hint) then
      raise exception 'FAIL [%]: expected % %, got % % (%)', p_label, p_state, coalesce(p_hint, ''), v_state, coalesce(v_hint, ''), v_msg;
    end if;
    return;
  end;
  raise exception 'FAIL [%]: expected error % %, but it succeeded', p_label, p_state, coalesce(p_hint, '');
end $$;

-- Readable row sets: ids → fixture labels, sorted ("O1,O2"). Unknown ids show as ?<uuid>.
create temp table t_label (id uuid primary key, label text not null) on commit drop;
grant select, insert on t_label to authenticated, anon;
create function pg_temp.seen(p_sql text) returns text language plpgsql as $$
declare v text;
begin
  execute format(
    'select coalesce(string_agg(coalesce(l.label, ''?'' || x.id::text), '','' order by coalesce(l.label, ''?'' || x.id::text)), '''') '
    'from (%s) as x(id) left join pg_temp.t_label l on l.id = x.id', p_sql) into v;
  return v;
end $$;
create function pg_temp.label(p_id uuid, p_label text) returns uuid language sql as $$
  insert into pg_temp.t_label values (p_id, p_label) on conflict (id) do update set label = excluded.label returning id;
$$;

-- ── base fixtures: 2 units, 7 staff accounts, catalogs ──────────────────────────────────────────────────────────────
-- U1 Monterrey: DIR (Dirección), ADM1, SUP1, SUP2, INACT (deactivated supervisor) · U2 Apodaca: ADM2, SUP3
insert into public.units (id, name, code, city) values
  (pg_temp.label('11111111-0000-4000-8000-000000000001', 'U1'), 'Unidad Prueba Uno', 'TU1', 'Monterrey'),
  (pg_temp.label('11111111-0000-4000-8000-000000000002', 'U2'), 'Unidad Prueba Dos', 'TU2', 'Apodaca');
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', pg_temp.label(u.id, u.label), 'authenticated', 'authenticated', u.email, '', now(),
       '{"provider":"email","providers":["email"]}', '{}', now(), now()
from (values
  ('22222222-0000-4000-8000-000000000001'::uuid, 'DIR', 'dir@tests.invalid'),
  ('22222222-0000-4000-8000-000000000002'::uuid, 'ADM1', 'adm1@tests.invalid'),
  ('22222222-0000-4000-8000-000000000003'::uuid, 'ADM2', 'adm2@tests.invalid'),
  ('22222222-0000-4000-8000-000000000004'::uuid, 'SUP1', 'sup1@tests.invalid'),
  ('22222222-0000-4000-8000-000000000005'::uuid, 'SUP2', 'sup2@tests.invalid'),
  ('22222222-0000-4000-8000-000000000006'::uuid, 'SUP3', 'sup3@tests.invalid'),
  ('22222222-0000-4000-8000-000000000007'::uuid, 'INACT', 'inact@tests.invalid'),
  ('22222222-0000-4000-8000-000000000008'::uuid, 'NEWBIE', 'Newbie.Person@Tests.invalid')
) as u(id, label, email);
insert into public.profiles (id, name, initials, role, title, unit_id, email, active, deactivated_at) values
  ('22222222-0000-4000-8000-000000000001', 'Dirección Prueba', 'DP', 'direccion', 'Director', '11111111-0000-4000-8000-000000000001', 'dir@tests.invalid', true, null),
  ('22222222-0000-4000-8000-000000000002', 'Administración Uno', 'AU', 'administracion', 'Coordinadora', '11111111-0000-4000-8000-000000000001', 'adm1@tests.invalid', true, null),
  ('22222222-0000-4000-8000-000000000003', 'Administración Dos', 'AD', 'administracion', 'Coordinador', '11111111-0000-4000-8000-000000000002', 'adm2@tests.invalid', true, null),
  ('22222222-0000-4000-8000-000000000004', 'Supervisora Uno', 'SU', 'supervisor', 'Supervisora', '11111111-0000-4000-8000-000000000001', 'sup1@tests.invalid', true, null),
  ('22222222-0000-4000-8000-000000000005', 'Supervisor Dos', 'SD', 'supervisor', 'Supervisor', '11111111-0000-4000-8000-000000000001', 'sup2@tests.invalid', true, null),
  ('22222222-0000-4000-8000-000000000006', 'Supervisor Tres', 'ST', 'supervisor', 'Supervisor', '11111111-0000-4000-8000-000000000002', 'sup3@tests.invalid', true, null),
  ('22222222-0000-4000-8000-000000000007', 'Supervisor Inactivo', 'SI', 'supervisor', 'Supervisor', '11111111-0000-4000-8000-000000000001', 'inact@tests.invalid', false, now());
insert into auth.sessions (id, user_id, created_at, updated_at) values
  ('22222222-9000-4000-8000-000000000004', '22222222-0000-4000-8000-000000000004', now(), now()),
  ('22222222-9000-4000-8000-000000000005', '22222222-0000-4000-8000-000000000005', now(), now());
insert into public.clients (id, name, short_name, segment, unit_id) values
  (pg_temp.label('33333333-0000-4000-8000-000000000001', 'C1'), 'Cliente Uno SA', 'Uno', 'Industrial', '11111111-0000-4000-8000-000000000001'),
  (pg_temp.label('33333333-0000-4000-8000-000000000002', 'C2'), 'Cliente Dos SA', 'Dos', 'Comercial', '11111111-0000-4000-8000-000000000001'),
  (pg_temp.label('33333333-0000-4000-8000-000000000003', 'C3'), 'Cliente Tres SA', 'Tres', 'Residencial', '11111111-0000-4000-8000-000000000002');
insert into public.sites (id, client_id, name, lat, lng) values
  (pg_temp.label('33333333-1000-4000-8000-000000000001', 'S1'), '33333333-0000-4000-8000-000000000001', 'Planta Uno', 25.70, -100.30),
  (pg_temp.label('33333333-1000-4000-8000-000000000002', 'S2'), '33333333-0000-4000-8000-000000000002', 'Oficinas Dos', 25.66, -100.35),
  (pg_temp.label('33333333-1000-4000-8000-000000000003', 'S3'), '33333333-0000-4000-8000-000000000003', 'Torre Tres', 25.77, -100.18),
  (pg_temp.label('33333333-1000-4000-8000-000000000004', 'S4'), '33333333-0000-4000-8000-000000000001', 'Bodega Uno (sin órdenes)', 25.71, -100.31);
insert into public.service_types (id, name, short, default_hours_per_day) values
  (pg_temp.label('33333333-2000-4000-8000-000000000001', 'ST'), 'Limpieza profunda', 'Profunda', 8);
insert into public.materials (id, name, unit) values
  (pg_temp.label('33333333-3000-4000-8000-000000000001', 'MAT'), 'Desengrasante', 'L');
insert into public.workers (id, name, initials, unit_id, active) values
  (pg_temp.label('44444444-0000-4000-8000-000000000001', 'W1'), 'Juan Pérez', 'JP', '11111111-0000-4000-8000-000000000001', true),
  (pg_temp.label('44444444-0000-4000-8000-000000000002', 'W2'), 'Rosa Gómez', 'RG', '11111111-0000-4000-8000-000000000001', true),
  (pg_temp.label('44444444-0000-4000-8000-000000000003', 'W3'), 'Luis Torres', 'LT', '11111111-0000-4000-8000-000000000002', true),
  (pg_temp.label('44444444-0000-4000-8000-000000000004', 'W4'), 'Ana Díaz', 'AD', '11111111-0000-4000-8000-000000000001', false);

-- Creates an order through the real RPC as ADM1 (or ADM2 for U2) with one jornada today, and returns its id.
-- p_n numbers the ids so a test can create several orders.
create function pg_temp.new_order(p_n integer, p_unit integer default 1, p_supervisor uuid default '22222222-0000-4000-8000-000000000004')
returns uuid language plpgsql as $$
declare
  v_order uuid := ('66666666-0000-4000-8000-' || lpad(p_n::text, 12, '0'))::uuid;
  v_day uuid := ('66666666-1000-4000-8000-' || lpad(p_n::text, 12, '0'))::uuid;
  v_admin uuid := case p_unit when 1 then '22222222-0000-4000-8000-000000000002'::uuid else '22222222-0000-4000-8000-000000000003'::uuid end;
  v_client uuid := case p_unit when 1 then '33333333-0000-4000-8000-000000000001'::uuid else '33333333-0000-4000-8000-000000000003'::uuid end;
  v_site uuid := case p_unit when 1 then '33333333-1000-4000-8000-000000000001'::uuid else '33333333-1000-4000-8000-000000000003'::uuid end;
begin
  perform pg_temp.label(v_order, 'ORD' || p_n);
  perform pg_temp.label(v_day, 'J' || p_n);
  perform pg_temp.as_user(v_admin);
  perform public.create_order(gen_random_uuid(), v_order, v_client, v_site, '33333333-2000-4000-8000-000000000001', p_supervisor,
    'Orden de prueba ' || p_n,
    jsonb_build_array(jsonb_build_object('id', v_day, 'date', current_date,
      'planned_start', now() - interval '4 hours', 'planned_end', now() + interval '4 hours')),
    array['Barrido', 'Trapeado'], jsonb_build_array(jsonb_build_object('material_id', '33333333-3000-4000-8000-000000000001', 'qty', 2)));
  perform pg_temp.as_owner();
  return v_order;
end $$;

-- Uploads an evidence object the way Storage does (as postgres here; the policies are tested in 02).
create function pg_temp.put_object(p_order uuid, p_kind text, p_photo uuid) returns text language sql as $$
  insert into storage.objects (bucket_id, name, owner_id, metadata)
  values ('evidencias', format('orders/%s/%s/%s.jpg', p_order, p_kind, p_photo), null, '{"size": 2048, "mimetype": "image/jpeg"}')
  returning name;
$$;

-- The global default privilege (migration review_history_and_defaults) also applies to these postgres-owned pg_temp
-- helpers: grant them explicitly so the authenticated/anon personas can call them.
do $$
declare
  r record;
begin
  for r in select p.oid::regprocedure as f from pg_proc p where p.pronamespace = pg_my_temp_schema() loop
    execute format('grant execute on function %s to public', r.f);
  end loop;
end $$;
