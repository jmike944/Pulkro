-- 20 · Owner decisions on the account administration — migration admin_users_decisions.
-- Decision 3: a login e-mail change the person confirmed themself is mirrored into profiles.email by the trigger
-- pulkro_mirror_email_change on auth.users (audited as their own change); Dirección's admin update never matches it; an
-- address another profile uses, or an account without profile, changes nothing and raises nothing (the trigger runs inside
-- GoTrue's transaction). Decision 2: sync_profile_email ends the person's sessions when it actually changes the e-mail, and
-- only theirs; a no-op or a refusal ends nothing. The GoTrue statements are simulated as the owner, the way the earlier
-- suites change auth.users: a self-service completion sets email to the pending address and clears email_change in one
-- update (models.User.ConfirmEmailChange); the admin update writes email alone.
do $$
declare
  c_dir constant uuid := '22222222-0000-4000-8000-000000000001';
  c_adm1 constant uuid := '22222222-0000-4000-8000-000000000002';
  c_sup1 constant uuid := '22222222-0000-4000-8000-000000000004';
  c_sup2 constant uuid := '22222222-0000-4000-8000-000000000005';
  c_sup3 constant uuid := '22222222-0000-4000-8000-000000000006';
  c_newbie constant uuid := '22222222-0000-4000-8000-000000000008';
  c_u1 constant uuid := '11111111-0000-4000-8000-000000000001';
  v_audits integer;
  v_version integer;
  v_res jsonb;
begin
  ----------------------------------------------------------------------------------------------------------------------
  -- Shape: the trigger and its function (definer, pinned search_path, no API role can call it); sync_profile_email keeps
  -- its signature, digest binding and grants.
  ----------------------------------------------------------------------------------------------------------------------
  perform pg_temp.check('trigger on auth.users, after update of email, enabled', exists (
    select 1 from pg_trigger t
    where t.tgrelid = 'auth.users'::regclass and t.tgname = 'pulkro_mirror_email_change' and not t.tgisinternal
      and t.tgenabled = 'O' and t.tgfoid = 'private.mirror_auth_email_change()'::regprocedure
      and pg_get_triggerdef(t.oid) like '%AFTER UPDATE OF email ON auth.users FOR EACH ROW WHEN%'));
  perform pg_temp.check('trigger function: security definer with search_path pinned', exists (
    select 1 from pg_proc p where p.oid = 'private.mirror_auth_email_change()'::regprocedure
      and p.prosecdef and exists (select 1 from unnest(p.proconfig) c where c in ('search_path=""', 'search_path='))));
  perform pg_temp.check('no API role executes the trigger function',
    not has_function_privilege('anon', 'private.mirror_auth_email_change()', 'execute')
    and not has_function_privilege('authenticated', 'private.mirror_auth_email_change()', 'execute')
    and not has_function_privilege('service_role', 'private.mirror_auth_email_change()', 'execute'));
  perform pg_temp.eq('a single private sync_profile_email, same arguments',
    (select string_agg(pg_get_function_identity_arguments(p.oid), ' | ') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'private' and p.proname = 'sync_profile_email'), 'p_op_id uuid, p_user_id uuid, p_email text');
  perform pg_temp.check('sync_profile_email wrapper binds the op args and is executable by authenticated only', exists (
    select 1 from pg_proc p where p.oid = 'public.sync_profile_email(uuid, uuid, text)'::regprocedure
      and p.prosrc like '%pulkro.op_args%' and not p.prosecdef
      and has_function_privilege('authenticated', p.oid, 'execute') and not has_function_privilege('anon', p.oid, 'execute')
      and not has_function_privilege('service_role', p.oid, 'execute')));
  perform pg_temp.check('its private half too: authenticated only (expose_rpc grants both)',
    has_function_privilege('authenticated', 'private.sync_profile_email(uuid, uuid, text)', 'execute')
    and not has_function_privilege('anon', 'private.sync_profile_email(uuid, uuid, text)', 'execute')
    and not has_function_privilege('service_role', 'private.sync_profile_email(uuid, uuid, text)', 'execute'));

  ----------------------------------------------------------------------------------------------------------------------
  -- Decision 3 · self-service completion (first block of the file: no RPC has set an op id in this transaction yet, as in
  -- GoTrue's connection). SUP1 asked for Nuevo.Sup1@… (email_change), then confirmed it.
  ----------------------------------------------------------------------------------------------------------------------
  select count(*) into v_audits from public.audit_log where entity_id = c_sup1;
  select row_version into v_version from public.profiles where id = c_sup1;
  update auth.users set email_change = 'Nuevo.Sup1@Tests.invalid' where id = c_sup1;
  perform pg_temp.eq('a pending request alone changes nothing', (select email from public.profiles where id = c_sup1), 'sup1@tests.invalid');
  perform pg_temp.ok('self-service completion',
    format($q$ update auth.users set email = 'Nuevo.Sup1@Tests.invalid', email_change = '' where id = %L returning email $q$, c_sup1));
  perform pg_temp.eq('the profile follows, lower-case', (select email from public.profiles where id = c_sup1), 'nuevo.sup1@tests.invalid');
  perform pg_temp.check('row_version bumped (the pull sees it)', (select row_version from public.profiles where id = c_sup1) = v_version + 1);
  perform pg_temp.eq('one audit row', (select count(*) from public.audit_log where entity_id = c_sup1)::text, (v_audits + 1)::text);
  perform pg_temp.check('audited as the person''s own change, in their unit, old → new', exists (
    select 1 from public.audit_log
    where entity = 'usuario' and entity_id = c_sup1 and actor_kind = 'usuario' and actor_id = c_sup1
      and actor_name = 'Supervisora Uno' and unit_id = c_u1 and order_id is null and op_id is null
      and action = 'Cambió su correo de acceso' and reason = 'sup1@tests.invalid → nuevo.sup1@tests.invalid'));

  -- Dirección's admin update (updateUserById with email_confirm) writes email alone: never mirrored.
  select count(*) into v_audits from public.audit_log where entity_id = c_sup3;
  perform pg_temp.ok('admin-style update, nothing pending',
    format($q$ update auth.users set email = 'Admin.Set@Tests.invalid' where id = %L returning email $q$, c_sup3));
  perform pg_temp.eq('admin-style: the profile is left alone', (select email from public.profiles where id = c_sup3), 'sup3@tests.invalid');
  -- … not even when it sets exactly the address the person had asked for (email_change stays as it was)
  update auth.users set email_change = 'pedido.sup3@tests.invalid' where id = c_sup3;
  perform pg_temp.ok('admin-style update to the pending address',
    format($q$ update auth.users set email = 'pedido.sup3@tests.invalid' where id = %L returning email $q$, c_sup3));
  perform pg_temp.eq('admin-style to the pending address: the profile is left alone',
    (select email from public.profiles where id = c_sup3), 'sup3@tests.invalid');
  -- … nor a completion of another address than the pending one
  update auth.users set email_change = 'pedido.sup3@tests.invalid' where id = c_sup3;
  perform pg_temp.ok('email set to another address than the pending one',
    format($q$ update auth.users set email = 'otro.sup3@tests.invalid', email_change = '' where id = %L returning email $q$, c_sup3));
  perform pg_temp.eq('another address: the profile is left alone', (select email from public.profiles where id = c_sup3), 'sup3@tests.invalid');
  perform pg_temp.eq('admin-style: nothing audited', (select count(*) from public.audit_log where entity_id = c_sup3)::text, v_audits::text);

  -- An address another profile already uses (SUP3's profile, not an auth account): no error, both profiles unchanged, no
  -- audit row, and GoTrue's update itself goes through.
  update public.profiles set email = 'ocupado@tests.invalid' where id = c_sup3;
  select count(*) into v_audits from public.audit_log where entity_id in (c_sup2, c_sup3);
  update auth.users set email_change = 'Ocupado@Tests.invalid' where id = c_sup2;
  perform pg_temp.ok('completion to an address another profile uses raises nothing',
    format($q$ update auth.users set email = 'ocupado@tests.invalid', email_change = '' where id = %L returning email $q$, c_sup2));
  perform pg_temp.eq('taken: GoTrue''s update went through', (select email from auth.users where id = c_sup2), 'ocupado@tests.invalid');
  perform pg_temp.eq('taken: SUP2 keeps its address', (select email from public.profiles where id = c_sup2), 'sup2@tests.invalid');
  perform pg_temp.eq('taken: SUP3 keeps its address', (select email from public.profiles where id = c_sup3), 'ocupado@tests.invalid');
  perform pg_temp.eq('taken: nothing audited',
    (select count(*) from public.audit_log where entity_id in (c_sup2, c_sup3))::text, v_audits::text);

  -- An auth account without profile (NEWBIE): no error, no profile created, nothing audited.
  update auth.users set email_change = 'newbie.nuevo@tests.invalid' where id = c_newbie;
  perform pg_temp.ok('completion for an account without profile raises nothing',
    format($q$ update auth.users set email = 'newbie.nuevo@tests.invalid', email_change = '' where id = %L returning email $q$, c_newbie));
  perform pg_temp.check('still no profile for NEWBIE', not exists (select 1 from public.profiles where id = c_newbie));
  perform pg_temp.check('nothing audited for NEWBIE', not exists (select 1 from public.audit_log where entity_id = c_newbie));

  -- put the fixtures back for the sessions half
  update public.profiles set email = 'sup3@tests.invalid' where id = c_sup3;
  update auth.users set email = 'sup2@tests.invalid' where id = c_sup2;
  update auth.users set email = 'sup3@tests.invalid' where id = c_sup3;

  ----------------------------------------------------------------------------------------------------------------------
  -- Decision 2 · sync_profile_email ends the sessions of the person whose e-mail it changed, and nobody else's.
  -- The prelude gives SUP1 and SUP2 one session each; DIR (the caller) and ADM1 get one here.
  ----------------------------------------------------------------------------------------------------------------------
  insert into auth.sessions (id, user_id, created_at, updated_at) values
    ('22222222-9000-4000-8000-000000000001', c_dir, now(), now()),
    ('22222222-9000-4000-8000-000000000002', c_adm1, now(), now()),
    ('22222222-9000-4000-8000-0000000000a5', c_sup2, now(), now());

  -- a refusal ends nothing: the login holds another address than the request's (email_changed)
  update auth.users set email = 'cambio.sup2@tests.invalid' where id = c_sup2;
  perform pg_temp.as_user(c_dir);
  perform pg_temp.err('sync refused (email_changed)',
    format($q$ select public.sync_profile_email(gen_random_uuid(), %L, 'otro.sup2@tests.invalid') $q$, c_sup2), 'PT409', 'email_changed');
  perform pg_temp.as_owner();
  perform pg_temp.eq('refused: SUP2 keeps both sessions', (select count(*) from auth.sessions where user_id = c_sup2)::text, '2');

  -- the change: SUP2's sessions end, everybody else's stay
  perform pg_temp.as_user(c_dir);
  v_res := pg_temp.ok('sync changes the e-mail',
    format($q$ select public.sync_profile_email(gen_random_uuid(), %L, 'cambio.sup2@tests.invalid') $q$, c_sup2))::jsonb;
  perform pg_temp.eq('changed', v_res ->> 'changed', 'true');
  perform pg_temp.as_owner();
  perform pg_temp.eq('the profile holds the new address', (select email from public.profiles where id = c_sup2), 'cambio.sup2@tests.invalid');
  perform pg_temp.check('SUP2''s sessions are gone', not exists (select 1 from auth.sessions where user_id = c_sup2));
  perform pg_temp.eq('nobody else''s session ended (DIR, ADM1, SUP1)',
    (select string_agg(user_id::text, ',' order by user_id) from auth.sessions where user_id in (c_dir, c_adm1, c_sup1)),
    concat_ws(',', c_dir, c_adm1, c_sup1));
  perform pg_temp.check('audited under Dirección as before', exists (
    select 1 from public.audit_log
    where entity = 'usuario' and entity_id = c_sup2 and actor_id = c_dir and action = 'Cambió el correo de Supervisor Dos'
      and reason = 'sup2@tests.invalid → cambio.sup2@tests.invalid'));

  -- a no-op sync (already in sync) ends nothing: SUP2 signs in again, then Dirección syncs the same address
  insert into auth.sessions (id, user_id, created_at, updated_at) values ('22222222-9000-4000-8000-0000000000b5', c_sup2, now(), now());
  perform pg_temp.as_user(c_dir);
  perform pg_temp.eq('no-op sync',
    pg_temp.ok('no-op', format($q$ select public.sync_profile_email(gen_random_uuid(), %L, 'cambio.sup2@tests.invalid') ->> 'changed' $q$, c_sup2)),
    'false');
  perform pg_temp.as_owner();
  perform pg_temp.eq('no-op: SUP2''s new session stays', (select count(*) from auth.sessions where user_id = c_sup2)::text, '1');

  -- a self-service change (decision 3) is the person's own: the trigger does not end their sessions, and Dirección's later
  -- sync of the same address is a no-op
  update auth.users set email_change = 'propio.sup2@tests.invalid' where id = c_sup2;
  update auth.users set email = 'propio.sup2@tests.invalid', email_change = '' where id = c_sup2;
  perform pg_temp.eq('self-service mirrored', (select email from public.profiles where id = c_sup2), 'propio.sup2@tests.invalid');
  perform pg_temp.eq('self-service: the session stays', (select count(*) from auth.sessions where user_id = c_sup2)::text, '1');
  perform pg_temp.as_user(c_dir);
  perform pg_temp.eq('sync after a self-service change',
    pg_temp.ok('sync after self-service', format($q$ select public.sync_profile_email(gen_random_uuid(), %L, 'propio.sup2@tests.invalid') ->> 'changed' $q$, c_sup2)),
    'false');
  perform pg_temp.as_owner();
  perform pg_temp.eq('sync after self-service: the session stays', (select count(*) from auth.sessions where user_id = c_sup2)::text, '1');
end $$;
