-- Pulkro Cuadrillas · backend 10 · review round (2026-10-11): business rules
-- F01 no closure without an executed jornada · F02 day numbering after out-of-order execution · F04 sync conflicts
-- told apart from scope loss · F05 clients with orders keep their unit · F06 supervisors with open work keep unit/role ·
-- F08 every device time bounded · F09 incidents frozen after closure · F10 256-bit survey tokens · F11 status derived
-- from the jornadas when leaving Reprogramada. Signatures are unchanged (the public wrappers stay valid).
-- See docs/backend/architecture.md §5, §6 and §8.

------------------------------------------------------------------------------------------------------------------------
-- Shared helpers
------------------------------------------------------------------------------------------------------------------------
-- Optional device times (notes, incidents, closures, reports, shares, photos): same bounds as check-in/out when given.
create function private.check_device_time_opt(p_at timestamptz, p_what text)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_at is null then
    return null;
  end if;
  return private.check_device_time(p_at, p_what);
end;
$$;

-- Execution status supported by the live jornadas (store.ts uses the same rule): no days → borrador; a day in progress →
-- en_ejecucion; pending days → jornada_cerrada if some day was already closed, else programada (crew assigned) or
-- borrador; every day closed → pendiente_validacion. Never an execution state without execution.
create function private.derived_status(p_order_id uuid)
returns public.order_status
language sql
stable
set search_path = ''
as $$
  select (case
    when count(*) = 0 then 'borrador'
    when bool_or(j.status = 'en_curso') then 'en_ejecucion'
    when bool_or(j.status = 'pendiente') then
      case when bool_or(j.status = 'cerrada') then 'jornada_cerrada'
           when bool_or(cardinality(j.worker_ids) > 0) then 'programada'
           else 'borrador' end
    else 'pendiente_validacion'
  end)::public.order_status
  from public.jornadas j
  where j.order_id = p_order_id and j.deleted_at is null;
$$;

