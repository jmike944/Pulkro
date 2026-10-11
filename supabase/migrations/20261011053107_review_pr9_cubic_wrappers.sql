-- Pulkro Cuadrillas · backend 13 · review round 4 (PR #9, cubic, 2026-10-11)
-- C7 request digests use SHA-256 · C8 invalid values answer PT422 invalid_value instead of raw SQLSTATEs · C9 check-out
-- derives the order status from every live jornada. Signatures are unchanged. See docs/backend/architecture.md §5 and §8.

------------------------------------------------------------------------------------------------------------------------
-- C7 + C8 · Wrapper generator. Same contract (thin SECURITY INVOKER wrapper public.<name> → private.<name>, EXECUTE only
-- for p_roles), now in PL/pgSQL so it can:
--   · bind the op id to a SHA-256 digest of the other arguments (MD5 is not collision-resistant; timestamptz digested as
--     epoch seconds, jsonb in canonical form);
--   · turn the raw errors of a bad input value (NULL into a NOT NULL column, a CHECK, a malformed number/date/enum…) into
--     the documented PT422 + hint 'invalid_value' (detail = the original message). Business errors (PTnnn), duplicates
--     (23505) and missing references (23503) pass through untouched.
------------------------------------------------------------------------------------------------------------------------
create or replace function private.expose_rpc(p_name text, p_roles text[] default array['authenticated'])
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_fn oid;
  v_args text;
  v_ident text;
  v_result text;
  v_call text;
  v_bind text := '';
  v_volatility text;
  v_role text;
begin
  select p.oid into strict v_fn
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private' and p.proname = p_name;
  if (select proretset from pg_catalog.pg_proc where oid = v_fn) then
    raise exception 'expose_rpc: % returns a set; RPCs return jsonb', p_name;
  end if;

  v_args := pg_catalog.pg_get_function_arguments(v_fn);
  v_ident := pg_catalog.pg_get_function_identity_arguments(v_fn);
  v_result := pg_catalog.pg_get_function_result(v_fn);
  v_volatility := case (select provolatile from pg_catalog.pg_proc where oid = v_fn)
                    when 's' then 'stable' when 'i' then 'immutable' else 'volatile' end;
  select string_agg(format('%1$I => %1$I', a.name), ', ' order by a.ord) into v_call
  from unnest((select proargnames from pg_catalog.pg_proc where oid = v_fn)) with ordinality as a(name, ord);

  if v_volatility = 'volatile' and (select proargnames[1] from pg_catalog.pg_proc where oid = v_fn) = 'p_op_id' then
    select format(
      'perform pg_catalog.set_config(''pulkro.op_args'', coalesce(p_op_id::text, '''') || '':'' || '
      'pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.jsonb_build_array(%s)::text, ''UTF8'')), ''hex''), true); ',
      string_agg(
        case when a.typ = 'pg_catalog.timestamptz'::pg_catalog.regtype::oid then format('extract(epoch from %I)', a.name)
             else format('%I', a.name) end,
        ', ' order by a.ord))
    into v_bind
    from unnest(
      (select proargnames from pg_catalog.pg_proc where oid = v_fn),
      (select proargtypes::oid[] from pg_catalog.pg_proc where oid = v_fn)
    ) with ordinality as a(name, typ, ord)
    where a.ord > 1;
  end if;

  execute format(
    'create or replace function public.%1$I(%2$s) returns %3$s language plpgsql %4$s security invoker set search_path = '''' '
    'as $rpc$ begin %6$sreturn private.%1$I(%5$s); '
    'exception when not_null_violation or check_violation or invalid_text_representation or invalid_datetime_format '
    'or datetime_field_overflow or numeric_value_out_of_range or string_data_right_truncation or invalid_parameter_value '
    'or null_value_not_allowed then '
    'raise exception using errcode = ''PT422'', message = ''Algún valor tiene un formato inválido.'', hint = ''invalid_value'', '
    'detail = sqlerrm; end $rpc$',
    p_name, v_args, v_result, v_volatility, coalesce(v_call, ''), coalesce(v_bind, ''));
  execute format('comment on function public.%I(%s) is %L', p_name, v_ident,
    format('RPC (security invoker) → private.%s. Rules, scope checks, audit and idempotency live there.', p_name));

  execute format('revoke all on function public.%I(%s) from public, anon, authenticated, service_role', p_name, v_ident);
  execute format('revoke all on function private.%I(%s) from public, anon, authenticated, service_role', p_name, v_ident);
  foreach v_role in array p_roles loop
    if v_role not in ('anon', 'authenticated') then
      raise exception 'expose_rpc: unexpected role %', v_role;
    end if;
    execute format('grant execute on function public.%I(%s) to %I', p_name, v_ident, v_role);
    execute format('grant execute on function private.%I(%s) to %I', p_name, v_ident, v_role);
  end loop;
end;
$$;
revoke all on function private.expose_rpc(text, text[]) from public, anon, authenticated, service_role;

-- Regenerate every wrapper (staff RPCs and the two anon survey RPCs). Op ids stored before this migration carry an MD5
-- digest: a retry of one of those would now answer op_id_reused (none exist before the pilot).
do $$
declare
  v_name text;
begin
  foreach v_name in array array[
    'create_order', 'update_order', 'set_order_status', 'cancel_order', 'reopen_order', 'archive_order', 'assign_crew',
    'schedule_jornadas', 'check_in', 'check_out', 'add_jornada_note', 'log_reminder', 'set_jornada_breakdown', 'add_photo',
    'update_photo', 'delete_photo', 'set_photo_selected', 'add_incident', 'update_incident', 'resolve_incident',
    'validate_closure', 'generate_report', 'log_share', 'create_case', 'update_case', 'add_case_note', 'create_survey',
    'record_manual_survey', 'upsert_unit', 'upsert_client', 'upsert_site', 'upsert_worker', 'upsert_service_type',
    'upsert_material', 'provision_profile', 'update_profile', 'update_my_contact'
  ] loop
    perform private.expose_rpc(v_name);
  end loop;
  perform private.expose_rpc('get_survey', array['anon']);
  perform private.expose_rpc('submit_survey', array['anon']);
end;
$$;

------------------------------------------------------------------------------------------------------------------------
-- C9 · Check-out derives the order status from the live jornadas (private.derived_status, as everywhere else): with
-- another day still en_curso the order stays en_ejecucion instead of jumping to jornada_cerrada/pendiente_validacion.
------------------------------------------------------------------------------------------------------------------------
create or replace function private.record_check(
  p_me public.profiles,
  p_kind public.check_kind,
  p_jornada_id uuid,
  p_device_at timestamptz,
  p_lat double precision,
  p_lng double precision,
  p_accuracy double precision,
  p_source public.geo_source,
  p_note text,
  p_offline boolean
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_order_id uuid;
  v_o public.orders;
  v_j public.jornadas;
  v_in public.jornada_checks;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_check public.jornada_checks;
  v_status public.order_status;
begin
  perform private.require(p_me, 'field.capture');
  v_j := private.lock_jornada(p_me, p_jornada_id);
  v_order_id := v_j.order_id;
  select * into v_o from public.orders o where o.id = v_order_id;
  perform private.assert_open(v_o);
  perform private.check_device_time(p_device_at, case p_kind when 'entrada' then 'entrada' else 'salida' end);
  if p_lat is null or p_lng is null or p_accuracy is null or p_source is null then
    perform private.fail('PT422', 'Falta la ubicación del registro.', 'location_missing');
  end if;
  if p_source <> 'gps' and length(coalesce(v_note, '')) < 8 then
    perform private.fail('PT422',
      case when p_source = 'remota' then 'Explique la supervisión remota (quién está en sitio y cómo se confirmó).'
           else 'Justifique la ubicación manual.' end,
      'location_note_required');
  end if;

  select * into v_in from public.jornada_checks c where c.jornada_id = p_jornada_id and c.kind = 'entrada';
  if p_kind = 'entrada' then
    if found then
      perform private.fail('PT409', 'La jornada ya tiene registro de entrada.', 'duplicate_check');
    end if;
  else
    if not found then
      perform private.fail('PT409', 'Registre la entrada antes de la salida.', 'check_in_missing');
    end if;
    if exists (select 1 from public.jornada_checks c where c.jornada_id = p_jornada_id and c.kind = 'salida') then
      perform private.fail('PT409', 'La jornada ya tiene registro de salida.', 'duplicate_check');
    end if;
    if p_device_at < v_in.device_at then
      perform private.fail('PT422', 'La hora de salida no puede ser anterior a la entrada. Revise el reloj del dispositivo.', 'check_sequence');
    end if;
  end if;

  insert into public.jornada_checks (jornada_id, order_id, kind, device_at, lat, lng, accuracy, source, note, offline, created_by)
  values (p_jornada_id, v_order_id, p_kind, p_device_at, p_lat, p_lng, p_accuracy, p_source, v_note, coalesce(p_offline, false), p_me.id)
  returning * into v_check;

  perform set_config('pulkro.device_at', p_device_at::text, true);
  perform private.audit(p_me, 'jornada', p_jornada_id,
    format('Registro de %s · Jornada %s (%s)', p_kind, v_j.day_index, private.geo_label(p_source, p_accuracy)),
    v_order_id, v_o.unit_id, v_note);

  if p_kind = 'entrada' then
    update public.jornadas set status = 'en_curso' where id = p_jornada_id;
    if v_o.status <> 'con_incidencia' then
      perform private.change_status(p_me, v_order_id, 'en_ejecucion');
    end if;
  else
    update public.jornadas set status = 'cerrada' where id = p_jornada_id;
    -- the status the live jornadas support: another day still in progress keeps the order en_ejecucion
    if v_o.status <> 'con_incidencia' then
      perform private.change_status(p_me, v_order_id, private.derived_status(v_order_id));
    end if;
  end if;

  select o.status into v_status from public.orders o where o.id = v_order_id;
  return jsonb_build_object('jornada_id', p_jornada_id, 'check_id', v_check.id, 'server_at', v_check.server_at,
    'order_id', v_order_id, 'order_status', v_status);
end;
$$;