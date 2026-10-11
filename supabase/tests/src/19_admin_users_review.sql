-- 19 · Review of the account administration — migration admin_users_review (finding AU-3). sync_profile_email takes the
-- address the request set (p_email, part of the op digest): while the login holds it the profile copies it as before;
-- after another e-mail change of the same person came in between it refuses (PT409 email_changed) and changes and audits
-- nothing, so the change that won is audited under its own author. The old two-argument pair is gone; a call without
-- p_email (admin-users version 1) still copies the login as it is.
do $$
declare
  c_dir constant uuid := '22222222-0000-4000-8000-000000000001';
  c_dir2 constant uuid := '22222222-0000-4000-8000-000000000009';
  c_adm1 constant uuid := '22222222-0000-4000-8000-000000000002';
  c_sup2 constant uuid := '22222222-0000-4000-8000-000000000005';
  c_u1 constant uuid := '11111111-0000-4000-8000-000000000001';
  v_r1 uuid := gen_random_uuid();
  v_r2 uuid := gen_random_uuid();
  v_res jsonb;
  v_audits integer;
begin
  -- one implementation and one wrapper, both with the address
  perform pg_temp.eq('a single public sync_profile_email',
    (select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'sync_profile_email'), '1');
  perform pg_temp.eq('a single private sync_profile_email, taking the address',
    (select string_agg(pg_get_function_identity_arguments(p.oid), ' | ') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'private' and p.proname = 'sync_profile_email'), 'p_op_id uuid, p_user_id uuid, p_email text');

  -- a second Dirección
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', pg_temp.label(c_dir2, 'DIR2'), 'authenticated', 'authenticated', 'dir2@tests.invalid', '', now(),
          '{"provider":"email","providers":["email"]}', '{}', now(), now());
  insert into public.profiles (id, name, initials, role, title, unit_id, email, active, deactivated_at)
  values (c_dir2, 'Dirección Dos', 'DD', 'direccion', 'Directora', c_u1, 'dir2@tests.invalid', true, null);
  select count(*) into v_audits from public.audit_log where entity_id = c_sup2;

  -- The race: R1 (DIR) sets B on the login, R2 (DIR2) sets C, then R1 syncs. R1 is refused and changes nothing.
  update auth.users set email = 'b@tests.invalid' where id = c_sup2;
  update auth.users set email = 'C@Tests.invalid' where id = c_sup2;
  perform pg_temp.as_user(c_dir);
  perform pg_temp.err('R1 syncs after another change of the login: email_changed',
    format($q$ select public.sync_profile_email(%L, %L, 'b@tests.invalid') $q$, v_r1, c_sup2), 'PT409', 'email_changed');
  perform pg_temp.as_owner();
  perform pg_temp.eq('R1: the profile keeps its address', (select email from public.profiles where id = c_sup2), 'sup2@tests.invalid');
  perform pg_temp.eq('R1: nothing audited', (select count(*) from public.audit_log where entity_id = c_sup2)::text, v_audits::text);

  -- R2's own sync copies C (compared trimmed and lower-cased) and is audited under DIR2, not DIR
  perform pg_temp.as_user(c_dir2);
  v_res := pg_temp.ok('R2 syncs its own address',
    format($q$ select public.sync_profile_email(%L, %L, ' C@tests.INVALID ') $q$, v_r2, c_sup2))::jsonb;
  perform pg_temp.eq('R2: changed', v_res ->> 'changed', 'true');
  perform pg_temp.eq('R2: the address, lower-case', v_res ->> 'email', 'c@tests.invalid');
  perform pg_temp.as_owner();
  perform pg_temp.eq('the profile holds C', (select email from public.profiles where id = c_sup2), 'c@tests.invalid');
  perform pg_temp.check('audited under DIR2 with the old and new address', exists (
    select 1 from public.audit_log
    where entity = 'usuario' and entity_id = c_sup2 and actor_id = c_dir2 and op_id = v_r2
      and reason = 'sup2@tests.invalid → c@tests.invalid'));
  perform pg_temp.check('nothing audited under DIR', not exists (
    select 1 from public.audit_log where entity_id = c_sup2 and actor_id = c_dir and action like 'Cambió el correo%'));

  -- R1 sent again (same op, same address) is still refused: the refusal stored nothing, the login still holds C
  perform pg_temp.as_user(c_dir);
  perform pg_temp.err('R1 retried: still email_changed',
    format($q$ select public.sync_profile_email(%L, %L, 'b@tests.invalid') $q$, v_r1, c_sup2), 'PT409', 'email_changed');

  -- retries of R2: the same address answers the stored result; another address under the same op id is refused (the
  -- digest covers p_email)
  perform pg_temp.as_user(c_dir2);
  perform pg_temp.eq('R2 retried answers the stored result',
    pg_temp.ok('R2 retry', format($q$ select public.sync_profile_email(%L, %L, ' C@tests.INVALID ') ->> 'duplicate' $q$, v_r2, c_sup2)), 'true');
  perform pg_temp.err('R2 op id with another address',
    format($q$ select public.sync_profile_email(%L, %L, 'b@tests.invalid') $q$, v_r2, c_sup2), 'PT409', 'op_id_reused');

  -- only an active Dirección, before anything is compared
  perform pg_temp.as_user(c_adm1);
  perform pg_temp.err('Administración is still refused',
    format($q$ select public.sync_profile_email(gen_random_uuid(), %L, 'c@tests.invalid') $q$, c_sup2), 'PT403', 'forbidden:users.admin');

  -- a caller without p_email (admin-users version 1) copies the login as it is
  perform pg_temp.as_owner();
  update auth.users set email = 'd@tests.invalid' where id = c_sup2;
  perform pg_temp.as_user(c_dir);
  perform pg_temp.eq('two-argument call copies the login',
    pg_temp.ok('v1 call', format($q$ select public.sync_profile_email(gen_random_uuid(), %L) ->> 'email' $q$, c_sup2)), 'd@tests.invalid');
  perform pg_temp.as_owner();
end $$;
