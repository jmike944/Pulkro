-- Pulkro Cuadrillas · backend 02 · tables
-- One table per type in src/lib/types.ts (plus the child tables that replace its nested arrays).
-- Every id is a client-generated UUID (offline creation). Columns are snake_case; the sync layer maps camelCase.
-- RLS is enabled on every table here; policies live in 03. The API roles only get SELECT: every write goes
-- through the RPCs (private.* SECURITY DEFINER behind public.* invoker wrappers), which re-check the rules.

------------------------------------------------------------------------------------------------------------------------
-- Organisation and people
------------------------------------------------------------------------------------------------------------------------
create table public.units (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 2 and 120),
  code text not null check (code ~ '^[A-Z0-9]{2,8}$'),
  city text not null default '' check (length(city) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  row_version integer not null default 1,
  constraint units_code_key unique (code)
);

-- Staff accounts (User in types.ts). The row's id IS the auth.users id; role/unit/active here are the single
-- source of truth for authorization (RLS reads them on every statement, so changes apply immediately).
create table public.profiles (
  id uuid primary key references auth.users (id) on delete restrict,
  name text not null check (length(btrim(name)) between 3 and 120),
  initials text not null check (length(initials) between 1 and 4),
  role public.user_role not null,
  title text not null default '' check (length(title) <= 120),
  unit_id uuid not null references public.units (id),
  email text not null check (email = lower(email) and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  phone text not null default '' check (length(phone) <= 40),
  hue smallint not null default 210 check (hue between 0 and 360),
  active boolean not null default true,
  deactivated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  row_version integer not null default 1,
  constraint profiles_email_key unique (email),
  constraint profiles_deactivated_consistent check (active = (deactivated_at is null))
);
create index profiles_unit_id_idx on public.profiles (unit_id);

-- Cleaning staff: no app access (doc §4.2), the supervisor captures for them.
create table public.workers (
  id uuid primary key,
  name text not null check (length(btrim(name)) between 3 and 120),
  initials text not null check (length(initials) between 1 and 4),
  unit_id uuid not null references public.units (id),
  specialty text not null default '' check (length(specialty) <= 80),
  phone text not null default '' check (length(phone) <= 40),
  hue smallint not null default 210 check (hue between 0 and 360),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  row_version integer not null default 1
);
create index workers_unit_id_idx on public.workers (unit_id);

------------------------------------------------------------------------------------------------------------------------
-- Catalogs
------------------------------------------------------------------------------------------------------------------------
create table public.clients (
  id uuid primary key,
  name text not null check (length(btrim(name)) between 2 and 160),
  short_name text not null check (length(btrim(short_name)) between 1 and 60),
  segment public.client_segment not null,
  unit_id uuid not null references public.units (id),
  contact_name text not null default '' check (length(contact_name) <= 120),
  contact_phone text not null default '' check (length(contact_phone) <= 40),
  contact_email text not null default '' check (contact_email = '' or contact_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  since date,
  hue smallint not null default 210 check (hue between 0 and 360),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  row_version integer not null default 1
);
create index clients_unit_id_idx on public.clients (unit_id);

-- Client.siteIds is derived from sites.client_id.
create table public.sites (
  id uuid primary key,
  client_id uuid not null references public.clients (id),
  name text not null check (length(btrim(name)) between 2 and 160),
  address text not null default '' check (length(address) <= 240),
  municipality text not null default '' check (length(municipality) <= 120),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  row_version integer not null default 1,
  constraint sites_id_client_key unique (id, client_id) -- target of orders (site_id, client_id): a site belongs to the order's client
);
create index sites_client_id_idx on public.sites (client_id);

create table public.service_types (
  id uuid primary key,
  name text not null check (length(btrim(name)) between 2 and 120),
  short text not null check (length(btrim(short)) between 1 and 40),
  hue smallint not null default 210 check (hue between 0 and 360),
  default_hours_per_day numeric(4, 1) not null check (default_hours_per_day > 0 and default_hours_per_day <= 24),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  row_version integer not null default 1
);

create table public.materials (
  id uuid primary key,
  name text not null check (length(btrim(name)) between 2 and 120),
  unit text not null check (length(btrim(unit)) between 1 and 12),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  row_version integer not null default 1
);

------------------------------------------------------------------------------------------------------------------------
-- Orders
------------------------------------------------------------------------------------------------------------------------
create table public.orders (
  id uuid primary key,
  folio text not null check (folio ~ '^OS-[0-9]{5,}$'),
  unit_id uuid not null references public.units (id),
  client_id uuid not null references public.clients (id),
  site_id uuid not null,
  service_type_id uuid not null references public.service_types (id),
  supervisor_id uuid not null references public.profiles (id),
  status public.order_status not null default 'borrador',
  previous_status public.order_status,
  title text not null check (length(btrim(title)) between 3 and 200),
  activities text[] not null default '{}' check (cardinality(activities) <= 50),
  -- [{ "material_id": uuid, "qty": number > 0 }] — validated by the RPCs against public.materials
  materials jsonb not null default '[]' check (jsonb_typeof(materials) = 'array'),
  special_instructions text not null default '' check (length(special_instructions) <= 4000),
  site_contact_name text not null default '' check (length(site_contact_name) <= 120),
  site_contact_phone text not null default '' check (length(site_contact_phone) <= 40),
  scheduled_start timestamptz not null,
  scheduled_end timestamptz not null,
  planned_days integer not null default 1 check (planned_days between 0 and 366),
  commercial_ref text not null default '' check (length(commercial_ref) <= 60),
  priority public.order_priority not null default 'normal',
  reopened_at timestamptz,
  archived_at timestamptz,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  row_version integer not null default 1,
  constraint orders_folio_key unique (folio),
  constraint orders_site_belongs_to_client foreign key (site_id, client_id) references public.sites (id, client_id),
  constraint orders_schedule_order check (scheduled_end >= scheduled_start)
);
create index orders_unit_id_status_idx on public.orders (unit_id, status);
create index orders_client_id_idx on public.orders (client_id);
create index orders_site_id_client_id_idx on public.orders (site_id, client_id);
create index orders_service_type_id_idx on public.orders (service_type_id);
create index orders_supervisor_id_idx on public.orders (supervisor_id);
create index orders_created_by_idx on public.orders (created_by);
create index orders_updated_at_idx on public.orders (updated_at);

-- One working day of an order (multi-day orders keep independent jornadas, doc §3).
create table public.jornadas (
  id uuid primary key,
  order_id uuid not null references public.orders (id),
  day_index integer not null check (day_index >= 1),
  date date not null,
  planned_start timestamptz not null,
  planned_end timestamptz not null,
  -- current crew snapshot (validated: active workers of the order's unit); the history is crew_changes
  worker_ids uuid[] not null default '{}' check (cardinality(worker_ids) <= 60),
  status public.jornada_status not null default 'pendiente',
  breakdown jsonb check (breakdown is null or jsonb_typeof(breakdown) = 'array'),
  breakdown_note text check (length(breakdown_note) <= 500),
  deleted_at timestamptz, -- tombstone: pending days replaced by a reschedule
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  row_version integer not null default 1,
  constraint jornadas_planned_order check (planned_end > planned_start)
);
create unique index jornadas_order_day_key on public.jornadas (order_id, day_index) where deleted_at is null;
create index jornadas_order_id_idx on public.jornadas (order_id);
create index jornadas_updated_at_idx on public.jornadas (updated_at);

-- Order.crewHistory (append-only)
create table public.crew_changes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id),
  jornada_id uuid references public.jornadas (id),
  worker_ids uuid[] not null check (cardinality(worker_ids) <= 60),
  reason text not null default '' check (length(reason) <= 500),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index crew_changes_order_id_idx on public.crew_changes (order_id);
create index crew_changes_jornada_id_idx on public.crew_changes (jornada_id);
create index crew_changes_created_by_idx on public.crew_changes (created_by);

-- Jornada.checkIn / checkOut (GeoStamp). One entrada and one salida per jornada, enforced by the unique key.
create table public.jornada_checks (
  id uuid primary key default gen_random_uuid(),
  jornada_id uuid not null references public.jornadas (id),
  order_id uuid not null references public.orders (id),
  kind public.check_kind not null,
  device_at timestamptz not null, -- device clock at capture
  server_at timestamptz not null default now(), -- server clock at sync (never from the client)
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  accuracy double precision not null check (accuracy >= 0 and accuracy <= 100000),
  source public.geo_source not null,
  note text check (length(note) <= 500),
  offline boolean not null default false,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint jornada_checks_one_per_kind unique (jornada_id, kind),
  constraint jornada_checks_note_required check (source = 'gps' or length(btrim(coalesce(note, ''))) >= 8)
);
create index jornada_checks_order_id_idx on public.jornada_checks (order_id);
create index jornada_checks_created_by_idx on public.jornada_checks (created_by);
create index jornada_checks_updated_at_idx on public.jornada_checks (updated_at);

-- Jornada.log (bitácora por jornada, append-only)
create table public.jornada_notes (
  id uuid primary key,
  jornada_id uuid not null references public.jornadas (id),
  order_id uuid not null references public.orders (id),
  text text not null check (length(btrim(text)) between 1 and 2000),
  device_at timestamptz,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index jornada_notes_jornada_id_idx on public.jornada_notes (jornada_id);
create index jornada_notes_order_id_idx on public.jornada_notes (order_id);
create index jornada_notes_created_by_idx on public.jornada_notes (created_by);

------------------------------------------------------------------------------------------------------------------------
-- Incidents, post-sale cases, photos
------------------------------------------------------------------------------------------------------------------------
create table public.incidents (
  id uuid primary key,
  folio text not null check (folio ~ '^INC-[0-9]{4,}$'),
  order_id uuid not null references public.orders (id),
  jornada_id uuid references public.jornadas (id),
  type public.incident_type not null,
  severity public.severity not null,
  description text not null check (length(btrim(description)) between 3 and 4000),
  status public.incident_status not null default 'abierta',
  blocks_closure boolean not null default false,
  resolution text check (length(resolution) <= 4000),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles (id),
  device_at timestamptz,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  row_version integer not null default 1,
  constraint incidents_folio_key unique (folio),
  constraint incidents_resolution_consistent check ((status = 'resuelta') = (resolved_at is not null and resolved_by is not null))
);
create index incidents_order_id_idx on public.incidents (order_id);
create index incidents_jornada_id_idx on public.incidents (jornada_id);
create index incidents_created_by_idx on public.incidents (created_by);
create index incidents_resolved_by_idx on public.incidents (resolved_by);
create index incidents_updated_at_idx on public.incidents (updated_at);

create table public.post_sale_cases (
  id uuid primary key,
  folio text not null check (folio ~ '^PV-[0-9]{4,}$'),
  order_id uuid not null references public.orders (id),
  client_id uuid not null references public.clients (id),
  category public.case_category not null,
  severity public.severity not null,
  channel public.case_channel not null,
  description text not null check (length(btrim(description)) between 3 and 4000),
  owner_id uuid not null references public.profiles (id),
  due_date date not null,
  status public.case_status not null default 'abierto',
  resolution text check (length(resolution) <= 4000),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  row_version integer not null default 1,
  constraint post_sale_cases_folio_key unique (folio)
);
create index post_sale_cases_order_id_idx on public.post_sale_cases (order_id);
create index post_sale_cases_client_id_idx on public.post_sale_cases (client_id);
create index post_sale_cases_owner_id_idx on public.post_sale_cases (owner_id);
create index post_sale_cases_created_by_idx on public.post_sale_cases (created_by);
create index post_sale_cases_updated_at_idx on public.post_sale_cases (updated_at);

-- PostSaleCase.timeline (append-only)
create table public.case_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.post_sale_cases (id),
  order_id uuid not null references public.orders (id),
  text text not null check (length(btrim(text)) between 1 and 2000),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index case_events_case_id_idx on public.case_events (case_id);
create index case_events_order_id_idx on public.case_events (order_id);
create index case_events_created_by_idx on public.case_events (created_by);

-- Photo metadata. The pixels live in Storage (bucket `evidencias`, private) at storage_path.
-- Incident.photoIds / PostSaleCase.photoIds are derived from incident_id / case_id.
create table public.photos (
  id uuid primary key,
  order_id uuid not null references public.orders (id),
  jornada_id uuid references public.jornadas (id),
  incident_id uuid references public.incidents (id),
  case_id uuid references public.post_sale_cases (id),
  kind public.photo_kind not null,
  area text not null default '' check (length(area) <= 120),
  taken_at timestamptz not null,
  taken_at_source public.taken_at_source not null,
  attached_at timestamptz, -- device time it was attached in the app (Photo.uploadedAt)
  origin public.photo_origin,
  lat double precision check (lat between -90 and 90),
  lng double precision check (lng between -180 and 180),
  accuracy double precision check (accuracy >= 0),
  geo_source public.photo_geo_source,
  storage_path text not null,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  bytes integer not null check (bytes > 0),
  width integer check (width > 0),
  height integer check (height > 0),
  selected_for_report boolean not null default false,
  note text check (length(note) <= 1000),
  deleted_at timestamptz, -- tombstone: removed from the evidence; the object stays (retention)
  deleted_by uuid references public.profiles (id),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  row_version integer not null default 1,
  constraint photos_storage_path_key unique (storage_path),
  constraint photos_position_pair check ((lat is null) = (lng is null)),
  constraint photos_deleted_consistent check ((deleted_at is null) = (deleted_by is null))
);
create index photos_order_id_idx on public.photos (order_id);
create index photos_jornada_id_idx on public.photos (jornada_id);
create index photos_incident_id_idx on public.photos (incident_id);
create index photos_case_id_idx on public.photos (case_id);
create index photos_created_by_idx on public.photos (created_by);
create index photos_deleted_by_idx on public.photos (deleted_by);
create index photos_updated_at_idx on public.photos (updated_at);

------------------------------------------------------------------------------------------------------------------------
-- Closure and reports (versioned: edits after closure create a new version, doc §8)
------------------------------------------------------------------------------------------------------------------------
create table public.order_closures (
  id uuid primary key,
  order_id uuid not null references public.orders (id),
  version integer not null check (version >= 1),
  summary text not null check (length(btrim(summary)) between 10 and 8000),
  conformity_method public.conformity_method,
  conformity_name text check (length(conformity_name) <= 120),
  conformity_role text check (length(conformity_role) <= 120),
  conformity_signature text check (
    conformity_signature ~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$' and octet_length(conformity_signature) <= 512000
  ),
  conformity_at timestamptz,
  conformity_comment text check (length(conformity_comment) <= 2000),
  exception_reason text check (length(btrim(exception_reason)) between 15 and 2000),
  exception_authorized_by uuid references public.profiles (id),
  exception_at timestamptz,
  validated_by uuid not null references public.profiles (id),
  validated_at timestamptz not null default now(),
  device_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint order_closures_version_key unique (order_id, version),
  constraint order_closures_exception_consistent check (
    (exception_reason is null) = (exception_authorized_by is null) and (exception_reason is null) = (exception_at is null)
  ),
  constraint order_closures_conformity_name check (conformity_method is null or length(btrim(conformity_name)) >= 3),
  constraint order_closures_signature_required check (conformity_method is distinct from 'firma' or conformity_signature is not null)
);
create index order_closures_validated_by_idx on public.order_closures (validated_by);
create index order_closures_exception_authorized_by_idx on public.order_closures (exception_authorized_by);

create table public.reports (
  id uuid primary key,
  order_id uuid not null references public.orders (id),
  closure_id uuid not null references public.order_closures (id),
  version integer not null check (version >= 1),
  summary text not null default '' check (length(summary) <= 8000),
  photo_ids uuid[] not null default '{}' check (cardinality(photo_ids) <= 200),
  snapshot jsonb not null, -- server-built frozen copy of what this version reports (order, jornadas, incidents, closure)
  generated_by uuid not null references public.profiles (id),
  generated_at timestamptz not null default now(),
  device_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reports_version_key unique (order_id, version)
);
create index reports_closure_id_idx on public.reports (closure_id);
create index reports_generated_by_idx on public.reports (generated_by);

-- Report.shares (ShareAttempt, append-only). Manual sharing never confirms delivery (doc §4.3).
create table public.report_shares (
  id uuid primary key,
  report_id uuid not null references public.reports (id),
  order_id uuid not null references public.orders (id),
  channel public.share_channel not null,
  recipient text not null default '' check (length(recipient) <= 200),
  note text not null default 'Envío iniciado desde el dispositivo · sin confirmación de entrega' check (length(note) <= 300),
  device_at timestamptz,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index report_shares_report_id_idx on public.report_shares (report_id);
create index report_shares_order_id_idx on public.report_shares (order_id);
create index report_shares_created_by_idx on public.report_shares (created_by);

------------------------------------------------------------------------------------------------------------------------
-- Surveys (the token lives in its own table so read-only roles never see it)
------------------------------------------------------------------------------------------------------------------------
create table public.surveys (
  id uuid primary key,
  order_id uuid not null references public.orders (id),
  client_id uuid not null references public.clients (id),
  channel public.share_channel not null,
  manual boolean not null default false,
  sent_by uuid not null references public.profiles (id),
  sent_at timestamptz not null default now(),
  responded_at timestamptz,
  overall smallint check (overall between 1 and 5),
  quality smallint check (quality between 1 and 5),
  punctuality smallint check (punctuality between 1 and 5),
  staff smallint check (staff between 1 and 5),
  nps smallint check (nps between 0 and 10),
  comment text check (length(comment) <= 2000),
  respondent_name text check (length(respondent_name) <= 120),
  recorded_by uuid references public.profiles (id), -- staff member who captured a manual answer
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  row_version integer not null default 1,
  constraint surveys_answers_complete check (
    (responded_at is null and overall is null and quality is null and punctuality is null and staff is null and nps is null)
    or (responded_at is not null and overall is not null and quality is not null and punctuality is not null and staff is not null and nps is not null)
  )
);
create index surveys_order_id_idx on public.surveys (order_id);
create index surveys_client_id_idx on public.surveys (client_id);
create index surveys_sent_by_idx on public.surveys (sent_by);
create index surveys_recorded_by_idx on public.surveys (recorded_by);

create table public.survey_tokens (
  survey_id uuid primary key references public.surveys (id),
  order_id uuid not null references public.orders (id),
  token text not null check (token ~ '^[A-Za-z0-9_-]{22,64}$'), -- ≥128 bits, generated on the device (offline)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint survey_tokens_token_key unique (token)
);
create index survey_tokens_order_id_idx on public.survey_tokens (order_id);

------------------------------------------------------------------------------------------------------------------------
-- Audit log (Bitácora). Written only by the RPCs, server clock. unit_id = unit of the touched record (orders: the
-- order's unit; catalogs/users: the record's unit; company-wide catalogs: the actor's unit) — see canSeeAuditEntry.
------------------------------------------------------------------------------------------------------------------------
create table public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  device_at timestamptz,
  actor_kind public.actor_kind not null default 'usuario',
  actor_id uuid references public.profiles (id),
  actor_name text not null, -- snapshot: the Bitácora never needs to read other people's profiles
  entity public.audit_entity not null,
  entity_id uuid not null,
  order_id uuid references public.orders (id),
  unit_id uuid references public.units (id),
  action text not null check (length(action) <= 300),
  reason text check (length(reason) <= 2000),
  op_id uuid,
  updated_at timestamptz not null default now(),
  constraint audit_log_actor_consistent check ((actor_kind = 'usuario') = (actor_id is not null))
);
create index audit_log_order_id_idx on public.audit_log (order_id);
create index audit_log_actor_id_idx on public.audit_log (actor_id);
create index audit_log_unit_id_idx on public.audit_log (unit_id);
create index audit_log_entity_idx on public.audit_log (entity, entity_id);
create index audit_log_updated_at_idx on public.audit_log (updated_at);

------------------------------------------------------------------------------------------------------------------------
-- Server time stamping + append-only enforcement
------------------------------------------------------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'units', 'profiles', 'workers', 'clients', 'sites', 'service_types', 'materials', 'orders', 'jornadas',
    'incidents', 'post_sale_cases', 'photos', 'surveys'
  ] loop
    execute format('create trigger stamp_insert before insert on public.%I for each row execute function private.stamp_insert()', t);
    execute format('create trigger stamp_update before update on public.%I for each row execute function private.stamp_update()', t);
  end loop;
  foreach t in array array[
    'crew_changes', 'jornada_checks', 'jornada_notes', 'case_events', 'order_closures', 'reports', 'report_shares', 'survey_tokens'
  ] loop
    execute format('create trigger stamp_insert before insert on public.%I for each row execute function private.stamp_insert()', t);
    execute format('create trigger reject_update before update on public.%I for each row execute function private.reject_update()', t);
  end loop;
end;
$$;

create function private.stamp_audit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.at := now();
  new.updated_at := new.at;
  return new;
end;
$$;
revoke all on function private.stamp_audit() from public, anon, authenticated, service_role;
create trigger stamp_insert before insert on public.audit_log for each row execute function private.stamp_audit();
create trigger reject_update before update on public.audit_log for each row execute function private.reject_update();

------------------------------------------------------------------------------------------------------------------------
-- RLS on, explicit grants. authenticated: SELECT only (rows filtered by the policies in 03). anon: nothing.
-- service_role (secret key, server-side only): full access for admin tooling; it bypasses RLS by design.
------------------------------------------------------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'units', 'profiles', 'workers', 'clients', 'sites', 'service_types', 'materials', 'orders', 'jornadas',
    'crew_changes', 'jornada_checks', 'jornada_notes', 'incidents', 'post_sale_cases', 'case_events', 'photos',
    'order_closures', 'reports', 'report_shares', 'surveys', 'survey_tokens', 'audit_log'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated, service_role', t);
    execute format('grant select on table public.%I to authenticated', t);
    execute format('grant select, insert, update, delete on table public.%I to service_role', t);
  end loop;
end;
$$;
