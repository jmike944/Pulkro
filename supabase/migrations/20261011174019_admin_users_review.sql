-- Pulkro Cuadrillas · backend 20 · review of the account administration (admin-users, finding AU-3)
-- sync_profile_email copied whatever auth.users.email held when it ran, and its op digest bound only the user id. Two
-- e-mail changes of the same person at once (R1 sets B, R2 sets C, then R1 syncs) made R1 copy C, audit "A → C" under the
-- wrong Dirección and report B as done. Now the RPC takes the address the request set (p_email, part of the op digest):
-- it syncs only while the login still holds it and refuses with PT409 email_changed otherwise (the admin-users function
-- then leaves the login alone: it belongs to the other request). p_email defaults to null so a caller that does not send
-- it (admin-users version 1) keeps working as before. See docs/backend/architecture.md §2 and
-- supabase/functions/admin-users/README.md.

------------------------------------------------------------------------------------------------------------------------
-- New signature: drop both halves first. expose_rpc looks the implementation up by name (`select … into strict`), so an
-- overload would break it, and `create or replace` of the wrapper with another argument list would add a second public
-- function instead of replacing the first.
------------------------------------------------------------------------------------------------------------------------
drop function public.sync_profile_email(uuid, uuid);
drop function private.sync_profile_email(uuid, uuid);

------------------------------------------------------------------------------------------------------------------------
-- sync_profile_email(p_op_id, p_user_id, p_email default null) → {ok, user_id, email, changed}. Idempotent per op id (the
-- digest now covers p_email); p_email given and different from auth.users.email → PT409 email_changed; an address already
-- in sync answers changed:false without an audit row; an address another profile uses → PT409 email_taken.
------------------------------------------------------------------------------------------------------------------------
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
  perform private.audit(v_me, 'usuario', p_user_id, format('Cambió el correo de %s', v_prev.name), null, v_prev.unit_id,
    format('%s → %s', v_prev.email, v_email));
  return private.finish_op(p_op_id, jsonb_build_object('user_id', p_user_id, 'email', v_email, 'changed', true));
exception
  -- a concurrent provision_profile / sync took the address between the check and the update (profiles_email_key)
  when unique_violation then
    perform private.fail('PT409', 'Ese correo ya pertenece a otra cuenta de Pulkro Cuadrillas: use uno distinto.', 'email_taken');
end;
$$;

------------------------------------------------------------------------------------------------------------------------
-- Privileges: reachable only through its invoker wrapper (expose_rpc regenerates it with the new argument list, binds the
-- op id to a SHA-256 digest of (p_user_id, p_email) and grants EXECUTE to authenticated on both halves). An op stored
-- before this migration carries the digest of (p_user_id) alone: replayed now it answers op_id_reused.
------------------------------------------------------------------------------------------------------------------------
revoke all on function private.sync_profile_email(uuid, uuid, text) from public, anon, authenticated, service_role;
select private.expose_rpc('sync_profile_email');