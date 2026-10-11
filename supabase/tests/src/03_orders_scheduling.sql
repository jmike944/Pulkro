-- 03 · Orders and scheduling: who may create / edit / cancel / reschedule / staff, inside which scope, and the
-- server-side rules behind each (folios, site ↔ client, supervisor ↔ unit, crews, tombstoned jornadas, idempotency).
do $$
declare
  v jsonb;
  v_op uuid := 'aaaaaaaa-0000-4000-8000-000000000001';
  c_dir constant uuid := '22222222-0000-4000-8000-000000000001';
  c_adm1 constant uuid := '22222222-0000-4000-8000-000000000002';
  c_adm2 constant uuid := '22222222-0000-4000-8000-000000000003';
  c_sup1 constant uuid := '22222222-0000-4000-8000-000000000004';
  c_sup2 constant uuid := '22222222-0000-4000-8000-000000000005';
  v_days constant text := $j$'[{"id": "77777777-0000-4000-8000-000000000001", "date": "2026-10-20", "planned_start": "2026-10-20T14:00:00Z", "planned_end": "2026-10-20T22:00:00Z"}]'$j$;
begin
  ------------------------------------------------------------------ create_order
  perform pg_temp.as_user(c_adm1);
  v := pg_temp.ok('ADM1 creates', format($q$ select public.create_order(%L, '77777777-1000-4000-8000-000000000001',
        '33333333-0000-4000-8000-000000000001', '33333333-1000-4000-8000-000000000001', '33333333-2000-4000-8000-000000000001',
        %L, '  Limpieza de nave  ', %s, array[' Barrido ', '', 'Trapeado'],
        '[{"material_id": "33333333-3000-4000-8000-000000000001", "qty": "2.5"}]', 'Usar EPP', 'Ing. Pérez', '+52 81 0000 1234', 'COT-77', 'alta') $q$,
        v_op, c_sup1, v_days))::jsonb;
  perform pg_temp.check('folio assigned by the server', (v ->> 'folio') ~ '^OS-[0-9]{5,}$');
  perform pg_temp.eq('new order is borrador', v ->> 'status', 'borrador');
  perform pg_temp.eq('order fields normalised',
    (select concat_ws('|', unit_id = '11111111-0000-4000-8000-000000000001', created_by = c_adm1, title, array_to_string(activities, ','),
       materials::text, priority, planned_days, created_at = now(), row_version)
     from public.orders where id = '77777777-1000-4000-8000-000000000001'),
    't|t|Limpieza de nave|Barrido,Trapeado|[{"qty": 2.5, "material_id": "33333333-3000-4000-8000-000000000001"}]|alta|1|t|1');
  perform pg_temp.eq('jornada created from the days', (select string_agg(day_index || ':' || date, ',') from public.jornadas where order_id = '77777777-1000-4000-8000-000000000001'), '1:2026-10-20');
  perform pg_temp.eq('audit with op id', (select count(*)::text from public.audit_log where order_id = '77777777-1000-4000-8000-000000000001' and op_id = v_op and action = 'Alta manual de orden de servicio' and reason = 'Trabajo autorizado COT-77'), '1');
  -- idempotent retry (same op id, same request): same answer, nothing duplicated
  v := pg_temp.ok('retry', format($q$ select public.create_order(%L, '77777777-1000-4000-8000-000000000001',
        '33333333-0000-4000-8000-000000000001', '33333333-1000-4000-8000-000000000001', '33333333-2000-4000-8000-000000000001',
        %L, '  Limpieza de nave  ', %s, array[' Barrido ', '', 'Trapeado'],
        '[{"material_id": "33333333-3000-4000-8000-000000000001", "qty": "2.5"}]', 'Usar EPP', 'Ing. Pérez', '+52 81 0000 1234', 'COT-77', 'alta') $q$,
        v_op, c_sup1, v_days))::jsonb;
  perform pg_temp.eq('retry flagged duplicate', v ->> 'duplicate', 'true');
  perform pg_temp.eq('retry returns same folio', v ->> 'folio', (select folio from public.orders where id = '77777777-1000-4000-8000-000000000001'));
  perform pg_temp.eq('no duplicate order', (select count(*)::text from public.orders), '1');
  -- the op id is bound to its request: the same id with another payload is refused, never reported as applied
  perform pg_temp.err('op id replayed with another payload', format($q$ select public.create_order(%L, '77777777-1000-4000-8000-000000000001',
        '33333333-0000-4000-8000-000000000001', '33333333-1000-4000-8000-000000000001', '33333333-2000-4000-8000-000000000001',
        %L, 'Limpieza de nave', %s) $q$, v_op, c_sup1, v_days), 'PT409', 'op_id_reused');
  perform pg_temp.err('op id reused for another action', format($q$ select public.cancel_order(%L, '77777777-1000-4000-8000-000000000001', 'motivo largo') $q$, v_op), 'PT409', 'op_id_reused');
  perform pg_temp.err('client of another unit', $q$ select public.create_order(gen_random_uuid(), gen_random_uuid(), '33333333-0000-4000-8000-000000000003', '33333333-1000-4000-8000-000000000003', '33333333-2000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000006', 'Orden ajena') $q$, 'PT404', 'out_of_scope');
  perform pg_temp.err('site of another client', $q$ select public.create_order(gen_random_uuid(), gen_random_uuid(), '33333333-0000-4000-8000-000000000001', '33333333-1000-4000-8000-000000000002', '33333333-2000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000004', 'Sitio cruzado') $q$, 'PT422', 'site_client_mismatch');
  perform pg_temp.err('supervisor of another unit', $q$ select public.create_order(gen_random_uuid(), gen_random_uuid(), '33333333-0000-4000-8000-000000000001', '33333333-1000-4000-8000-000000000001', '33333333-2000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000006', 'Supervisor ajeno') $q$, 'PT422', 'invalid_supervisor');
  perform pg_temp.err('inactive supervisor', $q$ select public.create_order(gen_random_uuid(), gen_random_uuid(), '33333333-0000-4000-8000-000000000001', '33333333-1000-4000-8000-000000000001', '33333333-2000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000007', 'Supervisor inactivo') $q$, 'PT422', 'invalid_supervisor');
  perform pg_temp.err('day ends before it starts', $q$ select public.create_order(gen_random_uuid(), gen_random_uuid(), '33333333-0000-4000-8000-000000000001', '33333333-1000-4000-8000-000000000001', '33333333-2000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000004', 'Fechas malas', '[{"id": "77777777-0000-4000-8000-000000000099", "date": "2026-10-20", "planned_start": "2026-10-20T22:00:00Z", "planned_end": "2026-10-20T14:00:00Z"}]') $q$, 'PT422', 'invalid_days');
  perform pg_temp.err('unparseable day', $q$ select public.create_order(gen_random_uuid(), gen_random_uuid(), '33333333-0000-4000-8000-000000000001', '33333333-1000-4000-8000-000000000001', '33333333-2000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000004', 'Fechas malas', '[{"id": "x", "date": "mañana"}]') $q$, 'PT422', 'invalid_days');
  perform pg_temp.err('unknown material', $q$ select public.create_order(gen_random_uuid(), gen_random_uuid(), '33333333-0000-4000-8000-000000000001', '33333333-1000-4000-8000-000000000001', '33333333-2000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000004', 'Material raro', '[]', '{}', '[{"material_id": "33333333-3000-4000-8000-0000000000ff", "qty": 1}]') $q$, 'PT422', 'invalid_materials');
  perform pg_temp.err('title too short', $q$ select public.create_order(gen_random_uuid(), gen_random_uuid(), '33333333-0000-4000-8000-000000000001', '33333333-1000-4000-8000-000000000001', '33333333-2000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000004', ' x ') $q$, 'PT422', 'invalid_text');
  perform pg_temp.err('missing op id', $q$ select public.create_order(null, gen_random_uuid(), '33333333-0000-4000-8000-000000000001', '33333333-1000-4000-8000-000000000001', '33333333-2000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000004', 'Sin op') $q$, 'PT422', 'op_id_required');
  perform pg_temp.as_user(c_dir);
  perform pg_temp.err('Dirección cannot create', $q$ select public.create_order(gen_random_uuid(), gen_random_uuid(), '33333333-0000-4000-8000-000000000001', '33333333-1000-4000-8000-000000000001', '33333333-2000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000004', 'Orden de Dirección') $q$, 'PT403', 'forbidden:order.create');
  perform pg_temp.as_user(c_sup1);
  perform pg_temp.err('supervisor cannot create', $q$ select public.create_order(gen_random_uuid(), gen_random_uuid(), '33333333-0000-4000-8000-000000000001', '33333333-1000-4000-8000-000000000001', '33333333-2000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000004', 'Orden del supervisor') $q$, 'PT403', 'forbidden:order.create');
  perform pg_temp.as_user('22222222-0000-4000-8000-000000000007');
  perform pg_temp.err('deactivated account', $q$ select public.update_my_contact(gen_random_uuid(), '1') $q$, 'PT401', 'inactive');
  perform pg_temp.as_user('22222222-0000-4000-8000-000000000008');
  perform pg_temp.err('account without profile', $q$ select public.update_my_contact(gen_random_uuid(), '1') $q$, 'PT401', 'no_profile');
  perform pg_temp.as_owner();

  ------------------------------------------------------------------ update_order
  perform pg_temp.new_order(1);  -- ORD1 (SUP1)
  perform pg_temp.as_user(c_adm1);
  perform pg_temp.ok('ADM1 edits general data', $q$ select public.update_order(gen_random_uuid(), '66666666-0000-4000-8000-000000000001', '{"title": "Nuevo título", "priority": "alta", "commercial_ref": "COT-9"}', 'Ajuste comercial') $q$);
  perform pg_temp.eq('edit audited with fields', (select action from public.audit_log where order_id = '66666666-0000-4000-8000-000000000001' and action like 'Editó%'), 'Editó referencia comercial, prioridad, título');
  perform pg_temp.err('unknown field', $q$ select public.update_order(gen_random_uuid(), '66666666-0000-4000-8000-000000000001', '{"status": "finalizada"}') $q$, 'PT422', 'field_not_editable');
  perform pg_temp.err('bad uuid value', $q$ select public.update_order(gen_random_uuid(), '66666666-0000-4000-8000-000000000001', '{"site_id": "no-uuid"}') $q$, 'PT422', 'invalid_value');
  perform pg_temp.err('site of another client', $q$ select public.update_order(gen_random_uuid(), '66666666-0000-4000-8000-000000000001', '{"site_id": "33333333-1000-4000-8000-000000000002"}') $q$, 'PT422', 'site_client_mismatch');
  perform pg_temp.ok('site of the same client', $q$ select public.update_order(gen_random_uuid(), '66666666-0000-4000-8000-000000000001', '{"site_id": "33333333-1000-4000-8000-000000000004"}') $q$);
  perform pg_temp.as_user(c_sup1);
  perform pg_temp.ok('SUP1 edits operational data', $q$ select public.update_order(gen_random_uuid(), '66666666-0000-4000-8000-000000000001', '{"special_instructions": "Acceso por andén 2", "activities": ["Pulido"], "materials": []}') $q$);
  perform pg_temp.err('SUP1 cannot edit general data', $q$ select public.update_order(gen_random_uuid(), '66666666-0000-4000-8000-000000000001', '{"title": "Otro"}') $q$, 'PT403', 'forbidden:order.edit');
  perform pg_temp.as_user(c_sup2);
  perform pg_temp.err('SUP2 cannot touch SUP1''s order', $q$ select public.update_order(gen_random_uuid(), '66666666-0000-4000-8000-000000000001', '{"special_instructions": "x"}') $q$, 'PT404', 'out_of_scope');
  perform pg_temp.as_user(c_adm2);
  perform pg_temp.err('ADM2 cannot touch U1 orders', $q$ select public.update_order(gen_random_uuid(), '66666666-0000-4000-8000-000000000001', '{"title": "Ajeno"}') $q$, 'PT404', 'out_of_scope');
  perform pg_temp.as_user(c_dir);
  perform pg_temp.err('Dirección only consults', $q$ select public.update_order(gen_random_uuid(), '66666666-0000-4000-8000-000000000001', '{"special_instructions": "x"}') $q$, 'PT403', 'forbidden:order.edit');
  -- reassignment (order.edit): supervisor of the same unit only; history in the audit log; scope follows
  perform pg_temp.as_user(c_adm1);
  perform pg_temp.err('reassign to other unit''s supervisor', $q$ select public.update_order(gen_random_uuid(), '66666666-0000-4000-8000-000000000001', '{"supervisor_id": "22222222-0000-4000-8000-000000000006"}') $q$, 'PT422', 'invalid_supervisor');
  perform pg_temp.ok('reassign to SUP2', $q$ select public.update_order(gen_random_uuid(), '66666666-0000-4000-8000-000000000001', '{"supervisor_id": "22222222-0000-4000-8000-000000000005"}', 'Carga de trabajo') $q$);
  perform pg_temp.check('reassignment history', exists (select 1 from public.audit_log where order_id = '66666666-0000-4000-8000-000000000001' and action = 'Reasignó la orden de Supervisora Uno a Supervisor Dos' and reason = 'Carga de trabajo'));
  perform pg_temp.as_user(c_sup1);
  -- the previous supervisor gets a sync conflict (their offline work is not "someone else's data"); others get 404
  perform pg_temp.err('previous supervisor lost the order', $q$ select public.update_order(gen_random_uuid(), '66666666-0000-4000-8000-000000000001', '{"special_instructions": "x"}') $q$, 'PT409', 'order_reassigned');
  perform pg_temp.as_user('22222222-0000-4000-8000-000000000006');
  perform pg_temp.err('a supervisor who never had it', $q$ select public.update_order(gen_random_uuid(), '66666666-0000-4000-8000-000000000001', '{"special_instructions": "x"}') $q$, 'PT404', 'out_of_scope');
  perform pg_temp.as_owner();
  perform pg_temp.eq('row_version bumps on every edit', (select row_version::text from public.orders where id = '66666666-0000-4000-8000-000000000001'), '5');

  ------------------------------------------------------------------ cancel_order
  perform pg_temp.new_order(2);  -- ORD2 (SUP1)
  perform pg_temp.as_user(c_sup1);
  perform pg_temp.err('supervisor cannot cancel', $q$ select public.cancel_order(gen_random_uuid(), '66666666-0000-4000-8000-000000000002', 'Cliente canceló') $q$, 'PT403', 'forbidden:order.edit');
  perform pg_temp.as_user(c_adm1);
  perform pg_temp.err('reason required', $q$ select public.cancel_order(gen_random_uuid(), '66666666-0000-4000-8000-000000000002', 'no') $q$, 'PT422', 'invalid_text');
  perform pg_temp.ok('ADM1 cancels', $q$ select public.cancel_order(gen_random_uuid(), '66666666-0000-4000-8000-000000000002', 'Cliente canceló el servicio') $q$);
  perform pg_temp.eq('cancelled', (select status::text from public.orders where id = '66666666-0000-4000-8000-000000000002'), 'cancelada');
  perform pg_temp.check('status change audited with reason', exists (select 1 from public.audit_log where order_id = '66666666-0000-4000-8000-000000000002' and action = 'Cambió estado a Cancelada' and reason = 'Cliente canceló el servicio'));
  perform pg_temp.err('cancel twice', $q$ select public.cancel_order(gen_random_uuid(), '66666666-0000-4000-8000-000000000002', 'Otra vez cancelada') $q$, 'PT409', 'order_not_open');
  perform pg_temp.err('no edits on a cancelled order', $q$ select public.update_order(gen_random_uuid(), '66666666-0000-4000-8000-000000000002', '{"title": "Revivir"}') $q$, 'PT409', 'order_cancelled');
  perform pg_temp.as_owner();

  ------------------------------------------------------------------ crews, reschedule, confirm dates
  perform pg_temp.new_order(3);  -- ORD3 (SUP1), J3 today
  perform pg_temp.as_user(c_adm1);
  perform pg_temp.err('Administración does not assign crews', $q$ select public.assign_crew(gen_random_uuid(), '66666666-0000-4000-8000-000000000003', array['44444444-0000-4000-8000-000000000001']::uuid[]) $q$, 'PT403', 'forbidden:crew.assign');
  perform pg_temp.err('Administración does not reschedule', $q$ select public.set_order_status(gen_random_uuid(), '66666666-0000-4000-8000-000000000003', 'reprogramada', 'Cliente pidió') $q$, 'PT403', 'forbidden:order.reschedule');
  perform pg_temp.as_user(c_sup1);
  perform pg_temp.err('crew from another unit', $q$ select public.assign_crew(gen_random_uuid(), '66666666-0000-4000-8000-000000000003', array['44444444-0000-4000-8000-000000000003']::uuid[]) $q$, 'PT422', 'invalid_crew');
  perform pg_temp.err('inactive worker', $q$ select public.assign_crew(gen_random_uuid(), '66666666-0000-4000-8000-000000000003', array['44444444-0000-4000-8000-000000000004']::uuid[]) $q$, 'PT422', 'invalid_crew');
  perform pg_temp.err('jornada of another order', $q$ select public.assign_crew(gen_random_uuid(), '66666666-0000-4000-8000-000000000003', array['44444444-0000-4000-8000-000000000001']::uuid[], 'x', '66666666-1000-4000-8000-000000000001') $q$, 'PT404', 'out_of_scope');
  perform pg_temp.eq('crew → programada',
    pg_temp.ok('assign', $q$ select public.assign_crew(gen_random_uuid(), '66666666-0000-4000-8000-000000000003', array['44444444-0000-4000-8000-000000000001', '44444444-0000-4000-8000-000000000002', '44444444-0000-4000-8000-000000000001']::uuid[], 'Asignación inicial') ->> 'status' $q$), 'programada');
  perform pg_temp.eq('pending jornadas carry the crew (deduplicated)', pg_temp.seen($q$ select unnest(worker_ids) from public.jornadas where order_id = '66666666-0000-4000-8000-000000000003' $q$), 'W1,W2');
  perform pg_temp.eq('crew history', (select array_length(worker_ids, 1)::text from public.crew_changes where order_id = '66666666-0000-4000-8000-000000000003'), '2');
  perform pg_temp.err('only settable states', $q$ select public.set_order_status(gen_random_uuid(), '66666666-0000-4000-8000-000000000003', 'finalizada') $q$, 'PT422', 'status_not_settable');
  perform pg_temp.err('confirming dates needs Reprogramada', $q$ select public.set_order_status(gen_random_uuid(), '66666666-0000-4000-8000-000000000003', 'programada') $q$, 'PT409', 'not_rescheduled');
  perform pg_temp.err('reprogramada needs a reason', $q$ select public.set_order_status(gen_random_uuid(), '66666666-0000-4000-8000-000000000003', 'reprogramada', 'x') $q$, 'PT422', 'reason_required');
  perform pg_temp.err('an empty schedule is refused while nothing was executed', $q$ select public.schedule_jornadas(gen_random_uuid(), '66666666-0000-4000-8000-000000000003', '[]', 'Sin fecha') $q$, 'PT422', 'days_required');
  perform pg_temp.ok('flag Reprogramada', $q$ select public.set_order_status(gen_random_uuid(), '66666666-0000-4000-8000-000000000003', 'reprogramada', 'El cliente movió la fecha') $q$);
  perform pg_temp.eq('reschedule confirms → programada',
    pg_temp.ok('schedule', $q$ select public.schedule_jornadas(gen_random_uuid(), '66666666-0000-4000-8000-000000000003',
      jsonb_build_array(jsonb_build_object('id', '77777777-2000-4000-8000-000000000001', 'date', current_date,
        'planned_start', now() - interval '1 hour', 'planned_end', now() + interval '6 hours')), 'Nueva fecha') ->> 'status' $q$), 'programada');
  perform pg_temp.as_owner();
  perform pg_temp.eq('old pending day tombstoned, new one live',
    (select string_agg(id::text || ':' || (deleted_at is not null) || ':' || day_index || ':' || array_length(worker_ids, 1), ',' order by id)
     from public.jornadas where order_id = '66666666-0000-4000-8000-000000000003'),
    '66666666-1000-4000-8000-000000000003:true:1:2,77777777-2000-4000-8000-000000000001:false:1:2');
  -- executed days are kept when rescheduling again
  perform pg_temp.as_user(c_sup1);
  perform pg_temp.ok('check-in new day', $q$ select public.check_in(gen_random_uuid(), '77777777-2000-4000-8000-000000000001', now() - interval '30 minutes', 25.7, -100.3, 8) $q$);
  perform pg_temp.ok('add a second day', $q$ select public.schedule_jornadas(gen_random_uuid(), '66666666-0000-4000-8000-000000000003',
      jsonb_build_array(jsonb_build_object('id', '77777777-2000-4000-8000-000000000002', 'date', current_date + 1,
        'planned_start', now() + interval '20 hours', 'planned_end', now() + interval '28 hours')), 'Día extra') $q$);
  perform pg_temp.err('reusing a jornada id', $q$ select public.schedule_jornadas(gen_random_uuid(), '66666666-0000-4000-8000-000000000003',
      jsonb_build_array(jsonb_build_object('id', '77777777-2000-4000-8000-000000000001', 'date', current_date + 2,
        'planned_start', now() + interval '44 hours', 'planned_end', now() + interval '50 hours'))) $q$, '23505');
  perform pg_temp.as_owner();
  perform pg_temp.eq('executed day kept, new day appended',
    (select string_agg(day_index || ':' || status, ',' order by day_index) from public.jornadas where order_id = '66666666-0000-4000-8000-000000000003' and deleted_at is null),
    '1:en_curso,2:pendiente');
  perform pg_temp.eq('planned_days follows live jornadas', (select planned_days::text from public.orders where id = '66666666-0000-4000-8000-000000000003'), '2');
end $$;
