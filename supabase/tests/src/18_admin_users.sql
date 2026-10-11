-- 18 · Account administration — migration admin_users_email_sync. The admin-users Edge Function changes the login e-mail
-- with the Auth admin API and then calls sync_profile_email with the caller's JWT: only an active Dirección (users.admin),
-- the profile copies auth.users.email in lower case, the change is audited (old → new) and bumps row_version for the pull,
-- retries of the same op id answer the stored result, an address another profile uses is refused (email_taken) and
-- update_profile still refuses the e-mail key. The deactivate/reactivate half of the function relays update_profile: the
-- contract it reads (open_orders on deactivation, none on reactivation, self_change) is pinned here as well.
do $$
declare
  c_dir constant uuid := '22222222-0000-4000-8000-000000000001';
  c_adm1 constant uuid := '22222222-0000-4000-8000-000000000002';
  c_sup1 constant uuid := '22222222-0000-4000-8000-000000000004';
  c_sup2 constant uuid := '22222222-0000-4000-8000-000000000005';
  c_sup3 constant uuid := '22222222-0000-4000-8000-000000000006';
  c_inact constant uuid := '22222222-0000-4000-8000-000000000007';
  c_newbie constant uuid := '22222222-0000-4000-8000-000000000008';
  c_u1 constant uuid := '11111111-0000-4000-8000-000000000001';
  v_op uuid := gen_random_uuid();
  v_res jsonb;
  v_version integer;
  v_audits integer;
  v_o uuid;
