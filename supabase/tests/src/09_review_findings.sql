-- 09 · Adversarial review (2026-10-11) — regression suite. One block per finding; each block asserts the behaviour the
-- backend must have (an invariant, so the fix can evolve without rewriting the check) and records a verdict. Every block
-- runs in its own subtransaction that is always rolled back (sentinel REVIEW_PASS), so the findings are independent of
-- each other. Fixed by migrations review_history_and_defaults, review_sync_and_visibility and review_business_rules;
-- the file fails at the end listing every finding that regressed, and prints 'ok' otherwise.
-- F03 backdates rows with ALTER TABLE … DISABLE TRIGGER (rolled back): it holds ACCESS EXCLUSIVE locks on clients,
-- sites, jornadas and orders for the duration of the file.
create temp table t_review (n serial, finding text, severity text, title text, verdict text) on commit drop;
grant select, insert on t_review to authenticated, anon;
grant usage on sequence t_review_n_seq to authenticated, anon;
create function pg_temp.verdict(p_finding text, p_severity text, p_title text, p_err text) returns void language sql as $$
  insert into pg_temp.t_review (finding, severity, title, verdict)
  values (p_finding, p_severity, p_title, case when p_err = 'REVIEW_PASS' then 'ok' else p_err end);
$$;
-- Runs one RPC call and returns 'ok' or '<sqlstate> <hint>' (never raises).
create function pg_temp.outcome(p_sql text) returns text language plpgsql as $$
declare v_state text; v_hint text;
begin
  execute p_sql;
  return 'ok';
exception when others then
  get stacked diagnostics v_state = returned_sqlstate, v_hint = pg_exception_hint;
  return v_state || ' ' || coalesce(v_hint, '');
end $$;
grant execute on function pg_temp.verdict(text, text, text, text) to public;
grant execute on function pg_temp.outcome(text) to public;

------------------------------------------------------------------------------------------------------------------------
-- F01a · high · an order that was never executed can be closed, reported and shared: no check-in, no ANTES/DESPUÉS,
-- no exception. Order created without days → blocking incident → resolve (fallback = pendiente_validacion) → closure.
------------------------------------------------------------------------------------------------------------------------
do $$
declare
  v_o constant uuid := '99999999-0000-4000-8000-000000000011';
begin
  perform pg_temp.as_user('22222222-0000-4000-8000-000000000002');
  perform public.create_order(gen_random_uuid(), v_o, '33333333-0000-4000-8000-000000000001', '33333333-1000-4000-8000-000000000001',
    '33333333-2000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000004', 'Orden sin jornadas');
  perform pg_temp.as_user('22222222-0000-4000-8000-000000000004');
  perform public.add_incident(gen_random_uuid(), '99999999-5000-4000-8000-000000000011', v_o, 'otra', 'baja', 'Incidencia que bloquea', true);
  perform public.resolve_incident(gen_random_uuid(), '99999999-5000-4000-8000-000000000011', 'Resuelta');
  perform pg_temp.outcome(format($q$ select public.validate_closure(gen_random_uuid(), gen_random_uuid(), %L, 'Servicio realizado completo') $q$, v_o));
  perform pg_temp.as_owner();
  perform pg_temp.check('F01a no closure for an order without any executed jornada (status now '
      || (select status from public.orders where id = v_o) || ')',
    not exists (select 1 from public.order_closures where order_id = v_o));
  raise exception 'REVIEW_PASS';
exception when others then
  perform pg_temp.verdict('F01a', 'high', 'closure of a never-executed order (zero jornadas)', sqlerrm);
end $$;

-- F01b · high · same bypass from a planned order: an empty reschedule tombstones the only (pending) day, a blocking
-- incident is opened and un-flagged, and the closure is validated straight from con_incidencia. Each step is checked on
-- its own: the empty reschedule is refused; a fully tombstoned order (set up directly, as if an older path had done it)
-- leaves con_incidencia for the status its jornadas support; and even forced into a closable status it cannot close.
do $$
declare
  v_o uuid;
begin
  v_o := pg_temp.new_order(12);
  perform pg_temp.as_user('22222222-0000-4000-8000-000000000004');
  perform pg_temp.err('F01b an empty reschedule cannot tombstone the only planned day',
    format($q$ select public.schedule_jornadas(gen_random_uuid(), %L, '[]') $q$, v_o), 'PT422', 'days_required');
  perform pg_temp.as_owner();
  update public.jornadas set deleted_at = now() where order_id = v_o;
  perform pg_temp.as_user('22222222-0000-4000-8000-000000000004');
  perform public.add_incident(gen_random_uuid(), '99999999-5000-4000-8000-000000000012', v_o, 'otra', 'baja', 'Incidencia que bloquea', true);
  perform pg_temp.eq('F01b un-flagging leaves con_incidencia for the jornadas'' status (none live → borrador)',
    public.update_incident(gen_random_uuid(), '99999999-5000-4000-8000-000000000012', '{"blocks_closure": false}') ->> 'order_status', 'borrador');
  perform pg_temp.as_owner();
  update public.orders set status = 'pendiente_validacion' where id = v_o;
  perform pg_temp.as_user('22222222-0000-4000-8000-000000000004');
  perform pg_temp.err('F01b no closure without an executed jornada, whatever the status',
    format($q$ select public.validate_closure(gen_random_uuid(), gen_random_uuid(), %L, 'Servicio realizado completo') $q$, v_o), 'PT409', 'closure_blocked');
  perform pg_temp.as_owner();
  perform pg_temp.check('F01b no closure after tombstoning every planned day without executing any',
    not exists (select 1 from public.order_closures where order_id = v_o));
  raise exception 'REVIEW_PASS';
