-- 02 · Writes only go through the RPCs. Direct INSERT / UPDATE / DELETE on every table is refused for every role,
-- internal helpers are not callable, and Storage only accepts uploads that match the field/postventa rules.
select pg_temp.new_order(1);                                                  -- ORD1: U1, SUP1, open (borrador)
select pg_temp.new_order(2, 1, '22222222-0000-4000-8000-000000000005');        -- ORD2: U1, SUP2
select pg_temp.new_order(3, 2, '22222222-0000-4000-8000-000000000006');        -- ORD3: U2, SUP3
update public.orders set status = 'finalizada' where id = '66666666-0000-4000-8000-000000000002';   -- ORD2 closed

do $$
declare
  p record;
  v_t text;
  v_tables text[] := array['units', 'profiles', 'workers', 'clients', 'sites', 'service_types', 'materials', 'orders',
    'jornadas', 'crew_changes', 'jornada_checks', 'jornada_notes', 'incidents', 'post_sale_cases', 'case_events', 'photos',
    'order_closures', 'reports', 'report_shares', 'surveys', 'survey_tokens', 'audit_log'];
begin
  -- every table × {insert, update, delete} × {Dirección, Administración, supervisor, deactivated, anon}
  for p in select * from (values
    ('DIR', '22222222-0000-4000-8000-000000000001'::uuid), ('ADM1', '22222222-0000-4000-8000-000000000002'::uuid),
    ('SUP1', '22222222-0000-4000-8000-000000000004'::uuid), ('INACT', '22222222-0000-4000-8000-000000000007'::uuid),
    ('ANON', null::uuid)) as x(who, id)
  loop
    if p.id is null then perform pg_temp.as_anon(); else perform pg_temp.as_user(p.id); end if;
    foreach v_t in array v_tables loop
      perform pg_temp.err(p.who || ' insert ' || v_t, format('insert into public.%I default values', v_t), '42501');
      perform pg_temp.err(p.who || ' update ' || v_t, format('update public.%I set updated_at = now()', v_t), '42501');
      perform pg_temp.err(p.who || ' delete ' || v_t, format('delete from public.%I', v_t), '42501');
    end loop;
    -- internal helpers and the idempotency table are out of reach
    perform pg_temp.err(p.who || ' private.audit', $q$ select private.denied_reason('x') $q$, '42501');
    perform pg_temp.err(p.who || ' private.begin_op', $q$ select private.begin_op(gen_random_uuid(), gen_random_uuid(), 'x') $q$, '42501');
    perform pg_temp.err(p.who || ' private.sync_ops', $q$ select 1 from private.sync_ops $q$, '42501');
    perform pg_temp.err(p.who || ' private.expose_rpc', $q$ select private.expose_rpc('create_order') $q$, '42501');
    perform pg_temp.err(p.who || ' hook', $q$ select private.custom_access_token_hook('{}') $q$, '42501');
    perform pg_temp.as_owner();
  end loop;
  -- anon cannot call any staff RPC
  perform pg_temp.as_anon();
  perform pg_temp.err('anon create_order', $q$ select public.create_order(gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 'x') $q$, '42501');
  perform pg_temp.err('anon check_in', $q$ select public.check_in(gen_random_uuid(), gen_random_uuid(), now(), 0, 0, 1) $q$, '42501');
  perform pg_temp.err('anon update_profile', $q$ select public.update_profile(gen_random_uuid(), gen_random_uuid(), '{}') $q$, '42501');
  perform pg_temp.err('anon sync_reconcile', $q$ select public.sync_reconcile('orders', '{}') $q$, '42501');
  perform pg_temp.as_owner();
end $$;

-- Storage upload rules (INSERT policy on storage.objects, evaluated as the caller like the Storage API does)
do $$
declare
  c record;