begin
  -- The function has already changed the auth account (updateUserById with email_confirm) when it calls the RPC.
  update auth.users set email = 'Supervisor.Dos@Tests.invalid' where id = c_sup2;
  select row_version into v_version from public.profiles where id = c_sup2;

  -- only an active Dirección
  perform pg_temp.as_user(c_adm1);
  perform pg_temp.err('Administración does not sync e-mails',
    format($q$ select public.sync_profile_email(gen_random_uuid(), %L) $q$, c_sup2), 'PT403', 'forbidden:users.admin');
  perform pg_temp.as_user(c_sup1);
  perform pg_temp.err('a supervisor does not sync e-mails',
    format($q$ select public.sync_profile_email(gen_random_uuid(), %L) $q$, c_sup2), 'PT403', 'forbidden:users.admin');
  perform pg_temp.as_user(c_inact);
  perform pg_temp.err('a deactivated account cannot',
    format($q$ select public.sync_profile_email(gen_random_uuid(), %L) $q$, c_sup2), 'PT401', 'inactive');
  perform pg_temp.as_anon();
  perform pg_temp.err('anon cannot call it',
    format($q$ select public.sync_profile_email(gen_random_uuid(), %L) $q$, c_sup2), '42501');
  perform pg_temp.as_owner();
  perform pg_temp.eq('refused calls leave the profile alone', (select email from public.profiles where id = c_sup2), 'sup2@tests.invalid');

  -- Dirección: the profile copies the auth address in lower case, audited, row_version bumped (the pull sees it)
  perform pg_temp.as_user(c_dir);
  v_res := pg_temp.ok('Dirección syncs the e-mail', format($q$ select public.sync_profile_email(%L, %L) $q$, v_op, c_sup2))::jsonb;
  perform pg_temp.eq('result: the new address', v_res ->> 'email', 'supervisor.dos@tests.invalid');
  perform pg_temp.eq('result: changed', v_res ->> 'changed', 'true');
  perform pg_temp.as_owner();
  perform pg_temp.eq('profile follows auth.users, lower-case', (select email from public.profiles where id = c_sup2), 'supervisor.dos@tests.invalid');
  perform pg_temp.check('row_version bumped', (select row_version from public.profiles where id = c_sup2) = v_version + 1);
  perform pg_temp.check('audited by Dirección with the old and new address', exists (
    select 1 from public.audit_log
    where entity = 'usuario' and entity_id = c_sup2 and actor_id = c_dir and op_id = v_op and unit_id = c_u1
      and action = 'Cambió el correo de Supervisor Dos' and reason = 'sup2@tests.invalid → supervisor.dos@tests.invalid'));
  select count(*) into v_audits from public.audit_log where entity_id = c_sup2;

  -- a retry of the same op answers the stored result; the op id cannot be replayed for someone else
  perform pg_temp.as_user(c_dir);
  perform pg_temp.eq('retry answers the stored result',
    pg_temp.ok('retry', format($q$ select public.sync_profile_email(%L, %L) ->> 'duplicate' $q$, v_op, c_sup2)), 'true');
  perform pg_temp.err('op id reused for another account',
    format($q$ select public.sync_profile_email(%L, %L) $q$, v_op, c_sup3), 'PT409', 'op_id_reused');
  -- nothing to change: ok, changed false, no audit row
  perform pg_temp.eq('already in sync',
    pg_temp.ok('no-op', format($q$ select public.sync_profile_email(gen_random_uuid(), %L) ->> 'changed' $q$, c_sup2)), 'false');
  perform pg_temp.as_owner();
  perform pg_temp.eq('no audit row for a retry or a no-op', (select count(*) from public.audit_log where entity_id = c_sup2)::text, v_audits::text);

  -- an address another profile already uses is refused, nothing changes
  update public.profiles set email = 'ocupado@tests.invalid' where id = c_sup3;
  update auth.users set email = 'Ocupado@Tests.invalid' where id = c_sup1;
  perform pg_temp.as_user(c_dir);
  perform pg_temp.err('an address of another profile is refused',
    format($q$ select public.sync_profile_email(gen_random_uuid(), %L) $q$, c_sup1), 'PT409', 'email_taken');
  perform pg_temp.as_owner();
  perform pg_temp.eq('SUP1 keeps its address', (select email from public.profiles where id = c_sup1), 'sup1@tests.invalid');
  update auth.users set email = 'sup1@tests.invalid' where id = c_sup1;

  -- accounts without a profile, unknown ids
  perform pg_temp.as_user(c_dir);
  perform pg_temp.err('an auth account without profile',
    format($q$ select public.sync_profile_email(gen_random_uuid(), %L) $q$, c_newbie), 'PT404', 'out_of_scope');
  perform pg_temp.err('an unknown id',
    format($q$ select public.sync_profile_email(gen_random_uuid(), %L) $q$, '22222222-0000-4000-8000-0000000000ff'), 'PT404', 'out_of_scope');

  -- a deactivated person's address can still be corrected
  perform pg_temp.as_owner();
  update auth.users set email = 'inactivo@tests.invalid' where id = c_inact;
  perform pg_temp.as_user(c_dir);
  perform pg_temp.ok('a deactivated account is synced too', format($q$ select public.sync_profile_email(gen_random_uuid(), %L) $q$, c_inact));
  perform pg_temp.as_owner();
  perform pg_temp.eq('deactivated profile follows', (select email from public.profiles where id = c_inact), 'inactivo@tests.invalid');

  -- the e-mail is never a profile field the client edits
  perform pg_temp.as_user(c_dir);
  perform pg_temp.err('update_profile refuses the e-mail key',
    format($q$ select public.update_profile(gen_random_uuid(), %L, '{"email": "otro@tests.invalid"}') $q$, c_sup2), 'PT422', 'field_not_editable');

  -- What the function relays for deactivate / reactivate (then it bans / unbans through the admin API).
  v_o := pg_temp.new_order(1);
  perform pg_temp.as_user(c_dir);
  perform pg_temp.err('Dirección cannot deactivate itself',
    format($q$ select public.update_profile(gen_random_uuid(), %L, '{"active": false}') $q$, c_dir), 'PT409', 'self_change');
  v_res := pg_temp.ok('deactivate', format($q$ select public.update_profile(gen_random_uuid(), %L, '{"active": false}') $q$, c_sup1))::jsonb;
  perform pg_temp.eq('deactivation: inactive', v_res ->> 'active', 'false');
  perform pg_temp.as_owner();
  perform pg_temp.eq('deactivation: the open orders left to reassign', v_res ->> 'open_orders',
    (select jsonb_build_array(o.folio)::text from public.orders o where o.id = v_o));
  perform pg_temp.check('deactivation: sessions revoked', not exists (select 1 from auth.sessions where user_id = c_sup1));
  perform pg_temp.as_user(c_dir);
  v_res := pg_temp.ok('reactivate', format($q$ select public.update_profile(gen_random_uuid(), %L, '{"active": true}') $q$, c_sup1))::jsonb;
  perform pg_temp.eq('reactivation: active', v_res ->> 'active', 'true');
  perform pg_temp.eq('reactivation: no open orders reported', v_res ->> 'open_orders', '[]');
  perform pg_temp.as_owner();
end $$;
