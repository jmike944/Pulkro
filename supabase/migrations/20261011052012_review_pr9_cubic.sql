-- Pulkro Cuadrillas · backend 12 · review round 3 (PR #9, cubic, 2026-10-11)
-- C1 an op id fails closed when only one side carries the request digest · C2 service hours 0.5–24 (RPC and table) ·
-- C3 every breakdown line needs numeric hours · C4 survey tokens without repeated sequences · C5 incident resolution
-- fields all-or-nothing · C6 a conformity method needs the client's name. See docs/backend/architecture.md §5 and §8.

------------------------------------------------------------------------------------------------------------------------
-- C1 · The digest comparison failed open: a stored op without digest (or a call without the wrapper's binding) answered
-- {"duplicate": true} to a replay with other arguments. Now the two sides must match, NULL included.
------------------------------------------------------------------------------------------------------------------------
create or replace function private.begin_op(p_op_id uuid, p_actor uuid, p_action text, p_device_at timestamptz default null)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v private.sync_ops;
  v_bound text := coalesce(current_setting('pulkro.op_args', true), '');
  v_hash text;
begin
  if p_op_id is null then
    perform private.fail('PT422', 'Falta el identificador de la operación (op_id).', 'op_id_required');
  end if;
  -- set by the public wrapper as '<op id>:<md5 of the other arguments>'; absent when called without the wrapper
  if left(v_bound, 37) = p_op_id::text || ':' then
    v_hash := nullif(substr(v_bound, 38), '');
  end if;
  perform set_config('pulkro.op_id', p_op_id::text, true);
  perform set_config('pulkro.device_at', coalesce(p_device_at::text, ''), true);
  insert into private.sync_ops (op_id, actor_id, action, args_hash) values (p_op_id, p_actor, p_action, v_hash)
  on conflict (op_id) do nothing;
  if found then
    return null;
  end if;
  select * into v from private.sync_ops s where s.op_id = p_op_id;
  if v.actor_id is distinct from p_actor or v.action <> p_action then
    perform private.fail('PT409', 'Ese identificador de operación ya se usó para otra acción.', 'op_id_reused');
  end if;
  if v.args_hash is distinct from v_hash then
    perform private.fail('PT409', 'Ese identificador de operación ya se usó con otros datos: este envío no se aplicó.', 'op_id_reused');
  end if;
  return coalesce(v.result, '{}'::jsonb) || jsonb_build_object('ok', true, 'duplicate', true);
end;
$$;

------------------------------------------------------------------------------------------------------------------------
-- C2 · Hours per day of a service type: 0.5 to 24, as the message says (the table check had the same gap).
------------------------------------------------------------------------------------------------------------------------
alter table public.service_types drop constraint service_types_default_hours_per_day_check;
alter table public.service_types add constraint service_types_default_hours_per_day_check
  check (default_hours_per_day >= 0.5 and default_hours_per_day <= 24);

create or replace function private.upsert_service_type(
  p_op_id uuid,
  p_service_type_id uuid,
  p_name text,
  p_short text,
  p_default_hours_per_day numeric,
  p_hue integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me public.profiles;
  v_dup jsonb;
  v_name text;
begin
  v_me := private.actor();
  v_dup := private.begin_op(p_op_id, v_me.id, 'upsert_service_type');
  if v_dup is not null then return v_dup; end if;
  perform private.require(v_me, 'catalogs.admin');
  v_name := private.req_text(p_name, 2, 120, 'Escriba el nombre del tipo de servicio.');
  if p_default_hours_per_day is null or p_default_hours_per_day < 0.5 or p_default_hours_per_day > 24 then
    perform private.fail('PT422', 'Las horas por día van de 0.5 a 24.', 'invalid_hours');
  end if;
  insert into public.service_types (id, name, short, hue, default_hours_per_day)
  values (p_service_type_id, v_name, private.req_text(p_short, 1, 40, 'Escriba el nombre corto.'), coalesce(p_hue, 210), p_default_hours_per_day)
  on conflict (id) do update set
    name = excluded.name, short = excluded.short, hue = excluded.hue, default_hours_per_day = excluded.default_hours_per_day;
  perform private.audit(v_me, 'catalogo', p_service_type_id, 'Guardó tipo de servicio ' || v_name);
  return private.finish_op(p_op_id, jsonb_build_object('service_type_id', p_service_type_id));
end;
$$;

------------------------------------------------------------------------------------------------------------------------
-- C3 · Desglose de horas: [{ "activity": text, "hours": number }], total ≤ 24 h. A line without hours (missing, null or
-- not a number) used to pass: NULL < 0 is unknown and sum() skips it.
------------------------------------------------------------------------------------------------------------------------
create or replace function private.set_jornada_breakdown(p_op_id uuid, p_jornada_id uuid, p_breakdown jsonb, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me public.profiles;
  v_dup jsonb;
  v_j public.jornadas;
  v_o public.orders;
  v_clean jsonb;
  v_total numeric;
begin
  v_me := private.actor();
  v_dup := private.begin_op(p_op_id, v_me.id, 'set_jornada_breakdown');
  if v_dup is not null then return v_dup; end if;
  perform private.require(v_me, 'field.capture');
  v_j := private.lock_jornada(v_me, p_jornada_id);
  select * into v_o from public.orders o where o.id = v_j.order_id;
  perform private.assert_open(v_o);
  if p_breakdown is null or jsonb_typeof(p_breakdown) <> 'array' or jsonb_array_length(p_breakdown) > 50 then
    perform private.fail('PT422', 'Desglose inválido.', 'invalid_breakdown');
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_breakdown) e
    where jsonb_typeof(e) <> 'object'
       or jsonb_typeof(e -> 'activity') is distinct from 'string'
       or jsonb_typeof(e -> 'hours') is distinct from 'number'
  ) then
    perform private.fail('PT422', 'Cada actividad necesita nombre y horas (0 a 24 en total).', 'invalid_breakdown');
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('activity', btrim(e ->> 'activity'), 'hours', (e ->> 'hours')::numeric) order by ord), '[]'::jsonb),
         coalesce(sum((e ->> 'hours')::numeric), 0)
    into v_clean, v_total
  from jsonb_array_elements(p_breakdown) with ordinality as t(e, ord);
  if v_total > 24 or exists (
    select 1 from jsonb_array_elements(v_clean) e
    where length(e ->> 'activity') not between 1 and 300 or (e ->> 'hours')::numeric < 0
  ) then
    perform private.fail('PT422', 'Cada actividad necesita nombre y horas (0 a 24 en total).', 'invalid_breakdown');
  end if;
  update public.jornadas set breakdown = v_clean, breakdown_note = left(nullif(btrim(p_note), ''), 500) where id = p_jornada_id;
  perform private.audit(v_me, 'jornada', p_jornada_id,
    format('Registró desglose de horas · Jornada %s (%s h)', v_j.day_index, to_char(v_total, 'FM990.0')),
    v_j.order_id, v_o.unit_id, p_note);
  return private.finish_op(p_op_id, jsonb_build_object('jornada_id', p_jornada_id));
