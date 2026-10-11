-- 15 · Review round 7 (PR #9, cubic + adversarial pass on round 6, 2026-10-11) — migration review_pr9_cubic_round2.
-- H1 update_incident refuses an empty patch and never detaches an incident from its jornada · H3 check-in/out under an
-- open blocking incident update the status to resume · H4 a supervisor owns a case only inside the order's unit · H5
-- upsert_site locks clients before the site · H2 (last) drop_demo_data refuses while a surviving order names a demo
-- material or demo worker. H2 runs only while the demo dataset is loaded; the fixture order also gets an incident and a
-- case so no table the drop would empty (and whose folio sequence it would reset) can end empty, even on a regression.
do $$
declare
  c_adm1 constant uuid := '22222222-0000-4000-8000-000000000002';
  c_sup1 constant uuid := '22222222-0000-4000-8000-000000000004';
  c_j1 constant uuid := '66666666-1000-4000-8000-000000000001';
  c_inc constant uuid := 'dddddddd-1500-4000-8000-000000000001';
  v_o uuid;
  v_o2 uuid;
  v_o3 uuid;
  v_material text;
  v_worker uuid;
begin
  v_o := pg_temp.new_order(1);
  v_o2 := pg_temp.new_order(2);
  v_o3 := pg_temp.new_order(3);

  ------------------------------------------------------------------ H1 · update_incident patch rules
  perform pg_temp.as_user(c_sup1);
  perform public.add_incident(gen_random_uuid(), c_inc, v_o, 'otra', 'media', 'Acceso restringido', false, c_j1);
  perform pg_temp.err('empty patch', format($q$ select public.update_incident(gen_random_uuid(), %L, '{}') $q$, c_inc), 'PT422', 'empty_patch');
  perform pg_temp.err('detaching the incident from its jornada',
    format($q$ select public.update_incident(gen_random_uuid(), %L, '{"jornada_id": null}') $q$, c_inc), 'PT422', 'jornada_required');
  perform pg_temp.err('a jornada of another order',
    format($q$ select public.update_incident(gen_random_uuid(), %L, '{"jornada_id": "66666666-1000-4000-8000-000000000002"}') $q$, c_inc), 'PT422', 'jornada_order_mismatch');
  perform pg_temp.ok('other fields still edit', format($q$ select public.update_incident(gen_random_uuid(), %L, '{"severity": "baja"}') $q$, c_inc));
  perform pg_temp.as_owner();
  perform pg_temp.eq('the incident keeps its jornada', (select jornada_id::text from public.incidents where id = c_inc), c_j1::text);

  ------------------------------------------------------------------ H3 · field capture under a blocking incident
  perform pg_temp.as_user(c_sup1);
  perform public.assign_crew(gen_random_uuid(), v_o3, array['44444444-0000-4000-8000-000000000001']::uuid[], 'Inicial');
  perform public.set_order_status(gen_random_uuid(), v_o3, 'reprogramada', 'El cliente movió la fecha');
  perform public.add_incident(gen_random_uuid(), 'dddddddd-1500-4000-8000-000000000003', v_o3, 'otra', 'alta', 'Acceso bloqueado', true);
  perform pg_temp.eq('check-in under the incident keeps con_incidencia',
    public.check_in(gen_random_uuid(), '66666666-1000-4000-8000-000000000003', now() - interval '3 hours', 25.7, -100.3, 10) ->> 'order_status', 'con_incidencia');
  perform pg_temp.as_owner();
  perform pg_temp.eq('…and the order now resumes en_ejecucion, not Reprogramada', (select previous_status::text from public.orders where id = v_o3), 'en_ejecucion');
  perform pg_temp.as_user(c_sup1);
  perform public.check_out(gen_random_uuid(), '66666666-1000-4000-8000-000000000003', now() - interval '1 hour', 25.7, -100.3, 10);
  perform pg_temp.eq('resolving after the work was done resumes pendiente_validacion',
    public.resolve_incident(gen_random_uuid(), 'dddddddd-1500-4000-8000-000000000003', 'Se liberó el acceso') ->> 'order_status', 'pendiente_validacion');

  ------------------------------------------------------------------ H5 · upsert_site: clients before the site
  perform pg_temp.as_owner();
  perform pg_temp.check('upsert_site locks both clients in id order before the site, and detects a site that changed client',
    pg_get_functiondef('private.upsert_site(uuid,uuid,uuid,text,double precision,double precision,text,text)'::regprocedure)
      ~ 'order by c\.id for share[^$]*from public\.sites s where s\.id = p_site_id for update[^$]*site_changed');
  perform pg_temp.as_user(c_adm1);
  perform pg_temp.ok('an existing site still saves', $q$ select public.upsert_site(gen_random_uuid(), '33333333-1000-4000-8000-000000000004', '33333333-0000-4000-8000-000000000001', 'Bodega Uno', 25.71, -100.31) $q$);

  ------------------------------------------------------------------ H4 · case owners belong to the order's unit
  perform pg_temp.as_owner();
  update public.profiles set unit_id = '11111111-0000-4000-8000-000000000002' where id = c_sup1;   -- moved without the guard
  perform pg_temp.as_user(c_adm1);
  perform pg_temp.err('the order''s supervisor from another unit cannot own its case',
    format($q$ select public.create_case(gen_random_uuid(), gen_random_uuid(), %L, 'calidad', 'media', 'telefono', 'Polvo en ventanas', %L, current_date) $q$, v_o2, c_sup1),
    'PT422', 'invalid_case_owner');
  perform pg_temp.as_owner();
  update public.profiles set unit_id = '11111111-0000-4000-8000-000000000001' where id = c_sup1;

  ------------------------------------------------------------------ H2 · demo references without a foreign key
  select r.row_id into v_material from private.demo_rows r where r.table_name = 'materials' order by r.row_id limit 1;
  select r.row_id::uuid into v_worker from private.demo_rows r where r.table_name = 'workers' order by r.row_id limit 1;
  if v_material is null or v_worker is null then
    raise notice '15 · H2 skipped: the demo dataset is not loaded';
    return;
  end if;
  perform pg_temp.as_user(c_adm1);
  perform public.create_case(gen_random_uuid(), gen_random_uuid(), v_o, 'calidad', 'media', 'telefono', 'Polvo en ventanas', c_adm1, current_date);
  perform pg_temp.as_owner();
  update public.orders set materials = jsonb_build_array(jsonb_build_object('material_id', v_material, 'qty', 1)) where id = v_o;
  perform pg_temp.err('a real order naming a demo material blocks the drop', $q$ select private.drop_demo_data() $q$, 'PT409', 'demo_in_use');
  update public.orders set materials = '[]' where id = v_o;
  update public.jornadas set worker_ids = array[v_worker] where id = c_j1;
  perform pg_temp.err('a real crew naming a demo worker blocks the drop', $q$ select private.drop_demo_data() $q$, 'PT409', 'demo_in_use');
  perform pg_temp.check('nothing was deleted', exists (select 1 from private.demo_rows));
end $$;
