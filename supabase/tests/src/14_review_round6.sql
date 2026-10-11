-- 14 · Review round 6 (PR #9, Codex, 2026-10-11) — migration review_pr9_codex_round2. G1 an order's open cases follow it
-- to the new supervisor · G2 reopening a case needs its reason · G3 open blocking incidents stay authoritative when an
-- order is flagged Reprogramada · G4 people stay readable wherever they appear on visible orders and cases · G5 upsert_site
-- holds the client it authorized against.
do $$
declare
  c_dir constant uuid := '22222222-0000-4000-8000-000000000001';
  c_adm1 constant uuid := '22222222-0000-4000-8000-000000000002';
  c_adm2 constant uuid := '22222222-0000-4000-8000-000000000003';
  c_sup1 constant uuid := '22222222-0000-4000-8000-000000000004';
  c_sup2 constant uuid := '22222222-0000-4000-8000-000000000005';
  c_sup3 constant uuid := '22222222-0000-4000-8000-000000000006';
  c_u2 constant uuid := '11111111-0000-4000-8000-000000000002';
  c_w1 constant uuid := '44444444-0000-4000-8000-000000000001';
  c_open constant uuid := 'abababab-1400-4000-8000-000000000001';
  c_closed constant uuid := 'abababab-1400-4000-8000-000000000002';
  v_o1 uuid;
  v_o2 uuid;
  v_o3 uuid;
begin
  v_o1 := pg_temp.new_order(1);
  v_o2 := pg_temp.new_order(2);
  v_o3 := pg_temp.new_order(3);

  ------------------------------------------------------------------ G1 · open cases follow the order to its new supervisor
  perform pg_temp.as_user(c_adm1);
  perform public.create_case(gen_random_uuid(), c_open, v_o1, 'calidad', 'media', 'telefono', 'Polvo en ventanas', c_sup1, current_date);
  perform public.create_case(gen_random_uuid(), c_closed, v_o1, 'puntualidad', 'baja', 'telefono', 'Llegaron tarde', c_sup1, current_date);
  perform public.update_case(gen_random_uuid(), c_closed, '{"status": "cerrado", "resolution": "Se ajustó el horario de llegada"}');
  perform pg_temp.ok('reassign order 1 to SUP2', format($q$ select public.update_order(gen_random_uuid(), %L, %L, 'Cambio de zona') $q$,
    v_o1, jsonb_build_object('supervisor_id', c_sup2)));
  perform pg_temp.as_owner();
  perform pg_temp.eq('the open case moved with the order', (select owner_id::text from public.post_sale_cases where id = c_open), c_sup2::text);
  perform pg_temp.eq('the closed case keeps its history', (select owner_id::text from public.post_sale_cases where id = c_closed), c_sup1::text);
  perform pg_temp.check('timeline and audit record the hand-over',
    exists (select 1 from public.case_events where case_id = c_open and text = 'Caso reasignado a Supervisor Dos junto con la orden.')
    and exists (select 1 from public.audit_log where entity_id = c_open and action like 'Reasignó caso PV-% con la orden'));
  perform pg_temp.as_user(c_sup2);
  perform pg_temp.check('the new supervisor sees the case they now own', exists (select 1 from public.post_sale_cases where id = c_open));

  ------------------------------------------------------------------ G2 · reopening a case needs its reason
  perform pg_temp.as_user(c_adm1);
  perform pg_temp.err('reopening without a reason',
    format($q$ select public.update_case(gen_random_uuid(), %L, '{"status": "en_proceso"}') $q$, c_closed), 'PT422', 'reason_required');
  perform pg_temp.err('reopening with a reason that says nothing',
    format($q$ select public.update_case(gen_random_uuid(), %L, '{"status": "en_proceso"}', 'Reabrir') $q$, c_closed), 'PT422', 'reason_required');
  perform pg_temp.err('a reason, but the owner no longer supervises the order',
    format($q$ select public.update_case(gen_random_uuid(), %L, '{"status": "en_proceso"}', 'El cliente volvió a llamar') $q$, c_closed), 'PT422', 'invalid_case_owner');
  perform pg_temp.ok('reason and the order''s current supervisor',
    format($q$ select public.update_case(gen_random_uuid(), %L, %L, 'El cliente volvió a llamar') $q$, c_closed,
      jsonb_build_object('status', 'en_proceso', 'owner_id', c_sup2)));
  perform pg_temp.as_owner();
  perform pg_temp.check('the reason is in the timeline',
    exists (select 1 from public.case_events where case_id = c_closed and text = 'El cliente volvió a llamar'));

  ------------------------------------------------------------------ G3 · blocking incidents stay authoritative
  perform pg_temp.as_user(c_sup1);
  perform public.assign_crew(gen_random_uuid(), v_o2, array[c_w1], 'Inicial');
  perform public.add_incident(gen_random_uuid(), 'dddddddd-1400-4000-8000-000000000001', v_o2, 'otra', 'alta', 'Acceso bloqueado por obra', true);
  perform pg_temp.eq('flagging Reprogramada under a blocking incident keeps con_incidencia',
    pg_temp.ok('flag', format($q$ select public.set_order_status(gen_random_uuid(), %L, 'reprogramada', 'El cliente movió la fecha') ->> 'status' $q$, v_o2)),
    'con_incidencia');
  perform pg_temp.as_owner();
  perform pg_temp.eq('Reprogramada becomes the status to resume', (select previous_status::text from public.orders where id = v_o2), 'reprogramada');
  perform pg_temp.check('the flag is audited with its reason',
    exists (select 1 from public.audit_log where order_id = v_o2 and action = 'Marcó la orden como reprogramada (sigue con incidencia)' and reason = 'El cliente movió la fecha'));
  perform pg_temp.as_user(c_sup1);
  perform pg_temp.eq('resolving the incident resumes Reprogramada',
    public.resolve_incident(gen_random_uuid(), 'dddddddd-1400-4000-8000-000000000001', 'La obra terminó') ->> 'order_status', 'reprogramada');
  perform public.add_incident(gen_random_uuid(), 'dddddddd-1400-4000-8000-000000000002', v_o2, 'otra', 'alta', 'Nueva obra en el acceso', true);
  perform pg_temp.eq('dates can be confirmed under the incident',
    pg_temp.ok('confirm', format($q$ select public.set_order_status(gen_random_uuid(), %L, 'programada', 'Fechas confirmadas') ->> 'status' $q$, v_o2)),
    'con_incidencia');
  perform pg_temp.as_owner();
  perform pg_temp.eq('…and the order then resumes the status its jornadas support', (select previous_status::text from public.orders where id = v_o2), 'programada');

  ------------------------------------------------------------------ G4 · people on visible records stay readable
  perform pg_temp.as_user(c_sup1);
  perform public.assign_crew(gen_random_uuid(), v_o3, array[c_w1], 'Inicial');
  perform public.check_in(gen_random_uuid(), '66666666-1000-4000-8000-000000000003', now() - interval '3 hours', 25.7, -100.3, 10);
  perform public.check_out(gen_random_uuid(), '66666666-1000-4000-8000-000000000003', now() - interval '1 hour', 25.7, -100.3, 10);
  perform public.validate_closure(gen_random_uuid(), gen_random_uuid(), v_o3, 'Servicio realizado completo', 'verbal', 'Ing. Pérez',
    p_exception_reason => 'La cámara falló durante todo el turno');
  perform pg_temp.as_user(c_adm1);
  perform public.update_order(gen_random_uuid(), v_o2, jsonb_build_object('supervisor_id', c_sup2), 'Cambio de zona');
  perform pg_temp.as_user(c_dir);
  perform pg_temp.ok('SUP1 moves to U2 (only a closed order left)', format($q$ select public.update_profile(gen_random_uuid(), %L, %L) $q$,
    c_sup1, jsonb_build_object('unit_id', c_u2)));
  perform pg_temp.as_user(c_adm1);
  perform pg_temp.eq('the old unit''s Administración still reads the supervisor of its closed order',
    pg_temp.seen(format($q$ select id from public.profiles where id = %L $q$, c_sup1)), 'SUP1');
  perform pg_temp.as_user(c_sup2);
  perform pg_temp.eq('the current supervisor reads the former one of their orders',
    pg_temp.seen(format($q$ select id from public.profiles where id = %L $q$, c_sup1)), 'SUP1');
  perform pg_temp.as_user(c_adm2);
  perform pg_temp.eq('the new unit reads them by unit', pg_temp.seen(format($q$ select id from public.profiles where id = %L $q$, c_sup1)), 'SUP1');
  perform pg_temp.as_user(c_sup3);
  perform pg_temp.eq('a supervisor with nothing in common does not',
    pg_temp.seen(format($q$ select id from public.profiles where id = %L $q$, c_sup1)), '');

  ------------------------------------------------------------------ G5 · upsert_site holds the client it authorized against
  perform pg_temp.as_owner();
  -- (round 7, H5, moved these locks before the site's to avoid a cycle with upsert_client: one statement, id order)
  perform pg_temp.check('upsert_site locks the client and the current one of an existing site FOR SHARE',
    pg_get_functiondef('private.upsert_site(uuid,uuid,uuid,text,double precision,double precision,text,text)'::regprocedure)
      ~ 'from public\.clients c where c\.id in \(p_client_id, v_prev_client\) order by c\.id for share');
end $$;
