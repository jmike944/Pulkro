-- Pulkro Cuadrillas · backend 21 · owner decisions on the account administration (2026-10-11)
-- Applies after 20261011154423_admin_users_review (it recreates that version of sync_profile_email).
--   · Decision 2: changing someone's login e-mail ends that person's sessions. sync_profile_email deletes the person's
--     auth.sessions (refresh tokens go with them) in the branch that actually changes profiles.email, exactly as
--     update_profile does on deactivation; a no-op, a retry or a refusal ends nothing.
--   · Decision 3: a login e-mail change the person asked for themself (auth.updateUser + the confirmation link) is mirrored
--     into profiles.email by a fail-safe trigger on auth.users, audited as the person's own change. Dirección's change
--     (admin-users change_email) keeps going through sync_profile_email, which audits it under its author.
-- See docs/backend/architecture.md §2 and supabase/functions/admin-users/README.md.

------------------------------------------------------------------------------------------------------------------------
-- Decision 2 · sync_profile_email(p_op_id, p_user_id, p_email default null), the 20261011154423 version plus the session
-- revocation. Same pattern as that migration: drop both halves, recreate the implementation, then expose_rpc regenerates
-- the wrapper (op id bound to a SHA-256 digest of (p_user_id, p_email)) and grants EXECUTE to authenticated on both.
-- Signature, digest and privileges end up exactly as before.
------------------------------------------------------------------------------------------------------------------------
drop function public.sync_profile_email(uuid, uuid, text);
drop function private.sync_profile_email(uuid, uuid, text);