exception when others then
  perform pg_temp.verdict('F01b', 'high', 'closure after an empty reschedule + un-flagged incident', sqlerrm);
end $$;

------------------------------------------------------------------------------------------------------------------------
-- F02 · high · rescheduling fails with 23505 once days were executed out of order (day 2 before day 1): the new day
-- gets day_index = (#kept) + n, which collides with the executed day 2. The sync design treats 23505 as "duplicate id".
------------------------------------------------------------------------------------------------------------------------
do $$
declare
  v_o constant uuid := '99999999-0000-4000-8000-000000000021';
begin
  perform pg_temp.as_user('22222222-0000-4000-8000-000000000002');
  perform public.create_order(gen_random_uuid(), v_o, '33333333-0000-4000-8000-000000000001', '33333333-1000-4000-8000-000000000001',
    '33333333-2000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000004', 'Orden de dos días',
    jsonb_build_array(
      jsonb_build_object('id', '99999999-1000-4000-8000-000000000021', 'date', current_date,
        'planned_start', now() - interval '4 hours', 'planned_end', now() + interval '4 hours'),
      jsonb_build_object('id', '99999999-1000-4000-8000-000000000022', 'date', current_date + 1,
        'planned_start', now() + interval '20 hours', 'planned_end', now() + interval '28 hours')));
  perform pg_temp.as_user('22222222-0000-4000-8000-000000000004');
  perform public.assign_crew(gen_random_uuid(), v_o, array['44444444-0000-4000-8000-000000000001']::uuid[], 'Inicial');
  -- day 1 was rained out; the crew works day 2 first, then the supervisor moves day 1
  perform public.check_in(gen_random_uuid(), '99999999-1000-4000-8000-000000000022', now() - interval '1 hour', 25.7, -100.3, 10);
  perform pg_temp.ok('F02 reschedule the pending day after a later day was executed', format($q$
    select public.schedule_jornadas(gen_random_uuid(), %L, jsonb_build_array(jsonb_build_object('id', '99999999-1000-4000-8000-000000000023',
      'date', current_date + 3, 'planned_start', now() + interval '3 days', 'planned_end', now() + interval '3 days 6 hours')), 'Lluvia') $q$, v_o));
  raise exception 'REVIEW_PASS';
exception when others then
  perform pg_temp.verdict('F02', 'high', 'schedule_jornadas collides on day_index after out-of-order execution', sqlerrm);
end $$;

------------------------------------------------------------------------------------------------------------------------
-- F03 · high · scope GAIN: rows that were already on the server but only now became visible never arrive through an
-- updated_at cursor. Fix = pull protocol (architecture.md §8) + server support: (1) an order that is new to the device,
-- or whose scope_changed_at (server-stamped at creation and on supervisor/unit change) is newer than the device's copy,
-- is fetched with its whole subtree by order_id; (2) referenced rows the device lacks (client_id, site_id, created_by,
-- owner_id…) are fetched by id; (3) a client that moves unit touches its sites, so the new unit's cursor sees them;
-- (4) a change of the device user's own role/unit/active state triggers a full re-sync. Rows are backdated with
-- triggers disabled to model a device whose cursor is one hour old.
------------------------------------------------------------------------------------------------------------------------
do $$
declare
  v_cursor constant timestamptz := now() - interval '1 hour';   -- SUP2's device last pulled one hour ago
  v_order constant uuid := '66666666-0000-4000-8000-000000000031';
begin
  alter table public.clients disable trigger stamp_update;
  alter table public.sites disable trigger stamp_update;
  update public.clients set updated_at = now() - interval '2 days' where id = '33333333-0000-4000-8000-000000000001';
  update public.sites set updated_at = now() - interval '2 days' where id = '33333333-1000-4000-8000-000000000001';
  alter table public.clients enable trigger stamp_update;
  alter table public.sites enable trigger stamp_update;
  -- Administración creates SUP2's first order for the long-existing client C1 / site S1
  perform pg_temp.new_order(31, 1, '22222222-0000-4000-8000-000000000005');
  perform pg_temp.as_user('22222222-0000-4000-8000-000000000005');
  perform pg_temp.eq('F03a the new order arrives in the incremental pull',
    pg_temp.seen(format('select id from public.orders where updated_at >= %L::timestamptz - interval ''60 seconds''', v_cursor)), 'ORD31');
  perform pg_temp.check('F03a scope_changed_at is stamped by the server at creation',
    (select scope_changed_at = now() from public.orders where id = v_order));
  -- (1) unknown order → subtree by order_id
  perform pg_temp.eq('F03a its jornadas come with the subtree', pg_temp.seen(format('select id from public.jornadas where order_id = %L', v_order)), 'J31');
  -- (2) references the device lacks → by id (RLS lets SUP2 read them now)
  perform pg_temp.eq('F03a its client is fetched by reference',
    pg_temp.seen(format('select id from public.clients where id in (select client_id from public.orders where id = %L)', v_order)), 'C1');
  perform pg_temp.eq('F03a its site is fetched by reference',
    pg_temp.seen(format('select id from public.sites where id in (select site_id from public.orders where id = %L)', v_order)), 'S1');
  perform pg_temp.eq('F03a its creator profile is fetched by reference',
    pg_temp.seen(format('select id from public.profiles where id in (select created_by from public.orders where id = %L)', v_order)), 'ADM1');
  raise exception 'REVIEW_PASS';
exception when others then
  perform pg_temp.verdict('F03a', 'high', 'scope gain: new order for an existing client (subtree + references)', sqlerrm);
end $$;

do $$
declare
  v_cursor constant timestamptz := now() - interval '1 hour';
  v_order constant uuid := '66666666-0000-4000-8000-000000000032';
  v_device_copy timestamptz;
begin
  perform pg_temp.new_order(32);   -- SUP1's order, jornada J32 written long ago
  alter table public.jornadas disable trigger stamp_update;
  alter table public.orders disable trigger track_scope;
  update public.jornadas set updated_at = now() - interval '2 days' where order_id = v_order;
  update public.orders set scope_changed_at = now() - interval '2 days' where id = v_order;
  alter table public.orders enable trigger track_scope;
  alter table public.jornadas enable trigger stamp_update;
  v_device_copy := (select scope_changed_at from public.orders where id = v_order);   -- a stale copy on a device
  -- a plain edit keeps scope_changed_at
  perform pg_temp.as_user('22222222-0000-4000-8000-000000000002');
  perform public.update_order(gen_random_uuid(), v_order, '{"title": "Orden 32 renombrada"}', 'Ajuste');
  perform pg_temp.as_owner();
  perform pg_temp.check('F03b a plain edit does not move scope_changed_at',
    (select scope_changed_at = v_device_copy from public.orders where id = v_order));
  perform pg_temp.as_user('22222222-0000-4000-8000-000000000002');
  perform public.update_order(gen_random_uuid(), v_order, '{"supervisor_id": "22222222-0000-4000-8000-000000000005"}', 'Reasignación');
  perform pg_temp.as_user('22222222-0000-4000-8000-000000000005');
  perform pg_temp.eq('F03b the reassigned order arrives in SUP2''s incremental pull',
    pg_temp.seen(format('select id from public.orders where updated_at >= %L::timestamptz - interval ''60 seconds''', v_cursor)), 'ORD32');
  perform pg_temp.check('F03b scope_changed_at moved past the device copy',
    (select scope_changed_at = now() and scope_changed_at > v_device_copy from public.orders where id = v_order));
  perform pg_temp.eq('F03b the old jornada is not in the cursor (why the subtree fetch exists)',
    pg_temp.seen(format('select id from public.jornadas where updated_at >= %L::timestamptz - interval ''60 seconds''', v_cursor)), '');
  perform pg_temp.eq('F03b …and arrives with the subtree by order_id',
    pg_temp.seen(format('select id from public.jornadas where order_id = %L', v_order)), 'J32');
  perform pg_temp.as_owner();
  perform pg_temp.check('F03b the previous supervisor is recorded',
    exists (select 1 from private.order_assignments where order_id = v_order and supervisor_id = '22222222-0000-4000-8000-000000000004'));
  raise exception 'REVIEW_PASS';
exception when others then
  perform pg_temp.verdict('F03b', 'high', 'scope gain: order reassigned to the device user (subtree)', sqlerrm);
end $$;

do $$
declare
  v_cursor constant timestamptz := now() - interval '1 hour';   -- ADM2's device last pulled one hour ago
begin
  alter table public.clients disable trigger stamp_update;
  alter table public.sites disable trigger stamp_update;
  update public.clients set updated_at = now() - interval '2 days';
  update public.sites set updated_at = now() - interval '2 days';
  alter table public.clients enable trigger stamp_update;
  alter table public.sites enable trigger stamp_update;
  -- Dirección moves C2 (no orders) from U1 to U2: U2's Administración must pull the client and its sites
  perform pg_temp.as_user('22222222-0000-4000-8000-000000000001');
  perform public.upsert_client(gen_random_uuid(), '33333333-0000-4000-8000-000000000002', 'Cliente Dos SA', 'Dos', 'Comercial',
    '11111111-0000-4000-8000-000000000002');
  perform pg_temp.as_user('22222222-0000-4000-8000-000000000003');
  perform pg_temp.eq('F03c the moved client arrives in the new unit''s pull',
    pg_temp.seen(format('select id from public.clients where updated_at >= %L::timestamptz - interval ''60 seconds''', v_cursor)), 'C2');
  perform pg_temp.eq('F03c …with its sites',
    pg_temp.seen(format('select id from public.sites where updated_at >= %L::timestamptz - interval ''60 seconds''', v_cursor)), 'S2');
  raise exception 'REVIEW_PASS';
exception when others then
  perform pg_temp.verdict('F03c', 'high', 'scope gain: client moved to another unit (sites touched)', sqlerrm);
end $$;

------------------------------------------------------------------------------------------------------------------------
-- F04 · medium · offline conflicts come back as PT404 out_of_scope (or a permanent PT422), the same answer as "this
-- record is not yours": the sync engine (§8: PT404/PT422 = permanent) drops field evidence it could have kept or retried.
------------------------------------------------------------------------------------------------------------------------
do $$
declare
  v_o uuid;
  v text;
begin
  v_o := pg_temp.new_order(41);
  perform pg_temp.as_user('22222222-0000-4000-8000-000000000004');
  -- device A reschedules (online) while device B still holds an offline check-in for the original day J41
  perform public.schedule_jornadas(gen_random_uuid(), v_o, jsonb_build_array(jsonb_build_object('id', '99999999-1000-4000-8000-000000000041',
    'date', current_date + 3, 'planned_start', now() + interval '3 days', 'planned_end', now() + interval '3 days 6 hours')), 'Cambio');
  v := pg_temp.outcome($q$ select public.check_in(gen_random_uuid(), '66666666-1000-4000-8000-000000000041', now() - interval '2 hours', 25.7, -100.3, 10) $q$);
  perform pg_temp.eq('F04a a check-in for a day replaced by a reschedule is a sync conflict, not scope loss', v, 'PT409 jornada_rescheduled');
  raise exception 'REVIEW_PASS';
exception when others then
  perform pg_temp.verdict('F04a', 'medium', 'check-in on a rescheduled (tombstoned) day answers PT404 out_of_scope', sqlerrm);
end $$;

do $$
declare
  v_o uuid;
  v text;
begin
  v_o := pg_temp.new_order(42);
  perform pg_temp.as_user('22222222-0000-4000-8000-000000000002');
  perform public.update_order(gen_random_uuid(), v_o, '{"supervisor_id": "22222222-0000-4000-8000-000000000005"}', 'Carga de trabajo');
  -- SUP1 worked the day offline, before the reassignment reached the device
  perform pg_temp.as_user('22222222-0000-4000-8000-000000000004');
  v := pg_temp.outcome($q$ select public.check_in(gen_random_uuid(), '66666666-1000-4000-8000-000000000042', now() - interval '3 hours', 25.7, -100.3, 10) $q$);
  perform pg_temp.eq('F04b field data captured before a reassignment is answered as a sync conflict, not "out of scope"', v, 'PT409 order_reassigned');
  raise exception 'REVIEW_PASS';
exception when others then
  perform pg_temp.verdict('F04b', 'medium', 'offline capture by the previous supervisor is rejected as out_of_scope (evidence lost)', sqlerrm);
end $$;

do $$
declare
  v_o uuid;
  v text;
begin
  v_o := pg_temp.new_order(43);
  perform pg_temp.put_object(v_o, 'antes', '99999999-6000-4000-8000-000000000043');
  perform pg_temp.as_user('22222222-0000-4000-8000-000000000004');
  -- the photo's jornada (created offline by schedule_jornadas on this device) has not reached the server yet
  v := pg_temp.outcome(format($q$ select public.add_photo(gen_random_uuid(), '99999999-6000-4000-8000-000000000043', %L, 'antes',
    'orders/%s/antes/99999999-6000-4000-8000-000000000043.jpg', p_jornada_id => '99999999-1000-4000-8000-0000000000aa') $q$, v_o, v_o));
  perform pg_temp.eq('F04c a photo whose jornada is not on the server yet is a retryable dependency, not a permanent PT422', v, 'PT409 parent_missing');
  raise exception 'REVIEW_PASS';
exception when others then
  perform pg_temp.verdict('F04c', 'medium', 'photo before its jornada answers a permanent PT422', sqlerrm);
end $$;

------------------------------------------------------------------------------------------------------------------------
-- F05 · medium · Dirección can move a client that has orders to another unit: the orders keep the old unit_id, so
-- Administración of that unit loses the client and its sites (order detail breaks, no new orders) and the new unit sees
-- the client without its history. Sites with orders are already protected (site_in_use); clients are not.
------------------------------------------------------------------------------------------------------------------------
do $$
begin
  perform pg_temp.new_order(51);   -- C1 / S1, unit U1
  perform pg_temp.as_user('22222222-0000-4000-8000-000000000001');
  perform pg_temp.outcome($q$ select public.upsert_client(gen_random_uuid(), '33333333-0000-4000-8000-000000000001', 'Cliente Uno SA', 'Uno',
    'Industrial', '11111111-0000-4000-8000-000000000002') $q$);
  perform pg_temp.as_owner();
  perform pg_temp.check('F05 every order and its client share the unit',
    not exists (select 1 from public.orders o join public.clients c on c.id = o.client_id where o.unit_id <> c.unit_id));
  raise exception 'REVIEW_PASS';
exception when others then
  perform pg_temp.verdict('F05', 'medium', 'client with orders can be moved to another unit', sqlerrm);
end $$;

------------------------------------------------------------------------------------------------------------------------
-- F06 · medium · a supervisor with open orders can be moved to another unit or given another role: the orders keep a
-- supervisor that create_order/update_order would refuse (other unit / not a supervisor). After a unit move the
-- supervisor still captures on the old unit's order but sees none of its crews, and the unit's Administración cannot
-- see the order's supervisor profile.
------------------------------------------------------------------------------------------------------------------------
do $$
begin
  perform pg_temp.new_order(61);   -- SUP1, open
  perform pg_temp.as_user('22222222-0000-4000-8000-000000000001');
  perform pg_temp.outcome($q$ select public.update_profile(gen_random_uuid(), '22222222-0000-4000-8000-000000000004', '{"unit_id": "11111111-0000-4000-8000-000000000002"}') $q$);
  perform pg_temp.as_owner();
  perform pg_temp.check('F06a open orders keep a supervisor of their own unit',
    not exists (select 1 from public.orders o join public.profiles p on p.id = o.supervisor_id
                where o.status not in ('finalizada', 'reporte_enviado', 'seguimiento', 'archivada', 'cancelada') and p.unit_id <> o.unit_id));
  raise exception 'REVIEW_PASS';
exception when others then
  perform pg_temp.verdict('F06a', 'medium', 'supervisor with open orders moved to another unit', sqlerrm);
end $$;

do $$
begin
  perform pg_temp.new_order(62);   -- SUP1, open
  perform pg_temp.as_user('22222222-0000-4000-8000-000000000001');
  perform pg_temp.outcome($q$ select public.update_profile(gen_random_uuid(), '22222222-0000-4000-8000-000000000004', '{"role": "administracion"}') $q$);
  perform pg_temp.as_owner();
  perform pg_temp.check('F06b open orders keep a supervisor whose role is supervisor',
    not exists (select 1 from public.orders o join public.profiles p on p.id = o.supervisor_id
                where o.status not in ('finalizada', 'reporte_enviado', 'seguimiento', 'archivada', 'cancelada') and p.role <> 'supervisor'));
  raise exception 'REVIEW_PASS';
exception when others then
  perform pg_temp.verdict('F06b', 'medium', 'supervisor with open orders given another role', sqlerrm);
end $$;

------------------------------------------------------------------------------------------------------------------------
-- F07 · medium · the idempotency key is not bound to its request: the same op id sent for a different jornada (client
-- bug, id collision in the queue) returns {"ok": true, "duplicate": true} with the FIRST jornada's ids, and the second
-- check-in silently never happens.
------------------------------------------------------------------------------------------------------------------------
do $$
declare
  v_op constant uuid := '99999999-9000-4000-8000-000000000071';
  v jsonb;
begin
  perform pg_temp.new_order(71);
  perform pg_temp.new_order(72);
  perform pg_temp.as_user('22222222-0000-4000-8000-000000000004');
  perform public.check_in(v_op, '66666666-1000-4000-8000-000000000071', now() - interval '1 hour', 25.7, -100.3, 10);
  begin
    v := public.check_in(v_op, '66666666-1000-4000-8000-000000000072', now() - interval '1 hour', 25.7, -100.3, 10);
  exception when others then
    v := null;   -- refusing the reused key (e.g. PT409 op_id_reused) is a correct answer
  end;
  perform pg_temp.as_owner();
  perform pg_temp.check('F07 an op id never reports success for a request it did not apply',
    v is null or exists (select 1 from public.jornada_checks where jornada_id = '66666666-1000-4000-8000-000000000072'));
  raise exception 'REVIEW_PASS';
exception when others then
  perform pg_temp.verdict('F07', 'medium', 'op id replay with a different payload is reported as applied', sqlerrm);
end $$;

------------------------------------------------------------------------------------------------------------------------
-- F08 · low · device timestamps are only bounded for check-in/out: notes, incidents, closures (device_at and the
-- client's conformity_at printed in the report), reports, shares and photos (attached_at) accept any date.
------------------------------------------------------------------------------------------------------------------------
do $$
declare
  v_o uuid;
begin
  v_o := pg_temp.new_order(81);
  perform pg_temp.as_user('22222222-0000-4000-8000-000000000004');
  perform pg_temp.outcome(format($q$ select public.add_incident(gen_random_uuid(), gen_random_uuid(), %L, 'otra', 'baja', 'Fecha rara',
    p_device_at => '2100-01-01T00:00:00Z') $q$, v_o));
  perform public.assign_crew(gen_random_uuid(), v_o, array['44444444-0000-4000-8000-000000000001']::uuid[], 'Inicial');
  perform public.check_in(gen_random_uuid(), '66666666-1000-4000-8000-000000000081', now() - interval '3 hours', 25.7, -100.3, 10);
  perform public.check_out(gen_random_uuid(), '66666666-1000-4000-8000-000000000081', now() - interval '1 hour', 25.7, -100.3, 10);
  perform pg_temp.outcome(format($q$ select public.validate_closure(gen_random_uuid(), gen_random_uuid(), %L, 'Servicio realizado completo',
    'verbal', 'Ing. Pérez', p_conformity_at => now() + interval '1 year', p_exception_reason => 'La cámara falló durante todo el turno') $q$, v_o));
  perform pg_temp.as_owner();
  perform pg_temp.check('F08 no stored device time / conformity time in the future',
    not exists (select 1 from public.incidents where device_at > now() + interval '5 minutes')
    and not exists (select 1 from public.order_closures where conformity_at > now() + interval '5 minutes'));
  raise exception 'REVIEW_PASS';
exception when others then
  perform pg_temp.verdict('F08', 'low', 'unbounded device / conformity timestamps', sqlerrm);
end $$;

-- F08b · the same bound on every other device time: notes, photos (attached_at and taken_at), reports and shares.
do $$
declare
  v_o uuid;
  c_j constant uuid := '66666666-1000-4000-8000-000000000082';
  c_rep constant uuid := '99999999-6000-4000-8000-000000000082';
  c_ph constant uuid := '99999999-7000-4000-8000-000000000082';
begin
  v_o := pg_temp.new_order(82);
  perform pg_temp.put_object(v_o, 'antes', c_ph);
  perform pg_temp.as_user('22222222-0000-4000-8000-000000000004');
  perform public.assign_crew(gen_random_uuid(), v_o, array['44444444-0000-4000-8000-000000000001']::uuid[], 'Inicial');
  perform public.check_in(gen_random_uuid(), c_j, now() - interval '3 hours', 25.7, -100.3, 10);
  perform pg_temp.err('F08b note dated in the future',
    format($q$ select public.add_jornada_note(gen_random_uuid(), gen_random_uuid(), %L, 'Nota del futuro', '2100-01-01T00:00:00Z') $q$, c_j),
    'PT422', 'device_time_future');
  perform pg_temp.err('F08b photo attached in the future',
    format($q$ select public.add_photo(gen_random_uuid(), %L, %L, 'antes', %L, p_attached_at => '2100-01-01T00:00:00Z') $q$,
      c_ph, v_o, format('orders/%s/antes/%s.jpg', v_o, c_ph)), 'PT422', 'device_time_future');
  perform pg_temp.err('F08b photo taken in the future',
    format($q$ select public.add_photo(gen_random_uuid(), %L, %L, 'antes', %L, p_taken_at => '2100-01-01T00:00:00Z') $q$,
      c_ph, v_o, format('orders/%s/antes/%s.jpg', v_o, c_ph)), 'PT422', 'device_time_future');
  perform public.check_out(gen_random_uuid(), c_j, now() - interval '1 hour', 25.7, -100.3, 10);
  perform public.validate_closure(gen_random_uuid(), gen_random_uuid(), v_o, 'Servicio realizado completo', 'verbal', 'Ing. Pérez',
    p_exception_reason => 'La cámara falló durante todo el turno');
  perform pg_temp.err('F08b report dated in the future',
    format($q$ select public.generate_report(gen_random_uuid(), gen_random_uuid(), %L, '{}', 'Resumen del servicio', '2100-01-01T00:00:00Z') $q$, v_o),
    'PT422', 'device_time_future');
  perform public.generate_report(gen_random_uuid(), c_rep, v_o, '{}', 'Resumen del servicio');
  perform pg_temp.err('F08b share dated in the future',
    format($q$ select public.log_share(gen_random_uuid(), gen_random_uuid(), %L, 'whatsapp', '+52 81 0000 1111', '2100-01-01T00:00:00Z') $q$, c_rep),
    'PT422', 'device_time_future');
  perform pg_temp.as_owner();
  perform pg_temp.check('F08b nothing stored with a future device time',
    not exists (select 1 from public.jornada_notes where jornada_id = c_j)
    and not exists (select 1 from public.photos where id = c_ph)
    and not exists (select 1 from public.reports where order_id = v_o and id <> c_rep)
    and not exists (select 1 from public.report_shares where report_id = c_rep));
  raise exception 'REVIEW_PASS';
exception when others then
  perform pg_temp.verdict('F08b', 'low', 'unbounded device time on notes, photos, reports or shares', sqlerrm);
end $$;

------------------------------------------------------------------------------------------------------------------------
-- F09 · low · incidents are still editable on closed orders (finalizada / reporte_enviado / seguimiento) without
-- reopening: doc §8 and architecture.md §6 say edits after closure need a reopen and a new version.
------------------------------------------------------------------------------------------------------------------------
do $$
declare
  v_o uuid;
begin
  v_o := pg_temp.new_order(91);
  perform pg_temp.as_user('22222222-0000-4000-8000-000000000004');
  perform public.add_incident(gen_random_uuid(), '99999999-5000-4000-8000-000000000091', v_o, 'danos', 'media', 'Rayón en el piso');
  perform pg_temp.as_owner();
  update public.orders set status = 'reporte_enviado' where id = v_o;
  perform pg_temp.as_user('22222222-0000-4000-8000-000000000004');
  perform pg_temp.outcome($q$ select public.update_incident(gen_random_uuid(), '99999999-5000-4000-8000-000000000091', '{"description": "Reescrita tras el cierre", "severity": "baja"}') $q$);
  perform pg_temp.as_owner();
  perform pg_temp.eq('F09 a closed order''s incident is not rewritten',
    (select description from public.incidents where id = '99999999-5000-4000-8000-000000000091'), 'Rayón en el piso');
  raise exception 'REVIEW_PASS';
exception when others then
  perform pg_temp.verdict('F09', 'low', 'incident edits after closure', sqlerrm);
end $$;

------------------------------------------------------------------------------------------------------------------------
-- F10 · low · the "≥ 128-bit" survey token is only checked by shape: 'aaaaaaaaaaaaaaaaaaaaaa' is accepted, and anyone
-- who guesses a link answers as the client (the prototype's surveyToken() yields 40 bits).
------------------------------------------------------------------------------------------------------------------------
do $$
declare
  v_o uuid;
begin
  v_o := pg_temp.new_order(101);
  perform pg_temp.as_user('22222222-0000-4000-8000-000000000004');
  perform pg_temp.outcome(format($q$ select public.create_survey(gen_random_uuid(), gen_random_uuid(), %L, 'whatsapp', 'aaaaaaaaaaaaaaaaaaaaaa') $q$, v_o));
  perform pg_temp.outcome(format($q$ select public.create_survey(gen_random_uuid(), gen_random_uuid(), %L, 'whatsapp', repeat('ab', 22)) $q$, v_o));
  perform pg_temp.as_owner();
  perform pg_temp.check('F10 a trivially guessable token is never stored',
    not exists (select 1 from public.survey_tokens where token in ('aaaaaaaaaaaaaaaaaaaaaa', repeat('ab', 22))));
  raise exception 'REVIEW_PASS';
exception when others then
  perform pg_temp.verdict('F10', 'low', 'low-entropy survey token accepted', sqlerrm);
end $$;

------------------------------------------------------------------------------------------------------------------------
-- F11 · low · "confirm dates" can move a Reprogramada order straight to en_ejecucion / jornada_cerrada although no day
-- was ever checked in (status, KPIs and the agenda then lie).
------------------------------------------------------------------------------------------------------------------------
do $$
declare
  v_o uuid;
begin
  v_o := pg_temp.new_order(111);
  perform pg_temp.as_user('22222222-0000-4000-8000-000000000004');
  perform public.set_order_status(gen_random_uuid(), v_o, 'reprogramada', 'El cliente movió la fecha');
  perform pg_temp.outcome(format($q$ select public.set_order_status(gen_random_uuid(), %L, 'jornada_cerrada') $q$, v_o));
  perform pg_temp.as_owner();
  perform pg_temp.check('F11 an order with no executed jornada is never en_ejecucion / jornada_cerrada',
    (select status from public.orders where id = v_o) not in ('en_ejecucion', 'jornada_cerrada'));
  raise exception 'REVIEW_PASS';
exception when others then
  perform pg_temp.verdict('F11', 'low', 'execution states settable without execution', sqlerrm);
end $$;

------------------------------------------------------------------------------------------------------------------------
-- F12 · low · "append-only" history only rejects UPDATE: the table owner (SQL editor, migrations) and service_role
-- (secret key, which also keeps full DML on every table) can DELETE closures, reports, checks and the audit log.
------------------------------------------------------------------------------------------------------------------------
do $$
declare
  v_before bigint;
begin
  perform pg_temp.new_order(121);
  select count(*) into v_before from public.audit_log;
  perform pg_temp.outcome('delete from public.audit_log');
  perform pg_temp.eq('F12a audit entries cannot be deleted', (select count(*) from public.audit_log)::text, v_before::text);
  raise exception 'REVIEW_PASS';
exception when others then
  perform pg_temp.verdict('F12a', 'low', 'append-only history can be deleted by the owner', sqlerrm);
end $$;

do $$
declare
  v_t text;
begin
  foreach v_t in array array['audit_log', 'order_closures', 'reports', 'report_shares', 'jornada_checks', 'jornada_notes', 'crew_changes', 'case_events'] loop
    perform pg_temp.check('F12b service_role cannot delete history: ' || v_t, not has_table_privilege('service_role', 'public.' || v_t, 'delete'));
  end loop;
  raise exception 'REVIEW_PASS';
exception when others then
  perform pg_temp.verdict('F12b', 'low', 'service_role keeps DELETE on append-only tables', sqlerrm);
end $$;

------------------------------------------------------------------------------------------------------------------------
-- F13 · low · architecture.md §13 says new objects in public need explicit grants, but the per-schema default
-- privileges cannot remove the built-in PUBLIC EXECUTE: any function a later migration adds to public or private is
-- callable by anon until someone remembers to revoke it (a SECURITY DEFINER one would be an open /rest/v1/rpc endpoint).
------------------------------------------------------------------------------------------------------------------------
do $$
begin
  create function public.zz_review_probe() returns integer language sql as 'select 1';
  create function private.zz_review_probe() returns integer language sql as 'select 1';
  perform pg_temp.check('F13 a new function in public is not executable by anon', not has_function_privilege('anon', 'public.zz_review_probe()', 'execute'));
  perform pg_temp.check('F13 a new function in private is not executable by anon', not has_function_privilege('anon', 'private.zz_review_probe()', 'execute'));
  raise exception 'REVIEW_PASS';
exception when others then
  perform pg_temp.verdict('F13', 'low', 'default EXECUTE to PUBLIC on new functions', sqlerrm);
end $$;

------------------------------------------------------------------------------------------------------------------------
-- F14 · low (scale) · the orders policy is an OR of the three role branches, so the planner cannot use
-- orders_supervisor_id_idx / orders_unit_id_status_idx: every supervisor/Administración read — and every child-table
-- read, through `order_id in (select id from orders)` — sequentially scans all orders (here 20 000 to find 200).
------------------------------------------------------------------------------------------------------------------------
do $$
declare
  r record;
  v_plan text := '';
begin
  insert into public.orders (id, folio, unit_id, client_id, site_id, service_type_id, supervisor_id, status, title, scheduled_start, scheduled_end, created_by)
  select gen_random_uuid(), 'OS-9' || lpad(g::text, 6, '0'), '11111111-0000-4000-8000-000000000001', '33333333-0000-4000-8000-000000000001',
         '33333333-1000-4000-8000-000000000001', '33333333-2000-4000-8000-000000000001',
         case when g % 100 = 0 then '22222222-0000-4000-8000-000000000004'::uuid else '22222222-0000-4000-8000-000000000005'::uuid end,
         'finalizada', 'Orden de volumen', now(), now(), '22222222-0000-4000-8000-000000000002'
  from generate_series(1, 20000) g;
  -- one photo per order: the child tables follow the same policy shape
  insert into public.photos (id, order_id, kind, taken_at, taken_at_source, storage_path, mime_type, bytes, created_by)
  select gen_random_uuid(), o.id, 'antes', now(), 'device', 'volume/' || o.id, 'image/jpeg', 1, '22222222-0000-4000-8000-000000000004'
  from public.orders o where o.title = 'Orden de volumen';
  analyze public.orders;
  analyze public.photos;
  perform pg_temp.as_user('22222222-0000-4000-8000-000000000004');
  for r in execute 'explain (costs off) select id from public.orders' loop
    v_plan := v_plan || r."QUERY PLAN" || ' | ';
  end loop;
  perform pg_temp.check('F14 a supervisor''s order read uses an index, not a full scan: ' || left(v_plan, 160), v_plan not like '%Seq Scan on orders%');
  v_plan := '';
  for r in execute 'explain (costs off) select * from public.photos' loop
    v_plan := v_plan || r."QUERY PLAN" || ' | ';
  end loop;
  perform pg_temp.check('F14 a supervisor''s photo read uses an index, not a full scan: ' || left(v_plan, 160), v_plan not like '%Seq Scan on photos%');
  perform pg_temp.eq('F14 and still sees exactly their 200 orders', (select count(*)::text from public.orders), '200');
  perform pg_temp.as_owner();
  raise exception 'REVIEW_PASS';
exception when others then
  perform pg_temp.verdict('F14', 'low', 'OR-shaped orders policy forces sequential scans', sqlerrm);
end $$;

------------------------------------------------------------------------------------------------------------------------
-- Verdict: fail loudly with every open finding.
------------------------------------------------------------------------------------------------------------------------
do $$
declare
  v text;
begin
  select string_agg(format('%s (%s) %s → %s', finding, severity, title, verdict), E'\n' order by n) into v
  from pg_temp.t_review where verdict <> 'ok';
  if v is not null then
    raise exception E'FAIL [review findings still open]\n%', v;
  end if;
end $$;