end;
$$;

------------------------------------------------------------------------------------------------------------------------
-- C4 · Survey tokens are generated on the device (256 random bits, 43 base64url characters). The server cannot measure
-- randomness, so it refuses the structures a broken generator produces: too few distinct characters, or any
-- 6-character sequence that repeats (every periodic or cyclic pattern shorter than the token). A random token repeats a
-- 6-gram with probability ~10⁻⁸; the app regenerates in that case (domain.ts isStrongSurveyToken).
------------------------------------------------------------------------------------------------------------------------
create or replace function private.check_token(p_token text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43,64}$'
     or (select count(distinct c) from regexp_split_to_table(p_token, '') c) < 16
     or exists (select 1 from generate_series(1, length(p_token) - 5) i group by substr(p_token, i, 6) having count(*) > 1) then
    perform private.fail('PT422', 'El enlace de la encuesta necesita un token aleatorio de 256 bits (43+ caracteres base64url).', 'weak_token');
  end if;
  return p_token;
end;
$$;

------------------------------------------------------------------------------------------------------------------------
-- C5 · An incident is resolved with when, who and what (all three) and open without any of them. The old check let an
-- open incident carry only resolved_at or only resolved_by.
-- C6 · A conformity method needs the client's name: a NULL name made the old check pass (NULL is not false).
------------------------------------------------------------------------------------------------------------------------
alter table public.incidents drop constraint incidents_resolution_consistent;
alter table public.incidents add constraint incidents_resolution_consistent check (
  case when status = 'resuelta'
    then resolved_at is not null and resolved_by is not null and length(btrim(coalesce(resolution, ''))) > 0
    else resolved_at is null and resolved_by is null
  end
);

alter table public.order_closures drop constraint order_closures_conformity_name;
alter table public.order_closures add constraint order_closures_conformity_name
  check (conformity_method is null or length(btrim(coalesce(conformity_name, ''))) >= 3);