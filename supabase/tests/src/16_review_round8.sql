-- 16 · Review round 8 (PR #9, cubic, 2026-10-11) — migration review_pr9_cubic_round3. J1 every person recorded on a visible
-- order stays readable: the catalog lists every foreign key to profiles (audit_log aside: it keeps actor_name), and
-- referenced_profile_ids must read each one; a report shared by someone only that share names is readable by the order's
-- supervisor, not by an unrelated supervisor.
do $$
declare
  c_adm2 constant uuid := '22222222-0000-4000-8000-000000000003';
  c_sup1 constant uuid := '22222222-0000-4000-8000-000000000004';
  c_sup3 constant uuid := '22222222-0000-4000-8000-000000000006';
  v_def text;
  v_o uuid;
  r record;
begin
  v_def := pg_get_functiondef('private.referenced_profile_ids()'::regprocedure);
  for r in
    select format('%I.%I', n.nspname, cl.relname) as tbl, a.attname as col
    from pg_constraint c
    join pg_class cl on cl.oid = c.conrelid
    join pg_namespace n on n.oid = cl.relnamespace
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f' and c.confrelid = 'public.profiles'::regclass and n.nspname = 'public'
      and cl.relname not in ('audit_log', 'profiles')
    order by 1, 2
  loop
    perform pg_temp.check('referenced_profile_ids reads ' || r.tbl || '.' || r.col,
      v_def ~ ('select t\.' || r.col || '( as id)? from ' || replace(r.tbl, '.', '\.') || ' t, v'));
  end loop;

  v_o := pg_temp.new_order(1);
  insert into public.order_closures (id, order_id, version, summary, validated_by)
  values ('c1c1c1c1-1600-4000-8000-000000000001', v_o, 1, 'Cierre de prueba', c_sup1);
  insert into public.reports (id, order_id, closure_id, version, snapshot, generated_by)
  values ('c2c2c2c2-1600-4000-8000-000000000001', v_o, 'c1c1c1c1-1600-4000-8000-000000000001', 1, '{}', c_sup1);
  insert into public.report_shares (id, report_id, order_id, channel, recipient, created_by)
  values (gen_random_uuid(), 'c2c2c2c2-1600-4000-8000-000000000001', v_o, 'whatsapp', '+52 81 0000 0000', c_adm2);
  perform pg_temp.as_user(c_sup1);
  perform pg_temp.eq('the order''s supervisor reads who shared its report',
    pg_temp.seen(format($q$ select id from public.profiles where id = %L $q$, c_adm2)), 'ADM2');
  perform pg_temp.as_user(c_sup3);
  perform pg_temp.eq('an unrelated supervisor does not',
    pg_temp.seen(format($q$ select id from public.profiles where id = %L $q$, c_adm2)), '');
  perform pg_temp.as_owner();
end $$;