begin
  for c in select * from (values
    -- who, uuid, order, kind, expected (true = upload allowed)
    ('SUP1 field photo on own open order',        '22222222-0000-4000-8000-000000000004'::uuid, '66666666-0000-4000-8000-000000000001', 'antes',      true),
    ('SUP1 incident photo on own open order',     '22222222-0000-4000-8000-000000000004'::uuid, '66666666-0000-4000-8000-000000000001', 'incidencia', true),
    ('SUP1 postventa photo on own order',         '22222222-0000-4000-8000-000000000004'::uuid, '66666666-0000-4000-8000-000000000001', 'postventa',  true),
    ('SUP1 photo on another supervisor''s order', '22222222-0000-4000-8000-000000000004'::uuid, '66666666-0000-4000-8000-000000000002', 'antes',      false),
    ('SUP1 photo on another unit''s order',       '22222222-0000-4000-8000-000000000004'::uuid, '66666666-0000-4000-8000-000000000003', 'antes',      false),
    ('SUP2 field photo on own CLOSED order',      '22222222-0000-4000-8000-000000000005'::uuid, '66666666-0000-4000-8000-000000000002', 'despues',    false),
    ('SUP2 postventa photo on own closed order',  '22222222-0000-4000-8000-000000000005'::uuid, '66666666-0000-4000-8000-000000000002', 'postventa',  true),
    ('ADM1 field photo (no field.capture)',       '22222222-0000-4000-8000-000000000002'::uuid, '66666666-0000-4000-8000-000000000001', 'antes',      false),
    ('ADM1 postventa photo in own unit',          '22222222-0000-4000-8000-000000000002'::uuid, '66666666-0000-4000-8000-000000000001', 'postventa',  true),
    ('ADM1 postventa photo in other unit',        '22222222-0000-4000-8000-000000000002'::uuid, '66666666-0000-4000-8000-000000000003', 'postventa',  false),
    ('DIR any photo (read-only)',                 '22222222-0000-4000-8000-000000000001'::uuid, '66666666-0000-4000-8000-000000000001', 'postventa',  false),
    ('INACT any photo',                           '22222222-0000-4000-8000-000000000007'::uuid, '66666666-0000-4000-8000-000000000001', 'antes',      false)
  ) as x(label, who, order_id, kind, allowed)
  loop
    perform pg_temp.as_user(c.who);
    if c.allowed then
      perform pg_temp.ok(c.label, format(
        'insert into storage.objects (bucket_id, name, owner_id) values (''evidencias'', ''orders/%s/%s/%s.jpg'', auth.uid()::text) returning name',
        c.order_id, c.kind, gen_random_uuid()));
    else
      perform pg_temp.err(c.label, format(
        'insert into storage.objects (bucket_id, name, owner_id) values (''evidencias'', ''orders/%s/%s/%s.jpg'', auth.uid()::text)',
        c.order_id, c.kind, gen_random_uuid()), '42501');
    end if;
    perform pg_temp.as_owner();
  end loop;

  perform pg_temp.as_user('22222222-0000-4000-8000-000000000004');
  perform pg_temp.err('malformed path', $q$ insert into storage.objects (bucket_id, name) values ('evidencias', 'orders/66666666-0000-4000-8000-000000000001/antes/../../x.jpg') $q$, '42501');
  perform pg_temp.err('unknown kind folder', $q$ insert into storage.objects (bucket_id, name) values ('evidencias', 'orders/66666666-0000-4000-8000-000000000001/otros/a0000000-0000-4000-8000-000000000001.jpg') $q$, '42501');
  perform pg_temp.err('executable extension', $q$ insert into storage.objects (bucket_id, name) values ('evidencias', 'orders/66666666-0000-4000-8000-000000000001/antes/a0000000-0000-4000-8000-000000000001.html') $q$, '42501');
  perform pg_temp.err('other bucket', $q$ insert into storage.objects (bucket_id, name) values ('avatars', 'x.jpg') $q$, '42501');

  -- evidence is immutable for clients: no UPDATE (no upsert/overwrite) and no DELETE, even on one's own upload
  perform pg_temp.ok('own upload', $q$ insert into storage.objects (bucket_id, name, owner_id, metadata) values ('evidencias', 'orders/66666666-0000-4000-8000-000000000001/despues/a0000000-0000-4000-8000-0000000000ff.jpg', auth.uid()::text, '{"size": 1}') returning name $q$);
  perform pg_temp.eq('update own object affects nothing',
    pg_temp.ok('update', $q$ with u as (update storage.objects set metadata = '{"size": 999}' where name like '%0000000000ff.jpg' returning 1) select count(*)::text from u $q$), '0');
  -- the Storage API sets storage.allow_delete_query for its own DELETEs (a direct DELETE is refused by the platform
  -- trigger storage.protect_delete); emulate the API path so the RLS decision is what is being tested
  perform set_config('storage.allow_delete_query', 'true', true);
  perform pg_temp.eq('delete own object affects nothing',
    pg_temp.ok('delete', $q$ with d as (delete from storage.objects where name like '%0000000000ff.jpg' returning 1) select count(*)::text from d $q$), '0');
  perform set_config('storage.allow_delete_query', 'false', true);
  perform pg_temp.as_owner();
  perform pg_temp.eq('object unchanged', (select metadata ->> 'size' from storage.objects where name like '%0000000000ff.jpg'), '1');
end $$;
