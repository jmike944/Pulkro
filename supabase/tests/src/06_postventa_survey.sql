-- 06 · Post-sale (postventa.manage = Administración of the unit and the order's supervisor; Dirección consults) and the
-- public survey: a client answers once, by token, without an account; staff sessions cannot answer as the client.
select pg_temp.new_order(1);                                                  -- ORD1 (U1, SUP1)
select pg_temp.new_order(3, 2, '22222222-0000-4000-8000-000000000006');        -- ORD3 (U2, SUP3)
update public.orders set status = 'reporte_enviado' where id = '66666666-0000-4000-8000-000000000001';
update public.orders set status = 'archivada', archived_at = now() where id = '66666666-0000-4000-8000-000000000003';
do $$
declare
  v jsonb;
  c_dir constant uuid := '22222222-0000-4000-8000-000000000001';
  c_adm1 constant uuid := '22222222-0000-4000-8000-000000000002';
  c_adm2 constant uuid := '22222222-0000-4000-8000-000000000003';
  c_sup1 constant uuid := '22222222-0000-4000-8000-000000000004';
  c_sup2 constant uuid := '22222222-0000-4000-8000-000000000005';
  c_tok constant text := 'Tok_ORD1_abcdefghijklmnopqrstuvwxyz0123456789AB';
begin
  ------------------------------------------------------------------ cases
  perform pg_temp.as_user(c_dir);
  perform pg_temp.err('Dirección consults only', $q$ select public.create_case(gen_random_uuid(), gen_random_uuid(), '66666666-0000-4000-8000-000000000001', 'calidad', 'media', 'telefono', 'Queja', '22222222-0000-4000-8000-000000000004', current_date) $q$, 'PT403', 'forbidden:postventa.manage');
  perform pg_temp.as_user(c_adm2);
  perform pg_temp.err('Administración of another unit', $q$ select public.create_case(gen_random_uuid(), gen_random_uuid(), '66666666-0000-4000-8000-000000000001', 'calidad', 'media', 'telefono', 'Queja', '22222222-0000-4000-8000-000000000003', current_date) $q$, 'PT404', 'out_of_scope');
  perform pg_temp.as_user(c_sup2);
  perform pg_temp.err('another supervisor', $q$ select public.create_case(gen_random_uuid(), gen_random_uuid(), '66666666-0000-4000-8000-000000000001', 'calidad', 'media', 'telefono', 'Queja', '22222222-0000-4000-8000-000000000005', current_date) $q$, 'PT404', 'out_of_scope');
  perform pg_temp.as_user(c_sup1);
  perform pg_temp.err('owner must be able to see the case (Dirección)', $q$ select public.create_case(gen_random_uuid(), gen_random_uuid(), '66666666-0000-4000-8000-000000000001', 'calidad', 'media', 'telefono', 'Queja', '22222222-0000-4000-8000-000000000001', current_date) $q$, 'PT422', 'invalid_case_owner');
  perform pg_temp.err('owner must be able to see the case (other supervisor)', $q$ select public.create_case(gen_random_uuid(), gen_random_uuid(), '66666666-0000-4000-8000-000000000001', 'calidad', 'media', 'telefono', 'Queja', '22222222-0000-4000-8000-000000000005', current_date) $q$, 'PT422', 'invalid_case_owner');
  perform pg_temp.err('owner must be active', $q$ select public.create_case(gen_random_uuid(), gen_random_uuid(), '66666666-0000-4000-8000-000000000001', 'calidad', 'media', 'telefono', 'Queja', '22222222-0000-4000-8000-000000000007', current_date) $q$, 'PT422', 'invalid_case_owner');
  perform pg_temp.err('due date required', $q$ select public.create_case(gen_random_uuid(), gen_random_uuid(), '66666666-0000-4000-8000-000000000001', 'calidad', 'media', 'telefono', 'Queja', '22222222-0000-4000-8000-000000000004', null) $q$, 'PT422', 'due_date_required');
  v := pg_temp.ok('supervisor opens a case for Administración', $q$ select public.create_case(gen_random_uuid(), 'abababab-0000-4000-8000-000000000001', '66666666-0000-4000-8000-000000000001', 'calidad', 'alta', 'whatsapp', 'Polvo en ventanas del lobby', '22222222-0000-4000-8000-000000000002', current_date + 3) $q$)::jsonb;
  perform pg_temp.check('case folio from the server', (v ->> 'folio') ~ '^PV-[0-9]{4,}$');
  perform pg_temp.eq('order → seguimiento', v ->> 'order_status', 'seguimiento');
  perform pg_temp.eq('client from the order, timeline started',
    (select concat_ws('|', c.client_id = '33333333-0000-4000-8000-000000000001', c.created_by = c_sup1, e.text)
     from public.post_sale_cases c join public.case_events e on e.case_id = c.id where c.id = 'abababab-0000-4000-8000-000000000001'),
    't|t|Caso registrado y asignado.');
  perform pg_temp.as_user(c_adm1);
  perform pg_temp.ok('Administración opens a case for the supervisor', $q$ select public.create_case(gen_random_uuid(), 'abababab-0000-4000-8000-000000000002', '66666666-0000-4000-8000-000000000001', 'puntualidad', 'baja', 'telefono', 'Llegaron tarde', '22222222-0000-4000-8000-000000000004', current_date + 5) $q$);
  perform pg_temp.err('case field not editable', $q$ select public.update_case(gen_random_uuid(), 'abababab-0000-4000-8000-000000000001', '{"order_id": "66666666-0000-4000-8000-000000000003"}') $q$, 'PT422', 'field_not_editable');
  perform pg_temp.err('owner of another unit', $q$ select public.update_case(gen_random_uuid(), 'abababab-0000-4000-8000-000000000001', '{"owner_id": "22222222-0000-4000-8000-000000000003"}') $q$, 'PT422', 'invalid_case_owner');
  perform pg_temp.err('bad due date', $q$ select public.update_case(gen_random_uuid(), 'abababab-0000-4000-8000-000000000001', '{"due_date": "mañana"}') $q$, 'PT422', 'invalid_value');
  perform pg_temp.err('nothing to save', $q$ select public.update_case(gen_random_uuid(), 'abababab-0000-4000-8000-000000000001', '{}') $q$, 'PT422', 'empty_patch');
  perform pg_temp.ok('take the case', $q$ select public.update_case(gen_random_uuid(), 'abababab-0000-4000-8000-000000000001', '{"status": "en_proceso", "owner_id": "22222222-0000-4000-8000-000000000004"}', 'Supervisora tomó el caso') $q$);
  perform pg_temp.err('empty note', $q$ select public.add_case_note(gen_random_uuid(), 'abababab-0000-4000-8000-000000000001', '  ') $q$, 'PT422', 'invalid_text');
  perform pg_temp.ok('note', $q$ select public.add_case_note(gen_random_uuid(), 'abababab-0000-4000-8000-000000000001', 'Visita programada') $q$);
  perform pg_temp.eq('timeline', (select string_agg(text, ' → ' order by created_at, text) from public.case_events where case_id = 'abababab-0000-4000-8000-000000000001'),
    'Caso registrado y asignado. → Supervisora tomó el caso → Visita programada');
  perform pg_temp.as_user(c_dir);
  perform pg_temp.err('Dirección cannot update cases', $q$ select public.add_case_note(gen_random_uuid(), 'abababab-0000-4000-8000-000000000001', 'Nota') $q$, 'PT403', 'forbidden:postventa.manage');
  -- a case on an archived order brings it back to follow-up (store.createCase)
  perform pg_temp.as_user('22222222-0000-4000-8000-000000000006');
  perform pg_temp.eq('archived → seguimiento', pg_temp.ok('case on archived order', $q$ select public.create_case(gen_random_uuid(), gen_random_uuid(), '66666666-0000-4000-8000-000000000003', 'otro', 'baja', 'presencial', 'Comentario posterior', '22222222-0000-4000-8000-000000000006', current_date) ->> 'order_status' $q$), 'seguimiento');

  ------------------------------------------------------------------ survey links (client-generated 256-bit tokens)
  perform pg_temp.as_user(c_sup1);
  perform pg_temp.err('weak token', $q$ select public.create_survey(gen_random_uuid(), gen_random_uuid(), '66666666-0000-4000-8000-000000000001', 'whatsapp', 'abc123') $q$, 'PT422', 'weak_token');
  perform pg_temp.err('guessable token (long but low entropy)', $q$ select public.create_survey(gen_random_uuid(), gen_random_uuid(), '66666666-0000-4000-8000-000000000001', 'whatsapp', repeat('ab', 22)) $q$, 'PT422', 'weak_token');
  perform pg_temp.err('128-bit tokens are no longer enough', $q$ select public.create_survey(gen_random_uuid(), gen_random_uuid(), '66666666-0000-4000-8000-000000000001', 'whatsapp', 'Q3v9_xT2mK8pLw4ZbN7cR1yH') $q$, 'PT422', 'weak_token');
  perform pg_temp.ok('survey link', format($q$ select public.create_survey(gen_random_uuid(), 'acacacac-0000-4000-8000-000000000001', '66666666-0000-4000-8000-000000000001', 'whatsapp', %L) $q$, c_tok));
  perform pg_temp.err('token unique', format($q$ select public.create_survey(gen_random_uuid(), gen_random_uuid(), '66666666-0000-4000-8000-000000000001', 'email', %L) $q$, c_tok), '23505');
  perform pg_temp.err('staff cannot answer as the client', format($q$ select public.submit_survey(%L, 5, 5, 5, 5, 10) $q$, c_tok), '42501');
  perform pg_temp.err('staff do not use the public reader', format($q$ select public.get_survey(%L) $q$, c_tok), '42501');
  perform pg_temp.as_user(c_dir);
  perform pg_temp.err('Dirección does not send surveys', $q$ select public.create_survey(gen_random_uuid(), gen_random_uuid(), '66666666-0000-4000-8000-000000000001', 'whatsapp', 'Tok_dir_abcdefghijklmnopqrstuvwxyz0123456789AB') $q$, 'PT403', 'forbidden:postventa.manage');

  ------------------------------------------------------------------ the client (anon)
  perform pg_temp.as_anon();
  v := pg_temp.ok('client opens the link', format($q$ select public.get_survey(%L) $q$, c_tok))::jsonb;
  perform pg_temp.eq('only what the client needs',
    concat_ws('|', v ->> 'client_name', v ->> 'service_name', v ->> 'supervisor_first_name', v ->> 'responded_at', (select string_agg(k, ',' order by k collate "C") from jsonb_object_keys(v) k)),
    'Cliente Uno SA|Limpieza profunda|Supervisora|answers,client_hue,client_name,order_title,responded_at,respondent_name,service_date,service_name,supervisor_first_name');
  perform pg_temp.err('malformed token', $q$ select public.get_survey('x') $q$, 'PT404', 'survey_not_found');
  perform pg_temp.err('unknown token', $q$ select public.get_survey('Tok_unknown_abcdefghijklmnopqrstuvwxyz0123456') $q$, 'PT404', 'survey_not_found');
  perform pg_temp.err('answers out of range', format($q$ select public.submit_survey(%L, 6, 5, 5, 5, 10) $q$, c_tok), 'PT422', 'invalid_answers');
  perform pg_temp.err('nps out of range', format($q$ select public.submit_survey(%L, 5, 5, 5, 5, 11) $q$, c_tok), 'PT422', 'invalid_answers');
  perform pg_temp.eq('client answers', pg_temp.ok('submit', format($q$ select public.submit_survey(%L, 5, 4, 5, 5, 9, 'Muy bien', 'Lic. Andrea') ->> 'status' $q$, c_tok)), 'recorded');
  perform pg_temp.eq('second answer refused (idempotent by token)', pg_temp.ok('submit again', format($q$ select public.submit_survey(%L, 1, 1, 1, 1, 0) ->> 'status' $q$, c_tok)), 'already_responded');
  v := pg_temp.ok('thanks page', format($q$ select public.get_survey(%L) $q$, c_tok))::jsonb;
  perform pg_temp.eq('the stored answer is the first one', concat_ws('|', v #>> '{answers,overall}', v #>> '{answers,nps}', v ->> 'respondent_name'), '5|9|Lic. Andrea');
  perform pg_temp.err('anon cannot use staff RPCs', $q$ select public.create_survey(gen_random_uuid(), gen_random_uuid(), '66666666-0000-4000-8000-000000000001', 'whatsapp', 'Tok_anon_abcdefghijklmnopqrstuvwxyz0123456789AB') $q$, '42501');
  perform pg_temp.as_owner();
  perform pg_temp.eq('answer recorded server-side',
    (select concat_ws('|', overall, quality, nps, comment, manual, responded_at = now()) from public.surveys where id = 'acacacac-0000-4000-8000-000000000001'), '5|4|9|Muy bien|f|t');
  perform pg_temp.eq('audited as the client',
    (select concat_ws('|', actor_kind, actor_id is null, actor_name, action, order_id = '66666666-0000-4000-8000-000000000001', unit_id = '11111111-0000-4000-8000-000000000001')
     from public.audit_log where entity = 'encuesta' and actor_kind = 'cliente'),
    'cliente|t|Lic. Andrea|Cliente respondió encuesta (5/5)|t|t');

  ------------------------------------------------------------------ manual capture by staff
  perform pg_temp.as_user(c_adm1);
  perform pg_temp.ok('second link (unanswered)', $q$ select public.create_survey(gen_random_uuid(), 'acacacac-0000-4000-8000-000000000002', '66666666-0000-4000-8000-000000000001', 'email', 'Tok_ORD1_second_abcdefghijklmnopqrstuvwxyz0123') $q$);
  perform pg_temp.err('manual answer needs who answered', $q$ select public.record_manual_survey(gen_random_uuid(), '66666666-0000-4000-8000-000000000001', 4, 4, 4, 4, 8, ' ') $q$, 'PT422', 'invalid_text');
  perform pg_temp.err('manual answers validated', $q$ select public.record_manual_survey(gen_random_uuid(), '66666666-0000-4000-8000-000000000001', 0, 4, 4, 4, 8, 'Ing. Marco') $q$, 'PT422', 'invalid_answers');
  perform pg_temp.eq('fills the pending link', pg_temp.ok('manual', $q$ select public.record_manual_survey(gen_random_uuid(), '66666666-0000-4000-8000-000000000001', 4, 4, 3, 4, 8, 'Ing. Marco', 'Por teléfono') ->> 'survey_id' $q$), 'acacacac-0000-4000-8000-000000000002');
  perform pg_temp.eq('marked manual, recorded by', (select concat_ws('|', manual, recorded_by = c_adm1, respondent_name) from public.surveys where id = 'acacacac-0000-4000-8000-000000000002'), 't|t|Ing. Marco');
  perform pg_temp.err('no pending link and no new id', $q$ select public.record_manual_survey(gen_random_uuid(), '66666666-0000-4000-8000-000000000001', 4, 4, 4, 4, 8, 'Ing. Marco') $q$, 'PT422', 'survey_id_required');
  perform pg_temp.ok('creates a manual survey', $q$ select public.record_manual_survey(gen_random_uuid(), '66666666-0000-4000-8000-000000000001', 5, 5, 5, 5, 10, 'Ing. Marco', null, 'acacacac-0000-4000-8000-000000000003', 'Tok_ORD1_manual_abcdefghijklmnopqrstuvwxyz0123') $q$);
  perform pg_temp.eq('three surveys on the order', (select count(*)::text from public.surveys where order_id = '66666666-0000-4000-8000-000000000001'), '3');
  perform pg_temp.as_owner();
end $$;
