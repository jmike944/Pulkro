-- 11 · Review round 3 (PR #9, cubic, 2026-10-11) — migration review_pr9_cubic. C1 op ids fail closed when only one side
-- carries the request digest · C2 service hours 0.5–24 · C3 breakdown lines need numeric hours · C4 survey tokens without
-- repeated sequences · C5 incident resolution fields all-or-nothing · C6 a conformity method needs the client's name.
do $$
declare
  c_dir constant uuid := '22222222-0000-4000-8000-000000000001';
  c_sup1 constant uuid := '22222222-0000-4000-8000-000000000004';
  c_j1 constant uuid := '66666666-1000-4000-8000-000000000001';
  v_o uuid;
  v_op uuid := gen_random_uuid();
  v_op2 uuid := gen_random_uuid();
  v_op3 uuid := gen_random_uuid();
  v_note uuid := gen_random_uuid();
  v_unbound text;
begin
  v_o := pg_temp.new_order(1);

  ------------------------------------------------------------------ C1 · op id ↔ request digest, NULL included
  perform pg_temp.as_user(c_sup1);
  perform pg_temp.ok('note through the wrapper (digest stored)',
    format($q$ select public.add_jornada_note(%L, %L, %L, 'Nota de prueba') $q$, v_op, v_note, c_j1));
  perform pg_temp.eq('same request through the wrapper → duplicate',
    pg_temp.ok('retry', format($q$ select public.add_jornada_note(%L, %L, %L, 'Nota de prueba') ->> 'duplicate' $q$, v_op, v_note, c_j1)), 'true');
  -- the implementation called without the wrapper's binding (no digest) cannot claim a request that had one
  perform pg_temp.as_owner();
  perform set_config('request.jwt.claims', json_build_object('sub', c_sup1, 'role', 'authenticated')::text, true);
  perform set_config('pulkro.op_args', '', true);
  perform pg_temp.err('unbound replay of a bound op id',
    format($q$ select private.add_jornada_note(%L, %L, %L, 'Otra nota distinta') $q$, v_op, gen_random_uuid(), c_j1), 'PT409', 'op_id_reused');
  -- and a stored op without digest cannot be claimed by a bound request with other arguments
  insert into private.sync_ops (op_id, actor_id, action, args_hash) values (v_op2, c_sup1, 'add_jornada_note', null);
  perform pg_temp.as_user(c_sup1);
  perform pg_temp.err('bound replay of an unbound op id',
    format($q$ select public.add_jornada_note(%L, %L, %L, 'Nota de prueba') $q$, v_op2, gen_random_uuid(), c_j1), 'PT409', 'op_id_reused');
  -- two unbound calls with the same op id stay idempotent (internal callers)
  perform pg_temp.as_owner();
  perform set_config('request.jwt.claims', json_build_object('sub', c_sup1, 'role', 'authenticated')::text, true);
  perform set_config('pulkro.op_args', '', true);
  v_unbound := format($q$ select private.add_jornada_note(%L, %L, %L, 'Nota interna') ->> 'duplicate' $q$, v_op3, gen_random_uuid(), c_j1);
  perform pg_temp.ok('first unbound call', v_unbound);
  perform pg_temp.eq('second unbound call → duplicate', pg_temp.ok('second unbound call', v_unbound), 'true');
  perform pg_temp.as_owner();

  ------------------------------------------------------------------ C2 · hours per day 0.5–24
  perform pg_temp.as_user(c_dir);
  perform pg_temp.err('0.4 h per day refused', $q$ select public.upsert_service_type(gen_random_uuid(), gen_random_uuid(), 'Limpieza ligera', 'Ligera', 0.4) $q$, 'PT422', 'invalid_hours');
  perform pg_temp.err('24.5 h per day refused', $q$ select public.upsert_service_type(gen_random_uuid(), gen_random_uuid(), 'Limpieza ligera', 'Ligera', 24.5) $q$, 'PT422', 'invalid_hours');
  perform pg_temp.ok('0.5 h per day accepted', $q$ select public.upsert_service_type(gen_random_uuid(), gen_random_uuid(), 'Limpieza ligera', 'Ligera', 0.5) $q$);
  perform pg_temp.as_owner();
  perform pg_temp.err('table check: 0.4 h', $q$ insert into public.service_types (id, name, short, default_hours_per_day) values (gen_random_uuid(), 'Directa', 'Directa', 0.4) $q$, '23514');

  ------------------------------------------------------------------ C3 · every breakdown line has numeric hours
  perform pg_temp.as_user(c_sup1);
  perform pg_temp.err('line without hours', format($q$ select public.set_jornada_breakdown(gen_random_uuid(), %L, '[{"activity": "Barrido"}]') $q$, c_j1), 'PT422', 'invalid_breakdown');
  perform pg_temp.err('line with null hours', format($q$ select public.set_jornada_breakdown(gen_random_uuid(), %L, '[{"activity": "Barrido", "hours": null}]') $q$, c_j1), 'PT422', 'invalid_breakdown');
  perform pg_temp.err('hours as text', format($q$ select public.set_jornada_breakdown(gen_random_uuid(), %L, '[{"activity": "Barrido", "hours": "2"}]') $q$, c_j1), 'PT422', 'invalid_breakdown');
  perform pg_temp.err('line without activity', format($q$ select public.set_jornada_breakdown(gen_random_uuid(), %L, '[{"hours": 2}]') $q$, c_j1), 'PT422', 'invalid_breakdown');
  perform pg_temp.err('more than 24 h', format($q$ select public.set_jornada_breakdown(gen_random_uuid(), %L, '[{"activity": "Barrido", "hours": 20}, {"activity": "Trapeado", "hours": 5}]') $q$, c_j1), 'PT422', 'invalid_breakdown');
  perform pg_temp.ok('valid breakdown', format($q$ select public.set_jornada_breakdown(gen_random_uuid(), %L, '[{"activity": "Barrido", "hours": 3}, {"activity": "Trapeado", "hours": 2.5}]') $q$, c_j1));
  perform pg_temp.as_owner();
  perform pg_temp.eq('stored breakdown', (select breakdown::text from public.jornadas where id = c_j1),
    '[{"hours": 3, "activity": "Barrido"}, {"hours": 2.5, "activity": "Trapeado"}]');

  ------------------------------------------------------------------ C4 · survey tokens
  perform pg_temp.err('16-character cycle', $q$ select private.check_token(rpad('', 43, 'k3Vq9_xT2mZ8pLw-')) $q$, 'PT422', 'weak_token');
  perform pg_temp.err('37-character period (one 6-character repeat)', $q$ select private.check_token(rpad('', 43, 'k3Vq9_xT2mZ8pLw-aBcDeFgHiJ0123456789r')) $q$, 'PT422', 'weak_token');
  perform pg_temp.eq('500 random 256-bit tokens accepted', (
    select count(*)::text from generate_series(1, 500) g,
      lateral (select translate(rtrim(encode(decode(md5(random()::text || g) || md5(random()::text || -g), 'hex'), 'base64'), '='), '+/', '-_') as t) x
    where private.check_token(x.t) = x.t), '500');

  ------------------------------------------------------------------ C5 · incident resolution all-or-nothing
  perform pg_temp.as_user(c_sup1);
  perform public.add_incident(gen_random_uuid(), 'dddddddd-1100-4000-8000-000000000001', v_o, 'otra', 'media', 'Acceso restringido', false);
  perform pg_temp.as_owner();
  perform pg_temp.err('open incident with only resolved_at',
    $q$ update public.incidents set resolved_at = now() where id = 'dddddddd-1100-4000-8000-000000000001' $q$, '23514');
  perform pg_temp.err('open incident with only resolved_by',
    format($q$ update public.incidents set resolved_by = %L where id = 'dddddddd-1100-4000-8000-000000000001' $q$, c_sup1), '23514');
  perform pg_temp.err('resolved incident without resolution text',
    format($q$ update public.incidents set status = 'resuelta', resolved_at = now(), resolved_by = %L where id = 'dddddddd-1100-4000-8000-000000000001' $q$, c_sup1), '23514');
  perform pg_temp.as_user(c_sup1);
  perform pg_temp.ok('resolution through the RPC', $q$ select public.resolve_incident(gen_random_uuid(), 'dddddddd-1100-4000-8000-000000000001', 'Se obtuvo acceso con el contacto') $q$);
  perform pg_temp.as_owner();

  ------------------------------------------------------------------ C6 · conformity method needs the client's name
  perform pg_temp.err('method without name',
    format($q$ insert into public.order_closures (id, order_id, version, summary, conformity_method, validated_by)
               values (gen_random_uuid(), %L, 99, 'Servicio realizado completo', 'verbal', %L) $q$, v_o, c_sup1), '23514');
  perform pg_temp.err('method with a blank name',
    format($q$ insert into public.order_closures (id, order_id, version, summary, conformity_method, conformity_name, validated_by)
               values (gen_random_uuid(), %L, 99, 'Servicio realizado completo', 'verbal', '  ', %L) $q$, v_o, c_sup1), '23514');
  perform pg_temp.ok('method with a name',
    format($q$ insert into public.order_closures (id, order_id, version, summary, conformity_method, conformity_name, validated_by)
               values (gen_random_uuid(), %L, 99, 'Servicio realizado completo', 'verbal', 'Ana López', %L) returning id $q$, v_o, c_sup1));
  perform pg_temp.ok('no method, no name',
    format($q$ insert into public.order_closures (id, order_id, version, summary, validated_by)
               values (gen_random_uuid(), %L, 98, 'Servicio realizado completo', %L) returning id $q$, v_o, c_sup1));
end $$;
