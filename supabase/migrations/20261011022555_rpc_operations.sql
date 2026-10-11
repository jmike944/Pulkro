-- Pulkro Cuadrillas · backend 05 · operation RPCs
-- Every store.ts mutation of the order lifecycle becomes one RPC with the same guards, re-checked on the server
-- against the current server state (never the client's). Conventions for every mutation RPC:
--   * first argument p_op_id = the offline queue item id → private.begin_op makes retries idempotent;
--   * ids of new rows are client-generated UUIDs (the device created them offline);
--   * scope: the order row is locked (FOR UPDATE) and checked with private.sees_order (= canSeeOrder);
--   * the audit entry is written here, with the server clock, the op id and the device time when given;
--   * returns jsonb {ok, duplicate?, …ids/folios/status the client needs to reconcile}.

------------------------------------------------------------------------------------------------------------------------
-- Shared helpers (SECURITY INVOKER; they only ever run inside the SECURITY DEFINER RPCs below, never granted)
------------------------------------------------------------------------------------------------------------------------
create function private.actor()
returns public.profiles
language plpgsql
stable
set search_path = ''
as $$
declare
  v public.profiles;
begin
  if auth.uid() is null then
    perform private.fail('PT401', 'Inicie sesión para continuar.', 'no_session');
  end if;
  select * into v from public.profiles p where p.id = auth.uid();
  if not found then
    perform private.fail('PT401', 'Su cuenta no tiene perfil en Pulkro Cuadrillas.', 'no_profile');
  end if;
  if not v.active then
    perform private.fail('PT401', 'Su cuenta está desactivada.', 'inactive');
  end if;
  return v;
end;
$$;

create function private.require(p_me public.profiles, variadic p_actions text[])
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if exists (select 1 from unnest(p_actions) a where private.can(p_me.role, a)) then
    return;
  end if;
  perform private.fail('PT403', private.denied_reason(p_actions[1]), 'forbidden:' || p_actions[1]);
end;
$$;

-- canSeeOrder for an already-loaded row (the RLS policy on public.orders says the same thing).
create function private.sees_order(p_me public.profiles, p_order public.orders)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case p_me.role
    when 'direccion' then true
    when 'administracion' then p_order.unit_id = p_me.unit_id
    when 'supervisor' then p_order.supervisor_id = p_me.id
    else false
  end;
$$;

-- Loads, locks and scope-checks an order. Not found and out of scope answer the same (no existence leak).
create function private.lock_order(p_me public.profiles, p_order_id uuid)
returns public.orders
language plpgsql
set search_path = ''
as $$
declare
  v public.orders;
begin
  select * into v from public.orders o where o.id = p_order_id for update;
  if not found or not private.sees_order(p_me, v) then
    perform private.fail('PT404', 'No encontrado o fuera de su alcance.', 'out_of_scope');
  end if;
  return v;
end;
$$;

create function private.is_terminal(p_status public.order_status)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_status in ('finalizada', 'reporte_enviado', 'seguimiento', 'archivada', 'cancelada');
$$;

-- Closed orders only change through reopen (doc §8: edits after closure create a new version).
create function private.assert_open(p_order public.orders)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_order.status = 'cancelada' then
    perform private.fail('PT409', 'La orden está cancelada.', 'order_cancelled');
  elsif private.is_terminal(p_order.status) then
    perform private.fail('PT409', 'Orden cerrada: reábrala para hacer cambios (se generará una nueva versión del reporte).', 'order_closed');
  end if;
end;
$$;

create function private.assert_not_frozen(p_order public.orders)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_order.status in ('cancelada', 'archivada') then
    perform private.fail('PT409', 'La orden ya no admite cambios.', 'order_frozen');
  end if;
end;
$$;

create function private.req_text(p_value text, p_min integer, p_max integer, p_message text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := btrim(coalesce(p_value, ''));
begin
  if length(v) < p_min or length(v) > p_max then
    perform private.fail('PT422', p_message, 'invalid_text');
  end if;
  return v;
end;
$$;

-- Device clocks are trusted only within bounds: not ahead of the server, not older than an offline backlog can be.
create function private.check_device_time(p_at timestamptz, p_what text)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_at is null then
    perform private.fail('PT422', format('Falta la hora del dispositivo (%s).', p_what), 'device_time_missing');
  end if;
  if p_at > now() + interval '5 minutes' then
    perform private.fail('PT422', format('La hora del dispositivo (%s) está adelantada. Revise el reloj del teléfono.', p_what), 'device_time_future');
  end if;
  if p_at < now() - interval '45 days' then
    perform private.fail('PT422', format('La hora del dispositivo (%s) es demasiado antigua.', p_what), 'device_time_stale');
  end if;
  return p_at;
end;
$$;

create function private.initials(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    nullif(upper((
      select string_agg(left(w, 1), '' order by ord)
      from (
        select w, ord
        from unnest(regexp_split_to_array(btrim(coalesce(p_name, '')), '\s+')) with ordinality as t(w, ord)
        where length(w) > 2
        order by ord
        limit 2
      ) s
    )), ''),
    upper(left(btrim(coalesce(p_name, '')), 1))
  );
$$;

create function private.status_label(p_status public.order_status)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_status
    when 'borrador' then 'Borrador'
    when 'programada' then 'Programada'
    when 'en_ejecucion' then 'En ejecución'
    when 'jornada_cerrada' then 'Jornada cerrada'
    when 'pendiente_validacion' then 'Pendiente de validación'
    when 'finalizada' then 'Finalizada'
    when 'reporte_enviado' then 'Reporte enviado'
    when 'seguimiento' then 'Seguimiento postventa'
    when 'archivada' then 'Archivada'
    when 'cancelada' then 'Cancelada'
    when 'reprogramada' then 'Reprogramada'
    when 'con_incidencia' then 'Con incidencia'
    when 'reabierta' then 'Reabierta'
  end;
$$;

------------------------------------------------------------------------------------------------------------------------
-- Idempotency + audit
------------------------------------------------------------------------------------------------------------------------
-- Returns null for a new operation (and remembers it), or the stored result of an operation already applied.
-- Concurrent retries of the same op serialize on the primary key. A failed op rolls back its row too, so a retry
-- re-runs the validation.
create function private.begin_op(p_op_id uuid, p_actor uuid, p_action text, p_device_at timestamptz default null)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v private.sync_ops;
begin
  if p_op_id is null then
    perform private.fail('PT422', 'Falta el identificador de la operación (op_id).', 'op_id_required');
  end if;
  perform set_config('pulkro.op_id', p_op_id::text, true);
  perform set_config('pulkro.device_at', coalesce(p_device_at::text, ''), true);
  insert into private.sync_ops (op_id, actor_id, action) values (p_op_id, p_actor, p_action)
  on conflict (op_id) do nothing;
  if found then
    return null;
  end if;
  select * into v from private.sync_ops s where s.op_id = p_op_id;
  if v.actor_id is distinct from p_actor or v.action <> p_action then
    perform private.fail('PT409', 'Ese identificador de operación ya se usó para otra acción.', 'op_id_reused');
  end if;
  return coalesce(v.result, '{}'::jsonb) || jsonb_build_object('ok', true, 'duplicate', true);
end;
$$;

create function private.finish_op(p_op_id uuid, p_result jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v jsonb := jsonb_build_object('ok', true) || coalesce(p_result, '{}'::jsonb);
begin
  update private.sync_ops set result = v where op_id = p_op_id;
  return v;
end;
$$;

create function private.audit(
  p_me public.profiles,
  p_entity public.audit_entity,
  p_entity_id uuid,
  p_action text,
  p_order_id uuid default null,
  p_unit_id uuid default null,
  p_reason text default null
)
returns void
language sql
set search_path = ''
as $$
  insert into public.audit_log (actor_kind, actor_id, actor_name, entity, entity_id, order_id, unit_id, action, reason, op_id, device_at)
  values (
    'usuario', p_me.id, p_me.name, p_entity, p_entity_id, p_order_id, coalesce(p_unit_id, p_me.unit_id),
    left(p_action, 300), left(nullif(btrim(p_reason), ''), 2000),
    nullif(current_setting('pulkro.op_id', true), '')::uuid,
    nullif(current_setting('pulkro.device_at', true), '')::timestamptz
  );
$$;

-- Internal transition (callers already authorized and locked the order). Audited like the store's changeStatus.
create function private.change_status(p_me public.profiles, p_order_id uuid, p_status public.order_status, p_reason text default null)
returns public.order_status
language plpgsql
set search_path = ''
as $$
declare
  v_old public.order_status;
  v_unit uuid;
begin
  select o.status, o.unit_id into v_old, v_unit from public.orders o where o.id = p_order_id;
  if v_old = p_status then
    return v_old;
  end if;
  update public.orders set status = p_status where id = p_order_id;
  perform private.audit(p_me, 'orden', p_order_id, 'Cambió estado a ' || private.status_label(p_status), p_order_id, v_unit, p_reason);
  return p_status;
end;
$$;

------------------------------------------------------------------------------------------------------------------------
-- Input normalisation
------------------------------------------------------------------------------------------------------------------------
create function private.clean_activities(p text[])
returns text[]
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text[];
begin
  select coalesce(array_agg(btrim(a) order by ord), '{}') into v
  from unnest(coalesce(p, '{}')) with ordinality as t(a, ord)
  where btrim(coalesce(a, '')) <> '';
  if cardinality(v) > 50 or exists (select 1 from unnest(v) a where length(a) > 300) then
    perform private.fail('PT422', 'Actividades inválidas (máximo 50, de hasta 300 caracteres).', 'invalid_activities');
  end if;
  return v;
end;
$$;

create function private.clean_materials(p jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_out jsonb := '[]'::jsonb;
  v_el jsonb;
  v_id uuid;
  v_qty numeric;
begin
  if p is null then
    return v_out;
  end if;
  if jsonb_typeof(p) <> 'array' or jsonb_array_length(p) > 50 then
    perform private.fail('PT422', 'Materiales inválidos.', 'invalid_materials');
  end if;
  for v_el in select value from jsonb_array_elements(p) loop
    begin
      v_id := (v_el ->> 'material_id')::uuid;
      v_qty := (v_el ->> 'qty')::numeric;
    exception when others then
      perform private.fail('PT422', 'Materiales inválidos.', 'invalid_materials');
    end;
    if v_id is null or v_qty is null or v_qty <= 0 or v_qty > 100000
       or not exists (select 1 from public.materials m where m.id = v_id) then
      perform private.fail('PT422', 'Cada material necesita un material del catálogo y una cantidad mayor a cero.', 'invalid_materials');
    end if;
    v_out := v_out || jsonb_build_array(jsonb_build_object('material_id', v_id, 'qty', v_qty));
  end loop;
  return v_out;
end;
$$;

-- [{ "id": uuid, "date": "yyyy-mm-dd", "planned_start": iso, "planned_end": iso }]
create function private.parse_days(p_days jsonb)
returns table (id uuid, day date, planned_start timestamptz, planned_end timestamptz)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_el jsonb;
begin
  if p_days is null then
    return;
  end if;
  if jsonb_typeof(p_days) <> 'array' or jsonb_array_length(p_days) > 60 then
    perform private.fail('PT422', 'Jornadas inválidas.', 'invalid_days');
  end if;
  for v_el in select value from jsonb_array_elements(p_days) loop
    begin
      id := (v_el ->> 'id')::uuid;
      day := (v_el ->> 'date')::date;
      planned_start := (v_el ->> 'planned_start')::timestamptz;
      planned_end := (v_el ->> 'planned_end')::timestamptz;
    exception when others then
      perform private.fail('PT422', 'Jornadas inválidas: fecha u hora con formato incorrecto.', 'invalid_days');
    end;
    if id is null or day is null or planned_start is null or planned_end is null
       or planned_end <= planned_start or planned_end - planned_start > interval '24 hours' then
      perform private.fail('PT422', 'Cada jornada necesita fecha, hora de inicio y una hora de fin posterior (máximo 24 h).', 'invalid_days');
    end if;
    return next;
  end loop;
end;
$$;

------------------------------------------------------------------------------------------------------------------------
-- Orders
------------------------------------------------------------------------------------------------------------------------
-- Alta manual (order.create = Administración, own unit). The folio is assigned here. Administración cannot
-- assign crews, so the order starts as borrador and the supervisor staffs it (doc §3 flow steps 2-4).
create function private.create_order(
  p_op_id uuid,
  p_order_id uuid,
  p_client_id uuid,
  p_site_id uuid,
  p_service_type_id uuid,
  p_supervisor_id uuid,
  p_title text,
  p_days jsonb default '[]',
  p_activities text[] default '{}',
  p_materials jsonb default '[]',
  p_special_instructions text default '',
  p_site_contact_name text default '',
  p_site_contact_phone text default '',
  p_commercial_ref text default '',
  p_priority public.order_priority default 'normal'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me public.profiles;
  v_dup jsonb;
  v_client public.clients;
  v_folio text;
  v_days integer;
  v_start timestamptz;
  v_end timestamptz;
  v_ref text := btrim(coalesce(p_commercial_ref, ''));
begin
  v_me := private.actor();
  v_dup := private.begin_op(p_op_id, v_me.id, 'create_order');
  if v_dup is not null then return v_dup; end if;
  perform private.require(v_me, 'order.create');

  select * into v_client from public.clients c where c.id = p_client_id;
  if not found or not (v_me.role = 'direccion' or v_client.unit_id = v_me.unit_id) then
    perform private.fail('PT404', 'El cliente no existe o está fuera de su alcance.', 'out_of_scope');
  end if;
  if not exists (select 1 from public.sites s where s.id = p_site_id and s.client_id = p_client_id) then
    perform private.fail('PT422', 'El sitio no pertenece al cliente.', 'site_client_mismatch');
  end if;
  if not exists (select 1 from public.service_types st where st.id = p_service_type_id) then
    perform private.fail('PT422', 'Tipo de servicio inválido.', 'invalid_service_type');
  end if;
  if not exists (
    select 1 from public.profiles u
    where u.id = p_supervisor_id and u.role = 'supervisor' and u.active and u.unit_id = v_client.unit_id
  ) then
    perform private.fail('PT422', 'El supervisor debe estar activo y pertenecer a la unidad del cliente.', 'invalid_supervisor');
  end if;

  select count(*), min(d.planned_start), max(d.planned_end) into v_days, v_start, v_end from private.parse_days(p_days) d;
  v_folio := 'OS-' || lpad(nextval('private.order_folio_seq')::text, 5, '0');

  insert into public.orders (
    id, folio, unit_id, client_id, site_id, service_type_id, supervisor_id, status, title, activities, materials,
    special_instructions, site_contact_name, site_contact_phone, scheduled_start, scheduled_end, planned_days,
    commercial_ref, priority, created_by
  ) values (
    p_order_id, v_folio, v_client.unit_id, p_client_id, p_site_id, p_service_type_id, p_supervisor_id, 'borrador',
    private.req_text(p_title, 3, 200, 'Escriba el título de la orden (3 a 200 caracteres).'),
    private.clean_activities(p_activities), private.clean_materials(p_materials),
    left(coalesce(p_special_instructions, ''), 4000), left(btrim(coalesce(p_site_contact_name, '')), 120),
    left(btrim(coalesce(p_site_contact_phone, '')), 40), coalesce(v_start, now()), coalesce(v_end, v_start, now()),
    greatest(1, v_days), left(v_ref, 60), coalesce(p_priority, 'normal'), v_me.id
  );

  insert into public.jornadas (id, order_id, day_index, date, planned_start, planned_end)
  select d.id, p_order_id, row_number() over (order by d.day, d.planned_start), d.day, d.planned_start, d.planned_end
  from private.parse_days(p_days) d;

  perform private.audit(v_me, 'orden', p_order_id, 'Alta manual de orden de servicio', p_order_id, v_client.unit_id,
    case when v_ref <> '' then 'Trabajo autorizado ' || v_ref end);

  return private.finish_op(p_op_id, jsonb_build_object('order_id', p_order_id, 'folio', v_folio, 'status', 'borrador'));
end;
$$;

-- Edits. Operational fields (order.editOperational: supervisor on own orders, Administración) vs general data
-- (order.edit: Administración, own unit). Closed or cancelled orders are not edited (reopen first).
-- p_patch keys: title, priority, commercial_ref, service_type_id, site_id, supervisor_id (general);
--               special_instructions, site_contact_name, site_contact_phone, activities, materials (operational).
create function private.update_order(p_op_id uuid, p_order_id uuid, p_patch jsonb, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me public.profiles;
  v_dup jsonb;
  v_o public.orders;
  v_keys text[];
  v_general boolean;
  v_new_sup uuid;
  v_labels text;
  v_version integer;
begin
  v_me := private.actor();
  v_dup := private.begin_op(p_op_id, v_me.id, 'update_order');
  if v_dup is not null then return v_dup; end if;

  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    perform private.fail('PT422', 'Cambios inválidos.', 'invalid_patch');
  end if;
  select array_agg(k order by k) into v_keys from jsonb_object_keys(p_patch) k;
  if v_keys is null then
    perform private.fail('PT422', 'No hay cambios que guardar.', 'empty_patch');
  end if;
  if exists (
    select 1 from unnest(v_keys) k
    where k not in ('title', 'priority', 'commercial_ref', 'service_type_id', 'site_id', 'supervisor_id',
                    'special_instructions', 'site_contact_name', 'site_contact_phone', 'activities', 'materials')
  ) then
    perform private.fail('PT422', 'Ese dato de la orden no se edita aquí.', 'field_not_editable');
  end if;
  v_general := v_keys && array['title', 'priority', 'commercial_ref', 'service_type_id', 'site_id', 'supervisor_id'];
  if v_general then
    perform private.require(v_me, 'order.edit');
  else
    perform private.require(v_me, 'order.edit', 'order.editOperational');
  end if;

  v_o := private.lock_order(v_me, p_order_id);
  perform private.assert_open(v_o);

  if p_patch ? 'supervisor_id' then
    v_new_sup := (p_patch ->> 'supervisor_id')::uuid;
    if not exists (
      select 1 from public.profiles u
      where u.id = v_new_sup and u.role = 'supervisor' and u.active and u.unit_id = v_o.unit_id
    ) then
      perform private.fail('PT422', 'El supervisor debe estar activo y pertenecer a la unidad de la orden.', 'invalid_supervisor');
    end if;
  end if;
  if p_patch ? 'site_id' and not exists (
    select 1 from public.sites s where s.id = (p_patch ->> 'site_id')::uuid and s.client_id = v_o.client_id
  ) then
    perform private.fail('PT422', 'El sitio no pertenece al cliente de la orden.', 'site_client_mismatch');
  end if;
  if p_patch ? 'service_type_id' and not exists (
    select 1 from public.service_types st where st.id = (p_patch ->> 'service_type_id')::uuid
  ) then
    perform private.fail('PT422', 'Tipo de servicio inválido.', 'invalid_service_type');
  end if;

  update public.orders o set
    title = case when p_patch ? 'title'
      then private.req_text(p_patch ->> 'title', 3, 200, 'Escriba el título de la orden (3 a 200 caracteres).') else o.title end,
    priority = case when p_patch ? 'priority' then (p_patch ->> 'priority')::public.order_priority else o.priority end,
    commercial_ref = case when p_patch ? 'commercial_ref' then left(btrim(coalesce(p_patch ->> 'commercial_ref', '')), 60) else o.commercial_ref end,
    service_type_id = case when p_patch ? 'service_type_id' then (p_patch ->> 'service_type_id')::uuid else o.service_type_id end,
    site_id = case when p_patch ? 'site_id' then (p_patch ->> 'site_id')::uuid else o.site_id end,
    supervisor_id = case when p_patch ? 'supervisor_id' then v_new_sup else o.supervisor_id end,
    special_instructions = case when p_patch ? 'special_instructions' then left(coalesce(p_patch ->> 'special_instructions', ''), 4000) else o.special_instructions end,
    site_contact_name = case when p_patch ? 'site_contact_name' then left(btrim(coalesce(p_patch ->> 'site_contact_name', '')), 120) else o.site_contact_name end,
    site_contact_phone = case when p_patch ? 'site_contact_phone' then left(btrim(coalesce(p_patch ->> 'site_contact_phone', '')), 40) else o.site_contact_phone end,
    activities = case when p_patch ? 'activities'
      then private.clean_activities(array(select jsonb_array_elements_text(p_patch -> 'activities'))) else o.activities end,
    materials = case when p_patch ? 'materials' then private.clean_materials(p_patch -> 'materials') else o.materials end
  where o.id = p_order_id
  returning o.row_version into v_version;

  select string_agg(case k
      when 'title' then 'título' when 'priority' then 'prioridad' when 'commercial_ref' then 'referencia comercial'
      when 'service_type_id' then 'tipo de servicio' when 'site_id' then 'sitio' when 'supervisor_id' then 'supervisor'
      when 'special_instructions' then 'instrucciones especiales' when 'site_contact_name' then 'contacto en sitio'
      when 'site_contact_phone' then 'teléfono del contacto' when 'activities' then 'actividades' when 'materials' then 'materiales'
    end, ', ' order by k) into v_labels
  from unnest(v_keys) k;
  perform private.audit(v_me, 'orden', p_order_id, 'Editó ' || v_labels, p_order_id, v_o.unit_id, p_reason);

  if v_new_sup is not null and v_new_sup <> v_o.supervisor_id then
    -- Reassignment history (doc §4.1): who had it, who has it now.
    perform private.audit(v_me, 'orden', p_order_id,
      format('Reasignó la orden de %s a %s',
        (select u.name from public.profiles u where u.id = v_o.supervisor_id),
        (select u.name from public.profiles u where u.id = v_new_sup)),
      p_order_id, v_o.unit_id, p_reason);
  end if;

  return private.finish_op(p_op_id, jsonb_build_object('order_id', p_order_id, 'row_version', v_version));
exception
  when invalid_text_representation or invalid_parameter_value then
    perform private.fail('PT422', 'Algún valor tiene un formato inválido.', 'invalid_value');
end;
$$;

-- Supervisor flags "Reprogramada" (with a reason) or confirms dates (leaves Reprogramada). Every other status is
-- derived by the system from jornadas, closure, incidents and reports.
create function private.set_order_status(p_op_id uuid, p_order_id uuid, p_status public.order_status, p_reason text default null)
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
  v_dup := private.begin_op(p_op_id, v_me.id, 'set_order_status');
  if v_dup is not null then return v_dup; end if;
  if p_status not in ('reprogramada', 'programada', 'en_ejecucion', 'jornada_cerrada') then
    perform private.fail('PT422', 'Ese estado lo calcula el sistema a partir de las jornadas, el cierre y el reporte.', 'status_not_settable');
  end if;
  perform private.require(v_me, 'order.reschedule');
  v_o := private.lock_order(v_me, p_order_id);
  perform private.assert_open(v_o);
  if p_status <> 'reprogramada' and v_o.status <> 'reprogramada' then
    perform private.fail('PT409', 'Solo se confirman fechas de una orden reprogramada.', 'not_rescheduled');
  end if;
  if p_status = 'reprogramada' and length(btrim(coalesce(p_reason, ''))) < 5 then
    perform private.fail('PT422', 'Indique el motivo de la reprogramación.', 'reason_required');
  end if;
  perform private.change_status(v_me, p_order_id, p_status, p_reason);
  return private.finish_op(p_op_id, jsonb_build_object('order_id', p_order_id, 'status', p_status));
end;
$$;

create function private.cancel_order(p_op_id uuid, p_order_id uuid, p_reason text)
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
  v_dup := private.begin_op(p_op_id, v_me.id, 'cancel_order');
  if v_dup is not null then return v_dup; end if;
  perform private.require(v_me, 'order.edit');
  v_o := private.lock_order(v_me, p_order_id);
  if v_o.status not in ('borrador', 'programada', 'en_ejecucion', 'jornada_cerrada', 'pendiente_validacion', 'con_incidencia', 'reprogramada', 'reabierta') then
    perform private.fail('PT409', 'Solo se cancelan órdenes abiertas.', 'order_not_open');
  end if;
  perform private.change_status(v_me, p_order_id, 'cancelada',
    private.req_text(p_reason, 5, 2000, 'Indique el motivo de la cancelación.'));
  return private.finish_op(p_op_id, jsonb_build_object('order_id', p_order_id, 'status', 'cancelada'));
end;
$$;

-- order.reopen: the supervisor of the order. The next report version needs a closure validated after reopened_at.
create function private.reopen_order(p_op_id uuid, p_order_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me public.profiles;
  v_dup jsonb;
  v_o public.orders;
  v_reason text;
begin
  v_me := private.actor();
  v_dup := private.begin_op(p_op_id, v_me.id, 'reopen_order');
  if v_dup is not null then return v_dup; end if;
  perform private.require(v_me, 'order.reopen');
  v_o := private.lock_order(v_me, p_order_id);
  if v_o.status not in ('finalizada', 'reporte_enviado', 'seguimiento') then
    perform private.fail('PT409', 'Solo se reabren órdenes finalizadas o con reporte enviado.', 'not_reopenable');
  end if;
  v_reason := private.req_text(p_reason, 5, 2000, 'Indique el motivo para reabrir la orden.');
  update public.orders set previous_status = v_o.status, reopened_at = now() where id = p_order_id;
  perform private.change_status(v_me, p_order_id, 'reabierta', v_reason);
  return private.finish_op(p_op_id, jsonb_build_object('order_id', p_order_id, 'status', 'reabierta', 'reopened_at', now()));
end;
$$;

create function private.archive_order(p_op_id uuid, p_order_id uuid, p_reason text default null)
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
  v_dup := private.begin_op(p_op_id, v_me.id, 'archive_order');
  if v_dup is not null then return v_dup; end if;
  perform private.require(v_me, 'order.archive');
  v_o := private.lock_order(v_me, p_order_id);
  if v_o.status not in ('reporte_enviado', 'seguimiento') then
    perform private.fail('PT409', 'Solo se archivan órdenes con reporte enviado o en seguimiento.', 'not_archivable');
  end if;
  if exists (select 1 from public.post_sale_cases c where c.order_id = p_order_id and c.status in ('abierto', 'en_proceso')) then
    perform private.fail('PT409', 'Hay casos postventa abiertos: resuélvalos antes de archivar.', 'open_cases');
  end if;
  update public.orders set archived_at = now() where id = p_order_id;
  perform private.change_status(v_me, p_order_id, 'archivada', coalesce(nullif(btrim(p_reason), ''), 'Ciclo postventa completo'));
  return private.finish_op(p_op_id, jsonb_build_object('order_id', p_order_id, 'status', 'archivada'));
end;
$$;

------------------------------------------------------------------------------------------------------------------------
-- Scheduling (supervisor of the order)
------------------------------------------------------------------------------------------------------------------------
-- crew.assign. Without p_jornada_id it updates every pending jornada. Crew = active workers of the order's unit.
create function private.assign_crew(
  p_op_id uuid,
  p_order_id uuid,
  p_worker_ids uuid[],
  p_reason text default '',
  p_jornada_id uuid default null
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
  v_workers uuid[];
begin
  v_me := private.actor();
  v_dup := private.begin_op(p_op_id, v_me.id, 'assign_crew');
  if v_dup is not null then return v_dup; end if;
  perform private.require(v_me, 'crew.assign');
  v_o := private.lock_order(v_me, p_order_id);
  perform private.assert_open(v_o);
  if p_jornada_id is not null and not exists (
    select 1 from public.jornadas j where j.id = p_jornada_id and j.order_id = p_order_id and j.deleted_at is null
  ) then
    perform private.fail('PT404', 'No encontrado o fuera de su alcance.', 'out_of_scope');
  end if;
  select coalesce(array_agg(distinct w), '{}') into v_workers from unnest(coalesce(p_worker_ids, '{}')) w;
  if cardinality(v_workers) > 60 or exists (
    select 1 from unnest(v_workers) w
    where not exists (select 1 from public.workers x where x.id = w and x.active and x.unit_id = v_o.unit_id)
  ) then
    perform private.fail('PT422', 'La cuadrilla debe ser personal activo de la unidad de la orden.', 'invalid_crew');
  end if;

  update public.jornadas j set worker_ids = v_workers
  where j.order_id = p_order_id and j.deleted_at is null
    and (case when p_jornada_id is not null then j.id = p_jornada_id else j.status = 'pendiente' end);
  insert into public.crew_changes (order_id, jornada_id, worker_ids, reason, created_by)
  values (p_order_id, p_jornada_id, v_workers, left(btrim(coalesce(p_reason, '')), 500), v_me.id);
  perform private.audit(v_me, 'orden', p_order_id, format('Asignó cuadrilla de %s personas', cardinality(v_workers)),
    p_order_id, v_o.unit_id, p_reason);

  if v_o.status = 'borrador' and cardinality(v_workers) > 0
     and exists (select 1 from public.jornadas j where j.order_id = p_order_id and j.deleted_at is null) then
    perform private.change_status(v_me, p_order_id, 'programada');
  end if;
  return private.finish_op(p_op_id, jsonb_build_object('order_id', p_order_id,
    'status', (select o.status from public.orders o where o.id = p_order_id)));
end;
$$;

-- Reprogramar / agregar jornadas: pending jornadas are replaced (tombstoned), executed ones are kept.
create function private.schedule_jornadas(p_op_id uuid, p_order_id uuid, p_days jsonb, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me public.profiles;
  v_dup jsonb;
  v_o public.orders;
  v_kept integer;
  v_crew uuid[];
  v_fresh integer;
begin
  v_me := private.actor();
  v_dup := private.begin_op(p_op_id, v_me.id, 'schedule_jornadas');
  if v_dup is not null then return v_dup; end if;
  perform private.require(v_me, 'order.reschedule', 'crew.assign');
  v_o := private.lock_order(v_me, p_order_id);
  perform private.assert_open(v_o);

  select count(*) into v_kept from public.jornadas j
  where j.order_id = p_order_id and j.deleted_at is null and j.status <> 'pendiente';
  select c.worker_ids into v_crew from public.crew_changes c
  where c.order_id = p_order_id order by c.created_at desc, c.id desc limit 1;
  v_crew := coalesce(v_crew, '{}');

  update public.jornadas j set deleted_at = now()
  where j.order_id = p_order_id and j.deleted_at is null and j.status = 'pendiente';
  insert into public.jornadas (id, order_id, day_index, date, planned_start, planned_end, worker_ids)
  select d.id, p_order_id, v_kept + row_number() over (order by d.day, d.planned_start), d.day, d.planned_start, d.planned_end, v_crew
  from private.parse_days(p_days) d;
  get diagnostics v_fresh = row_count;

  update public.orders o set
    planned_days = (select count(*) from public.jornadas j where j.order_id = p_order_id and j.deleted_at is null),
    scheduled_start = coalesce((select min(j.planned_start) from public.jornadas j where j.order_id = p_order_id and j.deleted_at is null), o.scheduled_start),
    scheduled_end = coalesce((select max(j.planned_end) from public.jornadas j where j.order_id = p_order_id and j.deleted_at is null), o.scheduled_end)
  where o.id = p_order_id;
  perform private.audit(v_me, 'orden', p_order_id, format('Programó %s jornada(s)', v_fresh), p_order_id, v_o.unit_id, p_reason);

  if v_o.status = 'borrador' and cardinality(v_crew) > 0 then
    perform private.change_status(v_me, p_order_id, 'programada');
  end if;
  if v_o.status = 'reprogramada' then
    perform private.change_status(v_me, p_order_id, 'programada', p_reason);
  end if;
  return private.finish_op(p_op_id, jsonb_build_object('order_id', p_order_id,
    'status', (select o.status from public.orders o where o.id = p_order_id)));
end;
$$;

------------------------------------------------------------------------------------------------------------------------
-- Field execution (field.capture = the supervisor of the order)
------------------------------------------------------------------------------------------------------------------------
create function private.geo_label(p_source public.geo_source, p_accuracy double precision)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_source
    when 'remota' then 'supervisión remota'
    when 'manual' then 'ubicación manual'
    else format('GPS ±%s m', round(p_accuracy)::bigint)
  end;
$$;

-- Shared by check_in / check_out: validates the stamp, inserts it (one per kind, unique key) and audits it.
create function private.record_check(
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
  v_remaining integer;
  v_status public.order_status;
begin
  perform private.require(p_me, 'field.capture');
  select j.order_id into v_order_id from public.jornadas j where j.id = p_jornada_id and j.deleted_at is null;
  if v_order_id is null then
    perform private.fail('PT404', 'No encontrado o fuera de su alcance.', 'out_of_scope');
  end if;
  v_o := private.lock_order(p_me, v_order_id);
  select * into v_j from public.jornadas j where j.id = p_jornada_id;
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
    select count(*) into v_remaining from public.jornadas j
    where j.order_id = v_order_id and j.deleted_at is null and j.status = 'pendiente';
    if v_o.status <> 'con_incidencia' then
      perform private.change_status(p_me, v_order_id,
        (case when v_remaining > 0 then 'jornada_cerrada' else 'pendiente_validacion' end)::public.order_status);
    end if;
  end if;

  select o.status into v_status from public.orders o where o.id = v_order_id;
  return jsonb_build_object('jornada_id', p_jornada_id, 'check_id', v_check.id, 'server_at', v_check.server_at,
    'order_id', v_order_id, 'order_status', v_status);
end;
$$;

create function private.check_in(
  p_op_id uuid,
  p_jornada_id uuid,
  p_device_at timestamptz,
  p_lat double precision,
  p_lng double precision,
  p_accuracy double precision,
  p_source public.geo_source default 'gps',
  p_note text default null,
  p_offline boolean default false
)
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
  v_dup := private.begin_op(p_op_id, v_me.id, 'check_in', p_device_at);
  if v_dup is not null then return v_dup; end if;
  return private.finish_op(p_op_id, private.record_check(v_me, 'entrada', p_jornada_id, p_device_at, p_lat, p_lng, p_accuracy, p_source, p_note, p_offline));
end;
$$;

create function private.check_out(
  p_op_id uuid,
  p_jornada_id uuid,
  p_device_at timestamptz,
  p_lat double precision,
  p_lng double precision,
  p_accuracy double precision,
  p_source public.geo_source default 'gps',
  p_note text default null,
  p_offline boolean default false
)
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
  v_dup := private.begin_op(p_op_id, v_me.id, 'check_out', p_device_at);
  if v_dup is not null then return v_dup; end if;
  return private.finish_op(p_op_id, private.record_check(v_me, 'salida', p_jornada_id, p_device_at, p_lat, p_lng, p_accuracy, p_source, p_note, p_offline));
end;
$$;

-- Loads, locks and scope-checks the order of a jornada.
create function private.lock_jornada(p_me public.profiles, p_jornada_id uuid)
returns public.jornadas
language plpgsql
set search_path = ''
as $$
declare
  v_order_id uuid;
  v public.jornadas;
begin
  select j.order_id into v_order_id from public.jornadas j where j.id = p_jornada_id and j.deleted_at is null;
  if v_order_id is null then
    perform private.fail('PT404', 'No encontrado o fuera de su alcance.', 'out_of_scope');
  end if;
  perform private.lock_order(p_me, v_order_id);
  select * into v from public.jornadas j where j.id = p_jornada_id;
  return v;
end;
$$;

create function private.add_jornada_note(p_op_id uuid, p_note_id uuid, p_jornada_id uuid, p_text text, p_device_at timestamptz default null)
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
begin
  v_me := private.actor();
  v_dup := private.begin_op(p_op_id, v_me.id, 'add_jornada_note', p_device_at);
  if v_dup is not null then return v_dup; end if;
  perform private.require(v_me, 'field.capture');
  v_j := private.lock_jornada(v_me, p_jornada_id);
  select * into v_o from public.orders o where o.id = v_j.order_id;
  perform private.assert_not_frozen(v_o);
  insert into public.jornada_notes (id, jornada_id, order_id, text, device_at, created_by)
  values (p_note_id, p_jornada_id, v_j.order_id, private.req_text(p_text, 1, 2000, 'Escriba la nota (hasta 2000 caracteres).'), p_device_at, v_me.id);
  perform private.audit(v_me, 'jornada', p_jornada_id, 'Agregó nota a la bitácora', v_j.order_id, v_o.unit_id);
  return private.finish_op(p_op_id, jsonb_build_object('note_id', p_note_id));
end;
$$;

-- Audit-only reminder about missing evidence (Evidencias): never writes into the jornada's bitácora.
create function private.log_reminder(p_op_id uuid, p_order_id uuid, p_jornada_id uuid default null, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me public.profiles;
  v_dup jsonb;
  v_o public.orders;
  v_day integer;
begin
  v_me := private.actor();
  v_dup := private.begin_op(p_op_id, v_me.id, 'log_reminder');
  if v_dup is not null then return v_dup; end if;
  perform private.require(v_me, 'field.capture');
  v_o := private.lock_order(v_me, p_order_id);
  if p_jornada_id is not null then
    select j.day_index into v_day from public.jornadas j where j.id = p_jornada_id and j.order_id = p_order_id and j.deleted_at is null;
  end if;
  perform private.audit(v_me, case when v_day is null then 'orden' else 'jornada' end::public.audit_entity,
    case when v_day is null then p_order_id else p_jornada_id end,
    'Envió recordatorio de evidencia' || case when v_day is null then '' else ' · Jornada ' || v_day end,
    p_order_id, v_o.unit_id, p_note);
  return private.finish_op(p_op_id, jsonb_build_object('order_id', p_order_id));
end;
$$;

-- Desglose de horas: [{ "activity": text, "hours": number }], total ≤ 24 h.
create function private.set_jornada_breakdown(p_op_id uuid, p_jornada_id uuid, p_breakdown jsonb, p_note text default null)
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
  begin
    select coalesce(jsonb_agg(jsonb_build_object('activity', btrim(e ->> 'activity'), 'hours', (e ->> 'hours')::numeric) order by ord), '[]'::jsonb),
           coalesce(sum((e ->> 'hours')::numeric), 0)
      into v_clean, v_total
    from jsonb_array_elements(p_breakdown) with ordinality as t(e, ord);
  exception when others then
    perform private.fail('PT422', 'Desglose inválido.', 'invalid_breakdown');
  end;
  if v_total > 24 or exists (
    select 1 from jsonb_array_elements(v_clean) e
    where length(coalesce(e ->> 'activity', '')) not between 1 and 300 or (e ->> 'hours')::numeric < 0
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
-- Photos (metadata; the file is uploaded to Storage first — see 04_storage)
------------------------------------------------------------------------------------------------------------------------
create function private.photo_action(p_kind public.photo_kind)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p_kind = 'postventa' then 'postventa.manage' else 'field.capture' end;
$$;

create function private.add_photo(
  p_op_id uuid,
  p_photo_id uuid,
  p_order_id uuid,
  p_kind public.photo_kind,
  p_storage_path text,
  p_taken_at timestamptz default null,
  p_taken_at_source public.taken_at_source default 'device',
  p_area text default '',
  p_jornada_id uuid default null,
  p_incident_id uuid default null,
  p_case_id uuid default null,
  p_attached_at timestamptz default null,
  p_origin public.photo_origin default null,
  p_lat double precision default null,
  p_lng double precision default null,
  p_accuracy double precision default null,
  p_geo_source public.photo_geo_source default null,
  p_width integer default null,
  p_height integer default null,
  p_selected_for_report boolean default true,
  p_note text default null
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
  v_size bigint;
  v_mime text;
  v_taken timestamptz := coalesce(p_taken_at, now());
  v_in timestamptz;
  v_out timestamptz;
  v_notes text[] := '{}';
  v_area text := coalesce(nullif(btrim(p_area), ''), 'Sin área');
begin
  v_me := private.actor();
  v_dup := private.begin_op(p_op_id, v_me.id, 'add_photo', p_attached_at);
  if v_dup is not null then return v_dup; end if;
  perform private.require(v_me, private.photo_action(p_kind));
  v_o := private.lock_order(v_me, p_order_id);
  if p_kind <> 'postventa' then
    perform private.assert_open(v_o);
  end if;

  if p_storage_path is null
     or p_storage_path !~ ('^orders/' || p_order_id || '/' || p_kind || '/' || p_photo_id || '\.(jpg|jpeg|png|webp)$') then
    perform private.fail('PT422', 'Ruta de archivo inválida para esta foto.', 'invalid_storage_path');
  end if;
  select (o.metadata ->> 'size')::bigint, o.metadata ->> 'mimetype' into v_size, v_mime
  from storage.objects o where o.bucket_id = 'evidencias' and o.name = p_storage_path;
  if not found then
    perform private.fail('PT409', 'El archivo de la foto aún no está en el servidor; se reintentará al terminar la carga.', 'object_missing');
  end if;
  if coalesce(v_mime, '') not in ('image/jpeg', 'image/png', 'image/webp') then
    perform private.fail('PT422', 'El archivo no es una imagen JPEG, PNG o WebP.', 'invalid_mime');
  end if;
  if p_jornada_id is not null and not exists (
    select 1 from public.jornadas j where j.id = p_jornada_id and j.order_id = p_order_id and j.deleted_at is null
  ) then
    perform private.fail('PT422', 'La jornada no pertenece a la orden.', 'jornada_order_mismatch');
  end if;
  if p_incident_id is not null and not exists (select 1 from public.incidents i where i.id = p_incident_id and i.order_id = p_order_id) then
    perform private.fail('PT422', 'La incidencia no pertenece a la orden.', 'incident_order_mismatch');
  end if;
  if p_case_id is not null and not exists (select 1 from public.post_sale_cases c where c.id = p_case_id and c.order_id = p_order_id) then
    perform private.fail('PT422', 'El caso no pertenece a la orden.', 'case_order_mismatch');
  end if;
  if v_taken > now() + interval '5 minutes' then
    perform private.fail('PT422', 'La fecha de la foto está en el futuro. Revise el reloj del dispositivo.', 'device_time_future');
  end if;

  insert into public.photos (
    id, order_id, jornada_id, incident_id, case_id, kind, area, taken_at, taken_at_source, attached_at, origin,
    lat, lng, accuracy, geo_source, storage_path, mime_type, bytes, width, height, selected_for_report, note, created_by
  ) values (
    p_photo_id, p_order_id, p_jornada_id, p_incident_id, p_case_id, p_kind, left(v_area, 120), v_taken,
    coalesce(p_taken_at_source, 'device'), p_attached_at, p_origin, p_lat, p_lng, p_accuracy, p_geo_source, p_storage_path,
    v_mime, greatest(coalesce(v_size, 1), 1)::integer, p_width, p_height, coalesce(p_selected_for_report, true),
    left(nullif(btrim(p_note), ''), 1000), v_me.id
  );

  -- Evidence integrity notes (photoTimingIssues in domain.ts), kept in the audit trail.
  if p_jornada_id is not null then
    select max(c.device_at) filter (where c.kind = 'entrada'), max(c.device_at) filter (where c.kind = 'salida')
      into v_in, v_out
    from public.jornada_checks c where c.jornada_id = p_jornada_id;
  end if;
  v_notes := array_remove(array[
    case p_origin when 'gallery' then 'Desde galería' when 'camera' then 'Cámara' end,
    case p_taken_at_source when 'exif' then 'tomada ' || to_char(v_taken at time zone 'America/Monterrey', 'DD/MM/YYYY HH24:MI')
                           when 'file' then 'fecha del archivo ' || to_char(v_taken at time zone 'America/Monterrey', 'DD/MM/YYYY HH24:MI') || ' (sin fecha de la toma)' end,
    case p_geo_source when 'exif' then 'ubicación de la foto' when 'device' then 'ubicación del teléfono al adjuntar' end,
    case when p_kind = 'antes' and v_out is not null and v_taken > v_out then 'Advertencia: Foto ANTES tomada después del registro de salida' end,
    case when p_kind = 'despues' and v_in is not null and v_taken < v_in then 'Advertencia: Foto DESPUÉS tomada antes del registro de entrada' end
  ], null);
  perform private.audit(v_me, 'foto', p_photo_id,
    format('Adjuntó foto %s · %s', case p_kind when 'antes' then 'ANTES' when 'despues' then 'DESPUÉS' else p_kind::text end, v_area),
    p_order_id, v_o.unit_id, array_to_string(v_notes, ' · '));
  return private.finish_op(p_op_id, jsonb_build_object('photo_id', p_photo_id, 'bytes', v_size));
end;
$$;

-- Loads a photo for an edit: kind decides the action; field photos of closed orders are frozen.
create function private.lock_photo_for_edit(p_me public.profiles, p_photo_id uuid)
returns public.photos
language plpgsql
set search_path = ''
as $$
declare
  v public.photos;
  v_o public.orders;
begin
  select * into v from public.photos p where p.id = p_photo_id and p.deleted_at is null;
  if not found then
    perform private.fail('PT404', 'No encontrado o fuera de su alcance.', 'out_of_scope');
  end if;
  perform private.require(p_me, private.photo_action(v.kind));
  v_o := private.lock_order(p_me, v.order_id);
  if v.kind <> 'postventa' then
    perform private.assert_open(v_o);
  end if;
  return v;
end;
$$;

-- p_patch keys: area, note, case_id, incident_id
create function private.update_photo(p_op_id uuid, p_photo_id uuid, p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me public.profiles;
  v_dup jsonb;
  v_p public.photos;
  v_case uuid;
  v_incident uuid;
begin
  v_me := private.actor();
  v_dup := private.begin_op(p_op_id, v_me.id, 'update_photo');
  if v_dup is not null then return v_dup; end if;
  v_p := private.lock_photo_for_edit(v_me, p_photo_id);
  if p_patch is null or jsonb_typeof(p_patch) <> 'object'
     or exists (select 1 from jsonb_object_keys(p_patch) k where k not in ('area', 'note', 'case_id', 'incident_id')) then
    perform private.fail('PT422', 'Ese dato de la foto no se edita aquí.', 'field_not_editable');
  end if;
  v_case := (p_patch ->> 'case_id')::uuid;
  v_incident := (p_patch ->> 'incident_id')::uuid;
  if v_case is not null and not exists (select 1 from public.post_sale_cases c where c.id = v_case and c.order_id = v_p.order_id) then
    perform private.fail('PT422', 'El caso no pertenece a la orden.', 'case_order_mismatch');
  end if;
  if v_incident is not null and not exists (select 1 from public.incidents i where i.id = v_incident and i.order_id = v_p.order_id) then
    perform private.fail('PT422', 'La incidencia no pertenece a la orden.', 'incident_order_mismatch');
  end if;
  update public.photos p set
    area = case when p_patch ? 'area' then left(coalesce(nullif(btrim(p_patch ->> 'area'), ''), 'Sin área'), 120) else p.area end,
    note = case when p_patch ? 'note' then left(nullif(btrim(p_patch ->> 'note'), ''), 1000) else p.note end,
    case_id = case when p_patch ? 'case_id' then v_case else p.case_id end,
    incident_id = case when p_patch ? 'incident_id' then v_incident else p.incident_id end
  where p.id = p_photo_id;
  perform private.audit(v_me, 'foto', p_photo_id,
    'Editó foto · ' || (select p.area from public.photos p where p.id = p_photo_id), v_p.order_id,
    (select o.unit_id from public.orders o where o.id = v_p.order_id));
  return private.finish_op(p_op_id, jsonb_build_object('photo_id', p_photo_id));
exception
  when invalid_text_representation then
    perform private.fail('PT422', 'Algún valor tiene un formato inválido.', 'invalid_value');
end;
$$;

-- Soft delete: the row becomes a tombstone (synced to devices), the Storage object is kept (retention policy).
create function private.delete_photo(p_op_id uuid, p_photo_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me public.profiles;
  v_dup jsonb;
  v_p public.photos;
begin
  v_me := private.actor();
  v_dup := private.begin_op(p_op_id, v_me.id, 'delete_photo');
  if v_dup is not null then return v_dup; end if;
  v_p := private.lock_photo_for_edit(v_me, p_photo_id);
  update public.photos set deleted_at = now(), deleted_by = v_me.id, selected_for_report = false where id = p_photo_id;
  perform private.audit(v_me, 'foto', p_photo_id, 'Eliminó foto · ' || v_p.area, v_p.order_id,
    (select o.unit_id from public.orders o where o.id = v_p.order_id));
  return private.finish_op(p_op_id, jsonb_build_object('photo_id', p_photo_id));
end;
$$;

-- Report selection (field.capture). Explicit value instead of a toggle so a retried op stays idempotent.
create function private.set_photo_selected(p_op_id uuid, p_photo_id uuid, p_selected boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me public.profiles;
  v_dup jsonb;
  v_p public.photos;
  v_o public.orders;
begin
  v_me := private.actor();
  v_dup := private.begin_op(p_op_id, v_me.id, 'set_photo_selected');
  if v_dup is not null then return v_dup; end if;
  perform private.require(v_me, 'field.capture');
  select * into v_p from public.photos p where p.id = p_photo_id and p.deleted_at is null;
  if not found then
    perform private.fail('PT404', 'No encontrado o fuera de su alcance.', 'out_of_scope');
  end if;
  v_o := private.lock_order(v_me, v_p.order_id);
  perform private.assert_not_frozen(v_o);
  if v_p.selected_for_report is distinct from coalesce(p_selected, false) then
    update public.photos set selected_for_report = coalesce(p_selected, false) where id = p_photo_id;
    perform private.audit(v_me, 'foto', p_photo_id,
      case when p_selected then 'Incluyó foto en reporte · ' else 'Quitó foto del reporte · ' end || v_p.area,
      v_p.order_id, v_o.unit_id);
  end if;
  return private.finish_op(p_op_id, jsonb_build_object('photo_id', p_photo_id, 'selected', coalesce(p_selected, false)));
end;
$$;

------------------------------------------------------------------------------------------------------------------------
-- Incidents
------------------------------------------------------------------------------------------------------------------------
create function private.add_incident(
  p_op_id uuid,
  p_incident_id uuid,
  p_order_id uuid,
  p_type public.incident_type,
  p_severity public.severity,
  p_description text,
  p_blocks_closure boolean default false,
  p_jornada_id uuid default null,
  p_device_at timestamptz default null
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
  v_desc text;
begin
  v_me := private.actor();
  v_dup := private.begin_op(p_op_id, v_me.id, 'add_incident', p_device_at);
  if v_dup is not null then return v_dup; end if;
  perform private.require(v_me, 'field.capture');
  v_o := private.lock_order(v_me, p_order_id);
  perform private.assert_open(v_o);
  if p_jornada_id is not null and not exists (
    select 1 from public.jornadas j where j.id = p_jornada_id and j.order_id = p_order_id and j.deleted_at is null
  ) then
    perform private.fail('PT422', 'La jornada no pertenece a la orden.', 'jornada_order_mismatch');
  end if;
  v_desc := private.req_text(p_description, 3, 4000, 'Describa la incidencia.');
  v_folio := 'INC-' || lpad(nextval('private.incident_folio_seq')::text, 4, '0');
  insert into public.incidents (id, folio, order_id, jornada_id, type, severity, description, blocks_closure, device_at, created_by)
  values (p_incident_id, v_folio, p_order_id, p_jornada_id, p_type, p_severity, v_desc, coalesce(p_blocks_closure, false), p_device_at, v_me.id);
  perform private.audit(v_me, 'incidencia', p_incident_id, 'Registró incidencia ' || v_folio, p_order_id, v_o.unit_id);
  if coalesce(p_blocks_closure, false) and v_o.status <> 'con_incidencia' then
    update public.orders set previous_status = v_o.status where id = p_order_id;
    perform private.change_status(v_me, p_order_id, 'con_incidencia', v_desc);
  end if;
  return private.finish_op(p_op_id, jsonb_build_object('incident_id', p_incident_id, 'folio', v_folio,
    'order_status', (select o.status from public.orders o where o.id = p_order_id)));
end;
$$;

-- p_patch keys: type, severity, description, blocks_closure, jornada_id (status/resolution go through resolve_incident)
create function private.update_incident(p_op_id uuid, p_incident_id uuid, p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me public.profiles;
  v_dup jsonb;
  v_i public.incidents;
  v_o public.orders;
  v_jornada uuid;
begin
  v_me := private.actor();
  v_dup := private.begin_op(p_op_id, v_me.id, 'update_incident');
  if v_dup is not null then return v_dup; end if;
  perform private.require(v_me, 'field.capture');
  select * into v_i from public.incidents i where i.id = p_incident_id;
  if not found then
    perform private.fail('PT404', 'No encontrado o fuera de su alcance.', 'out_of_scope');
  end if;
  v_o := private.lock_order(v_me, v_i.order_id);
  perform private.assert_not_frozen(v_o);
  if p_patch is null or jsonb_typeof(p_patch) <> 'object'
     or exists (select 1 from jsonb_object_keys(p_patch) k where k not in ('type', 'severity', 'description', 'blocks_closure', 'jornada_id')) then
    perform private.fail('PT422', 'Ese dato de la incidencia no se edita aquí.', 'field_not_editable');
  end if;
  v_jornada := (p_patch ->> 'jornada_id')::uuid;
  if v_jornada is not null and not exists (
    select 1 from public.jornadas j where j.id = v_jornada and j.order_id = v_i.order_id and j.deleted_at is null
  ) then
    perform private.fail('PT422', 'La jornada no pertenece a la orden.', 'jornada_order_mismatch');
  end if;
  update public.incidents i set
    type = case when p_patch ? 'type' then (p_patch ->> 'type')::public.incident_type else i.type end,
    severity = case when p_patch ? 'severity' then (p_patch ->> 'severity')::public.severity else i.severity end,
    description = case when p_patch ? 'description' then private.req_text(p_patch ->> 'description', 3, 4000, 'Describa la incidencia.') else i.description end,
    blocks_closure = case when p_patch ? 'blocks_closure' then coalesce((p_patch ->> 'blocks_closure')::boolean, false) else i.blocks_closure end,
    jornada_id = case when p_patch ? 'jornada_id' then v_jornada else i.jornada_id end
  where i.id = p_incident_id;
  perform private.audit(v_me, 'incidencia', p_incident_id, 'Actualizó incidencia ' || v_i.folio, v_i.order_id, v_o.unit_id);
  return private.finish_op(p_op_id, jsonb_build_object('incident_id', p_incident_id));
exception
  when invalid_text_representation then
    perform private.fail('PT422', 'Algún valor tiene un formato inválido.', 'invalid_value');
end;
$$;

create function private.resolve_incident(p_op_id uuid, p_incident_id uuid, p_resolution text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me public.profiles;
  v_dup jsonb;
  v_i public.incidents;
  v_o public.orders;
  v_resolution text;
  v_fallback public.order_status;
  v_next public.order_status;
begin
  v_me := private.actor();
  v_dup := private.begin_op(p_op_id, v_me.id, 'resolve_incident');
  if v_dup is not null then return v_dup; end if;
  perform private.require(v_me, 'field.capture');
  select * into v_i from public.incidents i where i.id = p_incident_id;
  if not found then
    perform private.fail('PT404', 'No encontrado o fuera de su alcance.', 'out_of_scope');
  end if;
  v_o := private.lock_order(v_me, v_i.order_id);
  perform private.assert_not_frozen(v_o);
  if v_i.status = 'resuelta' then
    perform private.fail('PT409', 'La incidencia ya está resuelta.', 'already_resolved');
  end if;
  v_resolution := private.req_text(p_resolution, 3, 4000, 'Describa la resolución.');
  update public.incidents set status = 'resuelta', resolution = v_resolution, resolved_at = now(), resolved_by = v_me.id
  where id = p_incident_id;
  perform private.audit(v_me, 'incidencia', p_incident_id, 'Resolvió incidencia ' || v_i.folio, v_i.order_id, v_o.unit_id, v_resolution);

  if v_o.status = 'con_incidencia' and not exists (
    select 1 from public.incidents i where i.order_id = v_i.order_id and i.status = 'abierta' and i.blocks_closure
  ) then
    -- Execution states are recomputed from the jornadas; anything else resumes where it was (store.resolveIncident).
    select case
      when bool_or(j.status = 'en_curso') then 'en_ejecucion'
      when bool_or(j.status = 'pendiente') then case when bool_or(j.status = 'cerrada') then 'jornada_cerrada' else 'programada' end
      else 'pendiente_validacion'
    end::public.order_status into v_fallback
    from public.jornadas j where j.order_id = v_i.order_id and j.deleted_at is null;
    v_next := case when v_o.previous_status in ('finalizada', 'reabierta', 'reprogramada') then v_o.previous_status
                   else coalesce(v_fallback, 'pendiente_validacion') end;
    perform private.change_status(v_me, v_i.order_id, v_next, 'Incidencia resuelta');
  end if;
  return private.finish_op(p_op_id, jsonb_build_object('incident_id', p_incident_id,
    'order_status', (select o.status from public.orders o where o.id = v_i.order_id)));
end;
$$;

------------------------------------------------------------------------------------------------------------------------
-- Closure and reports
------------------------------------------------------------------------------------------------------------------------
-- closure.authorize (supervisor). Re-checks doc §8 here, never trusting the dialog: every jornada closed, no open
-- blocking incident, ANTES + DESPUÉS per executed jornada unless a justified exception (≥ 15 chars) is recorded.
-- Each validation is a new version (re-validation after reopening = version n+1).
create function private.validate_closure(
  p_op_id uuid,
  p_closure_id uuid,
  p_order_id uuid,
  p_summary text,
  p_conformity_method public.conformity_method default null,
  p_conformity_name text default null,
  p_conformity_role text default null,
  p_conformity_signature text default null,
  p_conformity_at timestamptz default null,
  p_conformity_comment text default null,
  p_exception_reason text default null,
  p_device_at timestamptz default null
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
  v_open_jornadas integer;
  v_blocking text[];
  v_missing integer;
  v_exception text := nullif(btrim(coalesce(p_exception_reason, '')), '');
  v_version integer;
  v_hard text[] := '{}';
begin
  v_me := private.actor();
  v_dup := private.begin_op(p_op_id, v_me.id, 'validate_closure', p_device_at);
  if v_dup is not null then return v_dup; end if;
  perform private.require(v_me, 'closure.authorize');
  v_o := private.lock_order(v_me, p_order_id);
  if v_o.status not in ('pendiente_validacion', 'reabierta', 'con_incidencia') then
    perform private.fail('PT409',
      case when v_o.status in ('finalizada', 'reporte_enviado', 'seguimiento', 'archivada') then 'El cierre ya fue validado.'
           else 'Registre la salida de todas las jornadas antes de validar el cierre.' end,
      'not_closable');
  end if;

  select count(*) into v_open_jornadas from public.jornadas j
  where j.order_id = p_order_id and j.deleted_at is null and j.status <> 'cerrada';
  select array_agg(i.folio order by i.folio) into v_blocking from public.incidents i
  where i.order_id = p_order_id and i.status = 'abierta' and i.blocks_closure;
  if v_open_jornadas > 0 then
    v_hard := v_hard || format('%s jornada(s) sin registro de salida', v_open_jornadas);
  end if;
  if v_blocking is not null then
    v_hard := v_hard || array(select 'Incidencia abierta ' || f from unnest(v_blocking) f);
  end if;
  if cardinality(v_hard) > 0 then
    perform private.fail('PT409', 'No se puede cerrar: ' || array_to_string(v_hard, ' · ') || '.', 'closure_blocked');
  end if;

  select count(*) into v_missing from public.jornadas j
  where j.order_id = p_order_id and j.deleted_at is null
    and exists (select 1 from public.jornada_checks c where c.jornada_id = j.id and c.kind = 'entrada')
    and (
      not exists (select 1 from public.photos p where p.jornada_id = j.id and p.kind = 'antes' and p.deleted_at is null)
      or not exists (select 1 from public.photos p where p.jornada_id = j.id and p.kind = 'despues' and p.deleted_at is null)
    );
  if v_missing > 0 and length(coalesce(v_exception, '')) < 15 then
    perform private.fail('PT409', 'Faltan fotos ANTES o DESPUÉS: registre una excepción autorizada y justificada para cerrar.', 'evidence_missing');
  end if;
  if v_missing = 0 then
    v_exception := null; -- an exception is only recorded when evidence is actually missing
  end if;

  if p_conformity_method is not null then
    perform private.req_text(p_conformity_name, 3, 120, 'Indique quién dio la conformidad.');
    if p_conformity_method = 'firma' and p_conformity_signature is null then
      perform private.fail('PT422', 'Falta la firma del cliente.', 'signature_missing');
    end if;
  end if;

  select coalesce(max(c.version), 0) + 1 into v_version from public.order_closures c where c.order_id = p_order_id;
  insert into public.order_closures (
    id, order_id, version, summary, conformity_method, conformity_name, conformity_role, conformity_signature,
    conformity_at, conformity_comment, exception_reason, exception_authorized_by, exception_at, validated_by, device_at
  ) values (
    p_closure_id, p_order_id, v_version,
    private.req_text(p_summary, 10, 8000, 'Escriba la descripción para el reporte (mínimo 10 caracteres).'),
    p_conformity_method,
    case when p_conformity_method is not null then btrim(p_conformity_name) end,
    case when p_conformity_method is not null then nullif(btrim(coalesce(p_conformity_role, '')), '') end,
    case when p_conformity_method = 'firma' then p_conformity_signature end,
    case when p_conformity_method is not null then coalesce(p_conformity_at, p_device_at, now()) end,
    case when p_conformity_method is not null then nullif(btrim(coalesce(p_conformity_comment, '')), '') end,
    v_exception, case when v_exception is not null then v_me.id end, case when v_exception is not null then now() end,
    v_me.id, p_device_at
  );
  perform private.audit(v_me, 'orden', p_order_id,
    case when v_o.status = 'reabierta' then 'Validó de nuevo el cierre (orden reabierta)' else 'Validó cierre definitivo' end,
    p_order_id, v_o.unit_id, case when v_exception is not null then 'Excepción: ' || v_exception end);
  perform private.change_status(v_me, p_order_id, 'finalizada');
  return private.finish_op(p_op_id, jsonb_build_object('closure_id', p_closure_id, 'version', v_version, 'status', 'finalizada'));
end;
$$;

-- report.share (supervisor). Only after a validated closure — and after a reopening, only once the closure was
-- validated again. The server freezes a snapshot of what this version reports.
create function private.generate_report(
  p_op_id uuid,
  p_report_id uuid,
  p_order_id uuid,
  p_photo_ids uuid[] default '{}',
  p_summary text default '',
  p_device_at timestamptz default null
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
  v_closure public.order_closures;
  v_version integer;
  v_photos uuid[];
  v_snapshot jsonb;
begin
  v_me := private.actor();
  v_dup := private.begin_op(p_op_id, v_me.id, 'generate_report', p_device_at);
  if v_dup is not null then return v_dup; end if;
  perform private.require(v_me, 'report.share');
  v_o := private.lock_order(v_me, p_order_id);
  select * into v_closure from public.order_closures c where c.order_id = p_order_id order by c.version desc limit 1;
  if v_o.status = 'reabierta' or (v_o.reopened_at is not null and (v_closure.id is null or v_closure.validated_at < v_o.reopened_at)) then
    perform private.fail('PT409', 'La orden se reabrió: valide de nuevo el cierre antes de generar una nueva versión del reporte.', 'revalidation_required');
  end if;
  if v_o.status not in ('finalizada', 'reporte_enviado', 'seguimiento') or v_closure.id is null then
    perform private.fail('PT409', 'El reporte se genera cuando el cierre está validado.', 'closure_required');
  end if;

  -- Only live photos of this order, in the order the client chose.
  select coalesce(array_agg(x.id order by x.ord), '{}') into v_photos
  from (
    select distinct on (u.id) u.id, u.ord
    from unnest(coalesce(p_photo_ids, '{}')) with ordinality as u(id, ord)
    join public.photos p on p.id = u.id and p.order_id = p_order_id and p.deleted_at is null
    order by u.id, u.ord
  ) x;
  select coalesce(max(r.version), 0) + 1 into v_version from public.reports r where r.order_id = p_order_id;

  v_snapshot := jsonb_build_object(
    'order', to_jsonb(v_o) - 'row_version',
    'client', (select jsonb_build_object('id', c.id, 'name', c.name, 'short_name', c.short_name) from public.clients c where c.id = v_o.client_id),
    'site', (select to_jsonb(s) - 'row_version' from public.sites s where s.id = v_o.site_id),
    'service_type', (select jsonb_build_object('id', st.id, 'name', st.name) from public.service_types st where st.id = v_o.service_type_id),
    'supervisor', (select jsonb_build_object('id', u.id, 'name', u.name, 'title', u.title) from public.profiles u where u.id = v_o.supervisor_id),
    'closure', to_jsonb(v_closure) - 'conformity_signature',
    'jornadas', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', j.id, 'day_index', j.day_index, 'date', j.date, 'planned_start', j.planned_start, 'planned_end', j.planned_end,
        'status', j.status, 'breakdown', j.breakdown,
        'workers', (select coalesce(jsonb_agg(jsonb_build_object('id', w.id, 'name', w.name) order by w.name), '[]'::jsonb)
                    from public.workers w where w.id = any(j.worker_ids)),
        'checks', (select coalesce(jsonb_agg(to_jsonb(c) - 'updated_at' - 'created_at' order by c.kind), '[]'::jsonb)
                   from public.jornada_checks c where c.jornada_id = j.id)
      ) order by j.day_index), '[]'::jsonb)
      from public.jornadas j where j.order_id = p_order_id and j.deleted_at is null
    ),
    'incidents', (
      select coalesce(jsonb_agg(to_jsonb(i) - 'row_version' - 'updated_at' order by i.created_at), '[]'::jsonb)
      from public.incidents i where i.order_id = p_order_id
    ),
    'photos', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id, 'kind', p.kind, 'area', p.area, 'taken_at', p.taken_at, 'jornada_id', p.jornada_id,
        'storage_path', p.storage_path, 'lat', p.lat, 'lng', p.lng
      ) order by array_position(v_photos, p.id)), '[]'::jsonb)
      from public.photos p where p.id = any(v_photos)
    )
  );

  insert into public.reports (id, order_id, closure_id, version, summary, photo_ids, snapshot, generated_by, device_at)
  values (p_report_id, p_order_id, v_closure.id, v_version, left(coalesce(p_summary, ''), 8000), v_photos, v_snapshot, v_me.id, p_device_at);
  perform private.audit(v_me, 'reporte', p_report_id, format('Generó reporte PDF v%s', v_version), p_order_id, v_o.unit_id);
  return private.finish_op(p_op_id, jsonb_build_object('report_id', p_report_id, 'version', v_version, 'photo_ids', to_jsonb(v_photos)));
end;
$$;

-- Records that a manual share was initiated (never claims delivery). First share → Reporte enviado.
create function private.log_share(
  p_op_id uuid,
  p_share_id uuid,
  p_report_id uuid,
  p_channel public.share_channel,
  p_recipient text default '',
  p_device_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me public.profiles;
  v_dup jsonb;
  v_order_id uuid;
  v_o public.orders;
begin
  v_me := private.actor();
  v_dup := private.begin_op(p_op_id, v_me.id, 'log_share', p_device_at);
  if v_dup is not null then return v_dup; end if;
  perform private.require(v_me, 'report.share');
  select r.order_id into v_order_id from public.reports r where r.id = p_report_id;
  if v_order_id is null then
    perform private.fail('PT404', 'No encontrado o fuera de su alcance.', 'out_of_scope');
  end if;
  v_o := private.lock_order(v_me, v_order_id);
  insert into public.report_shares (id, report_id, order_id, channel, recipient, device_at, created_by)
  values (p_share_id, p_report_id, v_order_id, p_channel, left(btrim(coalesce(p_recipient, '')), 200), p_device_at, v_me.id);
  perform private.audit(v_me, 'reporte', p_report_id,
    'Inició envío por ' || case p_channel when 'whatsapp' then 'WhatsApp' when 'email' then 'correo' else 'descarga' end,
    v_order_id, v_o.unit_id, p_recipient);
  if v_o.status = 'finalizada' then
    perform private.change_status(v_me, v_order_id, 'reporte_enviado');
  end if;
  return private.finish_op(p_op_id, jsonb_build_object('share_id', p_share_id,
    'order_status', (select o.status from public.orders o where o.id = v_order_id)));
end;
$$;

------------------------------------------------------------------------------------------------------------------------
-- Privileges: helpers are never executable by API roles; RPCs get their public wrappers.
------------------------------------------------------------------------------------------------------------------------
revoke all on function private.actor() from public, anon, authenticated, service_role;
revoke all on function private.require(public.profiles, text[]) from public, anon, authenticated, service_role;
revoke all on function private.sees_order(public.profiles, public.orders) from public, anon, authenticated, service_role;
revoke all on function private.lock_order(public.profiles, uuid) from public, anon, authenticated, service_role;
revoke all on function private.lock_jornada(public.profiles, uuid) from public, anon, authenticated, service_role;
revoke all on function private.lock_photo_for_edit(public.profiles, uuid) from public, anon, authenticated, service_role;
revoke all on function private.is_terminal(public.order_status) from public, anon, authenticated, service_role;
revoke all on function private.assert_open(public.orders) from public, anon, authenticated, service_role;
revoke all on function private.assert_not_frozen(public.orders) from public, anon, authenticated, service_role;
revoke all on function private.req_text(text, integer, integer, text) from public, anon, authenticated, service_role;
revoke all on function private.check_device_time(timestamptz, text) from public, anon, authenticated, service_role;
revoke all on function private.initials(text) from public, anon, authenticated, service_role;
revoke all on function private.status_label(public.order_status) from public, anon, authenticated, service_role;
revoke all on function private.begin_op(uuid, uuid, text, timestamptz) from public, anon, authenticated, service_role;
revoke all on function private.finish_op(uuid, jsonb) from public, anon, authenticated, service_role;
revoke all on function private.audit(public.profiles, public.audit_entity, uuid, text, uuid, uuid, text) from public, anon, authenticated, service_role;
revoke all on function private.change_status(public.profiles, uuid, public.order_status, text) from public, anon, authenticated, service_role;
revoke all on function private.clean_activities(text[]) from public, anon, authenticated, service_role;
revoke all on function private.clean_materials(jsonb) from public, anon, authenticated, service_role;
revoke all on function private.parse_days(jsonb) from public, anon, authenticated, service_role;
revoke all on function private.geo_label(public.geo_source, double precision) from public, anon, authenticated, service_role;
revoke all on function private.record_check(public.profiles, public.check_kind, uuid, timestamptz, double precision, double precision, double precision, public.geo_source, text, boolean) from public, anon, authenticated, service_role;
revoke all on function private.photo_action(public.photo_kind) from public, anon, authenticated, service_role;

select private.expose_rpc('create_order');
select private.expose_rpc('update_order');
select private.expose_rpc('set_order_status');
select private.expose_rpc('cancel_order');
select private.expose_rpc('reopen_order');
select private.expose_rpc('archive_order');
select private.expose_rpc('assign_crew');
select private.expose_rpc('schedule_jornadas');
select private.expose_rpc('check_in');
select private.expose_rpc('check_out');
select private.expose_rpc('add_jornada_note');
select private.expose_rpc('log_reminder');
select private.expose_rpc('set_jornada_breakdown');
select private.expose_rpc('add_photo');
select private.expose_rpc('update_photo');
select private.expose_rpc('delete_photo');
select private.expose_rpc('set_photo_selected');
select private.expose_rpc('add_incident');
select private.expose_rpc('update_incident');
select private.expose_rpc('resolve_incident');
select private.expose_rpc('validate_closure');
select private.expose_rpc('generate_report');
select private.expose_rpc('log_share');
