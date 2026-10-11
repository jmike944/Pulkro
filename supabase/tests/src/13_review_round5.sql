-- 13 · Review round 5 (PR #9, adversarial pass on rounds 2–4, 2026-10-11) — migration review_pr9_followups. F1 assign_crew
-- follows the reference contract · F2 an open incident carries no resolution text · F3 reopening a case re-checks its
-- owner · F4 a supervisor of another unit cannot reopen an order · F5 crew_worker_ids resolves the visible orders once.
do $$
declare
  c_dir constant uuid := '22222222-0000-4000-8000-000000000001';
  c_adm1 constant uuid := '22222222-0000-4000-8000-000000000002';
  c_sup1 constant uuid := '22222222-0000-4000-8000-000000000004';
  c_u2 constant uuid := '11111111-0000-4000-8000-000000000002';
  c_w1 constant uuid := '44444444-0000-4000-8000-000000000001';
  c_case constant uuid := 'abababab-1300-4000-8000-000000000001';
  v_o1 uuid;
  v_o2 uuid;
  v_o3 uuid;
begin
  v_o1 := pg_temp.new_order(1);
  v_o2 := pg_temp.new_order(2);
  v_o3 := pg_temp.new_order(3);   -- created now: F3 moves ADM1 (who creates orders) to another unit
  perform pg_temp.as_user(c_sup1);
  perform public.assign_crew(gen_random_uuid(), v_o1, array[c_w1], 'Inicial');

  ------------------------------------------------------------------ F1 · assign_crew and the reference contract
  perform pg_temp.err('jornada not on the server yet → retried',
    format($q$ select public.assign_crew(gen_random_uuid(), %L, array[%L]::uuid[], 'x', gen_random_uuid()) $q$, v_o1, c_w1), 'PT409', 'parent_missing');
  perform pg_temp.err('jornada of another order',
    format($q$ select public.assign_crew(gen_random_uuid(), %L, array[%L]::uuid[], 'x', '66666666-1000-4000-8000-000000000002') $q$, v_o1, c_w1), 'PT422', 'jornada_order_mismatch');
  perform pg_temp.as_owner();
  update public.jornadas set deleted_at = now() where id = '66666666-1000-4000-8000-000000000002';
  perform pg_temp.as_user(c_sup1);
  perform pg_temp.err('rescheduled (tombstoned) jornada → sync conflict',
    format($q$ select public.assign_crew(gen_random_uuid(), %L, array[%L]::uuid[], 'x', '66666666-1000-4000-8000-000000000002') $q$, v_o2, c_w1), 'PT409', 'jornada_rescheduled');
  perform pg_temp.ok('the live jornada of the order still works',
    format($q$ select public.assign_crew(gen_random_uuid(), %L, array[%L]::uuid[], 'Ajuste', '66666666-1000-4000-8000-000000000001') $q$, v_o1, c_w1));

  ------------------------------------------------------------------ F2 · open incidents carry no resolution
  perform public.add_incident(gen_random_uuid(), 'dddddddd-1300-4000-8000-000000000001', v_o1, 'otra', 'media', 'Acceso restringido', false);
  perform pg_temp.as_owner();
  perform pg_temp.err('open incident with resolution text',
    $q$ update public.incidents set resolution = 'Texto suelto' where id = 'dddddddd-1300-4000-8000-000000000001' $q$, '23514');

  ------------------------------------------------------------------ F3 · reopening a case re-checks its owner
  perform pg_temp.as_user(c_adm1);
  perform public.create_case(gen_random_uuid(), c_case, v_o1, 'calidad', 'media', 'telefono', 'Polvo en ventanas', c_adm1, current_date);
  perform public.update_case(gen_random_uuid(), c_case, '{"status": "cerrado", "resolution": "Se repasaron las ventanas sin costo"}');
  perform pg_temp.as_user(c_dir);
  perform pg_temp.ok('ADM1 moves to U2 (no open case left)', format($q$ select public.update_profile(gen_random_uuid(), %L, %L) $q$,
    c_adm1, jsonb_build_object('unit_id', c_u2)));
  perform pg_temp.as_user(c_sup1);
  perform pg_temp.err('reopening hands the case to an owner who can no longer see it',
    format($q$ select public.update_case(gen_random_uuid(), %L, '{"status": "en_proceso"}', 'Reabrió el caso') $q$, c_case), 'PT422', 'invalid_case_owner');
  perform pg_temp.ok('reopening with a valid owner in the same patch',
    format($q$ select public.update_case(gen_random_uuid(), %L, %L, 'Reabrió el caso y lo tomó') $q$, c_case,
      jsonb_build_object('status', 'en_proceso', 'owner_id', c_sup1)));

  ------------------------------------------------------------------ F4 · reopen_order needs the supervisor in the unit
  perform pg_temp.as_user(c_sup1);
  perform public.assign_crew(gen_random_uuid(), v_o3, array[c_w1], 'Inicial');
  perform public.check_in(gen_random_uuid(), '66666666-1000-4000-8000-000000000003', now() - interval '3 hours', 25.7, -100.3, 10);
  perform public.check_out(gen_random_uuid(), '66666666-1000-4000-8000-000000000003', now() - interval '1 hour', 25.7, -100.3, 10);
  perform public.validate_closure(gen_random_uuid(), gen_random_uuid(), v_o3, 'Servicio realizado completo', 'verbal', 'Ing. Pérez',
    p_exception_reason => 'La cámara falló durante todo el turno');
  -- SUP1 also supervises the open orders 1 and 2 and owns the reopened case: hand them over so the move is allowed
  perform pg_temp.as_owner();
  update public.orders set supervisor_id = '22222222-0000-4000-8000-000000000005' where id in (v_o1, v_o2);
  update public.post_sale_cases set owner_id = '22222222-0000-4000-8000-000000000005' where id = c_case;
  perform pg_temp.as_user(c_dir);
  perform pg_temp.ok('SUP1 moves to U2 with only a closed order left', format($q$ select public.update_profile(gen_random_uuid(), %L, %L) $q$,
    c_sup1, jsonb_build_object('unit_id', c_u2)));
  perform pg_temp.as_user(c_sup1);
  perform pg_temp.err('a supervisor of another unit cannot reopen it',
    format($q$ select public.reopen_order(gen_random_uuid(), %L, 'Faltó una zona') $q$, v_o3), 'PT409', 'supervisor_other_unit');

  ------------------------------------------------------------------ F5 · visible orders resolved once
  perform pg_temp.as_owner();
  perform pg_temp.check('crew_worker_ids materializes the visible orders',
    pg_get_functiondef('private.crew_worker_ids()'::regprocedure) ~ 'with v as materialized');
end $$;
