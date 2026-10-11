-- Pulkro Cuadrillas · backend 16 · review round 7 (PR #9, cubic + adversarial pass on round 6, 2026-10-11)
-- H1 update_incident refuses an empty patch and never detaches an incident from its jornada · H2 drop_demo_data refuses
-- while a surviving order still names a demo material or demo worker (references without a foreign key) · H3 check-in,
-- check-out and rescheduling under an open blocking incident update the status the order resumes · H4 a supervisor owns
-- a case only while in the order's unit · H5 upsert_site locks clients before the site (no lock cycle with upsert_client).
-- Signatures are unchanged. See docs/backend/architecture.md §5–§6 and supabase/seed/README.md.

------------------------------------------------------------------------------------------------------------------------
-- H1 · p_patch keys: type, severity, description, blocks_closure, jornada_id (status/resolution go through
-- resolve_incident). An empty patch answers empty_patch; jornada_id must name a live jornada of the order.
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
  if p_patch = '{}'::jsonb then
    perform private.fail('PT422', 'No hay cambios que guardar.', 'empty_patch');
  end if;
  -- an incident stays on its jornada: the key may move it to another day of the order, never detach it (null)
  if p_patch ? 'jornada_id' then
    if jsonb_typeof(p_patch -> 'jornada_id') is distinct from 'string' then
      perform private.fail('PT422', 'Indique la jornada de la incidencia.', 'jornada_required');
    end if;
    v_jornada := (p_patch ->> 'jornada_id')::uuid;
    perform private.check_order_ref('jornada', v_jornada, v_i.order_id);
  end if;
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

------------------------------------------------------------------------------------------------------------------------
-- H2 · One-step removal of the demo dataset, now also guarding the references that have no foreign key.
------------------------------------------------------------------------------------------------------------------------
create or replace function private.drop_demo_data(p_delete_storage_rows boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_orders uuid[];
  v_units uuid[];
  v_users uuid[];
  v_paths text[];
  v_prev_purge text := coalesce(pg_catalog.current_setting('pulkro.history_purge', true), '');
  v_prev_storage text := coalesce(pg_catalog.current_setting('storage.allow_delete_query', true), '');
  v_counts jsonb := '{}'::jsonb;
  v_reset text[] := '{}';
  v_n bigint;
  v_t text;
  v_msg text;
  v_detail text;
  v_using text;
begin
  select coalesce(array_agg(r.row_id::uuid), '{}') into v_orders from private.demo_rows r where r.table_name = 'orders';
  select coalesce(array_agg(r.row_id::uuid), '{}') into v_units from private.demo_rows r where r.table_name = 'units';
  select coalesce(array_agg(r.row_id::uuid), '{}') into v_users from private.demo_rows r where r.table_name = 'auth.users';

  -- References without a foreign key: orders.materials (jsonb) and crew worker_ids (uuid[]). A row that survives the drop
  -- and still names a demo material or worker would keep a dangling id: refuse, like the foreign keys below do.
  select string_agg(x.what, '; ' order by x.what) into v_using
  from (
    select 'material in order ' || o.folio as what
    from public.orders o
    where not (o.id = any (v_orders))
      and exists (select 1 from jsonb_array_elements(o.materials) m
                  where (m ->> 'material_id') in (select r.row_id from private.demo_rows r where r.table_name = 'materials'))
    union all
    select 'worker on a crew of order ' || o.folio
    from public.orders o
    where not (o.id = any (v_orders))
      and (exists (select 1 from public.jornadas j where j.order_id = o.id
                   and j.worker_ids && (select coalesce(array_agg(r.row_id::uuid), '{}') from private.demo_rows r where r.table_name = 'workers'))
        or exists (select 1 from public.crew_changes c where c.order_id = o.id
                   and c.worker_ids && (select coalesce(array_agg(r.row_id::uuid), '{}') from private.demo_rows r where r.table_name = 'workers')))
  ) x;
  if v_using is not null then
    raise exception using errcode = 'PT409', hint = 'demo_in_use',
      message = 'Demo data is still referenced by rows that are not demo data; nothing was deleted.',
      detail = left(v_using, 1500) || '. Reassign or delete those rows first.';
  end if;

  -- Evidence files stored under a demo order (the seed uploads none).
  select array_agg(o.name order by o.name) into v_paths
  from storage.objects o
  where o.bucket_id = 'evidencias' and split_part(o.name, '/', 1) = 'orders'
    and split_part(o.name, '/', 2) = any (v_orders::text[]);
  if v_paths is not null and not coalesce(p_delete_storage_rows, false) then
    raise exception using errcode = 'PT409', hint = 'demo_storage_objects',
      message = format('%s evidence file(s) were uploaded to demo orders; nothing was deleted.', cardinality(v_paths)),
      detail = 'Delete them through the Storage API (Dashboard > Storage > evidencias > orders/<order id>) and run again, '
        || 'or call private.drop_demo_data(p_delete_storage_rows => true) to drop only their metadata rows. First paths: '
        || array_to_string(v_paths[1:10], ', ');
  end if;

  begin
    perform pg_catalog.set_config('pulkro.history_purge', 'on', true);
    if v_paths is not null then
      perform pg_catalog.set_config('storage.allow_delete_query', 'true', true);
      delete from storage.objects o where o.bucket_id = 'evidencias' and o.name = any (v_paths);
      get diagnostics v_n = row_count;
      v_counts := v_counts || jsonb_build_object('storage.objects', v_n);
      perform pg_catalog.set_config('storage.allow_delete_query', v_prev_storage, true);
    end if;

    delete from public.audit_log a
    where a.id in (select r.row_id::bigint from private.demo_rows r where r.table_name = 'audit_log')
       or a.order_id = any (v_orders) or a.unit_id = any (v_units) or a.actor_id = any (v_users);
    get diagnostics v_n = row_count;
    v_counts := v_counts || jsonb_build_object('audit_log', v_n);

    -- The subtree of every demo order, leaves first.
    foreach v_t in array array[
      'survey_tokens', 'surveys', 'report_shares', 'reports', 'order_closures', 'case_events', 'photos', 'post_sale_cases',
      'incidents', 'jornada_notes', 'jornada_checks', 'crew_changes', 'jornadas'
    ] loop
      execute format(
        'delete from public.%1$I t where t.order_id = any ($1) '
        'or t.%2$I in (select r.row_id::uuid from private.demo_rows r where r.table_name = %1$L)',
        v_t, case v_t when 'survey_tokens' then 'survey_id' else 'id' end)
      using v_orders;
      get diagnostics v_n = row_count;
      v_counts := v_counts || jsonb_build_object(v_t, v_n);
    end loop;

    delete from private.order_assignments a where a.order_id = any (v_orders) or a.supervisor_id = any (v_users);
    delete from public.orders o where o.id = any (v_orders);
    get diagnostics v_n = row_count;
    v_counts := v_counts || jsonb_build_object('orders', v_n);

    -- Catalogs and accounts: registered rows only.
    foreach v_t in array array['sites', 'clients', 'workers', 'materials', 'service_types', 'profiles'] loop
      execute format(
        'delete from public.%1$I t where t.id in (select r.row_id::uuid from private.demo_rows r where r.table_name = %1$L)', v_t);
      get diagnostics v_n = row_count;
      v_counts := v_counts || jsonb_build_object(v_t, v_n);
    end loop;
    delete from private.sync_ops s where s.actor_id = any (v_users);
    delete from auth.users u where u.id = any (v_users);
    get diagnostics v_n = row_count;
    v_counts := v_counts || jsonb_build_object('auth.users', v_n);
    delete from public.units u where u.id = any (v_units);
    get diagnostics v_n = row_count;
    v_counts := v_counts || jsonb_build_object('units', v_n);

    perform pg_catalog.set_config('pulkro.history_purge', v_prev_purge, true);
  exception when foreign_key_violation then
    get stacked diagnostics v_msg = message_text, v_detail = pg_exception_detail;
    raise exception using errcode = 'PT409', hint = 'demo_in_use',
      message = 'Demo data is still referenced by rows that are not demo data; nothing was deleted.',
      detail = v_msg || coalesce(' ' || v_detail, '') || ' Reassign or delete those rows first.';
  end;

  delete from private.demo_rows;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('registry', v_n);

  -- Folios and the audit identity restart only when nothing is left in their table.
  if not exists (select 1 from public.orders) then
    perform pg_catalog.setval('private.order_folio_seq'::regclass, 1, false);
    v_reset := v_reset || 'private.order_folio_seq'::text;
  end if;
  if not exists (select 1 from public.incidents) then
    perform pg_catalog.setval('private.incident_folio_seq'::regclass, 1, false);
    v_reset := v_reset || 'private.incident_folio_seq'::text;
  end if;
  if not exists (select 1 from public.post_sale_cases) then
    perform pg_catalog.setval('private.case_folio_seq'::regclass, 1, false);
    v_reset := v_reset || 'private.case_folio_seq'::text;
  end if;
  if not exists (select 1 from public.audit_log) then
    perform pg_catalog.setval(pg_catalog.pg_get_serial_sequence('public.audit_log', 'id')::regclass, 1, false);
    v_reset := v_reset || 'public.audit_log_id_seq'::text;
  end if;

  return jsonb_build_object('deleted', v_counts, 'sequences_reset', to_jsonb(v_reset));
end;
$$;

------------------------------------------------------------------------------------------------------------------------
-- H3 · Field capture and rescheduling under an open blocking incident: the order stays con_incidencia and the status the
-- non-incident path would set becomes previous_status (resolve_incident resumes it). Without this a Reprogramada flagged
-- before the incident survived the work and blocked the closure after the incident was resolved.
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
  else
    update public.jornadas set status = 'cerrada' where id = p_jornada_id;
  end if;
  -- entrada → en_ejecucion; salida → the status the live jornadas support (another day still in progress keeps
  -- en_ejecucion). Under an open blocking incident the order stays con_incidencia and that status becomes the one it
  -- resumes, so a stale Reprogramada/Reabierta is never resumed after the work was done.
  v_status := case when p_kind = 'entrada' then 'en_ejecucion'::public.order_status else private.derived_status(v_order_id) end;
  if v_o.status = 'con_incidencia' then
    update public.orders set previous_status = v_status where id = v_order_id;
  else
    perform private.change_status(p_me, v_order_id, v_status);
  end if;

  select o.status into v_status from public.orders o where o.id = v_order_id;
  return jsonb_build_object('jornada_id', p_jornada_id, 'check_id', v_check.id, 'server_at', v_check.server_at,
    'order_id', v_order_id, 'order_status', v_status);
end;
$$;

create or replace function private.schedule_jornadas(p_op_id uuid, p_order_id uuid, p_days jsonb, p_reason text default null)
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
  v_last integer;
  v_new integer;
  v_crew uuid[];
  v_fresh integer;
begin
  v_me := private.actor();
  v_dup := private.begin_op(p_op_id, v_me.id, 'schedule_jornadas');
  if v_dup is not null then return v_dup; end if;
  perform private.require(v_me, 'order.reschedule', 'crew.assign');
  v_o := private.lock_order(v_me, p_order_id);
  perform private.assert_open(v_o);

  select count(*), coalesce(max(j.day_index), 0) into v_kept, v_last from public.jornadas j
  where j.order_id = p_order_id and j.deleted_at is null and j.status <> 'pendiente';
  select count(*) into v_new from private.parse_days(p_days);
  if v_new = 0 and v_kept = 0 then
    perform private.fail('PT422', 'Indique al menos una jornada: la orden no puede quedarse sin días por ejecutar.', 'days_required');
  end if;
  select c.worker_ids into v_crew from public.crew_changes c
  where c.order_id = p_order_id order by c.created_at desc, c.id desc limit 1;
  v_crew := coalesce(v_crew, '{}');

  update public.jornadas j set deleted_at = now()
  where j.order_id = p_order_id and j.deleted_at is null and j.status = 'pendiente';
  insert into public.jornadas (id, order_id, day_index, date, planned_start, planned_end, worker_ids)
  select d.id, p_order_id, v_last + row_number() over (order by d.day, d.planned_start), d.day, d.planned_start, d.planned_end, v_crew
  from private.parse_days(p_days) d;
  get diagnostics v_fresh = row_count;

  update public.orders o set
    planned_days = (select count(*) from public.jornadas j where j.order_id = p_order_id and j.deleted_at is null),
    scheduled_start = coalesce((select min(j.planned_start) from public.jornadas j where j.order_id = p_order_id and j.deleted_at is null), o.scheduled_start),
    scheduled_end = coalesce((select max(j.planned_end) from public.jornadas j where j.order_id = p_order_id and j.deleted_at is null), o.scheduled_end)
  where o.id = p_order_id;
  perform private.audit(v_me, 'orden', p_order_id,
    format('Programó %s %s', v_fresh, case when v_fresh = 1 then 'jornada' else 'jornadas' end), p_order_id, v_o.unit_id, p_reason);

  if v_o.status in ('borrador', 'programada', 'en_ejecucion', 'jornada_cerrada', 'pendiente_validacion', 'reprogramada') then
    perform private.change_status(v_me, p_order_id, private.derived_status(p_order_id),
      case when v_o.status = 'reprogramada' then p_reason end);
  elsif v_o.status = 'con_incidencia'
        and v_o.previous_status in ('borrador', 'programada', 'en_ejecucion', 'jornada_cerrada', 'pendiente_validacion', 'reprogramada') then
    -- under an open blocking incident the new plan decides the status the order resumes
    update public.orders set previous_status = private.derived_status(p_order_id) where id = p_order_id;
  end if;
  return private.finish_op(p_op_id, jsonb_build_object('order_id', p_order_id,
    'status', (select o.status from public.orders o where o.id = p_order_id)));
end;
$$;

------------------------------------------------------------------------------------------------------------------------
-- H4 · Case owner: an active member of the order's unit — its Administración, or its own supervisor (as update_profile
-- and reopen_order already require, and as the app's isValidCaseOwner checks).
------------------------------------------------------------------------------------------------------------------------
create or replace function private.assert_case_owner(p_order public.orders, p_owner_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform 1 from public.profiles u
  where u.id = p_owner_id and u.active
    and u.unit_id = p_order.unit_id
    and (u.role = 'administracion' or (u.role = 'supervisor' and u.id = p_order.supervisor_id))
  for share;
  if not found then
    perform private.fail('PT422', 'El responsable debe ser Administración de la unidad o el supervisor de la orden.', 'invalid_case_owner');
  end if;
end;
$$;

------------------------------------------------------------------------------------------------------------------------
-- H5 · upsert_site: clients first (FOR SHARE, in id order), then the site FOR UPDATE — the order upsert_client uses — so
-- the two never wait on each other in a cycle; a site whose client changed in between answers site_changed (retry).
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
  v_prev_client uuid;
  v_prev public.sites;
  v_name text;
begin
  v_me := private.actor();
  v_dup := private.begin_op(p_op_id, v_me.id, 'upsert_site');
  if v_dup is not null then return v_dup; end if;
  perform private.require(v_me, 'catalogs.admin');
  -- Clients before sites, like upsert_client (client FOR UPDATE, then its sites): the target client and the site's current
  -- client are held FOR SHARE (in id order) until commit, so a concurrent unit move waits or is seen, without a lock cycle.
  select s.client_id into v_prev_client from public.sites s where s.id = p_site_id;
  perform 1 from public.clients c where c.id in (p_client_id, v_prev_client) order by c.id for share;
  select c.unit_id into v_unit from public.clients c where c.id = p_client_id;
  if v_unit is null then
    perform private.fail('PT404', 'No encontrado o fuera de su alcance.', 'out_of_scope');
  end if;
  perform private.allow_catalog_unit(v_me, v_unit);
  -- An existing site is also guarded by the unit of the client it belongs to today (a payload must not move it across units).
  select * into v_prev from public.sites s where s.id = p_site_id for update;
  if found then
    if v_prev.client_id is distinct from v_prev_client then
      perform private.fail('PT409', 'El sitio cambió de cliente mientras se guardaba: vuelva a intentarlo.', 'site_changed');
    end if;
    select c.unit_id into v_prev_unit from public.clients c where c.id = v_prev.client_id;
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