-- 10 · Review round 2 (PR #9, 2026-10-11) — migration review_pr9_codex. R1 a closed jornada keeps its crew · R2 Con
-- incidencia follows the blocking flag on edits · R3 photos/incidents/cases re-read under the order lock · R4 resolved
-- and closed cases carry their resolution · R5 rows a validation relied on stay locked until commit · R6 workers stay
-- readable wherever they are on a visible crew. R3 and R5 are races between two sessions: one transaction cannot
-- interleave them, so their checks pin the shape of the code (re-read after lock_order, FOR SHARE on the validated row).
do $$
declare
  c_dir constant uuid := '22222222-0000-4000-8000-000000000001';
  c_adm1 constant uuid := '22222222-0000-4000-8000-000000000002';
  c_adm2 constant uuid := '22222222-0000-4000-8000-000000000003';
  c_sup1 constant uuid := '22222222-0000-4000-8000-000000000004';
  c_sup2 constant uuid := '22222222-0000-4000-8000-000000000005';
  c_sup3 constant uuid := '22222222-0000-4000-8000-000000000006';
  c_u1 constant uuid := '11111111-0000-4000-8000-000000000001';
  c_u2 constant uuid := '11111111-0000-4000-8000-000000000002';
  c_w1 constant uuid := '44444444-0000-4000-8000-000000000001';
  c_w2 constant uuid := '44444444-0000-4000-8000-000000000002';
  v_o uuid;
  v_j uuid;
  v_src text;
begin
  ------------------------------------------------------------------ R1 · a closed jornada keeps its crew
  v_o := pg_temp.new_order(1);
  v_j := '66666666-1000-4000-8000-000000000001';
  perform pg_temp.as_user(c_sup1);
  perform public.assign_crew(gen_random_uuid(), v_o, array[c_w1], 'Inicial');
  perform pg_temp.ok('check-in',
    format($q$ select public.check_in(gen_random_uuid(), %L, now() - interval '3 hours', 25.7, -100.3, 10) $q$, v_j));
  perform pg_temp.ok('en_curso jornada: crew can still change',
    format($q$ select public.assign_crew(gen_random_uuid(), %L, array[%L, %L]::uuid[], 'Refuerzo', %L) $q$, v_o, c_w1, c_w2, v_j));
  perform pg_temp.ok('check-out', format($q$ select public.check_out(gen_random_uuid(), %L, now() - interval '1 hour', 25.7, -100.3, 10) $q$, v_j));
  perform pg_temp.err('closed jornada: crew is the record of who worked',
    format($q$ select public.assign_crew(gen_random_uuid(), %L, array[%L]::uuid[], 'Corrección', %L) $q$, v_o, c_w2, v_j), 'PT409', 'jornada_closed');
  perform pg_temp.as_owner();
  perform pg_temp.eq('closed crew unchanged', (select array_to_string(worker_ids, ',') from public.jornadas where id = v_j),
    concat_ws(',', c_w1, c_w2));
  perform pg_temp.eq('no crew_changes row for the refused call',
    (select count(*)::text from public.crew_changes where jornada_id = v_j), '1');

  ------------------------------------------------------------------ R2 · the blocking flag drives Con incidencia
  v_o := pg_temp.new_order(2);
  perform pg_temp.as_user(c_sup1);
  perform public.assign_crew(gen_random_uuid(), v_o, array[c_w1], 'Inicial');
  perform public.add_incident(gen_random_uuid(), 'dddddddd-1000-4000-8000-000000000001', v_o, 'otra', 'media', 'Acceso cerrado al área', false);
  perform pg_temp.eq('non-blocking incident leaves the order programada', (select status::text from public.orders where id = v_o), 'programada');
  perform pg_temp.eq('flag on → con_incidencia',
    pg_temp.ok('flag on', $q$ select public.update_incident(gen_random_uuid(), 'dddddddd-1000-4000-8000-000000000001', '{"blocks_closure": true}') ->> 'order_status' $q$),
    'con_incidencia');
  perform pg_temp.eq('status to resume kept', (select previous_status::text from public.orders where id = v_o), 'programada');
  perform public.add_incident(gen_random_uuid(), 'dddddddd-1000-4000-8000-000000000002', v_o, 'otra', 'alta', 'Fuga en el techo', true);
  perform pg_temp.eq('flag off while another blocker is open → still con_incidencia',
    pg_temp.ok('flag off 1', $q$ select public.update_incident(gen_random_uuid(), 'dddddddd-1000-4000-8000-000000000001', '{"blocks_closure": false}') ->> 'order_status' $q$),
    'con_incidencia');
  perform pg_temp.eq('flag off on the last blocker → status from the jornadas',
    pg_temp.ok('flag off 2', $q$ select public.update_incident(gen_random_uuid(), 'dddddddd-1000-4000-8000-000000000002', '{"blocks_closure": false}') ->> 'order_status' $q$),
    'programada');
  perform pg_temp.eq('other edits do not touch the status',
    pg_temp.ok('severity edit', $q$ select public.update_incident(gen_random_uuid(), 'dddddddd-1000-4000-8000-000000000002', '{"severity": "baja"}') ->> 'order_status' $q$),
    'programada');
  perform public.resolve_incident(gen_random_uuid(), 'dddddddd-1000-4000-8000-000000000002', 'Se reparó la fuga');
  perform pg_temp.eq('flagging a resolved incident does not block the order',
    pg_temp.ok('flag resolved', $q$ select public.update_incident(gen_random_uuid(), 'dddddddd-1000-4000-8000-000000000002', '{"blocks_closure": true}') ->> 'order_status' $q$),
    'programada');
  perform pg_temp.as_owner();
  perform pg_temp.check('status changes are audited with the incident',
    exists (select 1 from public.audit_log where order_id = v_o and action = 'Cambió estado a Programada' and reason like 'La incidencia INC-% ya no bloquea el cierre'));

  ------------------------------------------------------------------ R3 · re-read under the order lock
  foreach v_src in array array['lock_photo_for_edit', 'set_photo_selected', 'update_incident', 'resolve_incident', 'update_case'] loop
    perform pg_temp.check('R3 ' || v_src || ' re-reads its row FOR UPDATE after lock_order', (
      select position('lock_order' in d) > 0 and position('for update' in substr(d, position('lock_order' in d))) > 0
      from (select pg_get_functiondef(p.oid) d from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'private' and p.proname = v_src) f));
  end loop;
  -- The re-read sees a deletion committed while the caller waited: here, sequentially, a deleted photo is refused.
  v_o := pg_temp.new_order(3);
  perform pg_temp.put_object(v_o, 'antes', 'cccccccc-1000-4000-8000-000000000001');
  perform pg_temp.as_user(c_sup1);
  perform public.add_photo(gen_random_uuid(), 'cccccccc-1000-4000-8000-000000000001', v_o, 'antes',
    format('orders/%s/antes/cccccccc-1000-4000-8000-000000000001.jpg', v_o));
  perform public.delete_photo(gen_random_uuid(), 'cccccccc-1000-4000-8000-000000000001');
  perform pg_temp.err('selection of a deleted photo', $q$ select public.set_photo_selected(gen_random_uuid(), 'cccccccc-1000-4000-8000-000000000001', true) $q$, 'PT409', 'photo_deleted');
  perform pg_temp.err('edit of a deleted photo', $q$ select public.update_photo(gen_random_uuid(), 'cccccccc-1000-4000-8000-000000000001', '{"note": "x"}') $q$, 'PT409', 'photo_deleted');
  perform public.add_incident(gen_random_uuid(), 'dddddddd-1000-4000-8000-000000000003', v_o, 'otra', 'media', 'Incidencia para resolver dos veces', false);
  perform public.resolve_incident(gen_random_uuid(), 'dddddddd-1000-4000-8000-000000000003', 'Primera resolución');
  perform pg_temp.err('second resolution', $q$ select public.resolve_incident(gen_random_uuid(), 'dddddddd-1000-4000-8000-000000000003', 'Segunda resolución') $q$, 'PT409', 'already_resolved');
  perform pg_temp.as_owner();
  perform pg_temp.eq('first resolution kept', (select resolution from public.incidents where id = 'dddddddd-1000-4000-8000-000000000003'), 'Primera resolución');

  ------------------------------------------------------------------ R4 · resolved/closed cases carry their resolution
  v_o := pg_temp.new_order(4);
  perform pg_temp.as_user(c_adm1);
  perform pg_temp.err('a new case cannot start resolved',
    format($q$ select public.create_case(gen_random_uuid(), gen_random_uuid(), %L, 'calidad', 'media', 'telefono', 'Polvo en ventanas', %L, current_date, 'resuelto') $q$, v_o, c_adm1),
    'PT422', 'resolution_required');
  perform pg_temp.err('a new case cannot start closed',
    format($q$ select public.create_case(gen_random_uuid(), gen_random_uuid(), %L, 'calidad', 'media', 'telefono', 'Polvo en ventanas', %L, current_date, 'cerrado') $q$, v_o, c_adm1),
    'PT422', 'resolution_required');
  perform pg_temp.ok('a new case may start en_proceso',
    format($q$ select public.create_case(gen_random_uuid(), 'abababab-1000-4000-8000-000000000001', %L, 'calidad', 'media', 'telefono', 'Polvo en ventanas', %L, current_date, 'en_proceso') $q$, v_o, c_adm1));
  perform pg_temp.err('resolved without resolution', $q$ select public.update_case(gen_random_uuid(), 'abababab-1000-4000-8000-000000000001', '{"status": "resuelto"}') $q$, 'PT422', 'resolution_required');
  perform pg_temp.err('closed without resolution', $q$ select public.update_case(gen_random_uuid(), 'abababab-1000-4000-8000-000000000001', '{"status": "cerrado"}') $q$, 'PT422', 'resolution_required');
  perform pg_temp.err('resolution too short (app rule: 10 characters)', $q$ select public.update_case(gen_random_uuid(), 'abababab-1000-4000-8000-000000000001', '{"status": "resuelto", "resolution": "  Listo  "}') $q$, 'PT422', 'resolution_required');
  perform pg_temp.ok('resolved with its resolution', $q$ select public.update_case(gen_random_uuid(), 'abababab-1000-4000-8000-000000000001', '{"status": "resuelto", "resolution": "Se repasaron las ventanas sin costo"}', 'Resolución registrada') $q$);
  perform pg_temp.err('clearing the resolution of a resolved case', $q$ select public.update_case(gen_random_uuid(), 'abababab-1000-4000-8000-000000000001', '{"resolution": ""}') $q$, 'PT422', 'resolution_required');
  perform pg_temp.ok('closing keeps the recorded resolution', $q$ select public.update_case(gen_random_uuid(), 'abababab-1000-4000-8000-000000000001', '{"status": "cerrado"}', 'Cliente conforme') $q$);
  perform pg_temp.ok('a note on a closed case needs no resolution check', $q$ select public.add_case_note(gen_random_uuid(), 'abababab-1000-4000-8000-000000000001', 'Seguimiento telefónico') $q$);
  perform pg_temp.ok('reopening needs no resolution', $q$ select public.update_case(gen_random_uuid(), 'abababab-1000-4000-8000-000000000001', '{"status": "en_proceso"}', 'Reabrió el caso: volvió el polvo') $q$);
  perform pg_temp.as_owner();
  perform pg_temp.err('table backstop: resolved without resolution',
    $q$ update public.post_sale_cases set status = 'resuelto', resolution = null where id = 'abababab-1000-4000-8000-000000000001' $q$, '23514');

  ------------------------------------------------------------------ R5 · validated rows locked until commit
  perform pg_temp.check('R5 create_order locks the client FOR SHARE',
    pg_get_functiondef('private.create_order(uuid,uuid,uuid,uuid,uuid,uuid,text,jsonb,text[],jsonb,text,text,text,text,public.order_priority)'::regprocedure)
      ~ 'from public\.clients c where c\.id = p_client_id for share');
  perform pg_temp.check('R5 create_order locks the supervisor FOR SHARE',
    pg_get_functiondef('private.create_order(uuid,uuid,uuid,uuid,uuid,uuid,text,jsonb,text[],jsonb,text,text,text,text,public.order_priority)'::regprocedure)
      ~ 'u\.unit_id = v_client\.unit_id\s+for share');
  perform pg_temp.check('R5 update_order locks the new supervisor FOR SHARE',
    pg_get_functiondef('private.update_order(uuid,uuid,jsonb,text)'::regprocedure) ~ 'u\.unit_id = v_o\.unit_id\s+for share');
  perform pg_temp.check('R5 assign_crew locks the crew FOR SHARE',
    pg_get_functiondef('private.assign_crew(uuid,uuid,uuid[],text,uuid)'::regprocedure) ~ 'from public\.workers x[^;]*for share');
  perform pg_temp.check('R5 assert_case_owner locks the owner FOR SHARE (volatile)',
    pg_get_functiondef('private.assert_case_owner(public.orders,uuid)'::regprocedure) ~ 'for share'
    and (select provolatile from pg_proc where oid = 'private.assert_case_owner(public.orders,uuid)'::regprocedure) = 'v');
  perform pg_temp.check('R5 the moving side takes FOR UPDATE first (client, profile, worker)',
    pg_get_functiondef('private.upsert_client(uuid,uuid,text,text,public.client_segment,uuid,text,text,text,date,integer)'::regprocedure) ~ 'for update'
    and pg_get_functiondef('private.update_profile(uuid,uuid,jsonb)'::regprocedure) ~ 'for update'
    and pg_get_functiondef('private.upsert_worker(uuid,uuid,text,uuid,text,text,integer,boolean)'::regprocedure) ~ 'for update');

  ------------------------------------------------------------------ R6 · workers readable wherever they are on a crew
  v_o := pg_temp.new_order(6);
  perform pg_temp.as_user(c_sup1);
  perform public.assign_crew(gen_random_uuid(), v_o, array[c_w1, c_w2], 'Inicial');
  perform pg_temp.as_user(c_dir);
  perform pg_temp.ok('W1 moves to U2 with an open jornada (the app confirms first)',
    format($q$ select public.upsert_worker(gen_random_uuid(), %L, 'Juan Pérez', %L) $q$, c_w1, c_u2));
  perform pg_temp.as_user(c_sup1);
  perform pg_temp.eq('old supervisor still reads the moved crew member',
    pg_temp.seen($q$ select id from public.workers where id in ('44444444-0000-4000-8000-000000000001', '44444444-0000-4000-8000-000000000002') $q$), 'W1,W2');
  perform pg_temp.as_user(c_adm1);
  perform pg_temp.eq('old unit''s Administración still reads them',
    pg_temp.seen($q$ select id from public.workers where id in ('44444444-0000-4000-8000-000000000001', '44444444-0000-4000-8000-000000000002') $q$), 'W1,W2');
  perform pg_temp.as_user(c_sup2);
  perform pg_temp.eq('a supervisor without that crew does not',
    pg_temp.seen($q$ select id from public.workers where id = '44444444-0000-4000-8000-000000000001' $q$), '');
  perform pg_temp.as_user(c_adm2);
  perform pg_temp.eq('new unit reads W1 by unit', pg_temp.seen($q$ select id from public.workers where id = '44444444-0000-4000-8000-000000000001' $q$), 'W1');
  perform pg_temp.as_user(c_sup3);
  perform pg_temp.eq('new unit''s supervisor reads W1 by unit', pg_temp.seen($q$ select id from public.workers where id = '44444444-0000-4000-8000-000000000001' $q$), 'W1');
  perform pg_temp.as_user(c_sup1);
  perform pg_temp.err('W1 is no longer assignable in U1',
    format($q$ select public.assign_crew(gen_random_uuid(), %L, array[%L, %L]::uuid[], 'Reasignación') $q$, v_o, c_w1, c_w2), 'PT422', 'invalid_crew');
  perform pg_temp.ok('the old supervisor can take W1 off the crew',
    format($q$ select public.assign_crew(gen_random_uuid(), %L, array[%L]::uuid[], 'Juan cambió de unidad') $q$, v_o, c_w2));
  perform pg_temp.eq('W1 stays readable through the crew history',
    pg_temp.seen($q$ select id from public.workers where id = '44444444-0000-4000-8000-000000000001' $q$), 'W1');
  perform pg_temp.as_owner();
end $$;
