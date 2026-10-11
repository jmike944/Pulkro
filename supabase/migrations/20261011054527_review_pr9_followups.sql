-- Pulkro Cuadrillas · backend 14 · review round 5 (PR #9, adversarial pass on rounds 2–4, 2026-10-11)
-- F1 assign_crew answers the field-capture reference contract (parent_missing / jornada_order_mismatch /
-- jornada_rescheduled) · F2 an open incident carries no resolution text either · F3 reopening a case re-checks its owner ·
-- F4 a supervisor of another unit cannot reopen an order · F5 crew_worker_ids computes the visible orders once
-- (materialized). Signatures are unchanged. See docs/backend/architecture.md §4–§6.

------------------------------------------------------------------------------------------------------------------------
-- F1 · crew.assign on a named jornada: a jornada not on the server yet is retried (parent_missing), another order's is
-- refused (jornada_order_mismatch), a rescheduled one is a sync conflict (jornada_rescheduled), a closed one keeps its crew.
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
    -- same reference contract as field capture: parent_missing / jornada_order_mismatch / jornada_rescheduled
    perform private.check_order_ref('jornada', p_jornada_id, p_order_id);
    select * into v_j from public.jornadas j where j.id = p_jornada_id;
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
-- F2 · An open incident carries none of the resolution fields; a resolved one carries all three.
------------------------------------------------------------------------------------------------------------------------
alter table public.incidents drop constraint incidents_resolution_consistent;
alter table public.incidents add constraint incidents_resolution_consistent check (
  case when status = 'resuelta'
    then resolved_at is not null and resolved_by is not null and length(btrim(coalesce(resolution, ''))) > 0
    else resolved_at is null and resolved_by is null and resolution is null
  end
);

------------------------------------------------------------------------------------------------------------------------
-- F3 · Reopening a resolved/closed case checks that its owner can still see it (a reassignment in the same patch is
-- checked as before). p_patch keys: category, severity, channel, description, owner_id, due_date, status, resolution.
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
  if v_c.status in ('resuelto', 'cerrado') and v_status in ('abierto', 'en_proceso') and not v_patch ? 'owner_id' then
    perform private.assert_case_owner(v_o, v_c.owner_id);
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
-- F4 · order.reopen: the supervisor of the order, still in the order's unit.
------------------------------------------------------------------------------------------------------------------------
create or replace function private.reopen_order(p_op_id uuid, p_order_id uuid, p_reason text)
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
  -- a supervisor moved to another unit still sees their closed orders (supervisor_id) but cannot bring one back to work
  if v_me.unit_id is distinct from v_o.unit_id then
    perform private.fail('PT409', 'Usted ya no pertenece a la unidad de esta orden: pida a Administración que la reasigne antes de reabrirla.', 'supervisor_other_unit');
  end if;
  v_reason := private.req_text(p_reason, 5, 2000, 'Indique el motivo para reabrir la orden.');
  update public.orders set previous_status = v_o.status, reopened_at = now() where id = p_order_id;
  perform private.change_status(v_me, p_order_id, 'reabierta', v_reason);
  return private.finish_op(p_op_id, jsonb_build_object('order_id', p_order_id, 'status', 'reabierta', 'reopened_at', now()));
end;
$$;

------------------------------------------------------------------------------------------------------------------------
-- F5 · The visible orders are resolved once per call (materialized CTE), whatever the shape of the query below.
------------------------------------------------------------------------------------------------------------------------
create or replace function private.crew_worker_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  with v as materialized (select private.visible_order_ids() as ids)
  select coalesce(array_agg(distinct w.id), '{}')
  from (
    select unnest(j.worker_ids) as id from public.jornadas j, v where j.order_id = any (v.ids)
    union all
    select unnest(c.worker_ids) from public.crew_changes c, v where c.order_id = any (v.ids)
  ) w;
$$;