create function private.sync_profile_email(p_op_id uuid, p_user_id uuid, p_email text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me public.profiles;
  v_dup jsonb;
  v_prev public.profiles;
  v_email text;
begin
  v_me := private.actor();
  v_dup := private.begin_op(p_op_id, v_me.id, 'sync_profile_email');
  if v_dup is not null then return v_dup; end if;
  perform private.require(v_me, 'users.admin');

  -- Held until commit: a concurrent update_profile or sync of the same person waits (and vice versa).
  select * into v_prev from public.profiles p where p.id = p_user_id for update;
  if not found then
    perform private.fail('PT404', 'No encontrado o fuera de su alcance.', 'out_of_scope');
  end if;
  select lower(btrim(u.email)) into v_email from auth.users u where u.id = p_user_id;
  if coalesce(v_email, '') = '' then
    perform private.fail('PT404', 'La cuenta de acceso no tiene correo.', 'auth_user_missing');
  end if;
  -- The login no longer holds the address this request set: another change of the same account came in between. Its own
  -- sync copies it (and audits it under its author); this one changes nothing.
  if p_email is not null and lower(btrim(p_email)) <> v_email then
    perform private.fail('PT409',
      'Otra persona de Dirección cambió el correo de esta cuenta al mismo tiempo. Actualice la pantalla y revise el correo actual.',
      'email_changed');
  end if;

  if v_email = v_prev.email then
    return private.finish_op(p_op_id, jsonb_build_object('user_id', p_user_id, 'email', v_email, 'changed', false));
  end if;
  if exists (select 1 from public.profiles p where p.email = v_email and p.id <> p_user_id) then
    perform private.fail('PT409', 'Ese correo ya pertenece a otra cuenta de Pulkro Cuadrillas: use uno distinto.', 'email_taken');
  end if;

  update public.profiles set email = v_email where id = p_user_id;
  -- Decision 2: the login changed, so every session of the person ends with it (as on deactivation): devices signed in
  -- with the old address cannot renew their token and the person signs in again with the new one.
  delete from auth.sessions s where s.user_id = p_user_id; -- refresh tokens go with their sessions
  perform private.audit(v_me, 'usuario', p_user_id, format('Cambió el correo de %s', v_prev.name), null, v_prev.unit_id,
    format('%s → %s', v_prev.email, v_email));
  return private.finish_op(p_op_id, jsonb_build_object('user_id', p_user_id, 'email', v_email, 'changed', true));
exception
  -- a concurrent provision_profile / sync took the address between the check and the update (profiles_email_key)
  when unique_violation then
    perform private.fail('PT409', 'Ese correo ya pertenece a otra cuenta de Pulkro Cuadrillas: use uno distinto.', 'email_taken');
end;
$$;

revoke all on function private.sync_profile_email(uuid, uuid, text) from public, anon, authenticated, service_role;
select private.expose_rpc('sync_profile_email');

------------------------------------------------------------------------------------------------------------------------
-- Decision 3 · a self-service login e-mail change, once confirmed, is mirrored into profiles.email.
-- GoTrue completes a user-requested change (auth.updateUser({email}) + the confirmation link, or both links with secure
-- e-mail change) in ONE update of auth.users that sets email to the pending address and clears email_change
-- (models.User.ConfirmEmailChange). That statement is recognised by: the e-mail really changed, the old row had a pending
-- change, the new e-mail is that pending address, and the pending change is cleared in the same statement. Dirección's
-- path (admin updateUserById with email_confirm) writes email alone and leaves email_change as it was, so it never matches,
-- not even when it sets exactly the address the person had asked for: sync_profile_email stays the path that copies and
-- audits Dirección's changes.
-- Fail-safe: the trigger runs inside GoTrue's transaction (no JWT: private.actor() cannot be used), and an error there
-- would break the person's confirmation. So it never raises: an address another profile already uses (profiles_email_key)
-- or any other error leaves the profile as it was and writes no audit row (a sub-transaction rolls back its writes).
------------------------------------------------------------------------------------------------------------------------
create function private.mirror_auth_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prof public.profiles;
  v_email text;
begin
  -- The trigger's WHEN clause already holds this; checked again so the function never acts on anything else.
  if new.email is not distinct from old.email
     or coalesce(old.email_change, '') = ''
     or lower(old.email_change) is distinct from lower(new.email)
     or coalesce(new.email_change, '') <> '' then
    return null;
  end if;

  begin
    v_email := lower(btrim(new.email));
    select * into v_prof from public.profiles p where p.id = new.id for update;
    -- no profile (an account Pulkro does not know), or already in sync: nothing to do
    if not found or v_prof.email = v_email then
      return null;
    end if;
    update public.profiles set email = v_email where id = new.id;
    -- the person's own change: they are the actor (private.audit takes the actor's profile row; the unit is theirs)
    perform private.audit(v_prof, 'usuario', new.id, 'Cambió su correo de acceso', null, v_prof.unit_id,
      format('%s → %s', v_prof.email, v_email));
  exception
    when unique_violation then
      null; -- another profile already uses the address: the profile keeps its own, nothing audited
    when others then
      raise warning 'private.mirror_auth_email_change: profile e-mail not mirrored (SQLSTATE %)', sqlstate;
  end;
  return null;
end;
$$;

comment on function private.mirror_auth_email_change() is
  'Trigger (auth.users, AFTER UPDATE OF email): mirrors a SELF-SERVICE login e-mail change into public.profiles.email, '
  'audited as the person''s own change ("Cambió su correo de acceso", old → new). Acts only when GoTrue completes a pending '
  'change in one statement: new.email is distinct from old.email, old.email_change is not empty, lower(old.email_change) = '
  'lower(new.email) and new.email_change is empty. Anything else (Dirección''s admin update, which goes through '
  'sync_profile_email; any GoTrue behaviour that does not look like this) leaves the status quo. Never raises: an address '
  'another profile uses, or any error, leaves the profile unchanged and writes no audit row.';

revoke execute on function private.mirror_auth_email_change() from public, anon, authenticated, service_role;

create trigger pulkro_mirror_email_change
  after update of email on auth.users
  for each row
  when (new.email is distinct from old.email
        and coalesce(old.email_change, '') <> ''
        and lower(old.email_change) = lower(new.email)
        and coalesce(new.email_change, '') = '')
  execute function private.mirror_auth_email_change();

comment on column public.profiles.email is
  'Copy of auth.users.email (lower-case). Written only by provision_profile (invite), sync_profile_email (change_email of '
  'the admin-users Edge Function) and the trigger pulkro_mirror_email_change on auth.users (a change the person confirmed '
  'themself).';
