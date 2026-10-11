-- 12 · Review round 4 (PR #9, cubic, 2026-10-11) — migration review_pr9_cubic_wrappers. C7 request digests use SHA-256 ·
-- C8 a bad input value answers PT422 invalid_value (never a raw SQLSTATE), while duplicates (23505) and business errors
-- (PTnnn) pass through · C9 check-out derives the order status from every live jornada.
do $$
declare
  c_dir constant uuid := '22222222-0000-4000-8000-000000000001';
  c_adm1 constant uuid := '22222222-0000-4000-8000-000000000002';
  c_sup1 constant uuid := '22222222-0000-4000-8000-000000000004';
  c_u1 constant uuid := '11111111-0000-4000-8000-000000000001';
  c_c1 constant uuid := '33333333-0000-4000-8000-000000000001';
  c_o2 constant uuid := '66666666-0000-4000-8000-000000000002';
  c_ja constant uuid := '66666666-1000-4000-8000-0000000000a2';
  c_jb constant uuid := '66666666-1000-4000-8000-0000000000b2';
  v_o uuid;
  v_op uuid := gen_random_uuid();
  v_bad text;
begin
  v_o := pg_temp.new_order(1);

  ------------------------------------------------------------------ C7 · SHA-256 digests
  select string_agg(p.proname, ', ' order by p.proname) into v_bad
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosrc like '%pulkro.op_args%' and (p.prosrc not like '%sha256%' or p.prosrc like '%md5%');
  perform pg_temp.eq('every binding wrapper digests with SHA-256 (none with MD5)', coalesce(v_bad, ''), '');
  perform pg_temp.as_user(c_sup1);
  perform public.add_jornada_note(v_op, gen_random_uuid(), '66666666-1000-4000-8000-000000000001', 'Nota con digest');
  perform pg_temp.as_owner();
  perform pg_temp.check('stored digest is a SHA-256 hex string',
    (select args_hash ~ '^[0-9a-f]{64}$' from private.sync_ops where op_id = v_op));

  ------------------------------------------------------------------ C8 · invalid values → PT422 invalid_value
  select string_agg(p.proname, ', ' order by p.proname) into v_bad
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in (select q.proname from pg_proc q join pg_namespace m on m.oid = q.pronamespace where m.nspname = 'private' and q.prosecdef)
    and p.prosrc not like '%invalid_value%';
  perform pg_temp.eq('every RPC wrapper maps invalid values', coalesce(v_bad, ''), '');
  perform pg_temp.as_user(c_adm1);
  perform pg_temp.ok('a case to edit', format($q$ select public.create_case(gen_random_uuid(), 'abababab-1200-4000-8000-000000000001', %L, 'calidad', 'media', 'telefono', 'Polvo en ventanas', %L, current_date) $q$, v_o, c_adm1));
  perform pg_temp.err('case status set to null (NOT NULL)', $q$ select public.update_case(gen_random_uuid(), 'abababab-1200-4000-8000-000000000001', '{"status": null}') $q$, 'PT422', 'invalid_value');
  perform pg_temp.err('case category set to null (NOT NULL)', $q$ select public.update_case(gen_random_uuid(), 'abababab-1200-4000-8000-000000000001', '{"category": null}') $q$, 'PT422', 'invalid_value');
  perform pg_temp.err('new case without category', format($q$ select public.create_case(gen_random_uuid(), gen_random_uuid(), %L, null, 'media', 'telefono', 'Polvo en ventanas', %L, current_date) $q$, v_o, c_adm1), 'PT422', 'invalid_value');
  perform pg_temp.err('client hue out of range (CHECK)', format($q$ select public.upsert_client(gen_random_uuid(), gen_random_uuid(), 'Cliente Nuevo SA', 'Nuevo', 'Industrial', %L, p_hue => 400) $q$, c_u1), 'PT422', 'invalid_value');
  perform pg_temp.err('client hue overflowing smallint', format($q$ select public.upsert_client(gen_random_uuid(), gen_random_uuid(), 'Cliente Nuevo SA', 'Nuevo', 'Industrial', %L, p_hue => 40000) $q$, c_u1), 'PT422', 'invalid_value');
  perform pg_temp.err('site latitude out of range (CHECK)', format($q$ select public.upsert_site(gen_random_uuid(), gen_random_uuid(), %L, 'Sitio Nuevo', 91, -100.3) $q$, c_c1), 'PT422', 'invalid_value');
  perform pg_temp.as_user(c_dir);
  perform pg_temp.err('unit code of one character (CHECK)', $q$ select public.upsert_unit(gen_random_uuid(), gen_random_uuid(), 'Unidad Nueva', 'X') $q$, 'PT422', 'invalid_value');
  perform pg_temp.as_user(c_adm1);
  perform pg_temp.err('duplicate ids still answer 23505',
    format($q$ select public.create_case(gen_random_uuid(), 'abababab-1200-4000-8000-000000000001', %L, 'calidad', 'media', 'telefono', 'Otra queja', %L, current_date) $q$, v_o, c_adm1), '23505');
  perform pg_temp.err('business errors keep their own hint', $q$ select public.update_case(gen_random_uuid(), 'abababab-1200-4000-8000-000000000001', '{}') $q$, 'PT422', 'empty_patch');
  perform pg_temp.as_owner();

  ------------------------------------------------------------------ C9 · check-out while another day is in progress
  perform pg_temp.as_user(c_adm1);
  perform public.create_order(gen_random_uuid(), c_o2, c_c1, '33333333-1000-4000-8000-000000000001', '33333333-2000-4000-8000-000000000001', c_sup1,
    'Orden de dos jornadas',
    jsonb_build_array(
      jsonb_build_object('id', c_ja, 'date', current_date, 'planned_start', now() - interval '6 hours', 'planned_end', now() - interval '3 hours'),
      jsonb_build_object('id', c_jb, 'date', current_date, 'planned_start', now() - interval '2 hours', 'planned_end', now() + interval '2 hours')));
  perform pg_temp.as_user(c_sup1);
  perform public.assign_crew(gen_random_uuid(), c_o2, array['44444444-0000-4000-8000-000000000001']::uuid[], 'Inicial');
  perform public.check_in(gen_random_uuid(), c_ja, now() - interval '5 hours', 25.7, -100.3, 10);
  perform public.check_in(gen_random_uuid(), c_jb, now() - interval '90 minutes', 25.7, -100.3, 10);
  perform pg_temp.eq('day A checked out while day B is in progress → still en_ejecucion',
    public.check_out(gen_random_uuid(), c_ja, now() - interval '1 hour', 25.7, -100.3, 10) ->> 'order_status', 'en_ejecucion');
  perform pg_temp.eq('last day checked out → pendiente_validacion',
    public.check_out(gen_random_uuid(), c_jb, now() - interval '5 minutes', 25.7, -100.3, 10) ->> 'order_status', 'pendiente_validacion');
  perform pg_temp.as_owner();
end $$;