-- F04 · References inside an order (jornada, incident, case). Missing on the server → PT409 parent_missing (retryable:
-- the row may still be in the device's queue); another order's row → PT422 *_order_mismatch; a rescheduled
-- (tombstoned) jornada → PT409 jornada_rescheduled.
create function private.check_order_ref(p_kind text, p_id uuid, p_order_id uuid)
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  v_order uuid;
  v_deleted timestamptz;
begin
  if p_id is null then
    return;
  end if;
  if p_kind = 'jornada' then
    select j.order_id, j.deleted_at into v_order, v_deleted from public.jornadas j where j.id = p_id;
  elsif p_kind = 'incident' then
    select i.order_id into v_order from public.incidents i where i.id = p_id;
  elsif p_kind = 'case' then
    select c.order_id into v_order from public.post_sale_cases c where c.id = p_id;
  else
    raise exception 'check_order_ref: unknown kind %', p_kind;
  end if;
  if v_order is null then
    perform private.fail('PT409',
      case p_kind when 'jornada' then 'La jornada' when 'incident' then 'La incidencia' else 'El caso' end
        || ' todavía no está en el servidor; se reintentará cuando llegue.',
      'parent_missing');
  end if;
  if v_order <> p_order_id then
    perform private.fail('PT422',
      case p_kind when 'jornada' then 'La jornada no pertenece a la orden.'
                  when 'incident' then 'La incidencia no pertenece a la orden.'
                  else 'El caso no pertenece a la orden.' end,
      case p_kind when 'jornada' then 'jornada_order_mismatch'
                  when 'incident' then 'incident_order_mismatch'
                  else 'case_order_mismatch' end);
  end if;
  if v_deleted is not null then
    perform private.fail('PT409', 'La jornada se reprogramó en otro dispositivo: este registro no se aplicó.', 'jornada_rescheduled');
  end if;
end;
$$;

revoke all on function private.check_device_time_opt(timestamptz, text) from public, anon, authenticated, service_role;
revoke all on function private.derived_status(uuid) from public, anon, authenticated, service_role;
revoke all on function private.check_order_ref(text, uuid, uuid) from public, anon, authenticated, service_role;

------------------------------------------------------------------------------------------------------------------------
-- F04 · Scope checks that tell a sync conflict apart from "not yours"
------------------------------------------------------------------------------------------------------------------------
-- Loads, locks and scope-checks an order. Missing and out-of-scope orders answer the same (no existence leak), except
-- for a supervisor who had the order before a reassignment: their offline captures get PT409 order_reassigned.
create or replace function private.lock_order(p_me public.profiles, p_order_id uuid)
returns public.orders
language plpgsql
set search_path = ''
as $$
declare
  v public.orders;
begin
  select * into v from public.orders o where o.id = p_order_id for update;
  if found and private.sees_order(p_me, v) then
    return v;
  end if;
  if found and p_me.role = 'supervisor' and exists (
    select 1 from private.order_assignments a where a.order_id = p_order_id and a.supervisor_id = p_me.id
  ) then
    perform private.fail('PT409',
      format('La orden %s se reasignó a otro supervisor: este registro no se aplicó. Entregue lo capturado a quien tiene la orden.', v.folio),
      'order_reassigned');
  end if;
  perform private.fail('PT404', 'No encontrado o fuera de su alcance.', 'out_of_scope');
  return null;
end;
$$;

-- Loads a jornada for field capture: missing → parent_missing; order out of scope → out_of_scope / order_reassigned;
-- rescheduled (tombstoned) → jornada_rescheduled. The order row is locked.
create or replace function private.lock_jornada(p_me public.profiles, p_jornada_id uuid)
returns public.jornadas
language plpgsql
set search_path = ''
as $$
declare
  v_order_id uuid;
  v public.jornadas;
begin
  if p_jornada_id is null then
    perform private.fail('PT422', 'Falta la jornada.', 'jornada_required');
  end if;
  select j.order_id into v_order_id from public.jornadas j where j.id = p_jornada_id;
  if v_order_id is null then
    perform private.fail('PT409', 'La jornada todavía no está en el servidor; se reintentará cuando llegue.', 'parent_missing');
  end if;
  perform private.lock_order(p_me, v_order_id);
  select * into v from public.jornadas j where j.id = p_jornada_id;
  if v.deleted_at is not null then
    perform private.fail('PT409',
      format('La jornada %s se reprogramó en otro dispositivo: este registro no se aplicó. Captúrelo en la jornada vigente.', v.day_index),
      'jornada_rescheduled');
  end if;
  return v;
end;
$$;

-- Loads a photo for an edit: missing → parent_missing; out of scope → out_of_scope / order_reassigned; deleted →
-- photo_deleted; field photos of closed orders are frozen.
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
  if v.deleted_at is not null then
    perform private.fail('PT409', 'La foto ya se eliminó (en otro dispositivo o por otra persona).', 'photo_deleted');
  end if;
  if v.kind <> 'postventa' then
    perform private.assert_open(v_o);
  end if;
  return v;
end;
$$;

------------------------------------------------------------------------------------------------------------------------
-- Orders and scheduling
------------------------------------------------------------------------------------------------------------------------
-- F11 · Flag Reprogramada (with a reason) or confirm dates. Confirming leaves Reprogramada for the status the jornadas
-- support (derived_status), or Con incidencia while a blocking incident is open; the requested target is not trusted.
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
  if p_status = 'reprogramada' then
    if length(btrim(coalesce(p_reason, ''))) < 5 then
      perform private.fail('PT422', 'Indique el motivo de la reprogramación.', 'reason_required');
    end if;
    v_next := 'reprogramada';
  else
    v_next := private.derived_status(p_order_id);
    if exists (select 1 from public.incidents i where i.order_id = p_order_id and i.status = 'abierta' and i.blocks_closure) then
      update public.orders set previous_status = v_next where id = p_order_id;
      v_next := 'con_incidencia';
    end if;
  end if;
  perform private.change_status(v_me, p_order_id, v_next, p_reason);
  return private.finish_op(p_op_id, jsonb_build_object('order_id', p_order_id, 'status', v_next));
end;
$$;

-- F01 + F02 · Reprogramar / agregar jornadas: pending jornadas are replaced (tombstoned), executed ones are kept with
-- their numbers; new days continue after the highest executed day (a day worked out of order never collides). An empty
-- list is refused when no executed day would remain. Execution states are recomputed from the jornadas.
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
  end if;
  return private.finish_op(p_op_id, jsonb_build_object('order_id', p_order_id,
    'status', (select o.status from public.orders o where o.id = p_order_id)));
end;
$$;

------------------------------------------------------------------------------------------------------------------------
-- Field execution
------------------------------------------------------------------------------------------------------------------------
-- Shared by check_in / check_out (F04: the jornada is resolved by lock_jornada).
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
  v_remaining integer;
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

-- F08 · device time bounded when given.
create or replace function private.add_jornada_note(p_op_id uuid, p_note_id uuid, p_jornada_id uuid, p_text text, p_device_at timestamptz default null)
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
  values (p_note_id, p_jornada_id, v_j.order_id, private.req_text(p_text, 1, 2000, 'Escriba la nota (hasta 2000 caracteres).'),
          private.check_device_time_opt(p_device_at, 'nota'), v_me.id);
  perform private.audit(v_me, 'jornada', p_jornada_id, 'Agregó nota a la bitácora', v_j.order_id, v_o.unit_id);
  return private.finish_op(p_op_id, jsonb_build_object('note_id', p_note_id));
end;
$$;

------------------------------------------------------------------------------------------------------------------------
-- Photos
------------------------------------------------------------------------------------------------------------------------
-- F04 references (parent_missing / *_order_mismatch / jornada_rescheduled) · F08 attached_at bounded.
create or replace function private.add_photo(
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
  perform private.check_order_ref('jornada', p_jornada_id, p_order_id);
  perform private.check_order_ref('incident', p_incident_id, p_order_id);
  perform private.check_order_ref('case', p_case_id, p_order_id);
  if v_taken > now() + interval '5 minutes' then
    perform private.fail('PT422', 'La fecha de la foto está en el futuro. Revise el reloj del dispositivo.', 'device_time_future');
  end if;

  insert into public.photos (
    id, order_id, jornada_id, incident_id, case_id, kind, area, taken_at, taken_at_source, attached_at, origin,
    lat, lng, accuracy, geo_source, storage_path, mime_type, bytes, width, height, selected_for_report, note, created_by
  ) values (
    p_photo_id, p_order_id, p_jornada_id, p_incident_id, p_case_id, p_kind, left(v_area, 120), v_taken,
    coalesce(p_taken_at_source, 'device'), private.check_device_time_opt(p_attached_at, 'foto'), p_origin, p_lat, p_lng,
    p_accuracy, p_geo_source, p_storage_path, v_mime, greatest(coalesce(v_size, 1), 1)::integer, p_width, p_height,
    coalesce(p_selected_for_report, true), left(nullif(btrim(p_note), ''), 1000), v_me.id
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

-- p_patch keys: area, note, case_id, incident_id (F04 references)
create or replace function private.update_photo(p_op_id uuid, p_photo_id uuid, p_patch jsonb)
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
  perform private.check_order_ref('case', v_case, v_p.order_id);
  perform private.check_order_ref('incident', v_incident, v_p.order_id);
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

-- Report selection (field.capture), same lookup contract as lock_photo_for_edit.
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
-- Incidents
------------------------------------------------------------------------------------------------------------------------
-- F04 jornada reference · F08 device time bounded.
create or replace function private.add_incident(
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
  perform private.check_order_ref('jornada', p_jornada_id, p_order_id);
  v_desc := private.req_text(p_description, 3, 4000, 'Describa la incidencia.');
  v_folio := 'INC-' || lpad(nextval('private.incident_folio_seq')::text, 4, '0');
  insert into public.incidents (id, folio, order_id, jornada_id, type, severity, description, blocks_closure, device_at, created_by)
  values (p_incident_id, v_folio, p_order_id, p_jornada_id, p_type, p_severity, v_desc, coalesce(p_blocks_closure, false),
          private.check_device_time_opt(p_device_at, 'incidencia'), v_me.id);
  perform private.audit(v_me, 'incidencia', p_incident_id, 'Registró incidencia ' || v_folio, p_order_id, v_o.unit_id);
  if coalesce(p_blocks_closure, false) and v_o.status <> 'con_incidencia' then
    update public.orders set previous_status = v_o.status where id = p_order_id;
    perform private.change_status(v_me, p_order_id, 'con_incidencia', v_desc);
  end if;
  return private.finish_op(p_op_id, jsonb_build_object('incident_id', p_incident_id, 'folio', v_folio,
    'order_status', (select o.status from public.orders o where o.id = p_order_id)));
end;
$$;

-- F09 · an incident of a closed order is part of what the report froze: edits need a reopen (assert_open).
-- p_patch keys: type, severity, description, blocks_closure, jornada_id (status/resolution go through resolve_incident)
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
  perform private.assert_open(v_o);
  if p_patch is null or jsonb_typeof(p_patch) <> 'object'
     or exists (select 1 from jsonb_object_keys(p_patch) k where k not in ('type', 'severity', 'description', 'blocks_closure', 'jornada_id')) then
    perform private.fail('PT422', 'Ese dato de la incidencia no se edita aquí.', 'field_not_editable');
  end if;
  v_jornada := (p_patch ->> 'jornada_id')::uuid;
  perform private.check_order_ref('jornada', v_jornada, v_i.order_id);
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

-- F01 · resolving the last blocking incident recomputes the execution status from the jornadas (derived_status): an
-- order without executed days goes back to borrador/programada, never to pendiente_validacion.
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
-- Closure and reports
------------------------------------------------------------------------------------------------------------------------
-- F01 · a closure needs at least one live jornada with entrada AND salida (hard blocker, no exception can waive it).
-- F08 · device_at and the client's conformity time bounded.
create or replace function private.validate_closure(
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
  v_worked integer;
  v_blocking text[];
  v_missing integer;
  v_exception text := nullif(btrim(coalesce(p_exception_reason, '')), '');
  v_version integer;
  v_hard text[] := '{}';
  v_device_at timestamptz;
  v_conformity_at timestamptz;
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
  v_device_at := private.check_device_time_opt(p_device_at, 'cierre');
  v_conformity_at := private.check_device_time_opt(p_conformity_at, 'conformidad');

  select count(*) into v_open_jornadas from public.jornadas j
  where j.order_id = p_order_id and j.deleted_at is null and j.status <> 'cerrada';
  select count(*) into v_worked from public.jornadas j
  where j.order_id = p_order_id and j.deleted_at is null
    and exists (select 1 from public.jornada_checks c where c.jornada_id = j.id and c.kind = 'entrada')
    and exists (select 1 from public.jornada_checks c where c.jornada_id = j.id and c.kind = 'salida');
  select array_agg(i.folio order by i.folio) into v_blocking from public.incidents i
  where i.order_id = p_order_id and i.status = 'abierta' and i.blocks_closure;
  if v_open_jornadas > 0 then
    v_hard := v_hard || format('%s %s sin registro de salida', v_open_jornadas, case when v_open_jornadas = 1 then 'jornada' else 'jornadas' end);
  elsif v_worked = 0 then
    v_hard := v_hard || 'ninguna jornada ejecutada (con entrada y salida)'::text;
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
    case when p_conformity_method is not null then coalesce(v_conformity_at, v_device_at, now()) end,
    case when p_conformity_method is not null then nullif(btrim(coalesce(p_conformity_comment, '')), '') end,
    v_exception, case when v_exception is not null then v_me.id end, case when v_exception is not null then now() end,
    v_me.id, v_device_at
  );
  perform private.audit(v_me, 'orden', p_order_id,
    case when v_o.status = 'reabierta' then 'Validó de nuevo el cierre (orden reabierta)' else 'Validó cierre definitivo' end,
    p_order_id, v_o.unit_id, case when v_exception is not null then 'Excepción: ' || v_exception end);
  perform private.change_status(v_me, p_order_id, 'finalizada');
  return private.finish_op(p_op_id, jsonb_build_object('closure_id', p_closure_id, 'version', v_version, 'status', 'finalizada'));
end;
$$;

-- F08 · device time bounded (report body unchanged).
create or replace function private.generate_report(
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
  v_device_at timestamptz;
begin
  v_me := private.actor();
  v_dup := private.begin_op(p_op_id, v_me.id, 'generate_report', p_device_at);
  if v_dup is not null then return v_dup; end if;
  perform private.require(v_me, 'report.share');
  v_o := private.lock_order(v_me, p_order_id);
  v_device_at := private.check_device_time_opt(p_device_at, 'reporte');
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
  values (p_report_id, p_order_id, v_closure.id, v_version, left(coalesce(p_summary, ''), 8000), v_photos, v_snapshot, v_me.id, v_device_at);
  perform private.audit(v_me, 'reporte', p_report_id, format('Generó reporte PDF v%s', v_version), p_order_id, v_o.unit_id);
  return private.finish_op(p_op_id, jsonb_build_object('report_id', p_report_id, 'version', v_version, 'photo_ids', to_jsonb(v_photos)));
end;
$$;

-- F08 · device time bounded.
create or replace function private.log_share(
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
  values (p_share_id, p_report_id, v_order_id, p_channel, left(btrim(coalesce(p_recipient, '')), 200),
          private.check_device_time_opt(p_device_at, 'envío'), v_me.id);
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
-- F10 · Survey tokens: 256-bit (43+ base64url characters, as generated by the device) and not trivially guessable.
------------------------------------------------------------------------------------------------------------------------
alter table public.survey_tokens drop constraint survey_tokens_token_check;
alter table public.survey_tokens add constraint survey_tokens_token_check check (token ~ '^[A-Za-z0-9_-]{43,64}$');

create or replace function private.check_token(p_token text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43,64}$'
     or (select count(distinct c) from regexp_split_to_table(p_token, '') c) < 16 then
    perform private.fail('PT422', 'El enlace de la encuesta necesita un token aleatorio de 256 bits (43+ caracteres base64url).', 'weak_token');
  end if;
  return p_token;
end;
$$;

-- PUBLIC (anon only, /encuesta/[token]): what the client needs to recognise the service. No ids, no contacts.
create or replace function private.get_survey(p_token text)
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
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43,64}$' then
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

-- PUBLIC (anon only): the client answers once. Staff sessions cannot call it (EXECUTE is granted to anon only).
create or replace function private.submit_survey(
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
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43,64}$' then
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
-- F05 · A client with orders keeps its unit (its orders, sites and history belong to that unit's Administración).
-- A client without orders may move; its sites are touched so the new unit's devices pull them (incremental cursor).
------------------------------------------------------------------------------------------------------------------------
create or replace function private.upsert_client(
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
  v_moved boolean;
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
  v_moved := v_prev_unit is not null and v_prev_unit <> p_unit_id;
  if v_moved and exists (select 1 from public.orders o where o.client_id = p_client_id) then
    perform private.fail('PT409', 'El cliente ya tiene órdenes: no puede cambiar de unidad (sus órdenes e historial pertenecen a la unidad actual).', 'client_in_use');
  end if;
  v_short := private.req_text(p_short_name, 1, 60, 'Escriba el nombre corto del cliente.');
  insert into public.clients (id, name, short_name, segment, unit_id, contact_name, contact_phone, contact_email, since, hue)
  values (p_client_id, private.req_text(p_name, 2, 160, 'Escriba el nombre del cliente.'), v_short, p_segment, p_unit_id,
          left(btrim(coalesce(p_contact_name, '')), 120), left(btrim(coalesce(p_contact_phone, '')), 40),
          lower(btrim(coalesce(p_contact_email, ''))), p_since, coalesce(p_hue, 210))
  on conflict (id) do update set
    name = excluded.name, short_name = excluded.short_name, segment = excluded.segment, unit_id = excluded.unit_id,
    contact_name = excluded.contact_name, contact_phone = excluded.contact_phone, contact_email = excluded.contact_email,
    since = excluded.since, hue = excluded.hue;
  if v_moved then
    update public.sites s set row_version = s.row_version where s.client_id = p_client_id; -- stamp_update: new updated_at
  end if;
  perform private.audit(v_me, 'catalogo', p_client_id, 'Guardó cliente ' || v_short, null, p_unit_id);
  return private.finish_op(p_op_id, jsonb_build_object('client_id', p_client_id));
end;
$$;

------------------------------------------------------------------------------------------------------------------------
-- F06 · Unit or role changes are refused while the person supervises open orders or owns open post-sale cases
-- (reassign first). Deactivation is always possible (security) and reports the open orders left to reassign.
-- p_patch keys: name, title, role, unit_id, phone, hue, active. Nobody changes their own role, unit or status.
------------------------------------------------------------------------------------------------------------------------
create or replace function private.update_profile(p_op_id uuid, p_user_id uuid, p_patch jsonb)
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
  v_open text[];
  v_cases text;
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

  select array_agg(o.folio order by o.folio) into v_open from public.orders o
  where o.supervisor_id = p_user_id
    and o.status not in ('finalizada', 'reporte_enviado', 'seguimiento', 'archivada', 'cancelada');
  if (p_patch ? 'unit_id' and (p_patch ->> 'unit_id')::uuid is distinct from v_prev.unit_id)
     or (p_patch ? 'role' and (p_patch ->> 'role') is distinct from v_prev.role::text) then
    if v_open is not null then
      perform private.fail('PT409',
        format('Tiene órdenes abiertas como supervisor (%s): reasígnelas antes de cambiar su unidad o rol.', array_to_string(v_open, ', ')),
        'has_open_orders');
    end if;
    select string_agg(c.folio, ', ' order by c.folio) into v_cases from public.post_sale_cases c
    where c.owner_id = p_user_id and c.status in ('abierto', 'en_proceso');
    if v_cases is not null then
      perform private.fail('PT409',
        format('Es responsable de casos postventa abiertos (%s): reasígnelos antes de cambiar su unidad o rol.', v_cases),
        'has_open_cases');
    end if;
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
  perform private.audit(v_me, 'usuario', p_user_id, v_action, null, v_next.unit_id,
    case when v_prev.active and not v_next.active and v_open is not null
         then 'Órdenes abiertas por reasignar: ' || array_to_string(v_open, ', ') end);
  return private.finish_op(p_op_id, jsonb_build_object('user_id', p_user_id, 'active', v_next.active,
    'open_orders', case when v_prev.active and not v_next.active then to_jsonb(coalesce(v_open, '{}')) else '[]'::jsonb end));
exception
  when invalid_text_representation or numeric_value_out_of_range then
    perform private.fail('PT422', 'Algún valor tiene un formato inválido.', 'invalid_value');
end;
$$;
