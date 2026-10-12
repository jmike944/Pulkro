-- Pulkro Cuadrillas · backend 18 · owner decisions (2026-10-11)
-- Decision 19 (docs/backend/architecture.md §14): Administración can reassign the responsible supervisor of a closed order
-- (finalizada, reporte_enviado, seguimiento) without reopening it, so a closed order whose supervisor moved to another unit
-- or left can still be followed up and reopened (reopen_order requires the supervisor to belong to the order's unit).
-- Only supervisor_id; every other field of a closed order still needs a reopening. Signature unchanged.

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
  -- Decision 19: the responsible supervisor of a closed order (finalizada, reporte_enviado, seguimiento) can still be
  -- reassigned — that field only — so follow-up and a reopening are not stranded when its supervisor moved or left.
  -- Everything else on a closed order still needs a reopening; cancelled and archived orders stay frozen.
  if not (v_keys = array['supervisor_id'] and v_o.status in ('finalizada', 'reporte_enviado', 'seguimiento')) then
    perform private.assert_open(v_o);
  end if;

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