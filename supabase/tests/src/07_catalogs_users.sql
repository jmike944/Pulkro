-- 07 · Catalogs (catalogs.admin: Dirección everywhere, Administración inside its unit; company-wide catalogs by both),
-- units and users (users.admin = Dirección), self-service contact, deactivation with session revocation, auth hook.
select pg_temp.new_order(1);   -- ORD1 on site S1 (C1)
do $$
declare
  v jsonb;
  c_dir constant uuid := '22222222-0000-4000-8000-000000000001';
  c_adm1 constant uuid := '22222222-0000-4000-8000-000000000002';
  c_adm2 constant uuid := '22222222-0000-4000-8000-000000000003';
  c_sup1 constant uuid := '22222222-0000-4000-8000-000000000004';
  c_sup2 constant uuid := '22222222-0000-4000-8000-000000000005';
  c_u1 constant text := '11111111-0000-4000-8000-000000000001';
  c_u2 constant text := '11111111-0000-4000-8000-000000000002';
begin
  ------------------------------------------------------------------ units (Dirección)
  perform pg_temp.as_user(c_dir);
  perform pg_temp.ok('Dirección adds a unit', $q$ select public.upsert_unit(gen_random_uuid(), '11111111-0000-4000-8000-000000000003', 'Saltillo', 'tu3', 'Saltillo, Coah.') $q$);
  perform pg_temp.eq('unit code normalised', (select code from public.units where id = '11111111-0000-4000-8000-000000000003'), 'TU3');
  perform pg_temp.err('unit codes are unique', $q$ select public.upsert_unit(gen_random_uuid(), gen_random_uuid(), 'Otra', 'TU1') $q$, '23505');
  foreach v in array array[jsonb_build_object('who', c_adm1), jsonb_build_object('who', c_sup1)] loop
    perform pg_temp.as_user((v ->> 'who')::uuid);
    perform pg_temp.err('only Dirección manages units', $q$ select public.upsert_unit(gen_random_uuid(), gen_random_uuid(), 'Nueva', 'NVA') $q$, 'PT403', 'forbidden:users.admin');
  end loop;

  ------------------------------------------------------------------ clients / sites / workers (unit-scoped)
  perform pg_temp.as_user(c_adm1);
  perform pg_temp.ok('Administración adds a client in its unit', format($q$ select public.upsert_client(gen_random_uuid(), '33333333-0000-4000-8000-000000000011', 'Cliente Nuevo SA', 'Nuevo', 'Industrial', %L, 'Ing. Ruiz', '+52 81 0000 0001', ' Compras@Cliente.MX ') $q$, c_u1));
  perform pg_temp.eq('contact e-mail normalised', (select contact_email from public.clients where id = '33333333-0000-4000-8000-000000000011'), 'compras@cliente.mx');
  perform pg_temp.err('not in another unit', format($q$ select public.upsert_client(gen_random_uuid(), gen_random_uuid(), 'Ajeno SA', 'Ajeno', 'Comercial', %L) $q$, c_u2), 'PT403', 'other_unit');
  perform pg_temp.err('cannot move an own client out of the unit', format($q$ select public.upsert_client(gen_random_uuid(), '33333333-0000-4000-8000-000000000001', 'Cliente Uno SA', 'Uno', 'Industrial', %L) $q$, c_u2), 'PT403', 'other_unit');
  perform pg_temp.err('cannot edit another unit''s client', format($q$ select public.upsert_client(gen_random_uuid(), '33333333-0000-4000-8000-000000000003', 'Cliente Tres SA', 'Tres', 'Residencial', %L) $q$, c_u1), 'PT403', 'other_unit');
  perform pg_temp.err('unknown unit', $q$ select public.upsert_client(gen_random_uuid(), gen_random_uuid(), 'Sin unidad SA', 'Sin', 'Comercial', '11111111-0000-4000-8000-0000000000ff') $q$, 'PT422', 'invalid_unit');
  perform pg_temp.err('invalid e-mail', format($q$ select public.upsert_client(gen_random_uuid(), gen_random_uuid(), 'Correo malo SA', 'Malo', 'Comercial', %L, p_contact_email => 'no-es-correo') $q$, c_u1), '23514');
  perform pg_temp.ok('site for an own client', $q$ select public.upsert_site(gen_random_uuid(), '33333333-1000-4000-8000-000000000011', '33333333-0000-4000-8000-000000000011', 'Planta Norte', 25.8, -100.2, 'Av. Norte 1', 'Escobedo') $q$);
  perform pg_temp.err('site for another unit''s client', $q$ select public.upsert_site(gen_random_uuid(), gen_random_uuid(), '33333333-0000-4000-8000-000000000003', 'Sitio ajeno', 25.8, -100.2) $q$, 'PT403', 'other_unit');
  perform pg_temp.err('site for an unknown client', $q$ select public.upsert_site(gen_random_uuid(), gen_random_uuid(), '33333333-0000-4000-8000-0000000000ff', 'Sitio huérfano', 25.8, -100.2) $q$, 'PT404', 'out_of_scope');
  perform pg_temp.as_user(c_dir);
  perform pg_temp.err('a client with orders keeps its unit', format($q$ select public.upsert_client(gen_random_uuid(), '33333333-0000-4000-8000-000000000001', 'Cliente Uno SA', 'Uno', 'Industrial', %L) $q$, c_u2), 'PT409', 'client_in_use');
  perform pg_temp.as_user(c_adm1);
  perform pg_temp.err('a site with orders keeps its client', $q$ select public.upsert_site(gen_random_uuid(), '33333333-1000-4000-8000-000000000001', '33333333-0000-4000-8000-000000000002', 'Planta Uno', 25.70, -100.30) $q$, 'PT409', 'site_in_use');
  perform pg_temp.ok('a site without orders may move (same unit)', $q$ select public.upsert_site(gen_random_uuid(), '33333333-1000-4000-8000-000000000004', '33333333-0000-4000-8000-000000000002', 'Bodega Dos', 25.71, -100.31) $q$);
  perform pg_temp.err('cannot pull another unit''s site', $q$ select public.upsert_site(gen_random_uuid(), '33333333-1000-4000-8000-000000000003', '33333333-0000-4000-8000-000000000001', 'Torre Tres', 25.77, -100.18) $q$, 'PT403', 'other_unit');
  perform pg_temp.ok('worker in own unit', format($q$ select public.upsert_worker(gen_random_uuid(), '44444444-0000-4000-8000-000000000011', 'María de la Luz Hernández', %L, 'Pulido') $q$, c_u1));
  perform pg_temp.eq('worker initials computed', (select initials from public.workers where id = '44444444-0000-4000-8000-000000000011'), 'ML');
  perform pg_temp.ok('deactivate worker', format($q$ select public.upsert_worker(gen_random_uuid(), '44444444-0000-4000-8000-000000000011', 'María de la Luz Hernández', %L, 'Pulido', p_active => false) $q$, c_u1));
  perform pg_temp.err('worker of another unit', $q$ select public.upsert_worker(gen_random_uuid(), '44444444-0000-4000-8000-000000000003', 'Luis Torres', '11111111-0000-4000-8000-000000000002') $q$, 'PT403', 'other_unit');
  -- company-wide catalogs: Administración and Dirección (as coded in store.ts), never supervisors
  perform pg_temp.ok('Administración edits service types', $q$ select public.upsert_service_type(gen_random_uuid(), '33333333-2000-4000-8000-000000000002', 'Lavado de vidrios', 'Vidrios', 7) $q$);
  perform pg_temp.err('hours per day bounded', $q$ select public.upsert_service_type(gen_random_uuid(), gen_random_uuid(), 'Turno imposible', 'Imposible', 30) $q$, 'PT422', 'invalid_hours');
  perform pg_temp.ok('Administración edits materials', $q$ select public.upsert_material(gen_random_uuid(), '33333333-3000-4000-8000-000000000002', 'Cera acrílica', 'L') $q$);
  perform pg_temp.as_user(c_dir);
  perform pg_temp.ok('Dirección edits any unit''s client', format($q$ select public.upsert_client(gen_random_uuid(), '33333333-0000-4000-8000-000000000003', 'Cliente Tres SA de CV', 'Tres', 'Residencial', %L) $q$, c_u2));
  perform pg_temp.ok('Dirección edits company-wide catalogs', $q$ select public.upsert_material(gen_random_uuid(), '33333333-3000-4000-8000-000000000003', 'Pads de pulido', 'pza') $q$);
  perform pg_temp.as_user(c_sup1);
  perform pg_temp.err('supervisors do not edit catalogs (clients)', format($q$ select public.upsert_client(gen_random_uuid(), gen_random_uuid(), 'Cliente sup SA', 'Sup', 'Comercial', %L) $q$, c_u1), 'PT403', 'forbidden:catalogs.admin');
  perform pg_temp.err('supervisors do not edit catalogs (workers)', format($q$ select public.upsert_worker(gen_random_uuid(), gen_random_uuid(), 'Nuevo Trabajador', %L) $q$, c_u1), 'PT403', 'forbidden:catalogs.admin');
  perform pg_temp.err('supervisors do not edit catalogs (materials)', $q$ select public.upsert_material(gen_random_uuid(), gen_random_uuid(), 'Algo', 'L') $q$, 'PT403', 'forbidden:catalogs.admin');
  -- the Bitácora entry of a Dirección edit belongs to the edited record's unit (canSeeAuditEntry)
  perform pg_temp.as_user(c_adm2);
  perform pg_temp.eq('U2 Administración sees Dirección''s edit of a U2 client', (select count(*)::text from public.audit_log where action = 'Guardó cliente Tres'), '1');
  perform pg_temp.as_user(c_adm1);
  perform pg_temp.eq('U1 Administración does not', (select count(*)::text from public.audit_log where action = 'Guardó cliente Tres'), '0');

  ------------------------------------------------------------------ users (Dirección)
  perform pg_temp.as_user(c_adm1);
  perform pg_temp.err('Administración does not provision users', $q$ select public.provision_profile(gen_random_uuid(), '22222222-0000-4000-8000-000000000008', 'Persona Nueva', 'supervisor', '11111111-0000-4000-8000-000000000001') $q$, 'PT403', 'forbidden:users.admin');
  perform pg_temp.err('Administración does not edit users', $q$ select public.update_profile(gen_random_uuid(), '22222222-0000-4000-8000-000000000005', '{"title": "Jefe"}') $q$, 'PT403', 'forbidden:users.admin');
  perform pg_temp.as_user(c_dir);
  perform pg_temp.err('auth account must exist first', $q$ select public.provision_profile(gen_random_uuid(), '22222222-0000-4000-8000-0000000000ff', 'Persona Fantasma', 'supervisor', '11111111-0000-4000-8000-000000000001') $q$, 'PT404', 'auth_user_missing');
  perform pg_temp.err('unit required', $q$ select public.provision_profile(gen_random_uuid(), '22222222-0000-4000-8000-000000000008', 'Persona Nueva', 'supervisor', '11111111-0000-4000-8000-0000000000ff') $q$, 'PT422', 'invalid_profile');
  perform pg_temp.ok('Dirección provisions the invited account', $q$ select public.provision_profile(gen_random_uuid(), '22222222-0000-4000-8000-000000000008', 'Nora Pérez Salinas', 'supervisor', '11111111-0000-4000-8000-000000000001', 'Supervisora') $q$);
  perform pg_temp.eq('profile from the auth account', (select concat_ws('|', email, initials, role, active) from public.profiles where id = '22222222-0000-4000-8000-000000000008'), 'newbie.person@tests.invalid|NP|supervisor|t');
  perform pg_temp.err('provision once', $q$ select public.provision_profile(gen_random_uuid(), '22222222-0000-4000-8000-000000000008', 'Nora Pérez Salinas', 'supervisor', '11111111-0000-4000-8000-000000000001') $q$, 'PT409', 'already_provisioned');
  perform pg_temp.err('no self role change', $q$ select public.update_profile(gen_random_uuid(), '22222222-0000-4000-8000-000000000001', '{"role": "supervisor"}') $q$, 'PT409', 'self_change');
  perform pg_temp.err('no self unit change', $q$ select public.update_profile(gen_random_uuid(), '22222222-0000-4000-8000-000000000001', '{"unit_id": "11111111-0000-4000-8000-000000000002"}') $q$, 'PT409', 'self_change');
  perform pg_temp.err('no self deactivation', $q$ select public.update_profile(gen_random_uuid(), '22222222-0000-4000-8000-000000000001', '{"active": false}') $q$, 'PT409', 'self_change');
  perform pg_temp.ok('own name is fine', $q$ select public.update_profile(gen_random_uuid(), '22222222-0000-4000-8000-000000000001', '{"name": "Dirección Prueba Uno"}') $q$);
  perform pg_temp.err('e-mail is managed by the Edge Function', $q$ select public.update_profile(gen_random_uuid(), '22222222-0000-4000-8000-000000000005', '{"email": "x@y.z"}') $q$, 'PT422', 'field_not_editable');
  -- moving a supervisor to another unit changes what RLS shows them at once (no token refresh needed)
  perform pg_temp.ok('move SUP2 to U2', $q$ select public.update_profile(gen_random_uuid(), '22222222-0000-4000-8000-000000000005', '{"unit_id": "11111111-0000-4000-8000-000000000002"}') $q$);
  perform pg_temp.as_user(c_sup2);
  perform pg_temp.eq('SUP2 now plans with U2 crews', pg_temp.seen('select id from public.workers'), 'W3');
  -- deactivation: data access stops on the next statement; refresh tokens are revoked; tokens are refused at refresh
  perform pg_temp.as_user(c_sup1);
  perform pg_temp.eq('SUP1 sees ORD1 while active', pg_temp.seen('select id from public.orders'), 'ORD1');
  perform pg_temp.as_user(c_dir);
  -- open work blocks unit/role changes (reassign first) but never a deactivation, which reports what is left to reassign
  perform pg_temp.err('no unit move with open orders', $q$ select public.update_profile(gen_random_uuid(), '22222222-0000-4000-8000-000000000004', '{"unit_id": "11111111-0000-4000-8000-000000000002"}') $q$, 'PT409', 'has_open_orders');
  perform pg_temp.err('no role change with open orders', $q$ select public.update_profile(gen_random_uuid(), '22222222-0000-4000-8000-000000000004', '{"role": "administracion"}') $q$, 'PT409', 'has_open_orders');
  v := pg_temp.ok('deactivate', $q$ select public.update_profile(gen_random_uuid(), '22222222-0000-4000-8000-000000000004', '{"active": false}') $q$)::jsonb;
  perform pg_temp.eq('deactivate SUP1', v ->> 'active', 'false');
  perform pg_temp.eq('deactivation lists the open orders to reassign', (v -> 'open_orders')::text,
    (select jsonb_build_array(folio)::text from public.orders where id = '66666666-0000-4000-8000-000000000001'));
  perform pg_temp.check('deactivation audited', exists (select 1 from public.audit_log where action = 'Desactivó usuario Supervisora Uno'));
  perform pg_temp.as_owner();
  perform pg_temp.eq('SUP1 sessions revoked, SUP2 untouched',
    (select count(*) filter (where user_id = c_sup1)::text || '/' || count(*) filter (where user_id = c_sup2)::text from auth.sessions), '0/1');
  perform pg_temp.check('deactivated_at stamped', (select deactivated_at = now() from public.profiles where id = c_sup1));
  perform pg_temp.eq('hook refuses SUP1 tokens', private.custom_access_token_hook(jsonb_build_object('user_id', c_sup1, 'claims', '{}'::jsonb)) #>> '{error,http_code}', '403');
  perform pg_temp.as_user(c_sup1);
  perform pg_temp.eq('deactivated SUP1 sees nothing', pg_temp.seen('select id from public.orders'), '');
  perform pg_temp.err('deactivated SUP1 cannot act', $q$ select public.update_my_contact(gen_random_uuid(), '1') $q$, 'PT401', 'inactive');
  perform pg_temp.as_user(c_dir);
  perform pg_temp.ok('reactivate SUP1', $q$ select public.update_profile(gen_random_uuid(), '22222222-0000-4000-8000-000000000004', '{"active": true}') $q$);
  perform pg_temp.as_user(c_sup1);
  perform pg_temp.eq('reactivated SUP1 sees ORD1 again', pg_temp.seen('select id from public.orders'), 'ORD1');
  perform pg_temp.as_owner();
  perform pg_temp.eq('reactivation clears deactivated_at', (select (deactivated_at is null)::text from public.profiles where id = c_sup1), 'true');

  ------------------------------------------------------------------ self-service and identity
  perform pg_temp.as_user(c_sup2);
  perform pg_temp.ok('anyone updates their own phone', $q$ select public.update_my_contact(gen_random_uuid(), ' +52 81 0000 9999 ') $q$);
  perform pg_temp.as_owner();
  perform pg_temp.eq('phone saved, nothing else changed', (select concat_ws('|', phone, role, email) from public.profiles where id = c_sup2), '+52 81 0000 9999|supervisor|sup2@tests.invalid');
  perform pg_temp.err('auth users with a profile cannot be deleted (deactivate instead)', $q$ delete from auth.users where id = '22222222-0000-4000-8000-000000000005' $q$, '23503');
  v := private.custom_access_token_hook(jsonb_build_object('user_id', '22222222-0000-4000-8000-000000000008', 'claims', jsonb_build_object('app_metadata', '{}'::jsonb)));
  perform pg_temp.eq('hook for the provisioned account', v #>> '{claims,app_metadata,pulkro_role}', 'supervisor');
end $$;
