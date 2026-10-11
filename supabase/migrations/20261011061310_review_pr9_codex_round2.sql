-- Pulkro Cuadrillas · backend 15 · review round 6 (PR #9, Codex, 2026-10-11)
-- G1 an order's open cases follow it to the new supervisor · G2 reopening a case needs its reason · G3 open blocking
-- incidents stay authoritative when an order is flagged Reprogramada · G4 people stay readable wherever they appear on
-- visible orders and cases · G5 upsert_site holds the client it authorized against. Signatures are unchanged.
-- See docs/backend/architecture.md §4–§6.

------------------------------------------------------------------------------------------------------------------------
-- G1 · Reassigning an order hands its open cases owned by the former supervisor to the new one (in the same transaction,
-- with a timeline entry and an audit row): cases follow the order's visibility, so the former owner would lose them.
------------------------------------------------------------------------------------------------------------------------
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
  v_case record;
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
    -- Open cases the former supervisor owned follow the order: they would lose sight of them (cases follow the order's
    -- visibility), so the new supervisor takes them in the same transaction, with a timeline entry and an audit row.
    for v_case in
      select c.id, c.folio from public.post_sale_cases c
      where c.order_id = p_order_id and c.owner_id = v_o.supervisor_id and c.status in ('abierto', 'en_proceso')
      for update
    loop
      update public.post_sale_cases set owner_id = v_new_sup where id = v_case.id;
      insert into public.case_events (case_id, order_id, text, created_by)
      values (v_case.id, p_order_id, format('Caso reasignado a %s junto con la orden.',
        (select u.name from public.profiles u where u.id = v_new_sup)), v_me.id);
      perform private.audit(v_me, 'caso', v_case.id, 'Reasignó caso ' || v_case.folio || ' con la orden', p_order_id, v_o.unit_id, p_reason);
    end loop;
  end if;

  return private.finish_op(p_op_id, jsonb_build_object('order_id', p_order_id, 'row_version', v_version));
exception
  when invalid_text_representation or invalid_parameter_value then
    perform private.fail('PT422', 'Algún valor tiene un formato inválido.', 'invalid_value');
end;
$$;

------------------------------------------------------------------------------------------------------------------------
-- G2 · Reopening a resolved/closed case needs its reason (p_note, 10+ characters, kept in the timeline), and an owner who
-- can still see the case. p_patch keys: category, severity, channel, description, owner_id, due_date, status, resolution.
------------------------------------------------------------------------------------------------------------------------
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
  -- reopening hands the case back to its owner, who must still be able to see it (they may have moved since it closed)
  if v_c.status in ('resuelto', 'cerrado') and v_status in ('abierto', 'en_proceso') then
    -- reopening needs its reason in the timeline (the app asks for 10+ characters)
    if length(coalesce(v_note, '')) < 10 then
      perform private.fail('PT422', 'Indique por qué se reabre el caso (al menos 10 caracteres).', 'reason_required');
    end if;
    if not v_patch ? 'owner_id' then
      perform private.assert_case_owner(v_o, v_c.owner_id);
    end if;
  end if;
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
-- G3 · Flag Reprogramada (with a reason) or confirm dates. While a blocking incident is open the order stays
-- con_incidencia and the requested status becomes the one it resumes (previous_status); dates of an order that resumes
-- Reprogramada can be confirmed under the incident too. The requested target is never trusted (derived_status).
------------------------------------------------------------------------------------------------------------------------
create or replace function private.set_order_status(p_op_id uuid, p_order_id uuid, p_status public.order_status, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me public.profiles;
  v_dup jsonb;
  v_o public.orders;
  v_next public.order_status;
  v_rescheduled boolean;
  v_blocked boolean;
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
  -- "Reprogramada" is the order's own status, or the one it resumes after its blocking incidents (previous_status).
  v_rescheduled := v_o.status = 'reprogramada' or (v_o.status = 'con_incidencia' and v_o.previous_status = 'reprogramada');
  v_blocked := exists (select 1 from public.incidents i where i.order_id = p_order_id and i.status = 'abierta' and i.blocks_closure);
  if p_status <> 'reprogramada' and not v_rescheduled then
    perform private.fail('PT409', 'Solo se confirman fechas de una orden reprogramada.', 'not_rescheduled');
  end if;
  if p_status = 'reprogramada' then
    if length(btrim(coalesce(p_reason, ''))) < 5 then
      perform private.fail('PT422', 'Indique el motivo de la reprogramación.', 'reason_required');
    end if;
    v_next := 'reprogramada';
  else
    v_next := private.derived_status(p_order_id);
  end if;
  if v_blocked then
    -- An open blocking incident stays authoritative: the order stays con_incidencia and resumes v_next once it is resolved.
    update public.orders set previous_status = v_next where id = p_order_id;
    perform private.change_status(v_me, p_order_id, 'con_incidencia', p_reason);
    perform private.audit(v_me, 'orden', p_order_id,
      case when p_status = 'reprogramada' then 'Marcó la orden como reprogramada (sigue con incidencia)'
           else 'Confirmó fechas (sigue con incidencia)' end,
      p_order_id, v_o.unit_id, p_reason);
    v_next := 'con_incidencia';
  else
    perform private.change_status(v_me, p_order_id, v_next, p_reason);
  end if;
  return private.finish_op(p_op_id, jsonb_build_object('order_id', p_order_id, 'status', v_next));
end;
$$;

------------------------------------------------------------------------------------------------------------------------
-- G4 · People on visible records stay readable after a unit move: supervisors (current and former) and creators of
-- visible orders, owners and creators of their cases and case events, closure validators, survey senders. Resolved once
-- per statement (materialized), like visible_order_ids. Dirección still reads every profile; Administración its unit and
-- Dirección; supervisors themselves.
------------------------------------------------------------------------------------------------------------------------
create function private.referenced_profile_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  with v as materialized (select private.visible_order_ids() as ids)
  select coalesce(array_agg(distinct x.id) filter (where x.id is not null), '{}')
  from (
    select o.supervisor_id as id from public.orders o, v where o.id = any (v.ids)
    union all select o.created_by from public.orders o, v where o.id = any (v.ids)
    union all select a.supervisor_id from private.order_assignments a, v where a.order_id = any (v.ids)
    union all select c.owner_id from public.post_sale_cases c, v where c.order_id = any (v.ids)
    union all select c.created_by from public.post_sale_cases c, v where c.order_id = any (v.ids)
    union all select e.created_by from public.case_events e, v where e.order_id = any (v.ids)
    union all select cl.validated_by from public.order_closures cl, v where cl.order_id = any (v.ids)
    union all select s.sent_by from public.surveys s, v where s.order_id = any (v.ids)
    union all select s.recorded_by from public.surveys s, v where s.order_id = any (v.ids)
  ) x;
$$;
revoke all on function private.referenced_profile_ids() from public, anon, authenticated, service_role;
grant execute on function private.referenced_profile_ids() to authenticated;

drop policy profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
using (
  (select private.my_role()) = 'direccion'
  or ((select private.my_role()) = 'administracion' and (unit_id = (select private.my_unit()) or role = 'direccion'))
  or ((select private.my_role()) = 'supervisor' and id = (select auth.uid()))
  or id = any ((select private.referenced_profile_ids())::uuid[])
);

------------------------------------------------------------------------------------------------------------------------
-- G5 · upsert_site authorizes against the client's unit: that client row (and the site's current client) is held
-- FOR SHARE until commit, so a concurrent unit move (upsert_client, FOR UPDATE) waits or is seen.
------------------------------------------------------------------------------------------------------------------------
create or replace function private.upsert_site(
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
  v_prev_unit uuid;
  v_prev public.sites;
  v_name text;
begin
  v_me := private.actor();
  v_dup := private.begin_op(p_op_id, v_me.id, 'upsert_site');
  if v_dup is not null then return v_dup; end if;
  perform private.require(v_me, 'catalogs.admin');
  -- held until commit: a concurrent unit move of the client (upsert_client, FOR UPDATE) waits, or this call sees it
  select c.unit_id into v_unit from public.clients c where c.id = p_client_id for share;
  if v_unit is null then
    perform private.fail('PT404', 'No encontrado o fuera de su alcance.', 'out_of_scope');
  end if;
  perform private.allow_catalog_unit(v_me, v_unit);
  -- An existing site is also guarded by the unit of the client it belongs to today (a payload must not move it across units).
  select * into v_prev from public.sites s where s.id = p_site_id for update;
  if found then
    select c.unit_id into v_prev_unit from public.clients c where c.id = v_prev.client_id for share;
    perform private.allow_catalog_unit(v_me, v_prev_unit);
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