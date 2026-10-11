-- Pulkro Cuadrillas · backend 11 · review round 2 (PR #9, 2026-10-11)
-- R1 a closed jornada keeps its crew · R2 Con incidencia follows the blocking flag on edits · R3 photos and incidents
-- re-read under the order lock · R4 resolved/closed cases carry their resolution · R5 rows a validation relied on
-- stay locked until commit (client, supervisor, case owner, crew) · R6 workers stay readable where they are on a crew.
-- Signatures are unchanged (the public wrappers stay valid). See docs/backend/architecture.md §5, §6 and §8.

------------------------------------------------------------------------------------------------------------------------
-- R5 · Rows a validation relied on are locked FOR SHARE until commit. The RPCs that change them (upsert_client,
-- update_profile, upsert_worker) take FOR UPDATE first, so the two calls serialize: either the move waits and then
-- sees the new order/case/crew, or the creation waits and re-checks against the moved row.
------------------------------------------------------------------------------------------------------------------------
create or replace function private.assert_case_owner(p_order public.orders, p_owner_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform 1 from public.profiles u
  where u.id = p_owner_id and u.active
    and ((u.role = 'administracion' and u.unit_id = p_order.unit_id) or (u.role = 'supervisor' and u.id = p_order.supervisor_id))
  for share;
  if not found then
    perform private.fail('PT422', 'El responsable debe ser Administración de la unidad o el supervisor de la orden.', 'invalid_case_owner');
  end if;
end;
$$;

create or replace function private.create_order(
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

  -- The order copies the client's unit: a concurrent unit move (upsert_client) must wait for this order or see it.
  select * into v_client from public.clients c where c.id = p_client_id for share;
  if not found or not (v_me.role = 'direccion' or v_client.unit_id = v_me.unit_id) then
    perform private.fail('PT404', 'El cliente no existe o está fuera de su alcance.', 'out_of_scope');
  end if;
  if not exists (select 1 from public.sites s where s.id = p_site_id and s.client_id = p_client_id) then
    perform private.fail('PT422', 'El sitio no pertenece al cliente.', 'site_client_mismatch');
  end if;
  if not exists (select 1 from public.service_types st where st.id = p_service_type_id) then
    perform private.fail('PT422', 'Tipo de servicio inválido.', 'invalid_service_type');
  end if;
  perform 1 from public.profiles u
  where u.id = p_supervisor_id and u.role = 'supervisor' and u.active and u.unit_id = v_client.unit_id
  for share;
  if not found then
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

create or replace function private.update_order(p_op_id uuid, p_order_id uuid, p_patch jsonb, p_reason text default null)
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
    -- Held until commit: a concurrent unit/role change of that person (update_profile) waits and then sees this order.
    perform 1 from public.profiles u
    where u.id = v_new_sup and u.role = 'supervisor' and u.active and u.unit_id = v_o.unit_id
    for share;
    if not found then
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

------------------------------------------------------------------------------------------------------------------------
-- R1 · crew.assign. Without p_jornada_id it updates every pending jornada; a named jornada must still be open
-- (pendiente or en_curso): a closed day's crew is the record of who did the work (generate_report snapshots it).
-- R5 · the crew rows stay locked until commit, so a concurrent deactivation or unit move waits for this assignment.
------------------------------------------------------------------------------------------------------------------------
create or replace function private.assign_crew(
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
  v_j public.jornadas;
  v_workers uuid[];
  v_valid integer;
begin
  v_me := private.actor();
  v_dup := private.begin_op(p_op_id, v_me.id, 'assign_crew');
  if v_dup is not null then return v_dup; end if;
  perform private.require(v_me, 'crew.assign');
  v_o := private.lock_order(v_me, p_order_id);
  perform private.assert_open(v_o);
  if p_jornada_id is not null then
    select * into v_j from public.jornadas j where j.id = p_jornada_id and j.order_id = p_order_id and j.deleted_at is null;
    if not found then
      perform private.fail('PT404', 'No encontrado o fuera de su alcance.', 'out_of_scope');
    end if;
    if v_j.status = 'cerrada' then
      perform private.fail('PT409',
        format('La jornada %s ya se cerró: su cuadrilla queda como registro de quién hizo el trabajo y no se cambia.', v_j.day_index),
        'jornada_closed');
    end if;
  end if;
  select coalesce(array_agg(distinct w), '{}') into v_workers from unnest(coalesce(p_worker_ids, '{}')) w;
  if cardinality(v_workers) > 60 then
    perform private.fail('PT422', 'La cuadrilla debe ser personal activo de la unidad de la orden.', 'invalid_crew');
  end if;
  select count(*) into v_valid from (
    select 1 from public.workers x
    where x.id = any (v_workers) and x.active and x.unit_id = v_o.unit_id
    order by x.id
    for share
  ) ok;
  if v_valid <> cardinality(v_workers) then
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

------------------------------------------------------------------------------------------------------------------------
-- R3 · Photo edits: the photo is looked up to find its order, then re-read (and row-locked) once the order lock is
-- held, so a delete or edit committed by another device while this call waited is seen (photo_deleted).
------------------------------------------------------------------------------------------------------------------------
create or replace function private.lock_photo_for_edit(p_me public.profiles, p_photo_id uuid)
returns public.photos
language plpgsql
set search_path = ''
as $$
declare
  v public.photos;
  v_o public.orders;
begin
  select * into v from public.photos p where p.id = p_photo_id;
  if not found then
    perform private.fail('PT409', 'La foto todavía no está en el servidor; se reintentará cuando llegue.', 'parent_missing');
  end if;
  perform private.require(p_me, private.photo_action(v.kind));
  v_o := private.lock_order(p_me, v.order_id);
  select * into v from public.photos p where p.id = p_photo_id for update;
  if v.deleted_at is not null then
    perform private.fail('PT409', 'La foto ya se eliminó (en otro dispositivo o por otra persona).', 'photo_deleted');
  end if;
  if v.kind <> 'postventa' then
    perform private.assert_open(v_o);
  end if;
  return v;
end;
$$;

create or replace function private.set_photo_selected(p_op_id uuid, p_photo_id uuid, p_selected boolean)
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
  select * into v_p from public.photos p where p.id = p_photo_id;
  if not found then
    perform private.fail('PT409', 'La foto todavía no está en el servidor; se reintentará cuando llegue.', 'parent_missing');
  end if;
  v_o := private.lock_order(v_me, v_p.order_id);
  select * into v_p from public.photos p where p.id = p_photo_id for update;
  if v_p.deleted_at is not null then
    perform private.fail('PT409', 'La foto ya se eliminó (en otro dispositivo o por otra persona).', 'photo_deleted');
  end if;
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
-- R2 + R3 · Incidents. Both RPCs re-read the incident under the order lock (a resolution or edit committed by another
-- device while this call waited is seen). Turning the blocking flag of an open incident on enters Con incidencia
-- (keeping the status to resume, like add_incident); turning it off leaves it once no blocker remains (like
-- resolve_incident: finalizada/reabierta/reprogramada resume, execution states come from the jornadas).
------------------------------------------------------------------------------------------------------------------------
create or replace function private.update_incident(p_op_id uuid, p_incident_id uuid, p_patch jsonb)
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
  v_blocks boolean;
begin
  v_me := private.actor();
  v_dup := private.begin_op(p_op_id, v_me.id, 'update_incident');
  if v_dup is not null then return v_dup; end if;
  perform private.require(v_me, 'field.capture');
  select * into v_i from public.incidents i where i.id = p_incident_id;
  if not found then
    perform private.fail('PT409', 'La incidencia todavía no está en el servidor; se reintentará cuando llegue.', 'parent_missing');
  end if;
  v_o := private.lock_order(v_me, v_i.order_id);
  select * into v_i from public.incidents i where i.id = p_incident_id for update;
  perform private.assert_open(v_o);
  if p_patch is null or jsonb_typeof(p_patch) <> 'object'
     or exists (select 1 from jsonb_object_keys(p_patch) k where k not in ('type', 'severity', 'description', 'blocks_closure', 'jornada_id')) then
    perform private.fail('PT422', 'Ese dato de la incidencia no se edita aquí.', 'field_not_editable');
  end if;
  v_jornada := (p_patch ->> 'jornada_id')::uuid;
  perform private.check_order_ref('jornada', v_jornada, v_i.order_id);
  v_blocks := case when p_patch ? 'blocks_closure' then coalesce((p_patch ->> 'blocks_closure')::boolean, false) else v_i.blocks_closure end;
  update public.incidents i set
    type = case when p_patch ? 'type' then (p_patch ->> 'type')::public.incident_type else i.type end,
    severity = case when p_patch ? 'severity' then (p_patch ->> 'severity')::public.severity else i.severity end,
    description = case when p_patch ? 'description' then private.req_text(p_patch ->> 'description', 3, 4000, 'Describa la incidencia.') else i.description end,
    blocks_closure = v_blocks,
    jornada_id = case when p_patch ? 'jornada_id' then v_jornada else i.jornada_id end
  where i.id = p_incident_id;
  perform private.audit(v_me, 'incidencia', p_incident_id, 'Actualizó incidencia ' || v_i.folio, v_i.order_id, v_o.unit_id);

  if v_i.status = 'abierta' and v_blocks is distinct from v_i.blocks_closure then
    if v_blocks and v_o.status <> 'con_incidencia' then
      update public.orders set previous_status = v_o.status where id = v_i.order_id;
      perform private.change_status(v_me, v_i.order_id, 'con_incidencia',
        (select i.description from public.incidents i where i.id = p_incident_id));
    elsif not v_blocks and v_o.status = 'con_incidencia' and not exists (
      select 1 from public.incidents i where i.order_id = v_i.order_id and i.status = 'abierta' and i.blocks_closure
    ) then
      perform private.change_status(v_me, v_i.order_id,
        case when v_o.previous_status in ('finalizada', 'reabierta', 'reprogramada') then v_o.previous_status
             else private.derived_status(v_i.order_id) end,
        format('La incidencia %s ya no bloquea el cierre', v_i.folio));
    end if;
  end if;
  return private.finish_op(p_op_id, jsonb_build_object('incident_id', p_incident_id,
    'order_status', (select o.status from public.orders o where o.id = v_i.order_id)));
exception
  when invalid_text_representation then
    perform private.fail('PT422', 'Algún valor tiene un formato inválido.', 'invalid_value');
end;
$$;

create or replace function private.resolve_incident(p_op_id uuid, p_incident_id uuid, p_resolution text)
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
  v_next public.order_status;
begin
  v_me := private.actor();
  v_dup := private.begin_op(p_op_id, v_me.id, 'resolve_incident');
  if v_dup is not null then return v_dup; end if;
  perform private.require(v_me, 'field.capture');
  select * into v_i from public.incidents i where i.id = p_incident_id;
  if not found then
    perform private.fail('PT409', 'La incidencia todavía no está en el servidor; se reintentará cuando llegue.', 'parent_missing');
  end if;
  v_o := private.lock_order(v_me, v_i.order_id);
  select * into v_i from public.incidents i where i.id = p_incident_id for update;
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
    v_next := case when v_o.previous_status in ('finalizada', 'reabierta', 'reprogramada') then v_o.previous_status
                   else private.derived_status(v_i.order_id) end;
    perform private.change_status(v_me, v_i.order_id, v_next, 'Incidencia resuelta');
  end if;
  return private.finish_op(p_op_id, jsonb_build_object('incident_id', p_incident_id,
    'order_status', (select o.status from public.orders o where o.id = v_i.order_id)));
end;
$$;

------------------------------------------------------------------------------------------------------------------------
-- R4 · A case is resolved or closed only with its resolution (what was done for the client). New cases start abierto
-- or en_proceso (create_case takes no resolution); updates that set the status or the resolution are checked against
-- the resulting row, with the app's rule (at least 10 characters). The table keeps a non-blank floor as a backstop.
------------------------------------------------------------------------------------------------------------------------
alter table public.post_sale_cases add constraint post_sale_cases_resolution_required
  check (status in ('abierto', 'en_proceso') or length(btrim(coalesce(resolution, ''))) > 0) not valid;
alter table public.post_sale_cases validate constraint post_sale_cases_resolution_required;

create or replace function private.create_case(
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
  if coalesce(p_status, 'abierto') not in ('abierto', 'en_proceso') then
    perform private.fail('PT422', 'Un caso nuevo empieza abierto o en proceso: regístrelo y después márquelo como resuelto con su resolución.', 'resolution_required');
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
create or replace function private.update_case(p_op_id uuid, p_case_id uuid, p_patch jsonb default '{}', p_note text default null)
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
  v_status public.case_status;
  v_resolution text;
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
  select * into v_c from public.post_sale_cases c where c.id = p_case_id for update;
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
  v_status := case when v_patch ? 'status' then (v_patch ->> 'status')::public.case_status else v_c.status end;
  v_resolution := case when v_patch ? 'resolution' then left(nullif(btrim(v_patch ->> 'resolution'), ''), 4000) else v_c.resolution end;
  if (v_patch ? 'status' or v_patch ? 'resolution') and v_status in ('resuelto', 'cerrado')
     and length(coalesce(v_resolution, '')) < 10 then
    perform private.fail('PT422', 'Escriba la resolución (al menos 10 caracteres) para marcar el caso como resuelto o cerrado.', 'resolution_required');
  end if;
  update public.post_sale_cases c set
    category = case when v_patch ? 'category' then (v_patch ->> 'category')::public.case_category else c.category end,
    severity = case when v_patch ? 'severity' then (v_patch ->> 'severity')::public.severity else c.severity end,
    channel = case when v_patch ? 'channel' then (v_patch ->> 'channel')::public.case_channel else c.channel end,
    description = case when v_patch ? 'description' then private.req_text(v_patch ->> 'description', 3, 4000, 'Describa el caso.') else c.description end,
    owner_id = case when v_patch ? 'owner_id' then (v_patch ->> 'owner_id')::uuid else c.owner_id end,
    due_date = case when v_patch ? 'due_date' then coalesce((v_patch ->> 'due_date')::date, c.due_date) else c.due_date end,
    status = v_status,
    resolution = v_resolution
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

------------------------------------------------------------------------------------------------------------------------
-- R6 · A worker moved to another unit (or deactivated) can still be on open jornadas of the old unit — the app allows
-- it after a confirmation — and is named in closed jornadas and crew history. Workers stay readable wherever they
-- appear on a crew the caller can see; the planning pool (pickers) still filters by unit and active in the app.
------------------------------------------------------------------------------------------------------------------------
create function private.crew_worker_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  with v as (select private.visible_order_ids() as ids)
  select coalesce(array_agg(distinct w.id), '{}')
  from (
    select unnest(j.worker_ids) as id from public.jornadas j, v where j.order_id = any (v.ids)
    union all
    select unnest(c.worker_ids) from public.crew_changes c, v where c.order_id = any (v.ids)
  ) w;
$$;
revoke all on function private.crew_worker_ids() from public, anon, authenticated, service_role;
grant execute on function private.crew_worker_ids() to authenticated;

drop policy workers_select on public.workers;
create policy workers_select on public.workers for select to authenticated
using (
  (select private.my_role()) = 'direccion'
  or unit_id = (select private.my_unit())
  or id = any ((select private.crew_worker_ids())::uuid[])
);
