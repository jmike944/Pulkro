-- 05 · Closure and reports (doc §8): the server re-checks every blocker, versions closures and reports, only lets a
-- reopened order produce a new report after re-validation, and keeps history append-only.
select pg_temp.new_order(1);   -- ORD1 / J1: complete evidence path
select pg_temp.new_order(2);   -- ORD2 / J2: blocked path
select pg_temp.new_order(3);   -- ORD3 / J3: exception path
do $$
declare
  v jsonb;
  n integer;
  c_dir constant uuid := '22222222-0000-4000-8000-000000000001';
  c_adm1 constant uuid := '22222222-0000-4000-8000-000000000002';
  c_sup1 constant uuid := '22222222-0000-4000-8000-000000000004';
  c_sup2 constant uuid := '22222222-0000-4000-8000-000000000005';
  c_sig constant text := 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
begin
  -- execution: ORD1 and ORD3 fully executed (entrada + salida), ORD2 in progress
  perform pg_temp.as_user(c_sup1);
  for n in 1..3 loop
    perform public.assign_crew(gen_random_uuid(), ('66666666-0000-4000-8000-00000000000' || n)::uuid, array['44444444-0000-4000-8000-000000000001']::uuid[], 'Inicial');
    perform public.check_in(gen_random_uuid(), ('66666666-1000-4000-8000-00000000000' || n)::uuid, now() - interval '3 hours', 25.7, -100.3, 10);
    if n <> 2 then
      perform public.check_out(gen_random_uuid(), ('66666666-1000-4000-8000-00000000000' || n)::uuid, now() - interval '1 hour', 25.7, -100.3, 10);
    end if;
  end loop;
  perform pg_temp.eq('ORD1 waits for validation', (select status::text from public.orders where id = '66666666-0000-4000-8000-000000000001'), 'pendiente_validacion');

  ------------------------------------------------------------------ who may validate
  perform pg_temp.as_user(c_adm1);
  perform pg_temp.err('Administración cannot validate', $q$ select public.validate_closure(gen_random_uuid(), gen_random_uuid(), '66666666-0000-4000-8000-000000000001', 'Servicio realizado') $q$, 'PT403', 'forbidden:closure.authorize');
  perform pg_temp.as_user(c_dir);
  perform pg_temp.err('Dirección cannot validate', $q$ select public.validate_closure(gen_random_uuid(), gen_random_uuid(), '66666666-0000-4000-8000-000000000001', 'Servicio realizado') $q$, 'PT403', 'forbidden:closure.authorize');
  perform pg_temp.as_user(c_sup2);
  perform pg_temp.err('another supervisor', $q$ select public.validate_closure(gen_random_uuid(), gen_random_uuid(), '66666666-0000-4000-8000-000000000001', 'Servicio realizado') $q$, 'PT404', 'out_of_scope');

  ------------------------------------------------------------------ blockers
  perform pg_temp.as_user(c_sup1);
  perform pg_temp.err('not closable while executing', $q$ select public.validate_closure(gen_random_uuid(), gen_random_uuid(), '66666666-0000-4000-8000-000000000002', 'Servicio realizado') $q$, 'PT409', 'not_closable');
  perform pg_temp.ok('blocking incident on ORD2', $q$ select public.add_incident(gen_random_uuid(), 'dddddddd-0000-4000-8000-000000000002', '66666666-0000-4000-8000-000000000002', 'faltante_material', 'alta', 'Sin desengrasante', true) $q$);
  begin
    perform public.validate_closure(gen_random_uuid(), gen_random_uuid(), '66666666-0000-4000-8000-000000000002', 'Servicio realizado', p_exception_reason => 'Excepción muy bien justificada');
    raise exception 'FAIL [hard blockers]: closure accepted';
  exception when sqlstate 'PT409' then
    perform pg_temp.check('hard blockers listed (open jornada + blocking incident): ' || sqlerrm,
      sqlerrm like 'No se puede cerrar: 1 jornada sin registro de salida · Incidencia abierta INC-%');
  end;
  perform pg_temp.err('report before closure', $q$ select public.generate_report(gen_random_uuid(), gen_random_uuid(), '66666666-0000-4000-8000-000000000002') $q$, 'PT409', 'closure_required');
  perform pg_temp.err('missing ANTES/DESPUÉS without exception', $q$ select public.validate_closure(gen_random_uuid(), gen_random_uuid(), '66666666-0000-4000-8000-000000000001', 'Servicio realizado') $q$, 'PT409', 'evidence_missing');
  perform pg_temp.err('exception too short', $q$ select public.validate_closure(gen_random_uuid(), gen_random_uuid(), '66666666-0000-4000-8000-000000000001', 'Servicio realizado', p_exception_reason => 'sin cámara') $q$, 'PT409', 'evidence_missing');
  -- evidence for ORD1 (ANTES + DESPUÉS of the executed jornada) and a foreign photo on ORD3
  perform pg_temp.as_owner();
  perform pg_temp.put_object('66666666-0000-4000-8000-000000000001', 'antes', 'eeeeeeee-0000-4000-8000-000000000001');
  perform pg_temp.put_object('66666666-0000-4000-8000-000000000001', 'despues', 'eeeeeeee-0000-4000-8000-000000000002');
  perform pg_temp.put_object('66666666-0000-4000-8000-000000000001', 'despues', 'eeeeeeee-0000-4000-8000-000000000003');
  perform pg_temp.put_object('66666666-0000-4000-8000-000000000003', 'antes', 'eeeeeeee-0000-4000-8000-000000000009');
  perform pg_temp.as_user(c_sup1);
  perform public.add_photo(gen_random_uuid(), 'eeeeeeee-0000-4000-8000-000000000001', '66666666-0000-4000-8000-000000000001', 'antes', 'orders/66666666-0000-4000-8000-000000000001/antes/eeeeeeee-0000-4000-8000-000000000001.jpg', now() - interval '170 minutes', p_jornada_id => '66666666-1000-4000-8000-000000000001');
  perform public.add_photo(gen_random_uuid(), 'eeeeeeee-0000-4000-8000-000000000002', '66666666-0000-4000-8000-000000000001', 'despues', 'orders/66666666-0000-4000-8000-000000000001/despues/eeeeeeee-0000-4000-8000-000000000002.jpg', now() - interval '70 minutes', p_jornada_id => '66666666-1000-4000-8000-000000000001');
  perform public.add_photo(gen_random_uuid(), 'eeeeeeee-0000-4000-8000-000000000003', '66666666-0000-4000-8000-000000000001', 'despues', 'orders/66666666-0000-4000-8000-000000000001/despues/eeeeeeee-0000-4000-8000-000000000003.jpg', now() - interval '65 minutes', p_jornada_id => '66666666-1000-4000-8000-000000000001');
  perform public.add_photo(gen_random_uuid(), 'eeeeeeee-0000-4000-8000-000000000009', '66666666-0000-4000-8000-000000000003', 'antes', 'orders/66666666-0000-4000-8000-000000000003/antes/eeeeeeee-0000-4000-8000-000000000009.jpg', p_jornada_id => '66666666-1000-4000-8000-000000000003');
  perform public.delete_photo(gen_random_uuid(), 'eeeeeeee-0000-4000-8000-000000000003');
  perform pg_temp.err('signature required for firma', $q$ select public.validate_closure(gen_random_uuid(), gen_random_uuid(), '66666666-0000-4000-8000-000000000001', 'Servicio realizado', 'firma', 'Ing. Pérez') $q$, 'PT422', 'signature_missing');
  perform pg_temp.err('conformity needs a name', $q$ select public.validate_closure(gen_random_uuid(), gen_random_uuid(), '66666666-0000-4000-8000-000000000001', 'Servicio realizado', 'verbal', 'X') $q$, 'PT422', 'invalid_text');
  perform pg_temp.err('summary required', $q$ select public.validate_closure(gen_random_uuid(), gen_random_uuid(), '66666666-0000-4000-8000-000000000001', 'corto') $q$, 'PT422', 'invalid_text');

  ------------------------------------------------------------------ validate (complete evidence: no exception recorded)
  v := pg_temp.ok('validate ORD1', format($q$ select public.validate_closure(gen_random_uuid(), 'f1f1f1f1-0000-4000-8000-000000000001', '66666666-0000-4000-8000-000000000001',
      'Se realizó la limpieza completa del lobby', 'firma', 'Ing. Pérez', 'Gerente', %L, now() - interval '50 minutes', 'Conforme',
      p_exception_reason => 'Esta excepción no aplica porque hay fotos') $q$, c_sig))::jsonb;
  perform pg_temp.eq('closure v1 → finalizada', concat_ws('|', v ->> 'version', v ->> 'status'), '1|finalizada');
  perform pg_temp.eq('closure stored',
    (select concat_ws('|', validated_by = c_sup1, validated_at = now(), conformity_method, conformity_name, conformity_signature = c_sig, exception_reason is null)
     from public.order_closures where id = 'f1f1f1f1-0000-4000-8000-000000000001'), 't|t|firma|Ing. Pérez|t|t');
  perform pg_temp.err('validate twice', $q$ select public.validate_closure(gen_random_uuid(), gen_random_uuid(), '66666666-0000-4000-8000-000000000001', 'Servicio realizado') $q$, 'PT409', 'not_closable');
  perform pg_temp.err('field photos frozen after closure', $q$ select public.update_photo(gen_random_uuid(), 'eeeeeeee-0000-4000-8000-000000000001', '{"area": "x"}') $q$, 'PT409', 'order_closed');
  perform pg_temp.err('no operational edits after closure', $q$ select public.update_order(gen_random_uuid(), '66666666-0000-4000-8000-000000000001', '{"special_instructions": "x"}') $q$, 'PT409', 'order_closed');

  ------------------------------------------------------------------ report v1 + share
  perform pg_temp.as_user(c_adm1);
  perform pg_temp.err('Administración does not generate reports', $q$ select public.generate_report(gen_random_uuid(), gen_random_uuid(), '66666666-0000-4000-8000-000000000001') $q$, 'PT403', 'forbidden:report.share');
  perform pg_temp.as_user(c_sup1);
  v := pg_temp.ok('report v1', $q$ select public.generate_report(gen_random_uuid(), 'f2f2f2f2-0000-4000-8000-000000000001', '66666666-0000-4000-8000-000000000001',
      array['eeeeeeee-0000-4000-8000-000000000002', 'eeeeeeee-0000-4000-8000-000000000009', 'eeeeeeee-0000-4000-8000-000000000003', 'eeeeeeee-0000-4000-8000-000000000001', 'eeeeeeee-0000-4000-8000-000000000002']::uuid[],
      'Resumen del servicio') $q$)::jsonb;
  perform pg_temp.eq('only live photos of the order, client order kept, no duplicates', v ->> 'photo_ids',
    '["eeeeeeee-0000-4000-8000-000000000002", "eeeeeeee-0000-4000-8000-000000000001"]');
  perform pg_temp.eq('snapshot frozen by the server',
    (select concat_ws('|', snapshot #>> '{order,status}', snapshot #>> '{closure,version}', snapshot #> '{closure}' ? 'conformity_signature',
       jsonb_array_length(snapshot -> 'jornadas'), jsonb_array_length(snapshot #> '{jornadas,0,checks}'), jsonb_array_length(snapshot -> 'photos'),
       snapshot #>> '{client,name}', closure_id = 'f1f1f1f1-0000-4000-8000-000000000001')
     from public.reports where id = 'f2f2f2f2-0000-4000-8000-000000000001'),
    'finalizada|1|f|1|2|2|Cliente Uno SA|t');
  perform pg_temp.eq('first share → reporte_enviado',
    pg_temp.ok('share', $q$ select public.log_share(gen_random_uuid(), gen_random_uuid(), 'f2f2f2f2-0000-4000-8000-000000000001', 'whatsapp', '+52 81 0000 1111') ->> 'order_status' $q$), 'reporte_enviado');
  perform pg_temp.ok('second share', $q$ select public.log_share(gen_random_uuid(), gen_random_uuid(), 'f2f2f2f2-0000-4000-8000-000000000001', 'email', 'cliente@example.com') $q$);
  perform pg_temp.eq('shares never claim delivery', (select string_agg(distinct note, ',') from public.report_shares), 'Envío iniciado desde el dispositivo · sin confirmación de entrega');

  ------------------------------------------------------------------ reopen → re-validate → report v2
  perform pg_temp.as_user(c_adm1);
  perform pg_temp.err('Administración cannot reopen', $q$ select public.reopen_order(gen_random_uuid(), '66666666-0000-4000-8000-000000000001', 'Cliente reportó un detalle') $q$, 'PT403', 'forbidden:order.reopen');
  perform pg_temp.as_user(c_sup1);
  perform pg_temp.err('reopen needs a reason', $q$ select public.reopen_order(gen_random_uuid(), '66666666-0000-4000-8000-000000000001', 'x') $q$, 'PT422', 'invalid_text');
  perform pg_temp.err('only closed orders reopen', $q$ select public.reopen_order(gen_random_uuid(), '66666666-0000-4000-8000-000000000002', 'Reabrir algo abierto') $q$, 'PT409', 'not_reopenable');
  perform pg_temp.ok('reopen', $q$ select public.reopen_order(gen_random_uuid(), '66666666-0000-4000-8000-000000000001', 'El cliente reportó un detalle en el lobby') $q$);
  perform pg_temp.eq('reabierta remembers where it was', (select concat_ws('|', status, previous_status, reopened_at = now()) from public.orders where id = '66666666-0000-4000-8000-000000000001'), 'reabierta|reporte_enviado|t');
  perform pg_temp.err('no new report before re-validation', $q$ select public.generate_report(gen_random_uuid(), gen_random_uuid(), '66666666-0000-4000-8000-000000000001') $q$, 'PT409', 'revalidation_required');
  perform pg_temp.ok('evidence editable again', $q$ select public.update_photo(gen_random_uuid(), 'eeeeeeee-0000-4000-8000-000000000001', '{"note": "Retoque tras reapertura"}') $q$);
  v := pg_temp.ok('re-validate', $q$ select public.validate_closure(gen_random_uuid(), 'f1f1f1f1-0000-4000-8000-000000000002', '66666666-0000-4000-8000-000000000001', 'Se corrigió el detalle del lobby', 'verbal', 'Ing. Pérez') $q$)::jsonb;
  perform pg_temp.eq('closure v2', v ->> 'version', '2');
  perform pg_temp.check('re-validation audited', exists (select 1 from public.audit_log where order_id = '66666666-0000-4000-8000-000000000001' and action = 'Validó de nuevo el cierre (orden reabierta)'));
  perform pg_temp.eq('report v2', pg_temp.ok('report v2', $q$ select public.generate_report(gen_random_uuid(), 'f2f2f2f2-0000-4000-8000-000000000002', '66666666-0000-4000-8000-000000000001') ->> 'version' $q$), '2');
  perform pg_temp.eq('report v2 points at closure v2', (select closure_id::text from public.reports where id = 'f2f2f2f2-0000-4000-8000-000000000002'), 'f1f1f1f1-0000-4000-8000-000000000002');
  perform pg_temp.ok('share v2', $q$ select public.log_share(gen_random_uuid(), gen_random_uuid(), 'f2f2f2f2-0000-4000-8000-000000000002', 'descarga') $q$);
  perform pg_temp.eq('versions kept', (select count(*)::text from public.order_closures where order_id = '66666666-0000-4000-8000-000000000001') || '/' ||
    (select count(*)::text from public.reports where order_id = '66666666-0000-4000-8000-000000000001'), '2/2');

  ------------------------------------------------------------------ exception path (ORD3: DESPUÉS missing)
  v := pg_temp.ok('closure with authorized exception', $q$ select public.validate_closure(gen_random_uuid(), 'f1f1f1f1-0000-4000-8000-000000000003', '66666666-0000-4000-8000-000000000003', 'Servicio realizado sin foto final', p_exception_reason => 'La cámara del equipo falló al final del turno') $q$)::jsonb;
  perform pg_temp.eq('exception recorded and authorized by the supervisor',
    (select concat_ws('|', exception_reason, exception_authorized_by = c_sup1, exception_at = now()) from public.order_closures where id = 'f1f1f1f1-0000-4000-8000-000000000003'),
    'La cámara del equipo falló al final del turno|t|t');
  perform pg_temp.check('exception in the audit trail', exists (select 1 from public.audit_log where order_id = '66666666-0000-4000-8000-000000000003' and reason = 'Excepción: La cámara del equipo falló al final del turno'));

  ------------------------------------------------------------------ archive (post-sale cycle)
  perform pg_temp.ok('open a case', $q$ select public.create_case(gen_random_uuid(), 'f3f3f3f3-0000-4000-8000-000000000001', '66666666-0000-4000-8000-000000000001', 'calidad', 'media', 'telefono', 'Polvo en ventanas', '22222222-0000-4000-8000-000000000004', current_date + 2) $q$);
  perform pg_temp.as_user(c_adm1);
  perform pg_temp.err('no archive with open cases', $q$ select public.archive_order(gen_random_uuid(), '66666666-0000-4000-8000-000000000001') $q$, 'PT409', 'open_cases');
  perform pg_temp.ok('resolve the case', $q$ select public.update_case(gen_random_uuid(), 'f3f3f3f3-0000-4000-8000-000000000001', '{"status": "cerrado", "resolution": "Se limpió"}', 'Cerrado con el cliente') $q$);
  perform pg_temp.err('only post-sale orders archive', $q$ select public.archive_order(gen_random_uuid(), '66666666-0000-4000-8000-000000000003') $q$, 'PT409', 'not_archivable');
  perform pg_temp.as_user(c_dir);
  perform pg_temp.err('Dirección cannot archive', $q$ select public.archive_order(gen_random_uuid(), '66666666-0000-4000-8000-000000000001') $q$, 'PT403', 'forbidden:order.archive');
  perform pg_temp.as_user(c_adm1);
  perform pg_temp.ok('Administración archives', $q$ select public.archive_order(gen_random_uuid(), '66666666-0000-4000-8000-000000000001') $q$);
  perform pg_temp.eq('archived', (select concat_ws('|', status, archived_at = now()) from public.orders where id = '66666666-0000-4000-8000-000000000001'), 'archivada|t');
  perform pg_temp.as_user(c_sup1);
  perform pg_temp.err('archived orders are frozen', $q$ select public.add_jornada_note(gen_random_uuid(), gen_random_uuid(), '66666666-1000-4000-8000-000000000001', 'Tarde') $q$, 'PT409', 'order_frozen');
  perform pg_temp.err('archived: no report selection changes', $q$ select public.set_photo_selected(gen_random_uuid(), 'eeeeeeee-0000-4000-8000-000000000001', false) $q$, 'PT409', 'order_frozen');
  perform pg_temp.as_owner();

  ------------------------------------------------------------------ history is append-only, even for the table owner
  perform pg_temp.err('closures are append-only', $q$ update public.order_closures set summary = 'Reescrito' $q$, 'PT409', 'append_only');
  perform pg_temp.err('reports are append-only', $q$ update public.reports set summary = 'Reescrito' $q$, 'PT409', 'append_only');
  perform pg_temp.err('shares are append-only', $q$ update public.report_shares set recipient = 'otro' $q$, 'PT409', 'append_only');
  perform pg_temp.err('checks are append-only', $q$ update public.jornada_checks set device_at = now() $q$, 'PT409', 'append_only');
  perform pg_temp.err('audit is append-only', $q$ update public.audit_log set action = 'Reescrito' $q$, 'PT409', 'append_only');
  perform pg_temp.err('closures cannot be deleted', $q$ delete from public.order_closures $q$, 'PT409', 'append_only');
  perform pg_temp.err('shares cannot be deleted', $q$ delete from public.report_shares $q$, 'PT409', 'append_only');
  perform pg_temp.err('audit cannot be deleted', $q$ delete from public.audit_log $q$, 'PT409', 'append_only');
  perform pg_temp.err('audit cannot be truncated', $q$ truncate public.audit_log $q$, 'PT409', 'append_only');
  -- the vetted retention path (server-side job, owner only) can still purge inside its own transaction
  perform set_config('pulkro.history_purge', 'on', true);
  perform pg_temp.ok('retention job purges notes', $q$ with d as (delete from public.jornada_notes returning 1) select count(*)::text from d $q$);
  perform set_config('pulkro.history_purge', '', true);
end $$;
