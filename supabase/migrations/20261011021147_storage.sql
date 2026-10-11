-- Pulkro Cuadrillas · backend 04 · Storage
-- Private bucket `evidencias` for photo evidence. Path scheme (the RPCs and the policies both depend on it):
--   orders/<order_id>/<kind>/<photo_id>.<jpg|jpeg|png|webp>        kind = antes | despues | incidencia | postventa
-- Evidence is immutable: clients may INSERT (upload) and SELECT (download/list) only. There is no UPDATE policy,
-- so upsert/overwrite is impossible (Storage upsert needs INSERT + SELECT + UPDATE) and no DELETE policy. A retried
-- upload of the same path answers 409 "Duplicate", which the sync engine treats as success. Retention/cleanup
-- runs server-side with the secret key.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('evidencias', 'evidencias', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- order id of a well-formed evidence path, else null (malformed names never match a policy).
create function private.evidence_order_id(p_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when p_name ~ '^orders/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(antes|despues|incidencia|postventa)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$'
    then split_part(p_name, '/', 2)::uuid
  end;
$$;

create function private.evidence_kind(p_name text)
returns public.photo_kind
language sql
immutable
set search_path = ''
as $$
  select case when private.evidence_order_id(p_name) is not null then split_part(p_name, '/', 3)::public.photo_kind end;
$$;

-- Upload rule (SECURITY INVOKER: reads public.orders through the caller's RLS, so the order must be in scope):
-- field evidence (antes/después/incidencia) → field.capture (supervisor of the order) on an order that is not closed;
-- postventa evidence → postventa.manage (Administración of the unit, supervisor of the order).
create function private.can_upload_evidence(p_name text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((
    select case
      when private.evidence_kind(p_name) = 'postventa'
        then private.can(private.my_role(), 'postventa.manage')
      else private.can(private.my_role(), 'field.capture')
        and o.status not in ('finalizada', 'reporte_enviado', 'seguimiento', 'archivada', 'cancelada')
    end
    from public.orders o
    where o.id = private.evidence_order_id(p_name)
  ), false);
$$;

revoke all on function private.evidence_order_id(text) from public, anon, authenticated, service_role;
revoke all on function private.evidence_kind(text) from public, anon, authenticated, service_role;
revoke all on function private.can_upload_evidence(text) from public, anon, authenticated, service_role;
grant execute on function private.evidence_order_id(text) to authenticated;
grant execute on function private.evidence_kind(text) to authenticated;
grant execute on function private.can_upload_evidence(text) to authenticated;

create policy evidencias_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'evidencias'
  and private.can_upload_evidence(name)
);

-- Download / list: anyone who can see the order (Dirección and Administración consult evidence in the order detail).
create policy evidencias_select on storage.objects for select to authenticated
using (
  bucket_id = 'evidencias'
  and private.evidence_order_id(name) in (select o.id from public.orders o)
);
