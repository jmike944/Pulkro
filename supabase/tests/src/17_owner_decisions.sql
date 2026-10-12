-- 17 · Owner decisions (2026-10-11) — migration decision_closed_order_reassign. Decision 19: Administración reassigns the
-- responsible supervisor of a closed order without reopening it (that field only), so a closed order whose supervisor
-- moved to another unit can still be reopened by the new one; cancelled and archived orders stay frozen.
do $$
declare
  c_adm1 constant uuid := '22222222-0000-4000-8000-000000000002';
  c_sup1 constant uuid := '22222222-0000-4000-8000-000000000004';
  c_sup2 constant uuid := '22222222-0000-4000-8000-000000000005';
  c_dir constant uuid := '22222222-0000-4000-8000-000000000001';
  c_u2 constant uuid := '11111111-0000-4000-8000-000000000002';
  v_o uuid;
begin
  v_o := pg_temp.new_order(1);
  perform pg_temp.as_user(c_sup1);
  perform public.assign_crew(gen_random_uuid(), v_o, array['44444444-0000-4000-8000-000000000001']::uuid[], 'Inicial');
  perform public.check_in(gen_random_uuid(), '66666666-1000-4000-8000-000000000001', now() - interval '3 hours', 25.7, -100.3, 10);
  perform public.check_out(gen_random_uuid(), '66666666-1000-4000-8000-000000000001', now() - interval '1 hour', 25.7, -100.3, 10);
  perform public.validate_closure(gen_random_uuid(), gen_random_uuid(), v_o, 'Servicio realizado completo', 'verbal', 'Ing. Pérez',
    p_exception_reason => 'La cámara falló durante todo el turno');
  -- SUP1 moves to another unit with only this closed order left; reopening is now refused (supervisor_other_unit)
  perform pg_temp.as_user(c_dir);
  perform public.update_profile(gen_random_uuid(), c_sup1, jsonb_build_object('unit_id', c_u2));
  perform pg_temp.as_user(c_adm1);
  perform pg_temp.err('other fields of a closed order still need a reopening',
    format($q$ select public.update_order(gen_random_uuid(), %L, '{"title": "Nuevo título"}') $q$, v_o), 'PT409', 'order_closed');
  perform pg_temp.err('…even next to the supervisor',
    format($q$ select public.update_order(gen_random_uuid(), %L, %L) $q$, v_o, jsonb_build_object('supervisor_id', c_sup2, 'title', 'Nuevo título')), 'PT409', 'order_closed');
  perform pg_temp.ok('Administración reassigns the closed order to a supervisor of its unit',
    format($q$ select public.update_order(gen_random_uuid(), %L, %L, 'Supervisora cambió de unidad') $q$, v_o, jsonb_build_object('supervisor_id', c_sup2)));
  perform pg_temp.as_owner();
  perform pg_temp.eq('the order keeps its status', (select status::text from public.orders where id = v_o), 'finalizada');
  perform pg_temp.check('the reassignment is audited',
    exists (select 1 from public.audit_log where order_id = v_o and action = 'Reasignó la orden de Supervisora Uno a Supervisor Dos'));
  perform pg_temp.as_user(c_sup2);
  perform pg_temp.eq('the new supervisor can reopen it',
    pg_temp.ok('reopen', format($q$ select public.reopen_order(gen_random_uuid(), %L, 'Faltó una zona') ->> 'status' $q$, v_o)), 'reabierta');
  -- archived and cancelled orders stay frozen
  perform pg_temp.as_owner();
  update public.orders set status = 'archivada' where id = v_o;
  perform pg_temp.as_user(c_adm1);
  perform pg_temp.err('an archived order is not reassigned',
    format($q$ select public.update_order(gen_random_uuid(), %L, %L) $q$, v_o, jsonb_build_object('supervisor_id', c_sup2)), 'PT409', 'order_closed');
  perform pg_temp.as_owner();
  update public.orders set status = 'cancelada' where id = v_o;
  perform pg_temp.as_user(c_adm1);
  perform pg_temp.err('a cancelled order is not reassigned',
    format($q$ select public.update_order(gen_random_uuid(), %L, %L) $q$, v_o, jsonb_build_object('supervisor_id', c_sup2)), 'PT409', 'order_cancelled');
  perform pg_temp.as_owner();
end $$;
