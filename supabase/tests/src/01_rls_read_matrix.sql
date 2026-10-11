-- 01 · SELECT visibility for every table × every persona (mirrors canSeeOrder, useScopedCatalog, canSeeAuditEntry).
-- Fixture: O1 (U1, SUP1, created by ADM1) · O2 (U1, SUP2, created by ADM1) · O3 (U2, SUP3, created by ADM2),
-- each with exactly one row in every child table, inserted directly as the table owner.
do $$
declare
  n integer;
  v_order uuid; v_unit uuid; v_sup uuid; v_adm uuid; v_client uuid; v_site uuid;
  v_case_owner uuid; v_case_creator uuid;
  v_j uuid; v_inc uuid; v_photo uuid; v_cl uuid; v_rep uuid; v_case uuid; v_sv uuid;
begin
  for n in 1..3 loop
    v_order := pg_temp.label(('55555555-0000-4000-8000-00000000000' || n)::uuid, 'O' || n);
    v_unit := case when n < 3 then '11111111-0000-4000-8000-000000000001'::uuid else '11111111-0000-4000-8000-000000000002'::uuid end;
    v_sup := ('22222222-0000-4000-8000-00000000000' || (n + 3))::uuid;                      -- SUP1, SUP2, SUP3
    v_adm := case when n < 3 then '22222222-0000-4000-8000-000000000002'::uuid else '22222222-0000-4000-8000-000000000003'::uuid end;
    v_client := ('33333333-0000-4000-8000-00000000000' || n)::uuid;
    v_site := ('33333333-1000-4000-8000-00000000000' || n)::uuid;
    v_case_owner := case n when 1 then v_sup when 2 then v_adm else v_sup end;               -- K1 SUP1 · K2 ADM1 · K3 SUP3
    v_case_creator := case n when 2 then v_sup else v_adm end;                              -- K1 ADM1 · K2 SUP2 · K3 ADM2
    v_j := pg_temp.label(('55555555-1000-4000-8000-00000000000' || n)::uuid, 'J' || n);
    v_inc := pg_temp.label(('55555555-5000-4000-8000-00000000000' || n)::uuid, 'I' || n);
    v_photo := pg_temp.label(('55555555-6000-4000-8000-00000000000' || n)::uuid, 'P' || n);
    v_cl := pg_temp.label(('55555555-7000-4000-8000-00000000000' || n)::uuid, 'CL' || n);
    v_rep := pg_temp.label(('55555555-8000-4000-8000-00000000000' || n)::uuid, 'R' || n);
    v_case := pg_temp.label(('55555555-a000-4000-8000-00000000000' || n)::uuid, 'K' || n);
    v_sv := pg_temp.label(('55555555-c000-4000-8000-00000000000' || n)::uuid, 'SV' || n);

    insert into public.orders (id, folio, unit_id, client_id, site_id, service_type_id, supervisor_id, status, title, scheduled_start, scheduled_end, created_by)
    values (v_order, 'OS-9000' || n, v_unit, v_client, v_site, '33333333-2000-4000-8000-000000000001', v_sup, 'seguimiento', 'Orden matriz ' || n, now(), now(), v_adm);
    insert into public.jornadas (id, order_id, day_index, date, planned_start, planned_end, status)
    values (v_j, v_order, 1, current_date, now() - interval '8 hours', now(), 'cerrada');
    insert into public.crew_changes (order_id, jornada_id, worker_ids, reason, created_by) values (v_order, v_j, '{}', 'Asignación', v_sup);
    insert into public.jornada_checks (jornada_id, order_id, kind, device_at, lat, lng, accuracy, source, created_by)
    values (v_j, v_order, 'entrada', now() - interval '8 hours', 25.7, -100.3, 10, 'gps', v_sup);
    insert into public.jornada_notes (id, jornada_id, order_id, text, created_by) values (gen_random_uuid(), v_j, v_order, 'Nota', v_sup);
    insert into public.incidents (id, folio, order_id, jornada_id, type, severity, description, created_by)
    values (v_inc, 'INC-900' || n, v_order, v_j, 'otra', 'baja', 'Incidencia de matriz', v_sup);
    insert into public.post_sale_cases (id, folio, order_id, client_id, category, severity, channel, description, owner_id, due_date, created_by)
    values (v_case, 'PV-900' || n, v_order, v_client, 'calidad', 'media', 'telefono', 'Caso de matriz', v_case_owner, current_date + 3, v_case_creator);
    insert into public.case_events (case_id, order_id, text, created_by) values (v_case, v_order, 'Caso registrado y asignado.', v_case_creator);
    perform pg_temp.put_object(v_order, 'antes', v_photo);
    insert into public.photos (id, order_id, jornada_id, kind, area, taken_at, taken_at_source, storage_path, mime_type, bytes, created_by)
    values (v_photo, v_order, v_j, 'antes', 'Lobby', now() - interval '7 hours', 'device',
            format('orders/%s/antes/%s.jpg', v_order, v_photo), 'image/jpeg', 2048, v_sup);
    insert into public.order_closures (id, order_id, version, summary, validated_by) values (v_cl, v_order, 1, 'Cierre de la matriz', v_sup);
    insert into public.reports (id, order_id, closure_id, version, snapshot, generated_by) values (v_rep, v_order, v_cl, 1, '{}', v_sup);
    insert into public.report_shares (id, report_id, order_id, channel, recipient, created_by) values (gen_random_uuid(), v_rep, v_order, 'whatsapp', '+52 81 0000 0000', v_sup);
    insert into public.surveys (id, order_id, client_id, channel, sent_by) values (v_sv, v_order, v_client, 'whatsapp', v_sup);
    insert into public.survey_tokens (survey_id, order_id, token) values (v_sv, v_order, 'MatrixToken_' || n || '_abcdefghijklmnopqrstuvwxyz0123456789');
  end loop;

  -- Bitácora: A1 order O1 by SUP1 · A2 order O3 by SUP3 · A3 no order, unit U1, by ADM1 · A4 no order, unit U2, by DIR
  -- (a Dirección edit to another unit's catalog) · A5 no order, unit U1, by SUP1 (own contact) · A6 no order, U2, by ADM2
  insert into public.audit_log (actor_id, actor_name, entity, entity_id, order_id, unit_id, action) values
    ('22222222-0000-4000-8000-000000000004', 'Supervisora Uno', 'orden', '55555555-0000-4000-8000-000000000001', '55555555-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'A1'),
    ('22222222-0000-4000-8000-000000000006', 'Supervisor Tres', 'orden', '55555555-0000-4000-8000-000000000003', '55555555-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000002', 'A2'),
    ('22222222-0000-4000-8000-000000000002', 'Administración Uno', 'catalogo', '33333333-0000-4000-8000-000000000001', null, '11111111-0000-4000-8000-000000000001', 'A3'),
    ('22222222-0000-4000-8000-000000000001', 'Dirección Prueba', 'catalogo', '33333333-0000-4000-8000-000000000003', null, '11111111-0000-4000-8000-000000000002', 'A4'),
    ('22222222-0000-4000-8000-000000000004', 'Supervisora Uno', 'usuario', '22222222-0000-4000-8000-000000000004', null, '11111111-0000-4000-8000-000000000001', 'A5'),
    ('22222222-0000-4000-8000-000000000003', 'Administración Dos', 'catalogo', '44444444-0000-4000-8000-000000000003', null, '11111111-0000-4000-8000-000000000002', 'A6');
end $$;

-- Expected visibility per persona. Child tables carry exactly one row per order, so their order_id list must equal
-- the persona's order list (no duplicates, no leaks).
do $$
declare
  p record;
  v_t text;
  v_children text[] := array['jornadas', 'crew_changes', 'jornada_checks', 'jornada_notes', 'incidents', 'post_sale_cases',
    'case_events', 'photos', 'order_closures', 'reports', 'report_shares', 'surveys'];
begin
  for p in select * from (values
    ('DIR',   '22222222-0000-4000-8000-000000000001'::uuid, 'O1,O2,O3', 'U1,U2', 'ADM1,ADM2,DIR,INACT,SUP1,SUP2,SUP3', 'W1,W2,W3,W4', 'C1,C2,C3', 'S1,S2,S3,S4', 'ST', 'MAT', '',         'A1,A2,A3,A4,A5,A6'),
    ('ADM1',  '22222222-0000-4000-8000-000000000002'::uuid, 'O1,O2',    'U1',    'ADM1,DIR,INACT,SUP1,SUP2',          'W1,W2,W4',    'C1,C2',    'S1,S2,S4',    'ST', 'MAT', 'O1,O2',    'A1,A3,A5'),
    ('ADM2',  '22222222-0000-4000-8000-000000000003'::uuid, 'O3',       'U2',    'ADM2,DIR,SUP3',                     'W3',          'C3',       'S3',          'ST', 'MAT', 'O3',       'A2,A4,A6'),
    ('SUP1',  '22222222-0000-4000-8000-000000000004'::uuid, 'O1',       'U1',    'ADM1,SUP1',                         'W1,W2,W4',    'C1',       'S1',          'ST', 'MAT', 'O1',       'A1,A5'),
    ('SUP2',  '22222222-0000-4000-8000-000000000005'::uuid, 'O2',       'U1',    'ADM1,SUP2',                         'W1,W2,W4',    'C2',       'S2',          'ST', 'MAT', 'O2',       ''),
    ('SUP3',  '22222222-0000-4000-8000-000000000006'::uuid, 'O3',       'U2',    'ADM2,SUP3',                         'W3',          'C3',       'S3',          'ST', 'MAT', 'O3',       'A2'),
    ('INACT', '22222222-0000-4000-8000-000000000007'::uuid, '',         '',      '',                                  '',            '',         '',            '',   '',    '',         ''),
    ('NOPROF','22222222-0000-4000-8000-000000000008'::uuid, '',         '',      '',                                  '',            '',         '',            '',   '',    '',         '')
  ) as x(who, id, orders, units, profiles, workers, clients, sites, service_types, materials, tokens, audit)
  loop
    perform pg_temp.as_user(p.id);
    perform pg_temp.eq(p.who || ' · orders', pg_temp.seen('select id from public.orders'), p.orders);
    foreach v_t in array v_children loop
      perform pg_temp.eq(p.who || ' · ' || v_t, pg_temp.seen(format('select order_id from public.%I', v_t)), p.orders);
    end loop;
    perform pg_temp.eq(p.who || ' · survey_tokens', pg_temp.seen('select order_id from public.survey_tokens'), p.tokens);
    perform pg_temp.eq(p.who || ' · units', pg_temp.seen('select id from public.units'), p.units);
    perform pg_temp.eq(p.who || ' · profiles', pg_temp.seen('select id from public.profiles'), p.profiles);
    perform pg_temp.eq(p.who || ' · workers', pg_temp.seen('select id from public.workers'), p.workers);
    perform pg_temp.eq(p.who || ' · clients', pg_temp.seen('select id from public.clients'), p.clients);
    perform pg_temp.eq(p.who || ' · sites', pg_temp.seen('select id from public.sites'), p.sites);
    perform pg_temp.eq(p.who || ' · service_types', pg_temp.seen('select id from public.service_types'), p.service_types);
    perform pg_temp.eq(p.who || ' · materials', pg_temp.seen('select id from public.materials'), p.materials);
    perform pg_temp.eq(p.who || ' · audit_log', (select coalesce(string_agg(action, ',' order by action), '') from public.audit_log a
      where not exists (select 1 from pg_temp.t_demo d where d.table_name = 'audit_log' and d.row_id = a.id::text)), p.audit);
    perform pg_temp.eq(p.who || ' · storage evidencias',
      pg_temp.seen('select private.evidence_order_id(name) from storage.objects where bucket_id = ''evidencias'''), p.orders);
    perform pg_temp.as_owner();
  end loop;
end $$;

-- anon (publishable key, no session): no table is readable at all; no evidence object is listable.
do $$
declare
  v_t text;
begin
  perform pg_temp.as_anon();
  foreach v_t in array array['units', 'profiles', 'workers', 'clients', 'sites', 'service_types', 'materials', 'orders',
    'jornadas', 'crew_changes', 'jornada_checks', 'jornada_notes', 'incidents', 'post_sale_cases', 'case_events', 'photos',
    'order_closures', 'reports', 'report_shares', 'surveys', 'survey_tokens', 'audit_log'] loop
    perform pg_temp.err('anon select ' || v_t, format('select 1 from public.%I limit 1', v_t), '42501');
  end loop;
  perform pg_temp.eq('anon storage objects', (select count(*)::text from storage.objects where bucket_id = 'evidencias'), '0');
  perform pg_temp.as_owner();
end $$;

-- Scope moves with the data: reassigning O1 from SUP1 to SUP2 moves every child row with it (no stale access).
do $$
begin
  update public.orders set supervisor_id = '22222222-0000-4000-8000-000000000005' where id = '55555555-0000-4000-8000-000000000001';
  perform pg_temp.as_user('22222222-0000-4000-8000-000000000004');
  perform pg_temp.eq('SUP1 after reassignment · orders', pg_temp.seen('select id from public.orders'), '');
  perform pg_temp.eq('SUP1 after reassignment · photos', pg_temp.seen('select order_id from public.photos'), '');
  perform pg_temp.eq('SUP1 after reassignment · clients', pg_temp.seen('select id from public.clients'), '');
  perform pg_temp.as_user('22222222-0000-4000-8000-000000000005');
  perform pg_temp.eq('SUP2 after reassignment · orders', pg_temp.seen('select id from public.orders'), 'O1,O2');
  perform pg_temp.eq('SUP2 after reassignment · incidents', pg_temp.seen('select order_id from public.incidents'), 'O1,O2');
  perform pg_temp.as_owner();
end $$;
