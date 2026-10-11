-- 04 · Field capture is the supervisor's, on their own open orders: check-in/out sequence and duplicates, device-time
-- bounds, location justification, photos tied to uploaded objects, incidents and their effect on the order status.
select pg_temp.new_order(1);   -- ORD1 / J1 (SUP1)
select pg_temp.new_order(2);   -- ORD2 / J2 (SUP1)
do $$
declare
  v jsonb;
  v_op uuid := 'bbbbbbbb-0000-4000-8000-000000000001';
  c_dir constant uuid := '22222222-0000-4000-8000-000000000001';
  c_adm1 constant uuid := '22222222-0000-4000-8000-000000000002';
  c_sup1 constant uuid := '22222222-0000-4000-8000-000000000004';
  c_sup2 constant uuid := '22222222-0000-4000-8000-000000000005';
  c_j1 constant text := '66666666-1000-4000-8000-000000000001';
begin
  perform pg_temp.as_user(c_sup1);
  perform pg_temp.ok('crew', $q$ select public.assign_crew(gen_random_uuid(), '66666666-0000-4000-8000-000000000001', array['44444444-0000-4000-8000-000000000001']::uuid[], 'Inicial') $q$);

  ------------------------------------------------------------------ who may capture
  perform pg_temp.as_user(c_dir);
  perform pg_temp.err('Dirección cannot check in', format($q$ select public.check_in(gen_random_uuid(), %L, now(), 25.7, -100.3, 10) $q$, c_j1), 'PT403', 'forbidden:field.capture');
  perform pg_temp.as_user(c_adm1);
  perform pg_temp.err('Administración cannot check in', format($q$ select public.check_in(gen_random_uuid(), %L, now(), 25.7, -100.3, 10) $q$, c_j1), 'PT403', 'forbidden:field.capture');
  perform pg_temp.err('Administración cannot add incidents', $q$ select public.add_incident(gen_random_uuid(), gen_random_uuid(), '66666666-0000-4000-8000-000000000001', 'danos', 'alta', 'Daño en piso') $q$, 'PT403', 'forbidden:field.capture');
  perform pg_temp.err('Administración cannot write the bitácora', format($q$ select public.add_jornada_note(gen_random_uuid(), gen_random_uuid(), %L, 'Nota') $q$, c_j1), 'PT403', 'forbidden:field.capture');
  perform pg_temp.as_user(c_sup2);
  perform pg_temp.err('another supervisor''s jornada', format($q$ select public.check_in(gen_random_uuid(), %L, now(), 25.7, -100.3, 10) $q$, c_j1), 'PT404', 'out_of_scope');
  perform pg_temp.as_user('22222222-0000-4000-8000-000000000007');
  perform pg_temp.err('deactivated supervisor', format($q$ select public.check_in(gen_random_uuid(), %L, now(), 25.7, -100.3, 10) $q$, c_j1), 'PT401', 'inactive');

  ------------------------------------------------------------------ check-in / check-out rules
  perform pg_temp.as_user(c_sup1);
  perform pg_temp.err('no salida before entrada', format($q$ select public.check_out(gen_random_uuid(), %L, now(), 25.7, -100.3, 10) $q$, c_j1), 'PT409', 'check_in_missing');
  perform pg_temp.err('device clock ahead', format($q$ select public.check_in(gen_random_uuid(), %L, now() + interval '10 minutes', 25.7, -100.3, 10) $q$, c_j1), 'PT422', 'device_time_future');
  perform pg_temp.err('device time too old', format($q$ select public.check_in(gen_random_uuid(), %L, now() - interval '60 days', 25.7, -100.3, 10) $q$, c_j1), 'PT422', 'device_time_stale');
  perform pg_temp.err('device time missing', format($q$ select public.check_in(gen_random_uuid(), %L, null, 25.7, -100.3, 10) $q$, c_j1), 'PT422', 'device_time_missing');
  perform pg_temp.err('location missing', format($q$ select public.check_in(gen_random_uuid(), %L, now(), null, null, null) $q$, c_j1), 'PT422', 'location_missing');
  perform pg_temp.err('manual pin needs a justification', format($q$ select public.check_in(gen_random_uuid(), %L, now(), 25.7, -100.3, 10, 'manual', 'corta') $q$, c_j1), 'PT422', 'location_note_required');
  perform pg_temp.err('remote supervision needs a justification', format($q$ select public.check_in(gen_random_uuid(), %L, now(), 25.7, -100.3, 10, 'remota') $q$, c_j1), 'PT422', 'location_note_required');
  v := pg_temp.ok('check-in (captured offline 3 h ago)', format($q$ select public.check_in(%L, %L, now() - interval '3 hours', 25.7001, -100.3002, 12.4, 'gps', null, true) $q$, v_op, c_j1))::jsonb;
  perform pg_temp.eq('order in execution', v ->> 'order_status', 'en_ejecucion');
  perform pg_temp.eq('server stamps its own time; device time kept',
    (select concat_ws('|', server_at = now(), device_at = now() - interval '3 hours', offline, source, created_by = c_sup1)
     from public.jornada_checks where jornada_id = c_j1::uuid and kind = 'entrada'), 't|t|t|gps|t');
  perform pg_temp.eq('jornada in progress', (select status::text from public.jornadas where id = c_j1::uuid), 'en_curso');
  perform pg_temp.eq('audit records device time and op id',
    (select concat_ws('|', action, device_at = now() - interval '3 hours', op_id = v_op) from public.audit_log where entity = 'jornada' and entity_id = c_j1::uuid and action like 'Registro de entrada%'),
    'Registro de entrada · Jornada 1 (GPS ±12 m)|t|t');
  v := pg_temp.ok('retry of the same check-in', format($q$ select public.check_in(%L, %L, now() - interval '3 hours', 25.7001, -100.3002, 12.4, 'gps', null, true) $q$, v_op, c_j1))::jsonb;
  perform pg_temp.eq('retry returns the stored result', v ->> 'duplicate', 'true');
  perform pg_temp.err('same op id, other jornada', format($q$ select public.check_in(%L, '66666666-1000-4000-8000-000000000002', now() - interval '3 hours', 25.7001, -100.3002, 12.4, 'gps', null, true) $q$, v_op), 'PT409', 'op_id_reused');
  perform pg_temp.err('jornada not on the server yet', $q$ select public.check_in(gen_random_uuid(), gen_random_uuid(), now(), 25.7, -100.3, 10) $q$, 'PT409', 'parent_missing');
  perform pg_temp.err('second entrada (new op)', format($q$ select public.check_in(gen_random_uuid(), %L, now(), 25.7, -100.3, 10) $q$, c_j1), 'PT409', 'duplicate_check');
  perform pg_temp.eq('still one entrada', (select count(*)::text from public.jornada_checks where jornada_id = c_j1::uuid), '1');
  perform pg_temp.err('salida earlier than entrada', format($q$ select public.check_out(gen_random_uuid(), %L, now() - interval '4 hours', 25.7, -100.3, 10) $q$, c_j1), 'PT422', 'check_sequence');

  ------------------------------------------------------------------ bitácora, desglose, reminders
  perform pg_temp.ok('note', format($q$ select public.add_jornada_note(gen_random_uuid(), gen_random_uuid(), %L, 'Llegamos y firmamos acceso') $q$, c_j1));
  perform pg_temp.err('empty note', format($q$ select public.add_jornada_note(gen_random_uuid(), gen_random_uuid(), %L, '   ') $q$, c_j1), 'PT422', 'invalid_text');
  perform pg_temp.err('breakdown over 24 h', format($q$ select public.set_jornada_breakdown(gen_random_uuid(), %L, '[{"activity": "Barrido", "hours": 20}, {"activity": "Pulido", "hours": 5}]') $q$, c_j1), 'PT422', 'invalid_breakdown');
  perform pg_temp.err('breakdown not numeric', format($q$ select public.set_jornada_breakdown(gen_random_uuid(), %L, '[{"activity": "Barrido", "hours": "mucho"}]') $q$, c_j1), 'PT422', 'invalid_breakdown');
  perform pg_temp.ok('breakdown', format($q$ select public.set_jornada_breakdown(gen_random_uuid(), %L, '[{"activity": " Barrido ", "hours": 2.5}]', 'Sin novedades') $q$, c_j1));
  perform pg_temp.eq('breakdown stored', (select breakdown::text from public.jornadas where id = c_j1::uuid), '[{"hours": 2.5, "activity": "Barrido"}]');
  perform pg_temp.ok('reminder', format($q$ select public.log_reminder(gen_random_uuid(), '66666666-0000-4000-8000-000000000001', %L, 'Falta foto DESPUÉS') $q$, c_j1));
  perform pg_temp.check('reminder only in the audit log', exists (select 1 from public.audit_log where action = 'Envió recordatorio de evidencia · Jornada 1'));

  ------------------------------------------------------------------ photos (object first, then metadata)
  perform pg_temp.err('metadata before the upload finished', $q$ select public.add_photo(gen_random_uuid(), 'cccccccc-0000-4000-8000-000000000001', '66666666-0000-4000-8000-000000000001', 'antes', 'orders/66666666-0000-4000-8000-000000000001/antes/cccccccc-0000-4000-8000-000000000001.jpg') $q$, 'PT409', 'object_missing');
  perform pg_temp.as_owner();
  perform pg_temp.put_object('66666666-0000-4000-8000-000000000001', 'antes', 'cccccccc-0000-4000-8000-000000000001');
  perform pg_temp.put_object('66666666-0000-4000-8000-000000000001', 'despues', 'cccccccc-0000-4000-8000-000000000002');
  perform pg_temp.put_object('66666666-0000-4000-8000-000000000001', 'postventa', 'cccccccc-0000-4000-8000-000000000003');
  perform pg_temp.put_object('66666666-0000-4000-8000-000000000001', 'antes', 'cccccccc-0000-4000-8000-000000000004');
  perform pg_temp.as_user(c_sup1);
  perform pg_temp.err('path must match the photo', $q$ select public.add_photo(gen_random_uuid(), 'cccccccc-0000-4000-8000-000000000001', '66666666-0000-4000-8000-000000000001', 'despues', 'orders/66666666-0000-4000-8000-000000000001/antes/cccccccc-0000-4000-8000-000000000001.jpg') $q$, 'PT422', 'invalid_storage_path');
  perform pg_temp.err('jornada of another order', $q$ select public.add_photo(gen_random_uuid(), 'cccccccc-0000-4000-8000-000000000001', '66666666-0000-4000-8000-000000000001', 'antes', 'orders/66666666-0000-4000-8000-000000000001/antes/cccccccc-0000-4000-8000-000000000001.jpg', p_jornada_id => '66666666-1000-4000-8000-000000000002') $q$, 'PT422', 'jornada_order_mismatch');
  perform pg_temp.err('photo time in the future', $q$ select public.add_photo(gen_random_uuid(), 'cccccccc-0000-4000-8000-000000000001', '66666666-0000-4000-8000-000000000001', 'antes', 'orders/66666666-0000-4000-8000-000000000001/antes/cccccccc-0000-4000-8000-000000000001.jpg', now() + interval '1 hour') $q$, 'PT422', 'device_time_future');
  perform pg_temp.ok('ANTES photo', $q$ select public.add_photo(gen_random_uuid(), 'cccccccc-0000-4000-8000-000000000001', '66666666-0000-4000-8000-000000000001', 'antes', 'orders/66666666-0000-4000-8000-000000000001/antes/cccccccc-0000-4000-8000-000000000001.jpg', now() - interval '170 minutes', 'exif', 'Lobby', p_jornada_id => '66666666-1000-4000-8000-000000000001', p_origin => 'camera', p_lat => 25.7, p_lng => -100.3, p_geo_source => 'exif', p_width => 1600, p_height => 1200) $q$);
  perform pg_temp.eq('photo row from the stored object',
    (select concat_ws('|', bytes, mime_type, created_by = c_sup1, selected_for_report, taken_at_source, width) from public.photos where id = 'cccccccc-0000-4000-8000-000000000001'),
    '2048|image/jpeg|t|t|exif|1600');
  perform pg_temp.ok('DESPUÉS photo taken before the check-in', $q$ select public.add_photo(gen_random_uuid(), 'cccccccc-0000-4000-8000-000000000002', '66666666-0000-4000-8000-000000000001', 'despues', 'orders/66666666-0000-4000-8000-000000000001/despues/cccccccc-0000-4000-8000-000000000002.jpg', now() - interval '5 hours', 'file', 'Lobby', p_jornada_id => '66666666-1000-4000-8000-000000000001', p_origin => 'gallery') $q$);
  perform pg_temp.check('integrity warning kept in the audit log', exists (select 1 from public.audit_log where entity_id = 'cccccccc-0000-4000-8000-000000000002' and reason like '%Desde galería%Advertencia: Foto DESPUÉS tomada antes del registro de entrada%'));
  perform pg_temp.ok('edit photo', $q$ select public.update_photo(gen_random_uuid(), 'cccccccc-0000-4000-8000-000000000002', '{"area": "Lobby norte", "note": "Toma de respaldo"}') $q$);
  perform pg_temp.err('photo field not editable', $q$ select public.update_photo(gen_random_uuid(), 'cccccccc-0000-4000-8000-000000000002', '{"kind": "antes"}') $q$, 'PT422', 'field_not_editable');
  perform pg_temp.ok('unselect from report', $q$ select public.set_photo_selected(gen_random_uuid(), 'cccccccc-0000-4000-8000-000000000002', false) $q$);
  perform pg_temp.ok('unselect again (no-op)', $q$ select public.set_photo_selected(gen_random_uuid(), 'cccccccc-0000-4000-8000-000000000002', false) $q$);
  perform pg_temp.eq('selection audited once', (select count(*)::text from public.audit_log where entity_id = 'cccccccc-0000-4000-8000-000000000002' and action like 'Quitó foto%'), '1');
  perform pg_temp.ok('second ANTES photo', $q$ select public.add_photo(gen_random_uuid(), 'cccccccc-0000-4000-8000-000000000004', '66666666-0000-4000-8000-000000000001', 'antes', 'orders/66666666-0000-4000-8000-000000000001/antes/cccccccc-0000-4000-8000-000000000004.jpg', p_jornada_id => '66666666-1000-4000-8000-000000000001') $q$);
  perform pg_temp.ok('delete photo', $q$ select public.delete_photo(gen_random_uuid(), 'cccccccc-0000-4000-8000-000000000004') $q$);
  perform pg_temp.eq('soft-deleted tombstone', (select concat_ws('|', deleted_at is not null, deleted_by = c_sup1, selected_for_report) from public.photos where id = 'cccccccc-0000-4000-8000-000000000004'), 't|t|f');
  perform pg_temp.err('deleted photos are gone for edits', $q$ select public.update_photo(gen_random_uuid(), 'cccccccc-0000-4000-8000-000000000004', '{"area": "x"}') $q$, 'PT409', 'photo_deleted');
  perform pg_temp.err('deleted photos are gone for the report', $q$ select public.set_photo_selected(gen_random_uuid(), 'cccccccc-0000-4000-8000-000000000004', true) $q$, 'PT409', 'photo_deleted');
  perform pg_temp.err('photo not on the server yet', $q$ select public.update_photo(gen_random_uuid(), 'cccccccc-0000-4000-8000-0000000000ee', '{"area": "x"}') $q$, 'PT409', 'parent_missing');
  perform pg_temp.as_owner();
  perform pg_temp.check('the object is retained', exists (select 1 from storage.objects where name like '%cccccccc-0000-4000-8000-000000000004.jpg'));
  perform pg_temp.as_user(c_adm1);
  perform pg_temp.err('Administración cannot add field photos', $q$ select public.add_photo(gen_random_uuid(), 'cccccccc-0000-4000-8000-000000000005', '66666666-0000-4000-8000-000000000001', 'antes', 'orders/66666666-0000-4000-8000-000000000001/antes/cccccccc-0000-4000-8000-000000000005.jpg') $q$, 'PT403', 'forbidden:field.capture');
  perform pg_temp.ok('Administración adds a postventa photo', $q$ select public.add_photo(gen_random_uuid(), 'cccccccc-0000-4000-8000-000000000003', '66666666-0000-4000-8000-000000000001', 'postventa', 'orders/66666666-0000-4000-8000-000000000001/postventa/cccccccc-0000-4000-8000-000000000003.jpg') $q$);
  perform pg_temp.err('Administración cannot select report photos', $q$ select public.set_photo_selected(gen_random_uuid(), 'cccccccc-0000-4000-8000-000000000001', false) $q$, 'PT403', 'forbidden:field.capture');
  perform pg_temp.as_user(c_dir);
  perform pg_temp.err('Dirección cannot delete photos', $q$ select public.delete_photo(gen_random_uuid(), 'cccccccc-0000-4000-8000-000000000001') $q$, 'PT403', 'forbidden:field.capture');

  ------------------------------------------------------------------ incidents
  perform pg_temp.as_user(c_sup1);
  v := pg_temp.ok('blocking incident', $q$ select public.add_incident(gen_random_uuid(), 'dddddddd-0000-4000-8000-000000000001', '66666666-0000-4000-8000-000000000001', 'danos', 'alta', 'Rayón en piso de mármol', true, '66666666-1000-4000-8000-000000000001') $q$)::jsonb;
  perform pg_temp.check('incident folio from the server', (v ->> 'folio') ~ '^INC-[0-9]{4,}$');
  perform pg_temp.eq('order → con_incidencia', v ->> 'order_status', 'con_incidencia');
  perform pg_temp.eq('previous status remembered', (select previous_status::text from public.orders where id = '66666666-0000-4000-8000-000000000001'), 'en_ejecucion');
  perform pg_temp.err('incident field not editable', $q$ select public.update_incident(gen_random_uuid(), 'dddddddd-0000-4000-8000-000000000001', '{"status": "resuelta"}') $q$, 'PT422', 'field_not_editable');
  perform pg_temp.ok('update incident', $q$ select public.update_incident(gen_random_uuid(), 'dddddddd-0000-4000-8000-000000000001', '{"severity": "media", "description": "Rayón leve en mármol"}') $q$);
  perform pg_temp.ok('incident on ORD2', $q$ select public.add_incident(gen_random_uuid(), 'dddddddd-0000-4000-8000-0000000000f2', '66666666-0000-4000-8000-000000000002', 'otra', 'baja', 'Detalle menor en ORD2') $q$);
  perform pg_temp.err('link photo to an incident of another order', $q$ select public.update_photo(gen_random_uuid(), 'cccccccc-0000-4000-8000-000000000001', '{"incident_id": "dddddddd-0000-4000-8000-0000000000f2"}') $q$, 'PT422', 'incident_order_mismatch');
  perform pg_temp.err('link photo to an incident not on the server yet', $q$ select public.update_photo(gen_random_uuid(), 'cccccccc-0000-4000-8000-000000000001', '{"incident_id": "dddddddd-0000-4000-8000-0000000000ff"}') $q$, 'PT409', 'parent_missing');
  perform pg_temp.ok('link photo to the incident', $q$ select public.update_photo(gen_random_uuid(), 'cccccccc-0000-4000-8000-000000000001', '{"incident_id": "dddddddd-0000-4000-8000-000000000001"}') $q$);
  perform pg_temp.ok('check-out while blocked', format($q$ select public.check_out(gen_random_uuid(), %L, now() - interval '5 minutes', 25.7, -100.3, 9) $q$, c_j1));
  perform pg_temp.eq('status stays con_incidencia', (select status::text from public.orders where id = '66666666-0000-4000-8000-000000000001'), 'con_incidencia');
  perform pg_temp.err('second salida', format($q$ select public.check_out(gen_random_uuid(), %L, now(), 25.7, -100.3, 9) $q$, c_j1), 'PT409', 'duplicate_check');
  perform pg_temp.err('resolution required', $q$ select public.resolve_incident(gen_random_uuid(), 'dddddddd-0000-4000-8000-000000000001', ' ') $q$, 'PT422', 'invalid_text');
  perform pg_temp.eq('resolving recomputes the status',
    pg_temp.ok('resolve', $q$ select public.resolve_incident(gen_random_uuid(), 'dddddddd-0000-4000-8000-000000000001', 'Se pulió la zona') ->> 'order_status' $q$), 'pendiente_validacion');
  perform pg_temp.err('resolve twice', $q$ select public.resolve_incident(gen_random_uuid(), 'dddddddd-0000-4000-8000-000000000001', 'Otra vez') $q$, 'PT409', 'already_resolved');

  ------------------------------------------------------------------ closed orders freeze field capture
  perform pg_temp.as_owner();
  update public.orders set status = 'finalizada' where id = '66666666-0000-4000-8000-000000000002';
  perform pg_temp.put_object('66666666-0000-4000-8000-000000000002', 'postventa', 'cccccccc-0000-4000-8000-000000000006');
  perform pg_temp.as_user(c_sup1);
  perform pg_temp.err('no check-in on a closed order', $q$ select public.check_in(gen_random_uuid(), '66666666-1000-4000-8000-000000000002', now(), 25.7, -100.3, 10) $q$, 'PT409', 'order_closed');
  perform pg_temp.err('no field incidents on a closed order', $q$ select public.add_incident(gen_random_uuid(), gen_random_uuid(), '66666666-0000-4000-8000-000000000002', 'otra', 'baja', 'Tarde') $q$, 'PT409', 'order_closed');
  perform pg_temp.err('no breakdown on a closed order', $q$ select public.set_jornada_breakdown(gen_random_uuid(), '66666666-1000-4000-8000-000000000002', '[]') $q$, 'PT409', 'order_closed');
  perform pg_temp.ok('postventa evidence still allowed', $q$ select public.add_photo(gen_random_uuid(), 'cccccccc-0000-4000-8000-000000000006', '66666666-0000-4000-8000-000000000002', 'postventa', 'orders/66666666-0000-4000-8000-000000000002/postventa/cccccccc-0000-4000-8000-000000000006.jpg') $q$);
  perform pg_temp.ok('bitácora note still allowed after closure', $q$ select public.add_jornada_note(gen_random_uuid(), gen_random_uuid(), '66666666-1000-4000-8000-000000000002', 'Nota posterior') $q$);
  perform pg_temp.as_owner();
end $$;
