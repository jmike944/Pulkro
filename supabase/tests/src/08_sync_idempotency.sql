-- 08 · Sync protocol guarantees: idempotent retries (op ids), no op-id hijacking, failed ops can be retried, server
-- time on every row, incremental pull by updated_at/row_version, tombstones, and scope-loss reconciliation.
select pg_temp.new_order(1);   -- ORD1 (SUP1)
select pg_temp.new_order(2);   -- ORD2 (SUP1)
do $$
declare
  v jsonb;
  v_audit integer;
  v_before timestamptz;
  c_adm1 constant uuid := '22222222-0000-4000-8000-000000000002';
  c_sup1 constant uuid := '22222222-0000-4000-8000-000000000004';
  c_sup2 constant uuid := '22222222-0000-4000-8000-000000000005';
  c_op constant uuid := 'cdcdcdcd-0000-4000-8000-000000000001';
begin
  ------------------------------------------------------------------ retries are idempotent
  perform pg_temp.as_user(c_sup1);
  perform pg_temp.ok('note', format($q$ select public.add_jornada_note(%L, 'cdcdcdcd-1000-4000-8000-000000000001', '66666666-1000-4000-8000-000000000001', 'Primera nota') $q$, c_op));
  select count(*) into v_audit from public.audit_log;
  v := pg_temp.ok('same op again', format($q$ select public.add_jornada_note(%L, 'cdcdcdcd-1000-4000-8000-000000000001', '66666666-1000-4000-8000-000000000001', 'Primera nota') $q$, c_op))::jsonb;
  perform pg_temp.eq('stored result returned', concat_ws('|', v ->> 'ok', v ->> 'duplicate', v ->> 'note_id'), 'true|true|cdcdcdcd-1000-4000-8000-000000000001');
  perform pg_temp.eq('no second note', (select count(*)::text from public.jornada_notes), '1');
  perform pg_temp.eq('no second audit entry', (select count(*) from public.audit_log)::text, v_audit::text);
  -- same entity id under a new op id is a real conflict, not a silent duplicate
  perform pg_temp.err('entity id reused under a new op', $q$ select public.add_jornada_note(gen_random_uuid(), 'cdcdcdcd-1000-4000-8000-000000000001', '66666666-1000-4000-8000-000000000001', 'Otra') $q$, '23505');
  perform pg_temp.as_user(c_sup2);
  perform pg_temp.err('another user cannot replay or probe an op id', format($q$ select public.update_my_contact(%L, '1') $q$, c_op), 'PT409', 'op_id_reused');
  -- a failed op leaves no trace: the same op id succeeds once the input is fixed
  perform pg_temp.as_user(c_sup1);
  perform pg_temp.err('first attempt fails', $q$ select public.add_jornada_note('cdcdcdcd-0000-4000-8000-000000000002', gen_random_uuid(), '66666666-1000-4000-8000-000000000001', '') $q$, 'PT422', 'invalid_text');
  v := pg_temp.ok('retry with the same op id', $q$ select public.add_jornada_note('cdcdcdcd-0000-4000-8000-000000000002', 'cdcdcdcd-1000-4000-8000-000000000002', '66666666-1000-4000-8000-000000000001', 'Nota corregida') $q$)::jsonb;
  perform pg_temp.check('not a duplicate', v ->> 'duplicate' is null);
  perform pg_temp.as_owner();
  perform pg_temp.eq('op journal', (select concat_ws('|', actor_id = c_sup1, action, result ->> 'ok') from private.sync_ops where op_id = c_op), 't|add_jornada_note|true');

  ------------------------------------------------------------------ server time and row versions (pull cursor)
  insert into public.service_types (id, name, short, default_hours_per_day, created_at, updated_at, row_version)
  values ('33333333-2000-4000-8000-0000000000aa', 'Prueba reloj', 'Reloj', 4, '2001-01-01', '2001-01-01', 99);
  perform pg_temp.eq('client-supplied timestamps are replaced by the server clock',
    (select concat_ws('|', created_at = now(), updated_at = now(), row_version) from public.service_types where id = '33333333-2000-4000-8000-0000000000aa'), 't|t|99');
  perform pg_temp.as_user(c_sup1);
  perform public.update_order(gen_random_uuid(), '66666666-0000-4000-8000-000000000001', '{"special_instructions": "v2"}');
  perform public.update_order(gen_random_uuid(), '66666666-0000-4000-8000-000000000001', '{"special_instructions": "v3"}');
  perform pg_temp.eq('row_version counts the edits', (select row_version::text from public.orders where id = '66666666-0000-4000-8000-000000000001'), '3');
  perform pg_temp.eq('append-only rows: updated_at = created_at', (select count(*)::text from public.jornada_notes where updated_at <> created_at), '0');
  -- incremental pull = RLS-scoped select on updated_at, keyset-paginated
  perform pg_temp.eq('pull orders since a cursor', pg_temp.seen($q$ select id from public.orders where updated_at >= now() - interval '1 minute' order by updated_at, id limit 500 $q$), 'ORD1,ORD2');
  -- rescheduling leaves a tombstone the device will pull
  perform public.assign_crew(gen_random_uuid(), '66666666-0000-4000-8000-000000000002', array['44444444-0000-4000-8000-000000000001']::uuid[], 'Inicial');
  perform public.schedule_jornadas(gen_random_uuid(), '66666666-0000-4000-8000-000000000002',
    jsonb_build_array(jsonb_build_object('id', 'cdcdcdcd-2000-4000-8000-000000000001', 'date', current_date + 1,
      'planned_start', now() + interval '20 hours', 'planned_end', now() + interval '26 hours')), 'Movida');
  perform pg_temp.eq('tombstone is visible to the device', (select concat_ws('|', deleted_at is not null, updated_at = now()) from public.jornadas where id = '66666666-1000-4000-8000-000000000002'), 't|t');

  ------------------------------------------------------------------ scope-loss reconciliation
  perform pg_temp.eq('SUP1 still holds both orders', pg_temp.seen($q$ select unnest(public.sync_reconcile('orders', array['66666666-0000-4000-8000-000000000001', '66666666-0000-4000-8000-000000000002']::uuid[])) $q$), 'ORD1,ORD2');
  perform pg_temp.as_user(c_adm1);
  perform public.update_order(gen_random_uuid(), '66666666-0000-4000-8000-000000000002', '{"supervisor_id": "22222222-0000-4000-8000-000000000005"}', 'Reasignación');
  perform pg_temp.as_user(c_sup1);
  perform pg_temp.eq('ORD2 left SUP1''s scope', pg_temp.seen($q$ select unnest(public.sync_reconcile('orders', array['66666666-0000-4000-8000-000000000001', '66666666-0000-4000-8000-000000000002']::uuid[])) $q$), 'ORD1');
  perform pg_temp.eq('and so did its jornadas', pg_temp.seen($q$ select unnest(public.sync_reconcile('jornadas', array['66666666-1000-4000-8000-000000000001', '66666666-1000-4000-8000-000000000002', 'cdcdcdcd-2000-4000-8000-000000000001']::uuid[])) $q$), 'J1');
  perform pg_temp.eq('catalog rows reconcile too', pg_temp.seen($q$ select unnest(public.sync_reconcile('clients', array['33333333-0000-4000-8000-000000000001', '33333333-0000-4000-8000-000000000002']::uuid[])) $q$), 'C1');
  perform pg_temp.err('only synced tables', $q$ select public.sync_reconcile('audit_log', '{}') $q$, 'PT422', 'invalid_table');
  perform pg_temp.err('bounded batches', $q$ select public.sync_reconcile('orders', array(select gen_random_uuid() from generate_series(1, 2001))) $q$, 'PT422', 'too_many_ids');
  perform pg_temp.as_user(c_sup2);
  perform pg_temp.eq('SUP2 gained ORD2', pg_temp.seen($q$ select unnest(public.sync_reconcile('orders', array['66666666-0000-4000-8000-000000000001', '66666666-0000-4000-8000-000000000002']::uuid[])) $q$), 'ORD2');
  perform pg_temp.as_owner();
end $$;
