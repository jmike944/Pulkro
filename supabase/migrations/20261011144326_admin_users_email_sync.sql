-- Pulkro Cuadrillas · backend 19 · account administration (phase 5 of §12, decision 11)
-- The `admin-users` Edge Function changes a person's login e-mail with the Auth admin API (secret key, email_confirm) and
-- then calls private.sync_profile_email with the CALLER's JWT, so the profile copy follows the auth account: the database
-- re-checks users.admin, writes the lower-cased address and audits who did it. The client never writes profiles.email
-- (update_profile refuses the key): it only mirrors auth.users.email (provision_profile at the invite, this RPC after a
-- change). See docs/backend/architecture.md §2 and supabase/functions/admin-users/README.md.

------------------------------------------------------------------------------------------------------------------------
-- sync_profile_email(p_op_id, p_user_id) → {ok, user_id, email, changed}. Idempotent per op id like every RPC; an address
-- already in sync answers changed:false without an audit row; an address another profile uses → PT409 email_taken.
------------------------------------------------------------------------------------------------------------------------
create function private.sync_profile_email(p_op_id uuid, p_user_id uuid)
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

  -- Held until commit: a concurrent update_profile of the same person waits (and vice versa).
  select * into v_prev from public.profiles p where p.id = p_user_id for update;
  if not found then
    perform private.fail('PT404', 'No encontrado o fuera de su alcance.', 'out_of_scope');
  end if;
  select lower(btrim(u.email)) into v_email from auth.users u where u.id = p_user_id;
  if coalesce(v_email, '') = '' then
    perform private.fail('PT404', 'La cuenta de acceso no tiene correo.', 'auth_user_missing');
  end if;

  if v_email = v_prev.email then
    return private.finish_op(p_op_id, jsonb_build_object('user_id', p_user_id, 'email', v_email, 'changed', false));
  end if;
  if exists (select 1 from public.profiles p where p.email = v_email and p.id <> p_user_id) then
    perform private.fail('PT409', 'Ese correo ya pertenece a otra cuenta de Pulkro Cuadrillas: use uno distinto.', 'email_taken');
  end if;

  update public.profiles set email = v_email where id = p_user_id;
  perform private.audit(v_me, 'usuario', p_user_id, format('Cambió el correo de %s', v_prev.name), null, v_prev.unit_id,
    format('%s → %s', v_prev.email, v_email));
  return private.finish_op(p_op_id, jsonb_build_object('user_id', p_user_id, 'email', v_email, 'changed', true));
exception
  -- a concurrent provision_profile / sync took the address between the check and the update (profiles_email_key)
  when unique_violation then
    perform private.fail('PT409', 'Ese correo ya pertenece a otra cuenta de Pulkro Cuadrillas: use uno distinto.', 'email_taken');
end;
$$;

comment on column public.profiles.email is
  'Copy of auth.users.email (lower-case). Written only by provision_profile (invite) and sync_profile_email (change_email of the admin-users Edge Function).';

------------------------------------------------------------------------------------------------------------------------
-- Privileges: the implementation is reachable only through its invoker wrapper (expose_rpc binds the op id to the
-- request digest and grants EXECUTE to authenticated on both).
------------------------------------------------------------------------------------------------------------------------
revoke all on function private.sync_profile_email(uuid, uuid) from public, anon, authenticated, service_role;
select private.expose_rpc('sync_profile_email');