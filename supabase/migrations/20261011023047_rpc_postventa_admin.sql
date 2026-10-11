-- Pulkro Cuadrillas · backend 06 · post-sale, public survey, catalogs, users, sync helpers

------------------------------------------------------------------------------------------------------------------------
-- Post-sale cases (postventa.manage = Administración of the unit, supervisor of the order; Dirección consults)
------------------------------------------------------------------------------------------------------------------------
-- A case owner must be able to see the case under RLS: an active Administración member of the order's unit or the
-- order's own supervisor. (The prototype offered every supervisor of the unit, who would then never see the case.)
create function private.assert_case_owner(p_order public.orders, p_owner_id uuid)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.profiles u
    where u.id = p_owner_id and u.active
      and ((u.role = 'administracion' and u.unit_id = p_order.unit_id) or (u.role = 'supervisor' and u.id = p_order.supervisor_id))
  ) then
    perform private.fail('PT422', 'El responsable debe ser Administración de la unidad o el supervisor de la orden.', 'invalid_case_owner');
  end if;
end;
$$;

create function private.create_case(
  p_op_id uuid,
  p_case_id uuid,
  p_order_id uuid,
  p_category public.case_category,
  p_severity public.severity,
  p_channel public.case_channel,
  p_description text,
  p_owner_id uuid,
  p_due_date date,
  p_status public.case_status default 'abierto'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me public.profiles;
  v_dup jsonb;
  v_o public.orders;
  v_folio text;
begin
  v_me := private.actor();
  v_dup := private.begin_op(p_op_id, v_me.id, 'create_case');
  if v_dup is not null then return v_dup; end if;
  perform private.require(v_me, 'postventa.manage');
  v_o := private.lock_order(v_me, p_order_id);
  perform private.assert_case_owner(v_o, p_owner_id);
  if p_due_date is null then
    perform private.fail('PT422', 'Indique la fecha compromiso.', 'due_date_required');
  end if;
  v_folio := 'PV-' || lpad(nextval('private.case_folio_seq')::text, 4, '0');
  insert into public.post_sale_cases (id, folio, order_id, client_id, category, severity, channel, description, owner_id, due_date, status, created_by)
  values (p_case_id, v_folio, p_order_id, v_o.client_id, p_category, p_severity, p_channel,
          private.req_text(p_description, 3, 4000, 'Describa el caso.'), p_owner_id, p_due_date, coalesce(p_status, 'abierto'), v_me.id);
  insert into public.case_events (case_id, order_id, text, created_by) values (p_case_id, p_order_id, 'Caso registrado y asignado.', v_me.id);
  perform private.audit(v_me, 'caso', p_case_id, 'Abrió caso postventa ' || v_folio, p_order_id, v_o.unit_id);
  if v_o.status in ('reporte_enviado', 'archivada') then
    perform private.change_status(v_me, p_order_id, 'seguimiento', 'Caso ' || v_folio);
  end if;
  return private.finish_op(p_op_id, jsonb_build_object('case_id', p_case_id, 'folio', v_folio,
    'order_status', (select o.status from public.orders o where o.id = p_order_id)));
end;
$$;

-- p_patch keys: category, severity, channel, description, owner_id, due_date, status, resolution. p_note → timeline.
create function private.update_case(p_op_id uuid, p_case_id uuid, p_patch jsonb default '{}', p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me public.profiles;
  v_dup jsonb;
  v_c public.post_sale_cases;
  v_o public.orders;
  v_patch jsonb := coalesce(p_patch, '{}'::jsonb);
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  v_me := private.actor();
  v_dup := private.begin_op(p_op_id, v_me.id, 'update_case');
  if v_dup is not null then return v_dup; end if;
  perform private.require(v_me, 'postventa.manage');
  select * into v_c from public.post_sale_cases c where c.id = p_case_id;
  if not found then
    perform private.fail('PT404', 'No encontrado o fuera de su alcance.', 'out_of_scope');
  end if;
  v_o := private.lock_order(v_me, v_c.order_id);
  if jsonb_typeof(v_patch) <> 'object' or exists (
    select 1 from jsonb_object_keys(v_patch) k
    where k not in ('category', 'severity', 'channel', 'description', 'owner_id', 'due_date', 'status', 'resolution')
  ) then
    perform private.fail('PT422', 'Ese dato del caso no se edita aquí.', 'field_not_editable');
  end if;
  if v_patch = '{}'::jsonb and v_note is null then
    perform private.fail('PT422', 'No hay cambios que guardar.', 'empty_patch');
  end if;
  if v_patch ? 'owner_id' then
    perform private.assert_case_owner(v_o, (v_patch ->> 'owner_id')::uuid);
  end if;
  update public.post_sale_cases c set
    category = case when v_patch ? 'category' then (v_patch ->> 'category')::public.case_category else c.category end,
    severity = case when v_patch ? 'severity' then (v_patch ->> 'severity')::public.severity else c.severity end,
    channel = case when v_patch ? 'channel' then (v_patch ->> 'channel')::public.case_channel else c.channel end,
    description = case when v_patch ? 'description' then private.req_text(v_patch ->> 'description', 3, 4000, 'Describa el caso.') else c.description end,
    owner_id = case when v_patch ? 'owner_id' then (v_patch ->> 'owner_id')::uuid else c.owner_id end,
    due_date = case when v_patch ? 'due_date' then coalesce((v_patch ->> 'due_date')::date, c.due_date) else c.due_date end,
    status = case when v_patch ? 'status' then (v_patch ->> 'status')::public.case_status else c.status end,
    resolution = case when v_patch ? 'resolution' then left(nullif(btrim(v_patch ->> 'resolution'), ''), 4000) else c.resolution end
  where c.id = p_case_id;
  if v_note is not null then
    insert into public.case_events (case_id, order_id, text, created_by) values (p_case_id, v_c.order_id, left(v_note, 2000), v_me.id);
  end if;
  perform private.audit(v_me, 'caso', p_case_id, coalesce(v_note, 'Actualizó caso ' || v_c.folio), v_c.order_id, v_o.unit_id);
  return private.finish_op(p_op_id, jsonb_build_object('case_id', p_case_id));
exception
  when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
    perform private.fail('PT422', 'Algún valor tiene un formato inválido.', 'invalid_value');
end;
$$;

create function private.add_case_note(p_op_id uuid, p_case_id uuid, p_text text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return private.update_case(p_op_id, p_case_id, '{}'::jsonb, private.req_text(p_text, 1, 2000, 'Escriba la nota.'));
end;
$$;

------------------------------------------------------------------------------------------------------------------------
-- Surveys
------------------------------------------------------------------------------------------------------------------------
create function private.check_answers(p_overall integer, p_quality integer, p_punctuality integer, p_staff integer, p_nps integer)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_overall is null or p_quality is null or p_punctuality is null or p_staff is null or p_nps is null
     or p_overall not between 1 and 5 or p_quality not between 1 and 5 or p_punctuality not between 1 and 5
     or p_staff not between 1 and 5 or p_nps not between 0 and 10 then
    perform private.fail('PT422', 'Responda todas las preguntas (1 a 5 estrellas y recomendación de 0 a 10).', 'invalid_answers');
  end if;
end;
$$;

create function private.check_token(p_token text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{22,64}$' then
    perform private.fail('PT422', 'El enlace de la encuesta necesita un token aleatorio de al menos 128 bits (22+ caracteres base64url).', 'weak_token');
  end if;
  return p_token;
end;
$$;

-- Link generated by the device (offline-capable): the token is client-generated with ≥128 bits of entropy.
create function private.create_survey(p_op_id uuid, p_survey_id uuid, p_order_id uuid, p_channel public.share_channel, p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me public.profiles;
  v_dup jsonb;
  v_o public.orders;
begin
  v_me := private.actor();
  v_dup := private.begin_op(p_op_id, v_me.id, 'create_survey');
  if v_dup is not null then return v_dup; end if;
  perform private.require(v_me, 'postventa.manage');
  v_o := private.lock_order(v_me, p_order_id);
  insert into public.surveys (id, order_id, client_id, channel, manual, sent_by)
  values (p_survey_id, p_order_id, v_o.client_id, p_channel, false, v_me.id);
  insert into public.survey_tokens (survey_id, order_id, token) values (p_survey_id, p_order_id, private.check_token(p_token));
  perform private.audit(v_me, 'encuesta', p_survey_id, 'Generó enlace de encuesta', p_order_id, v_o.unit_id);
  if v_o.status = 'reporte_enviado' then
    perform private.change_status(v_me, p_order_id, 'seguimiento', 'Encuesta enviada');
  end if;
  return private.finish_op(p_op_id, jsonb_build_object('survey_id', p_survey_id,
    'order_status', (select o.status from public.orders o where o.id = p_order_id)));
end;
$$;

-- Staff captures the client's answer (phone call, visit). Fills the newest unanswered survey of the order, or
-- creates a new manual one (then p_survey_id and p_token are required).
create function private.record_manual_survey(
  p_op_id uuid,
  p_order_id uuid,
  p_overall integer,
  p_quality integer,
  p_punctuality integer,
  p_staff integer,
  p_nps integer,
  p_respondent_name text,
  p_comment text default null,
  p_survey_id uuid default null,
  p_token text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me public.profiles;
  v_dup jsonb;
  v_o public.orders;
  v_survey uuid;
  v_name text;
begin
  v_me := private.actor();
  v_dup := private.begin_op(p_op_id, v_me.id, 'record_manual_survey');
  if v_dup is not null then return v_dup; end if;
  perform private.require(v_me, 'postventa.manage');
  v_o := private.lock_order(v_me, p_order_id);
  perform private.check_answers(p_overall, p_quality, p_punctuality, p_staff, p_nps);
  v_name := private.req_text(p_respondent_name, 2, 120, 'Indique quién respondió.');

  select s.id into v_survey from public.surveys s
  where s.order_id = p_order_id and s.responded_at is null
  order by s.sent_at desc, s.id desc limit 1 for update;
  if v_survey is null then
    if p_survey_id is null then
      perform private.fail('PT422', 'Falta el identificador de la nueva encuesta.', 'survey_id_required');
    end if;
    v_survey := p_survey_id;
    insert into public.surveys (id, order_id, client_id, channel, manual, sent_by)
    values (v_survey, p_order_id, v_o.client_id, 'descarga', true, v_me.id);
    insert into public.survey_tokens (survey_id, order_id, token) values (v_survey, p_order_id, private.check_token(p_token));
  end if;
  update public.surveys set
    responded_at = now(), overall = p_overall, quality = p_quality, punctuality = p_punctuality, staff = p_staff, nps = p_nps,
    comment = left(nullif(btrim(coalesce(p_comment, '')), ''), 2000), respondent_name = v_name, manual = true, recorded_by = v_me.id
  where id = v_survey;
  perform private.audit(v_me, 'encuesta', v_survey, 'Registró respuesta de encuesta manualmente', p_order_id, v_o.unit_id);
  return private.finish_op(p_op_id, jsonb_build_object('survey_id', v_survey));
end;
$$;

-- PUBLIC (anon only, /encuesta/[token]): what the client needs to recognise the service. No ids, no contacts.
create function private.get_survey(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_s public.surveys;
  v_o public.orders;
  v_out jsonb;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{22,64}$' then
    perform private.fail('PT404', 'La encuesta no existe o el enlace es incorrecto.', 'survey_not_found');
  end if;
  select s.* into v_s from public.survey_tokens t join public.surveys s on s.id = t.survey_id where t.token = p_token;
  if not found then
    perform private.fail('PT404', 'La encuesta no existe o el enlace es incorrecto.', 'survey_not_found');
  end if;
  select * into v_o from public.orders o where o.id = v_s.order_id;
  select jsonb_build_object(
    'client_name', c.name,
    'client_hue', c.hue,
    'service_name', st.name,
    'order_title', v_o.title,
    'service_date', coalesce((select max(cl.validated_at) from public.order_closures cl where cl.order_id = v_o.id), v_o.scheduled_end),
    'supervisor_first_name', split_part(u.name, ' ', 1),
    'responded_at', v_s.responded_at,
    'respondent_name', v_s.respondent_name,
    'answers', case when v_s.responded_at is not null then jsonb_build_object(
      'overall', v_s.overall, 'quality', v_s.quality, 'punctuality', v_s.punctuality, 'staff', v_s.staff, 'nps', v_s.nps,
      'comment', v_s.comment) end
  ) into v_out
  from public.clients c, public.service_types st, public.profiles u
  where c.id = v_o.client_id and st.id = v_o.service_type_id and u.id = v_o.supervisor_id;
  return v_out;
end;
$$;

-- PUBLIC (anon only): the client answers once. Staff sessions cannot call it (EXECUTE is granted to anon only),
-- so an answer is never recorded as the client's from a staff account. The token is the idempotency key.
create function private.submit_survey(
  p_token text,
  p_overall integer,
  p_quality integer,
  p_punctuality integer,
  p_staff integer,
  p_nps integer,
  p_comment text default null,
  p_respondent_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_s public.surveys;
  v_unit uuid;
  v_name text := left(nullif(btrim(coalesce(p_respondent_name, '')), ''), 120);
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{22,64}$' then
    perform private.fail('PT404', 'La encuesta no existe o el enlace es incorrecto.', 'survey_not_found');
  end if;
  select s.* into v_s from public.survey_tokens t join public.surveys s on s.id = t.survey_id
  where t.token = p_token for update of s;
  if not found then
    perform private.fail('PT404', 'La encuesta no existe o el enlace es incorrecto.', 'survey_not_found');
  end if;
  if v_s.responded_at is not null then
    return jsonb_build_object('ok', false, 'status', 'already_responded', 'responded_at', v_s.responded_at);
  end if;
  perform private.check_answers(p_overall, p_quality, p_punctuality, p_staff, p_nps);
  update public.surveys set
    responded_at = now(), overall = p_overall, quality = p_quality, punctuality = p_punctuality, staff = p_staff, nps = p_nps,
    comment = left(nullif(btrim(coalesce(p_comment, '')), ''), 2000), respondent_name = v_name
  where id = v_s.id;
  select o.unit_id into v_unit from public.orders o where o.id = v_s.order_id;
  insert into public.audit_log (actor_kind, actor_id, actor_name, entity, entity_id, order_id, unit_id, action)
  values ('cliente', null, coalesce(v_name, 'Cliente'), 'encuesta', v_s.id, v_s.order_id, v_unit,
          format('Cliente respondió encuesta (%s/5)', p_overall));
  return jsonb_build_object('ok', true, 'status', 'recorded');
end;
$$;

------------------------------------------------------------------------------------------------------------------------
-- Catalogs (catalogs.admin = Dirección everywhere, Administración inside its own unit; company-wide catalogs —
-- service types, materials — by both, as coded in store.ts) and units (Dirección)
------------------------------------------------------------------------------------------------------------------------
create function private.allow_catalog_unit(p_me public.profiles, p_unit_id uuid)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_unit_id is null or not exists (select 1 from public.units u where u.id = p_unit_id) then
    perform private.fail('PT422', 'Unidad inválida.', 'invalid_unit');
  end if;
  if p_me.role <> 'direccion' and p_unit_id <> p_me.unit_id then
    perform private.fail('PT403', 'Solo puede modificar el catálogo de su unidad.', 'other_unit');
  end if;
end;
$$;

create function private.upsert_unit(p_op_id uuid, p_unit_id uuid, p_name text, p_code text, p_city text default '')
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
  v_dup := private.begin_op(p_op_id, v_me.id, 'upsert_unit');
  if v_dup is not null then return v_dup; end if;
  perform private.require(v_me, 'users.admin');
  v_name := private.req_text(p_name, 2, 120, 'Escriba el nombre de la unidad.');
  insert into public.units (id, name, code, city)
  values (p_unit_id, v_name, upper(btrim(coalesce(p_code, ''))), left(btrim(coalesce(p_city, '')), 120))
  on conflict (id) do update set name = excluded.name, code = excluded.code, city = excluded.city;
  perform private.audit(v_me, 'catalogo', p_unit_id, 'Guardó unidad ' || v_name, null, p_unit_id);
  return private.finish_op(p_op_id, jsonb_build_object('unit_id', p_unit_id));
end;
$$;

create function private.upsert_client(
  p_op_id uuid,
  p_client_id uuid,
  p_name text,
  p_short_name text,
  p_segment public.client_segment,
  p_unit_id uuid,
  p_contact_name text default '',
  p_contact_phone text default '',
  p_contact_email text default '',
  p_since date default null,
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
  v_prev_unit uuid;
  v_short text;
begin
  v_me := private.actor();
  v_dup := private.begin_op(p_op_id, v_me.id, 'upsert_client');
  if v_dup is not null then return v_dup; end if;
  perform private.require(v_me, 'catalogs.admin');
  select c.unit_id into v_prev_unit from public.clients c where c.id = p_client_id for update;
  if v_prev_unit is not null then
    perform private.allow_catalog_unit(v_me, v_prev_unit);
  end if;
  perform private.allow_catalog_unit(v_me, p_unit_id);
  v_short := private.req_text(p_short_name, 1, 60, 'Escriba el nombre corto del cliente.');
  insert into public.clients (id, name, short_name, segment, unit_id, contact_name, contact_phone, contact_email, since, hue)
  values (p_client_id, private.req_text(p_name, 2, 160, 'Escriba el nombre del cliente.'), v_short, p_segment, p_unit_id,
          left(btrim(coalesce(p_contact_name, '')), 120), left(btrim(coalesce(p_contact_phone, '')), 40),
          lower(btrim(coalesce(p_contact_email, ''))), p_since, coalesce(p_hue, 210))
  on conflict (id) do update set
    name = excluded.name, short_name = excluded.short_name, segment = excluded.segment, unit_id = excluded.unit_id,
    contact_name = excluded.contact_name, contact_phone = excluded.contact_phone, contact_email = excluded.contact_email,
    since = excluded.since, hue = excluded.hue;
  perform private.audit(v_me, 'catalogo', p_client_id, 'Guardó cliente ' || v_short, null, p_unit_id);
  return private.finish_op(p_op_id, jsonb_build_object('client_id', p_client_id));
end;
$$;

create function private.upsert_site(
  p_op_id uuid,
  p_site_id uuid,
  p_client_id uuid,
  p_name text,
  p_lat double precision,
  p_lng double precision,
  p_address text default '',
  p_municipality text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me public.profiles;
  v_dup jsonb;
  v_unit uuid;
  v_prev public.sites;
  v_name text;
begin
  v_me := private.actor();
  v_dup := private.begin_op(p_op_id, v_me.id, 'upsert_site');
  if v_dup is not null then return v_dup; end if;
  perform private.require(v_me, 'catalogs.admin');
  select c.unit_id into v_unit from public.clients c where c.id = p_client_id;
  if v_unit is null then
    perform private.fail('PT404', 'No encontrado o fuera de su alcance.', 'out_of_scope');
  end if;
  perform private.allow_catalog_unit(v_me, v_unit);
  -- An existing site is also guarded by the unit of the client it belongs to today (a payload must not move it across units).
  select * into v_prev from public.sites s where s.id = p_site_id for update;
  if found then
    perform private.allow_catalog_unit(v_me, (select c.unit_id from public.clients c where c.id = v_prev.client_id));
    if v_prev.client_id <> p_client_id and exists (select 1 from public.orders o where o.site_id = p_site_id) then
      perform private.fail('PT409', 'El sitio ya tiene órdenes: no puede cambiar de cliente.', 'site_in_use');
    end if;
  end if;
  v_name := private.req_text(p_name, 2, 160, 'Escriba el nombre del sitio.');
  insert into public.sites (id, client_id, name, address, municipality, lat, lng)
  values (p_site_id, p_client_id, v_name, left(btrim(coalesce(p_address, '')), 240), left(btrim(coalesce(p_municipality, '')), 120), p_lat, p_lng)
  on conflict (id) do update set
    client_id = excluded.client_id, name = excluded.name, address = excluded.address,
    municipality = excluded.municipality, lat = excluded.lat, lng = excluded.lng;
  perform private.audit(v_me, 'catalogo', p_site_id, 'Guardó sitio ' || v_name, null, v_unit);
  return private.finish_op(p_op_id, jsonb_build_object('site_id', p_site_id));
end;
$$;

create function private.upsert_worker(
  p_op_id uuid,
  p_worker_id uuid,
  p_name text,
  p_unit_id uuid,
  p_specialty text default '',
  p_phone text default '',
  p_hue integer default null,
  p_active boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me public.profiles;
  v_dup jsonb;
  v_prev_unit uuid;
  v_name text;
begin
  v_me := private.actor();
  v_dup := private.begin_op(p_op_id, v_me.id, 'upsert_worker');
  if v_dup is not null then return v_dup; end if;
  perform private.require(v_me, 'catalogs.admin');
  select w.unit_id into v_prev_unit from public.workers w where w.id = p_worker_id for update;
  if v_prev_unit is not null then
    perform private.allow_catalog_unit(v_me, v_prev_unit);
  end if;
  perform private.allow_catalog_unit(v_me, p_unit_id);
  v_name := private.req_text(p_name, 3, 120, 'Escriba el nombre del trabajador.');
  insert into public.workers (id, name, initials, unit_id, specialty, phone, hue, active)
  values (p_worker_id, v_name, private.initials(v_name), p_unit_id, left(btrim(coalesce(p_specialty, '')), 80),
          left(btrim(coalesce(p_phone, '')), 40), coalesce(p_hue, 210), coalesce(p_active, true))
  on conflict (id) do update set
    name = excluded.name, initials = excluded.initials, unit_id = excluded.unit_id, specialty = excluded.specialty,
    phone = excluded.phone, hue = excluded.hue, active = excluded.active;
  perform private.audit(v_me, 'catalogo', p_worker_id, 'Guardó trabajador ' || v_name, null, p_unit_id);
  return private.finish_op(p_op_id, jsonb_build_object('worker_id', p_worker_id));
end;
$$;

create function private.upsert_service_type(
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
  if p_default_hours_per_day is null or p_default_hours_per_day <= 0 or p_default_hours_per_day > 24 then
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

create function private.upsert_material(p_op_id uuid, p_material_id uuid, p_name text, p_unit text)
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
  v_dup := private.begin_op(p_op_id, v_me.id, 'upsert_material');
  if v_dup is not null then return v_dup; end if;
  perform private.require(v_me, 'catalogs.admin');
  v_name := private.req_text(p_name, 2, 120, 'Escriba el nombre del material.');
  insert into public.materials (id, name, unit)
  values (p_material_id, v_name, private.req_text(p_unit, 1, 12, 'Indique la unidad de medida.'))
  on conflict (id) do update set name = excluded.name, unit = excluded.unit;
  perform private.audit(v_me, 'catalogo', p_material_id, 'Guardó material ' || v_name);
  return private.finish_op(p_op_id, jsonb_build_object('material_id', p_material_id));
end;
$$;

------------------------------------------------------------------------------------------------------------------------
-- Users (users.admin = Dirección). The auth account itself is created by the `admin-users` Edge Function with the
-- secret key (invite e-mail → the person sets a password); the profile is created here with the caller's JWT.
------------------------------------------------------------------------------------------------------------------------
create function private.provision_profile(
  p_op_id uuid,
  p_user_id uuid,
  p_name text,
  p_role public.user_role,
  p_unit_id uuid,
  p_title text default '',
  p_phone text default '',
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
  v_email text;
  v_name text;
begin
  v_me := private.actor();
  v_dup := private.begin_op(p_op_id, v_me.id, 'provision_profile');
  if v_dup is not null then return v_dup; end if;
  perform private.require(v_me, 'users.admin');
  select lower(u.email) into v_email from auth.users u where u.id = p_user_id;
  if v_email is null then
    perform private.fail('PT404', 'La cuenta de acceso no existe (cree la invitación primero).', 'auth_user_missing');
  end if;
  if exists (select 1 from public.profiles p where p.id = p_user_id) then
    perform private.fail('PT409', 'Esa cuenta ya tiene perfil.', 'already_provisioned');
  end if;
  if p_role is null or p_unit_id is null or not exists (select 1 from public.units u where u.id = p_unit_id) then
    perform private.fail('PT422', 'Indique rol y unidad.', 'invalid_profile');
  end if;
  v_name := private.req_text(p_name, 3, 120, 'Escriba el nombre completo.');
  insert into public.profiles (id, name, initials, role, title, unit_id, email, phone, hue)
  values (p_user_id, v_name, private.initials(v_name), p_role, left(btrim(coalesce(p_title, '')), 120), p_unit_id, v_email,
          left(btrim(coalesce(p_phone, '')), 40), coalesce(p_hue, 210));
  perform private.audit(v_me, 'usuario', p_user_id, format('Dio de alta usuario %s (%s)', v_name, p_role), null, p_unit_id);
  return private.finish_op(p_op_id, jsonb_build_object('user_id', p_user_id));
end;
$$;

-- p_patch keys: name, title, role, unit_id, phone, hue, active. Nobody changes their own role, unit or status.
-- Deactivating revokes every session (refresh tokens) at once; RLS already ignores the account from that moment.
create function private.update_profile(p_op_id uuid, p_user_id uuid, p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me public.profiles;
  v_dup jsonb;
  v_prev public.profiles;
  v_next public.profiles;
  v_action text;
begin
  v_me := private.actor();
  v_dup := private.begin_op(p_op_id, v_me.id, 'update_profile');
  if v_dup is not null then return v_dup; end if;
  perform private.require(v_me, 'users.admin');
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' or exists (
    select 1 from jsonb_object_keys(p_patch) k where k not in ('name', 'title', 'role', 'unit_id', 'phone', 'hue', 'active')
  ) then
    perform private.fail('PT422', 'Ese dato del usuario no se edita aquí.', 'field_not_editable');
  end if;
  select * into v_prev from public.profiles p where p.id = p_user_id for update;
  if not found then
    perform private.fail('PT404', 'No encontrado o fuera de su alcance.', 'out_of_scope');
  end if;
  if p_user_id = v_me.id and (
       (p_patch ? 'role' and (p_patch ->> 'role') is distinct from v_prev.role::text)
    or (p_patch ? 'unit_id' and (p_patch ->> 'unit_id')::uuid is distinct from v_prev.unit_id)
    or (p_patch ? 'active' and (p_patch ->> 'active')::boolean is distinct from v_prev.active)
  ) then
    perform private.fail('PT409', 'No puede cambiar su propio rol, unidad o estado: pídalo a otra persona de Dirección.', 'self_change');
  end if;
  if p_patch ? 'unit_id' and not exists (select 1 from public.units u where u.id = (p_patch ->> 'unit_id')::uuid) then
    perform private.fail('PT422', 'Unidad inválida.', 'invalid_unit');
  end if;

  update public.profiles p set
    name = case when p_patch ? 'name' then private.req_text(p_patch ->> 'name', 3, 120, 'Escriba el nombre completo.') else p.name end,
    initials = case when p_patch ? 'name' then private.initials(p_patch ->> 'name') else p.initials end,
    title = case when p_patch ? 'title' then left(btrim(coalesce(p_patch ->> 'title', '')), 120) else p.title end,
    role = case when p_patch ? 'role' then (p_patch ->> 'role')::public.user_role else p.role end,
    unit_id = case when p_patch ? 'unit_id' then (p_patch ->> 'unit_id')::uuid else p.unit_id end,
    phone = case when p_patch ? 'phone' then left(btrim(coalesce(p_patch ->> 'phone', '')), 40) else p.phone end,
    hue = case when p_patch ? 'hue' then coalesce((p_patch ->> 'hue')::smallint, p.hue) else p.hue end,
    active = case when p_patch ? 'active' then coalesce((p_patch ->> 'active')::boolean, p.active) else p.active end,
    deactivated_at = case
      when p_patch ? 'active' and not coalesce((p_patch ->> 'active')::boolean, p.active) then coalesce(p.deactivated_at, now())
      when p_patch ? 'active' and coalesce((p_patch ->> 'active')::boolean, p.active) then null
      else p.deactivated_at end
  where p.id = p_user_id
  returning * into v_next;

  if v_prev.active and not v_next.active then
    delete from auth.sessions s where s.user_id = p_user_id; -- refresh tokens go with their sessions
    v_action := 'Desactivó usuario ' || v_next.name;
  elsif not v_prev.active and v_next.active then
    v_action := 'Reactivó usuario ' || v_next.name;
  else
    v_action := 'Guardó usuario ' || v_next.name;
  end if;
  perform private.audit(v_me, 'usuario', p_user_id, v_action, null, v_next.unit_id);
  return private.finish_op(p_op_id, jsonb_build_object('user_id', p_user_id, 'active', v_next.active));
exception
  when invalid_text_representation or numeric_value_out_of_range then
    perform private.fail('PT422', 'Algún valor tiene un formato inválido.', 'invalid_value');
end;
$$;

-- Self-service "Mis datos": only one's own phone (the e-mail is the login identity, managed by Dirección).
create function private.update_my_contact(p_op_id uuid, p_phone text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me public.profiles;
  v_dup jsonb;
begin
  v_me := private.actor();
  v_dup := private.begin_op(p_op_id, v_me.id, 'update_my_contact');
  if v_dup is not null then return v_dup; end if;
  update public.profiles set phone = left(btrim(coalesce(p_phone, '')), 40) where id = v_me.id;
  perform private.audit(v_me, 'usuario', v_me.id, 'Actualizó sus datos de contacto', null, v_me.unit_id);
  return private.finish_op(p_op_id, jsonb_build_object('user_id', v_me.id));
end;
$$;

------------------------------------------------------------------------------------------------------------------------
-- Sync helper: scope-loss reconciliation. The device sends ids it holds; the answer is the subset the caller can
-- still read (SECURITY INVOKER → plain RLS). Whatever is missing left the caller's scope and is dropped locally.
------------------------------------------------------------------------------------------------------------------------
create function public.sync_reconcile(p_table text, p_ids uuid[])
returns uuid[]
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_pk text;
  v uuid[];
begin
  v_pk := case
    when p_table = 'survey_tokens' then 'survey_id'
    when p_table in ('units', 'profiles', 'workers', 'clients', 'sites', 'service_types', 'materials', 'orders', 'jornadas',
                     'crew_changes', 'jornada_checks', 'jornada_notes', 'incidents', 'post_sale_cases', 'case_events', 'photos',
                     'order_closures', 'reports', 'report_shares', 'surveys') then 'id'
  end;
  if v_pk is null then
    raise sqlstate 'PT422' using message = 'Tabla no sincronizable: ' || coalesce(p_table, '(nula)'), hint = 'invalid_table';
  end if;
  if cardinality(p_ids) > 2000 then
    raise sqlstate 'PT422' using message = 'Máximo 2000 ids por llamada.', hint = 'too_many_ids';
  end if;
  execute format('select coalesce(array_agg(t.%1$I), ''{}'') from public.%2$I t where t.%1$I = any($1)', v_pk, p_table)
    into v using coalesce(p_ids, '{}');
  return v;
end;
$$;

------------------------------------------------------------------------------------------------------------------------
-- Privileges
------------------------------------------------------------------------------------------------------------------------
revoke all on function private.assert_case_owner(public.orders, uuid) from public, anon, authenticated, service_role;
revoke all on function private.check_answers(integer, integer, integer, integer, integer) from public, anon, authenticated, service_role;
revoke all on function private.check_token(text) from public, anon, authenticated, service_role;
revoke all on function private.allow_catalog_unit(public.profiles, uuid) from public, anon, authenticated, service_role;
revoke all on function public.sync_reconcile(text, uuid[]) from public, anon, authenticated, service_role;
grant execute on function public.sync_reconcile(text, uuid[]) to authenticated;

select private.expose_rpc('create_case');
select private.expose_rpc('update_case');
select private.expose_rpc('add_case_note');
select private.expose_rpc('create_survey');
select private.expose_rpc('record_manual_survey');
select private.expose_rpc('get_survey', array['anon']);
select private.expose_rpc('submit_survey', array['anon']);
select private.expose_rpc('upsert_unit');
select private.expose_rpc('upsert_client');
select private.expose_rpc('upsert_site');
select private.expose_rpc('upsert_worker');
select private.expose_rpc('upsert_service_type');
select private.expose_rpc('upsert_material');
select private.expose_rpc('provision_profile');
select private.expose_rpc('update_profile');
select private.expose_rpc('update_my_contact');
