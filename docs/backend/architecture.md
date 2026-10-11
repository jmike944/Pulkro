# Pulkro Cuadrillas — backend architecture (Supabase)

Status (2026-10-11, after the review round): schema, RLS, business-rule RPCs, Storage and the auth hook are **applied** to
the Supabase project "Pulkro" (ref `cbdzndpdpwtxbhshidyi`, us-east-1, Postgres 17.11). All public and private tables are
empty. The app still runs on the on-device zustand store; wiring it to this backend is the phased plan in §12.

| Applied migration (version = file name) | Content |
|---|---|
| `20261011020831_foundation` | `private` schema, default privileges, enums, error/stamp helpers, folio sequences, `private.sync_ops`, `private.expose_rpc` |
| `20261011020950_core_tables` | 22 tables, constraints, every FK + filter index, server-time triggers, append-only triggers, RLS on, grants |
| `20261011021110_access_rls` | `private.my_role()/my_unit()/can()`, all SELECT policies, custom access token hook |
| `20261011021147_storage` | private bucket `evidencias`, upload/download policies |
| `20261011022555_rpc_operations` | order, scheduling, field, photo, incident, closure and report RPCs |
| `20261011023047_rpc_postventa_admin` | cases, surveys (staff + public), catalogs, units, users, `sync_reconcile` |
| `20261011023131_harden_rls_auto_enable` | revokes EXECUTE on the platform's `public.rls_auto_enable()` (advisor 0028/0029) |
| `20261011042704_review_history_and_defaults` | review F13: global default privilege (no `EXECUTE` to `PUBLIC` on new functions) · F12: append-only tables also reject DELETE/TRUNCATE (vetted purge path), `service_role` read + append only on them |
| `20261011042743_review_sync_and_visibility` | review F07: op id bound to a digest of its arguments (`sync_ops.args_hash`, regenerated wrappers) · F03: `orders.scope_changed_at` · F04: `private.order_assignments` (previous supervisors) · F14: `private.visible_order_ids()` and index-friendly order/child policies |
| `20261011043034_review_business_rules` | review F01, F02, F04–F06, F08–F11: closure needs an executed jornada, day numbering, conflict reasons (`order_reassigned`, `jornada_rescheduled`, `parent_missing`, `photo_deleted`), client/supervisor moves with open work, bounded device times, incidents frozen after closure, 256-bit survey tokens, status derived from the jornadas |
| `20261011050659_review_pr9_codex` | PR #9 review: a closed jornada keeps its crew (`jornada_closed`), the blocking flag of an open incident moves the order in/out of `con_incidencia` on edits, photos/incidents/cases re-read under the order lock, resolved/closed cases need their resolution (`resolution_required` + table check), validated rows locked `FOR SHARE` until commit (client, supervisor, case owner, crew), workers readable wherever they are on a visible crew (`private.crew_worker_ids()`) |
| `20261011052012_review_pr9_cubic` | PR #9 review (cubic): op ids fail closed when only one side carries the request digest, service hours 0.5–24 (RPC + table check), breakdown lines need numeric hours, survey tokens without repeated 6-character sequences, incident resolution fields all-or-nothing, a conformity method needs the client's name |
| `20261011053107_review_pr9_cubic_wrappers` | PR #9 review (cubic): request digests use SHA-256, wrappers map invalid input values to `PT422 invalid_value`, check-out derives the order status from every live jornada (`derived_status`) |
| `20261011054527_review_pr9_followups` | adversarial pass on the PR #9 fixes: `assign_crew` follows the reference contract (`parent_missing` / `jornada_order_mismatch` / `jornada_rescheduled`), an open incident carries no resolution text, reopening a case re-checks its owner, a supervisor of another unit cannot reopen an order (`supervisor_other_unit`), `crew_worker_ids` materializes the visible orders |

Sources of truth mirrored here: `docs/requisitos.md`, `src/lib/types.ts`, `src/lib/permissions.ts`, `src/lib/hooks.ts`,
`src/lib/store.ts`, `src/lib/domain.ts`. Tests: `supabase/tests/` (all 14 files pass, including the review regression suites
`09` to `13`; they ignore the rows of the demo dataset). Types: `src/lib/supabase/database.types.ts` (regenerated after migration `20261011043034`).

---

## 1. Shape of the system

```
PWA (Next.js 16, zustand + IndexedDB, works offline)
 ├─ reads:  PostgREST SELECT on public tables  → RLS decides the rows (scope = canSeeOrder & co.)
 ├─ writes: PostgREST RPC public.<action>(p_op_id, …)  → invoker wrapper → private.<action> (SECURITY DEFINER)
 │          re-checks role, scope and every business rule against server state, writes rows + audit, idempotent
 ├─ files:  Storage bucket `evidencias` (private): upload → then RPC add_photo links the metadata
 └─ auth:   Supabase Auth, e-mail + password; JWT carries role/unit hints from the hook (UI only)
Edge Function `admin-users` (designed, not deployed): invites/bans accounts with the secret key; profiles via RPC
Public survey page (/encuesta/[token]): anon → public.get_survey / public.submit_survey only
```

Principles: **the database is the authority** (the client's guards stay for UX only); **authorization reads
`public.profiles`, never JWT claims, never `user_metadata`**; **clients only SELECT tables**, every write is an RPC;
**all ids are client-generated UUIDs** so offline creations keep their identity; **server clock** on every row.

## 2. Auth, roles, accounts

**Login**: e-mail + password (`supabase.auth.signInWithPassword`). Self sign-up must be **disabled** in Auth settings
(admin invites keep working).

**Role and unit reach RLS through `public.profiles`** (`id` = `auth.users.id`, `role`, `unit_id`, `active`). Policies
call `(select private.my_role())` / `(select private.my_unit())` / `(select private.visible_order_ids())`: SECURITY
DEFINER, `search_path = ''`, in the non-exposed `private` schema, wrapped in `select` so Postgres evaluates them once per
statement (initPlan). An inactive or missing profile makes them return `null`, so every policy denies and every RPC
answers `PT401`.

**Custom access token hook** `private.custom_access_token_hook` (SECURITY INVOKER as the docs recommend, executed by
`supabase_auth_admin`, which gets `usage` on `private`/`public`, `execute` on the hook and a `using (true)` SELECT policy on
`profiles`):
- adds `app_metadata.pulkro_role` and `app_metadata.pulkro_unit_id` — **UI hints only** (route guards in `proxy.ts`,
  menus); never trusted by the database;
- **refuses** to issue/refresh a token (403) when the profile is missing or inactive.
- To enable: Dashboard → Authentication → Hooks → Custom access token → Postgres function
  `private.custom_access_token_hook` (config.toml: `uri = "pg-functions://postgres/private/custom_access_token_hook"`).
  **Not enabled yet** (needs the dashboard; the MCP has no auth-config tool). Everything is secure without it; it only
  adds the UI claims and the refresh refusal.

**Stale claims**: claims can lag up to the JWT lifetime. Because RLS reads `profiles` on every statement, a role/unit
change or deactivation is effective **immediately** for data. The client calls `supabase.auth.refreshSession()` after any
`PT401`/`PT403` or when it pulls a changed own profile, so menus catch up (and runs a full re-sync, §8).

**Account lifecycle (Dirección = `users.admin`)** — Edge Function `admin-users` (design, not deployed):

```ts
// supabase/functions/admin-users/index.ts — verify_jwt = true (user JWT); secret key only inside the function
import { withSupabase } from 'npm:@supabase/server@1'
export default { fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
  const body = await req.json()                       // { action, opId, email?, userId?, name?, role?, unitId? }
  const { data: me } = await ctx.supabase.from('profiles').select('role, active').eq('id', ctx.userClaims!.id).single()
  if (me?.role !== 'direccion' || !me.active) return Response.json({ code: 'forbidden' }, { status: 403 })
  if (body.action === 'invite') {
    const { data, error } = await ctx.supabaseAdmin.auth.admin.inviteUserByEmail(body.email, { redirectTo: `${Deno.env.get('APP_URL')}/acceso/definir-contrasena` })
    if (error) return Response.json({ code: 'invite_failed', message: error.message }, { status: 400 })
    // the profile is written with the CALLER's JWT: the DB re-checks users.admin and audits who did it
    const { error: rpcError } = await ctx.supabase.rpc('provision_profile', { p_op_id: body.opId, p_user_id: data.user.id,
      p_name: body.name, p_role: body.role, p_unit_id: body.unitId, p_title: body.title ?? '', p_phone: body.phone ?? '' })
    if (rpcError) { await ctx.supabaseAdmin.auth.admin.deleteUser(data.user.id); return Response.json(rpcError, { status: 400 }) }
    return Response.json({ userId: data.user.id })
  }
  if (body.action === 'deactivate' || body.action === 'reactivate') {
    const active = body.action === 'reactivate'
    const { data, error } = await ctx.supabase.rpc('update_profile', { p_op_id: body.opId, p_user_id: body.userId, p_patch: { active } })
    if (error) return Response.json(error, { status: 400 })
    await ctx.supabaseAdmin.auth.admin.updateUserById(body.userId, { ban_duration: active ? 'none' : '876000h' })
    return Response.json({ ok: true, openOrders: data?.open_orders ?? [] })   // folios left to reassign
  }
  // 'change_email': auth.admin.updateUserById(id, { email }) + profile e-mail sync (RPC still to add, see §14)
  return Response.json({ code: 'unknown_action' }, { status: 400 })
}) }
```

**Deactivation is layered**: `update_profile(active=false)` (in the same transaction) sets `deactivated_at`, **deletes the
user's `auth.sessions`** (refresh tokens die with them) and returns `open_orders` (folios of the open orders the person
still supervises, also in the audit reason) so Dirección can reassign them; from the next statement RLS shows nothing and
RPCs return `PT401`; the hook refuses new tokens; the Edge Function also bans the user. Nobody can change their own role,
unit or status. **Unit or role changes are refused (`PT409 has_open_orders` / `has_open_cases`, listing the folios) while
the person supervises open orders or owns open post-sale cases**: reassign first. Auth users with a profile cannot be
deleted (`on delete restrict`): accounts are deactivated, history keeps names.

**Bootstrap of the first Dirección account** (once, by the owner, SQL editor as `postgres`): invite the e-mail from
Dashboard → Authentication → Users → Invite, then
`insert into public.units (id, name, code, city) values (gen_random_uuid(), 'Matriz Monterrey', 'MTY', 'Monterrey, N.L.');`
and `insert into public.profiles (id, name, initials, role, unit_id, email) select u.id, '<Nombre>', '<IN>', 'direccion', (select id from public.units where code = 'MTY'), lower(u.email) from auth.users u where u.email = '<correo>';`.
After that every account goes through the app/Edge Function.

## 3. Data model (`src/lib/types.ts` → tables)

Conventions: `uuid` PKs generated on the device (recommend UUIDv7 in the client for index locality; Postgres 17 has no
native `uuidv7()`), snake_case, `text` + CHECK lengths, `timestamptz`, enums identical to the TS unions, `created_at` /
`updated_at` stamped by triggers with the **server clock** (client values are overwritten), `row_version` on mutable
rows, `deleted_at` tombstones where rows can disappear. Every FK has an index (asserted by test 00).

| Type | Table | Notes |
|---|---|---|
| `Unit` | `units` | `code` unique (`^[A-Z0-9]{2,8}$`) |
| `User` | `profiles` | PK/FK `auth.users(id)` restrict; `role`, `unit_id`, `active` + `deactivated_at`; `email` unique, lower-case |
| `Worker` | `workers` | unit-scoped crew; never deleted (`active`) |
| `Client` | `clients` | `siteIds` derived from `sites.client_id`; a client with orders cannot change unit (`client_in_use`) |
| `Site` | `sites` | `unique (id, client_id)` is the target of `orders (site_id, client_id)` → a site always belongs to the order's client |
| `ServiceType`, `Material` | `service_types`, `materials` | company-wide |
| `Order` | `orders` | `folio` server-generated `OS-00001` (sequence); `materials` jsonb `[{material_id, qty}]` validated against `materials`; `activities text[]`; `site_contact_*`; `previous_status`, `reopened_at`, `archived_at`; **`scope_changed_at`** (server time of the last change of who sees the order: creation, supervisor or unit change — §8) |
| `Order.crewHistory` | `crew_changes` | append-only snapshots (`worker_ids uuid[]`) |
| `Order.closure` | `order_closures` | **versioned** (`unique(order_id, version)`), append-only; conformity (+ signature PNG data URL ≤ 512 kB), exception (reason ≥ 15, authorized_by, at) |
| `Jornada` | `jornadas` | `worker_ids uuid[]` (current crew), `breakdown jsonb`, `deleted_at` tombstone for rescheduled pending days; partial unique `(order_id, day_index) where deleted_at is null`; new days continue after the highest executed `day_index` |
| `Jornada.checkIn/checkOut` (`GeoStamp`) | `jornada_checks` | `kind entrada/salida`, **`unique(jornada_id, kind)`**, `device_at` (device) + `server_at` (server), source, note (required for manual/remota), offline flag; append-only |
| `Jornada.log` | `jornada_notes` | append-only |
| `Photo` | `photos` | metadata only; `storage_path` unique → Storage object; `bytes`/`mime_type` read from the stored object; soft delete (`deleted_at`, `deleted_by`) |
| `Incident` | `incidents` | folio `INC-0001`; `photoIds` = photos with `incident_id`; frozen once the order is closed (reopen to edit) |
| `Report` | `reports` | versioned, append-only, `closure_id` of the validated closure it reports, `photo_ids`, server-built `snapshot jsonb` (frozen content of that version) |
| `Report.shares` | `report_shares` | append-only; note always "sin confirmación de entrega" |
| `PostSaleCase` | `post_sale_cases` | folio `PV-0001`; `timeline` = `case_events` (append-only) |
| `Survey` | `surveys` + `survey_tokens` | token in its own table so read-only roles never see it; **256-bit** (`^[A-Za-z0-9_-]{43,64}$`, ≥ 16 distinct characters); answers all-or-nothing (CHECK) |
| `AuditEntry` | `audit_log` | written only by RPCs; `at` server time, `device_at`, `op_id`, `actor_kind` (usuario/cliente/sistema), `actor_name` snapshot, `unit_id` of the touched record |

`private` (no API role has any grant; RLS on, no policies — advisor INFO 0008 by design): `sync_ops` (op journal for
idempotency: actor, action, result and **`args_hash`**, the digest of the request), `order_assignments` (previous
supervisors of each order, written by the `orders` trigger `track_scope`) and the folio sequences.

**Append-only** (`crew_changes`, `jornada_checks`, `jornada_notes`, `case_events`, `order_closures`, `reports`,
`report_shares`, `survey_tokens`, `audit_log`): UPDATE, DELETE and TRUNCATE are rejected by triggers even for the table
owner (`PT409 append_only`); `service_role` only has SELECT + INSERT on them. A vetted server-side retention job may purge
inside its own transaction with `set local pulkro.history_purge = 'on'` (§14).

**Client-only (never synced)**: session/unit filter (`session`), the sync queue itself, UI state (`ui-store`), photo
blobs until uploaded (IndexedDB `pulkro-photos`), procedural demo scenes and the demo seed (`DEMO_ENABLED`),
provisional folios ("pendiente") of offline-created orders/incidents/cases until the RPC returns the real one, derived
KPIs (`metrics.ts`).

## 4. RLS matrix

API grants: `anon` — nothing on tables (only `get_survey`/`submit_survey`); `authenticated` — **SELECT only** on the 22
tables; `service_role` — full on mutable tables, SELECT + INSERT on the append-only ones (server-side tooling only).
INSERT/UPDATE/DELETE policies do not exist: writes are refused with `42501` for every role (test 02) and happen only inside
the RPCs. One permissive SELECT policy per table, `to authenticated`. `R` = `(select private.my_role())`, `U` =
`(select private.my_unit())`, `me` = `(select auth.uid())`, `V` = `(select private.visible_order_ids())::uuid[]`.

| Table | Dirección | Administración | Supervisor |
|---|---|---|---|
| `orders` | `id = any(V)` — V = every order | V = orders of `U` | V = orders with `supervisor_id = me` |
| `jornadas`, `crew_changes`, `jornada_checks`, `jornada_notes`, `incidents`, `photos`, `order_closures`, `reports`, `report_shares`, `post_sale_cases`, `case_events`, `surveys` | `order_id = any(V)` — canSeeOrder is defined once, in `visible_order_ids()` | same | same |
| `survey_tokens` | none (consults only) | `R in (administracion, supervisor) and order_id = any(V)` | same |
| `units` | all | `id = U` | `id = U` |
| `profiles` | all | `unit_id = U or role = 'direccion'` | self, creators of visible orders, owners/creators of visible cases |
| `workers` | all | `unit_id = U` or on a visible crew | `unit_id = U` or on a visible crew |
| `clients` | all | `unit_id = U` | `id in (select client_id from orders)` |
| `sites` | all | `client_id in (select id from clients)` | `id in (select site_id from orders)` |
| `service_types`, `materials` | `R is not null` | same | same |
| `audit_log` | entries of visible orders + all without order | entries of visible orders + `order_id is null and unit_id = U` | entries of visible orders + own actions without order |
| `storage.objects` (`evidencias`) | SELECT if the path's order is visible | same | same |

**Why `visible_order_ids()`** (review F14): an OR of three role branches cannot use an index, so every orders read and
every child-table read was a sequential scan. The SECURITY DEFINER function resolves the caller's order ids once per
statement with the role's own index; the policies compare against that array, which the planner serves from
`orders_pkey` / `<child>_order_id_idx` (measured with 20 000 orders / 80 000 photos: a supervisor's photo read went from
23–36 ms to 1.4–3.6 ms; Dirección's incremental photo pull from 132 ms to 21 ms). Dirección's array holds every order id:
fine at Pulkro's scale (tens of thousands); revisit beyond ~100 000 orders (§14).

**Workers on a visible crew** (PR #9 review): a worker moved to another unit or deactivated can still be booked on
open jornadas of the old unit (the app allows it after a confirmation) and is named in closed jornadas and crew history.
`private.crew_worker_ids()` (SECURITY DEFINER, once per statement) collects the worker ids of the caller's visible
`jornadas` and `crew_changes`, so the old unit keeps reading those people; planning pickers still filter by unit and
`active` in the app, and `assign_crew` only accepts active workers of the order's unit.

Dirección's "unit filter" stays a UI filter (Dirección sees all units). Deactivated accounts and accounts without a
profile see nothing. Scope follows the data: reassigning an order moves every child row with it (test 01).

## 5. Write API (RPCs)

Every mutation is `public.<name>(p_op_id uuid, …) returns jsonb`, a SECURITY INVOKER PL/pgSQL wrapper generated by
`private.expose_rpc` around `private.<name>` (SECURITY DEFINER, `search_path = ''`). The wrapper first stores
`<op id>:<SHA-256 of every other argument>` in the transaction-local setting `pulkro.op_args` (timestamptz arguments as
epoch seconds, jsonb in canonical form), then calls the implementation. It also turns the raw errors of a bad input value
(NULL into a NOT NULL column, a CHECK, a malformed number/date/enum, an overflow) into `PT422 invalid_value` with the
original message as `detail`; business errors (`PTnnn`), duplicate ids (`23505`) and missing references (`23503`) pass
through unchanged. The definer function: resolves the caller from
`profiles` (`PT401` if none/inactive) → `begin_op` (idempotency, request digest) → `private.require` (permission matrix =
`permissions.ts`) → loads and **locks** the order (`FOR UPDATE`) → validates → writes → audits → `finish_op`. The two anon
RPCs take the token instead of an op id.

| RPC | Permission (scope) | Main server-side rules |
|---|---|---|
| `create_order` | order.create (Administración, own unit) | client in unit, site ∈ client, active supervisor of that unit, materials/activities/days validated; folio; starts `borrador` |
| `update_order` | general fields: order.edit · operational: + order.editOperational (own) | whitelisted keys; closed/cancelled refused; supervisor reassignment within unit, audited "Reasignó la orden de A a B", recorded in `private.order_assignments`, `scope_changed_at` stamped |
| `set_order_status` | order.reschedule | flag `reprogramada` (reason ≥ 5) or confirm dates: leaving `reprogramada` goes to the status the jornadas support (`derived_status`), or `con_incidencia` while a blocking incident is open — the requested target is not trusted |
| `cancel_order` | order.edit | open orders only, reason ≥ 5 |
| `reopen_order` | order.reopen (supervisor, own, still in the order's unit — `supervisor_other_unit`) | finalizada/reporte_enviado/seguimiento → `reabierta`, keeps `previous_status`, stamps `reopened_at` |
| `archive_order` | order.archive | reporte_enviado/seguimiento and no open cases |
| `assign_crew` | crew.assign | active workers of the order's unit (rows locked `FOR SHARE`); a named jornada follows the reference contract (`parent_missing` / `jornada_order_mismatch` / `jornada_rescheduled`) and must be pending or in progress — a closed day's crew is the record of who worked (`jornada_closed`); history row; borrador → programada |
| `schedule_jornadas` | order.reschedule / crew.assign | executed days kept with their numbers, pending ones tombstoned, new days numbered after the highest executed day; an empty list is refused while nothing was executed (`days_required`); execution states recomputed (`derived_status`) |
| `check_in` / `check_out` | field.capture | see §6 |
| `add_jornada_note`, `log_reminder`, `set_jornada_breakdown` | field.capture | breakdown: every line a named activity with numeric hours ≥ 0, ≤ 24 h in total; notes allowed until cancelled/archived |
| `add_photo`, `update_photo`, `delete_photo`, `set_photo_selected` | field.capture (postventa photos: postventa.manage) | object must already exist in Storage at `orders/<order>/<kind>/<photo>.<ext>`; references checked (`parent_missing` / `*_order_mismatch` / `jornada_rescheduled`); field photos frozen on closed orders; soft delete (`photo_deleted` afterwards) |
| `add_incident`, `update_incident`, `resolve_incident` | field.capture | blocking incident → `con_incidencia` (+ previous status); edits only on open orders; flagging an open incident as blocking enters `con_incidencia`, un-flagging or resolving the last blocking one recomputes the status (`derived_status`; previous `finalizada`/`reabierta`/`reprogramada` resume); the incident is re-read under the order lock, so a second resolution answers `already_resolved` |
| `validate_closure` | closure.authorize | see §6; new closure version |
| `generate_report`, `log_share` | report.share | see §6 |
| `create_case`, `update_case`, `add_case_note` | postventa.manage | owner = active Administración of the unit or the order's supervisor; new cases start `abierto`/`en_proceso`; `resuelto`/`cerrado` need a resolution ≥ 10 characters (`resolution_required`; table check `post_sale_cases_resolution_required` as backstop); reopening a resolved/closed case re-checks its owner (`invalid_case_owner` — reassign in the same patch); case on reporte_enviado/archivada → seguimiento |
| `create_survey`, `record_manual_survey` | postventa.manage | token 256-bit (`^[A-Za-z0-9_-]{43,64}$`, ≥ 16 distinct characters, no repeated 6-character sequence — a broken generator's cycles are refused; a random token fails it with p ≈ 10⁻⁸ and the app regenerates), device-generated |
| `get_survey`, `submit_survey` | **anon only** | see §9 |
| `upsert_unit` | users.admin (Dirección) | code normalised, unique |
| `upsert_client`, `upsert_site`, `upsert_worker` | catalogs.admin (Administración own unit; Dirección all) | previous and new unit both checked; a client with orders cannot change unit (`client_in_use`), a client without orders that moves touches its sites; a site with orders cannot change client |
| `upsert_service_type`, `upsert_material` | catalogs.admin | company-wide (as coded in `store.ts`) |
| `provision_profile`, `update_profile` | users.admin | auth user must exist; no self role/unit/status change; no unit/role change with open orders or open cases; deactivation revokes sessions and returns `open_orders` |
| `update_my_contact` | any active account | own phone only |
| `sync_reconcile` (read) | any active account (SECURITY INVOKER, plain RLS) | returns the subset of ids still visible |

**Error contract** (PostgREST maps `PTnnn` to HTTP status; `hint` is a stable machine reason):
`PT401` (`no_session`, `no_profile`, `inactive`) · `PT403` (`forbidden:<action>`, `other_unit`) · `PT404`
(`out_of_scope`, `survey_not_found`, `auth_user_missing`) · `PT409` (`order_closed`, `order_cancelled`, `order_frozen`,
`duplicate_check`, `check_in_missing`, `not_closable`, `closure_blocked`, `evidence_missing`, `revalidation_required`,
`closure_required`, `open_cases`, `not_reopenable`, `not_archivable`, `not_rescheduled`, `already_resolved`,
`already_provisioned`, `self_change`, `site_in_use`, `client_in_use`, `has_open_orders`, `has_open_cases`,
`op_id_reused`, `object_missing`, `parent_missing`, `order_reassigned`, `jornada_rescheduled`, `photo_deleted`,
`append_only`, `jornada_closed`, `supervisor_other_unit`) · `PT422` (`invalid_*`, `device_time_*`, `location_*`, `reason_required`, `weak_token`,
`op_id_required`, `days_required`, `jornada_required`, `resolution_required`, `*_order_mismatch`, …) · `23505` duplicate id · `42501` no privilege. Messages are
user-facing Spanish (the same texts as `DENIED_REASON`/store toasts).

**Not found vs. not yours**: a missing or out-of-scope **order** answers `PT404 out_of_scope` (no existence leak), except
for a supervisor who had the order before a reassignment (`PT409 order_reassigned`). A **referenced or targeted row of
field capture** (jornada, incident, case, photo) that does not exist on the server answers `PT409 parent_missing` — it may
still be in the device's queue; this reveals only whether a random UUID exists.

## 6. Business rules enforced on the server (never trusted from the client)

- **Check-in/out** (doc §8): one `entrada` and one `salida` per jornada (unique key; a second one with another op id →
  `duplicate_check`); `salida` needs an `entrada` and `device_at` not earlier than it; device time required, ≤ 5 min ahead
  of the server and ≤ 45 days old; manual/remote location needs a note ≥ 8 chars; `server_at` = server clock; a rescheduled
  (tombstoned) jornada answers `jornada_rescheduled`; closed/cancelled orders refused; jornada and order status derived
  exactly like `store.checkIn/checkOut` (`en_ejecucion`, `jornada_cerrada`, `pendiente_validacion`, unless `con_incidencia`).
- **Every device time is bounded** (review F08): notes, incidents, closures (`device_at` and the client's
  `conformity_at`), reports, shares and photos (`attached_at`) get the same bounds as check-in/out when given; a photo's
  `taken_at` may be old (gallery) but not in the future.
- **Status derivation** (`private.derived_status`, mirrored by `derivedExecutionStatus` in `domain.ts`): no live jornadas →
  `borrador`; a day in progress → `en_ejecucion`; pending days → `jornada_cerrada` if a day was already closed, else
  `programada` (crew assigned) or `borrador`; every day closed → `pendiente_validacion`. Used when confirming dates, after
  a reschedule and when the last blocking incident is resolved: **no execution state without execution**.
- **Closure**: only from `pendiente_validacion`, `reabierta`, `con_incidencia`; hard blockers = jornadas without salida,
  **no live jornada with both entrada and salida** (a service never executed cannot be closed, no exception waives it) and
  open blocking incidents (listed in the error); every executed jornada needs ≥ 1 live ANTES and ≥ 1 live DESPUÉS photo,
  otherwise an exception ≥ 15 chars is required and recorded with `authorized_by` = the supervisor and server time (and
  ignored if evidence is complete); conformity name ≥ 3, `firma` requires the signature; summary ≥ 10.
- **Edits after closure create versions**: finalizada/reporte_enviado/seguimiento/archivada orders refuse field, incident
  and order edits (`order_closed`); the supervisor reopens (`reabierta`), edits, re-validates → closure **v n+1** → report
  **v n+1**; resolving an incident and bitácora notes stay possible until the order is archived (follow-up); closures,
  reports, shares, checks, notes, crew history, case events and the audit log are append-only (UPDATE/DELETE/TRUNCATE
  rejected, even for the table owner).
- **Reports only after (re-)validation**: `generate_report` requires a validated closure, and after a reopening a closure
  validated at/after `reopened_at`; photo ids are filtered to live photos of the order; the server stores a frozen
  `snapshot` of order, site, client, supervisor, closure (without signature), jornadas + checks + crews, incidents and the
  selected photos.
- **Sharing** never claims delivery; the first share moves `finalizada → reporte_enviado`.
- **Organisation integrity**: a client with orders keeps its unit; a supervisor/owner with open orders/cases keeps unit
  and role (reassign first); open orders therefore always have an active-or-deactivated supervisor of their own unit.
- **Concurrency** (PR #9 review): every RPC locks the order first, then re-reads the row it edits (photo, incident, case)
  `FOR UPDATE`, so an edit or delete committed by another device while the call waited is seen. A row that a validation
  relies on but another RPC can move is locked `FOR SHARE` until commit — the client and supervisor in `create_order`, the
  new supervisor in `update_order`, the case owner, the crew in `assign_crew` — and the moving side (`upsert_client`,
  `update_profile`, `upsert_worker`) takes `FOR UPDATE` before its own checks: either the move waits and then sees the new
  order/case/crew, or the creation waits and validates against the moved row.
- **Survey** by token without login, once (§9).
- **Audit** is written by the RPCs (`private.audit`): server `at`, `device_at` when the action has one, `op_id`,
  actor snapshot, `unit_id` of the touched record (order unit; catalog/user record unit; company-wide catalogs → actor unit)
  — exactly what `canSeeAuditEntry` needs.

## 7. Storage

- Bucket `evidencias`: private, 10 MiB per file, `image/jpeg|png|webp` (the device already compresses to ≤ 1600 px JPEG).
- Path: `orders/<order_id>/<kind>/<photo_id>.<jpg|jpeg|png|webp>` with `kind ∈ antes|despues|incidencia|postventa`.
- Policies on `storage.objects`: **INSERT** when `private.can_upload_evidence(name)` (field kinds: supervisor of the order
  and order not closed; `postventa`: Administración of the unit or the order's supervisor) · **SELECT** (download/list)
  when the path's order is visible. **No UPDATE and no DELETE policy**: evidence is immutable for clients, so upsert is
  impossible (it would need INSERT + SELECT + UPDATE) and a retried upload answers *409 Duplicate*, which the sync engine
  treats as success. Direct SQL deletes are also blocked by the platform trigger `storage.protect_delete`.
- Offline flow: capture → compressed blob in IndexedDB → queue `upload(path)` then `add_photo(...)`; `add_photo` refuses
  (`PT409 object_missing`, transient) until the object exists, so metadata never points at a missing file; `bytes` and
  `mime_type` come from the stored object, not from the client. An upload that fails permanently (400/413/415: too large,
  wrong type) moves the item to quarantine instead of retrying `add_photo` forever (§8).
- Display: `createSignedUrl(path, 600)` (10 minutes: a link created before a deactivation or reassignment stays valid until
  it expires) or `download()` with the user JWT; cache thumbnails in IndexedDB.
- Retention: `delete_photo` tombstones the row and keeps the object; purging (and lifecycle rules, including objects whose
  `add_photo` never succeeded) is a server-side job with the secret key once the retention policy is decided (§14).

## 8. Sync protocol

**Push — per-action RPCs, not table upserts.** The store already models each mutation as an action with guards
(`checkIn`, `validateClosure`, …); the server must re-evaluate those guards against *current server state* (status
machine, blockers, scope, versioning), which row upserts cannot express safely and would require write grants on tables.
One RPC per queue item keeps generated TypeScript types for every argument (a batched `sync_push` is a later optimisation,
§14).

- **Idempotency**: each queue item has a UUID `op_id` (= `p_op_id`) and **stores its exact arguments**; a retry resends the
  same payload. `private.begin_op` inserts the op into `private.sync_ops` (`on conflict do nothing`) with the request
  digest: a retry returns the stored result with `duplicate: true` and changes nothing; the same op id with **other
  arguments**, another action or another user → `PT409 op_id_reused` (never a false "applied"; the digests must match
  NULL included, so a stored op without digest and a call without the wrapper's binding never vouch for each other); concurrent retries
  serialize on the PK; a failed op rolls back its row, so it can be retried after fixing input. New rows also carry
  client-generated ids (a different op reusing an entity id → `23505`).
- **Ordering & dependencies**: FIFO per device; an item may depend on earlier items for the same order (e.g.
  `create_order` → `schedule_jornadas`, upload → `add_photo`, `add_incident` → photo linked to it). When an item fails
  permanently, later items of the same order are held ("bloqueado por…") until resolved.
- **Outcome classes** for the queue:
  - *retry with backoff*: network errors, 5xx, `408/429`, `PT409 object_missing` (upload still running) and
    `PT409 parent_missing` (a parent still in the queue) — capped (e.g. 20 attempts / 24 h), then quarantine;
  - *re-authenticate, keep the queue*: `PT401`;
  - *conflict → quarantine* (keep the payload and blobs on the device, show "no se aplicó" with the server message, offer
    redo/hand-off/discard): `order_reassigned`, `jornada_rescheduled`, `photo_deleted`, `order_closed`, `order_cancelled`,
    `order_frozen`, `duplicate_check`, `op_id_reused`, a permanently failed upload;
  - *permanent error* (bug or invalid input): other `PT403/PT404/PT409/PT422`; re-pull the order, let the user decide.
  Field evidence is never dropped silently: a quarantined capture can be exported (photos + times) and handed to the
  current supervisor.
- **Conflicts**: field-level patches (`update_order`, `update_photo`, `update_incident`, `update_case` send only the
  touched keys) so Administración (general data) and the supervisor (operational data) never overwrite each other; the
  same field edited twice → last server arrival wins, both edits stay in the audit log. State conflicts (check-in on an
  order cancelled meanwhile, closure after an incident was opened on another device) are rejected by the rules — the
  server state wins.
- **Device time**: `p_device_at` (check-in/out, notes, incidents, closure, reports, shares) and `p_taken_at`/`p_attached_at`
  (photos) are stored next to the server time, bounded (§6) and never used for authorization. A phone clock more than
  5 minutes fast is refused (`device_time_future`): the app compares its clock with the server's `Date` header and warns
  before capturing (policy in §14).

**Pull — RLS-scoped table reads with incremental cursors, plus fetch-by-reference for scope gain.**

- Per table: `select * from <table> where updated_at >= :cursor - interval '60 seconds' order by updated_at, id limit
  1000` (keyset pagination on `(updated_at, id)`), cursor = max `updated_at` received. The 60 s overlap covers
  transactions that started before the previous pull and committed after it (`updated_at` = transaction start; RPC
  transactions are short and `authenticated` has an 8 s statement timeout). Merge by id: replace when
  `row_version` ≥ local (append-only rows are insert-or-ignore). `updated_at` indexes exist on the large tables.
- **Scope gain** (review F03) — rows that already existed but only now became visible never appear in a cursor, so:
  1. an order that is **new to the device**, or whose **`scope_changed_at` is newer** than the device's copy (created,
     reassigned, or a round trip away and back), is fetched with its **whole subtree** by `order_id`
     (`jornadas`, `jornada_checks`, `jornada_notes`, `crew_changes`, `incidents`, `photos`, `order_closures`, `reports`,
     `report_shares`, `post_sale_cases`, `case_events`, `surveys`, `survey_tokens` — PostgREST
     `?order_id=in.(…)` per table, or one embedded select);
  2. after merging a page, **referenced ids the device lacks** (`client_id`, `site_id`, `supervisor_id`, `created_by`,
     `owner_id`, `worker_ids`, `service_type_id`, material ids) are fetched by id (RLS returns what the user may see);
  3. a **client that moves unit** touches its sites, so the new unit's cursor sees them (server side, `upsert_client`);
  4. a change of the user's **own profile** (role, unit, reactivation) → refresh the session and run a **full re-sync**
     (initial load + reconcile).
- **Tombstones**: `jornadas.deleted_at` (rescheduled days), `photos.deleted_at`, `profiles.active=false`,
  `workers.active=false` are regular updated rows → they arrive through the same pull.
- **Scope loss** (order reassigned, unit change, deactivation, role change): `rpc('sync_reconcile', {p_table, p_ids})`
  returns which of the device's ids are still visible (≤ 2000 per call); the device drops the rest and their children.
  Run it after login, on unit/role change and periodically (e.g. daily) per table. Queued items for dropped orders go to
  quarantine (above), not to the trash.
- **Initial load**: catalogs (small) + orders in scope that are open or updated in the last N months (Dirección: N
  chosen in §14) + their children by `order_id in (…)`; `audit_log` only for a recent window (it is not reconciled).
- Server-assigned values (folios, `server_at`, versions, snapshots, `scope_changed_at`) reach the device through the RPC
  result and the next pull; offline creations show "pendiente" until then.
- Realtime is not needed for the MVP (pull on reconnect / interval / focus).

## 9. Public survey

`/encuesta/[token]` uses the publishable key **without a session** (role `anon`):
`get_survey(p_token)` returns only client name/hue, service name, order title, service date, supervisor first name and
— once answered — the answers; `submit_survey(p_token, …)` validates 1–5 / 0–10, records once (row lock;
a second call returns `{ok:false, status:'already_responded'}`), audits as `cliente`. Both are granted to `anon` **only**:
a browser with a staff session gets `42501`, so a staff account cannot answer *from its session* (the page keeps asking to
sign out, as today). Staff hold the links, so a staff member could still answer from a private window: answers are
audited as `cliente` and the link is only shared through the client's channel — accepted risk, see §14. Malformed/unknown
tokens → `PT404`. Tokens are 256-bit (32 random bytes, base64url, generated with `crypto.getRandomValues` in
`store.ts`); short or low-entropy tokens are refused (`weak_token`). Rate limiting/expiry: §14.

## 10. API keys and environment

- App (browser + Next.js server): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (`sb_publishable_…`).
  The publishable key maps to `anon` / `authenticated`; all protection is RLS + grants.
- **Secret key** (`sb_secret_…`): only inside the Edge Function (auto-provisioned `SUPABASE_SECRET_KEYS`, read by
  `@supabase/server`); never in Next.js, never `NEXT_PUBLIC_*`, never in the repo (`.env*` is git-ignored). The app needs
  no secret at all.
- Legacy `anon`/`service_role` keys are deprecated by end of 2026: create the new keys and disable the legacy ones once
  nothing uses them. Recommended: migrate to asymmetric JWT signing keys so `getClaims()` verifies locally.

## 11. Next.js integration (Next 16, App Router, `@supabase/ssr`) — design, not built yet

**Status:** only `src/lib/supabase/database.types.ts` exists today. Everything else in this section is the planned shape
of the integration (phase 1 of §12); the app still runs on its local demo store and its demo `/login`.

- `src/lib/supabase/client.ts` (to create): `createBrowserClient<Database>(url, publishableKey)` — used by the store/sync
  engine.
- `src/lib/supabase/server.ts` (to create): `createServerClient<Database>` with `cookies: { getAll, setAll }` (`setAll` in
  try/catch in Server Components).
- `src/proxy.ts` (to create; Next 16 renamed Middleware to Proxy): refresh the session (return the response `setAll`
  built, copy its cookies/cache headers if redirecting), redirect to `/login` without a session except `/encuesta/*`,
  `/offline`, static assets; optional optimistic route gating with `app_metadata.pulkro_role` + `canSeeRoute` — the
  database still decides. Use `supabase.auth.getClaims()` there and in server code, never `getSession()`.
- Login (`/login`, to rewire from the demo role picker): `signInWithPassword`; invite landing
  (`/acceso/definir-contrasena`, to create): verify the invite link, then `updateUser({ password })`. Sign-out clears
  IndexedDB only after the queue is empty (or warns).
- Do not use the deprecated `@supabase/server` framework adapters; `@supabase/server` (`withSupabase`) is for the Edge
  Function only.
- `src/lib/supabase/database.types.ts` (exists) is generated; regenerate after every migration.

## 12. Phased plan to wire the app

1. **Project settings** (dashboard): disable sign-ups; Site URL + redirect URLs; enable the hook; custom SMTP + Spanish
   invite/recovery templates; JWT expiry (keep ≤ 1 h) and session limits; new API keys; asymmetric signing keys.
   Bootstrap the first Dirección (§2). Create a **dev/staging project or branch** for everything that follows.
2. **Auth in the app**: Supabase clients, `proxy.ts`, login/invite pages, `session` from Auth instead of the demo
   switcher (keep the demo behind `NEXT_PUBLIC_DEMO`).
3. **Read path**: sync engine pull (cursor + scope gain + reconcile, §8) into the existing store (replace `ensureSeeded`
   for real accounts); catalogs and orders read-only first.
4. **Write path**: queue items `{op_id, rpc, args, order_id, deps, attempts, state}` from each store action (keep the
   local optimistic update), push via RPC with the outcome classes of §8 (retry / quarantine / error); photos (upload →
   `add_photo`); folios from results. The store guards already mirror the server rules changed in the review
   (`closureBlockers` "ninguna jornada ejecutada", `derivedExecutionStatus`, day numbering, frozen incidents, 256-bit
   survey tokens).
5. **Admin**: deploy `admin-users`, users screen calls it (shows `open_orders` after a deactivation); catalogs via RPCs;
   import real catalogs.
6. **Pilot hardening**: run `supabase/tests` in CI against a branch, `pg_cron` purge of `private.sync_ops` (> 90 days),
   storage retention job, PITR/backups, monitoring of advisors and logs.

## 13. Operations

- Migrations: `supabase/migrations/<applied version>_<name>.sql`, applied with the MCP `apply_migration` (name = file
  name without version) and verified byte-for-byte (`md5` of `supabase_migrations.schema_migrations.statements[1]` = file
  `md5`; all 10 match). **Never edit an applied file**; fix forward with a new one. Dry run first: one `execute_sql` call
  `begin; <migration>; <tests>; rollback;` (verified to be transactional). Changing an RPC signature: drop the old
  `public.<name>` wrapper, recreate `private.<name>`, call `private.expose_rpc` (which also regenerates the op-args
  digest).
- **Function privileges**: Postgres grants `EXECUTE` on new functions to `PUBLIC`, and per-schema default privileges
  cannot revoke that. Since `20261011042704` a **global** default (`alter default privileges for role postgres revoke
  execute on functions from public`) does: every function created by `postgres` in any schema is executable by its owner
  only, and each migration grants `EXECUTE` explicitly (`expose_rpc`; RLS helpers `my_role`, `my_unit`, `can`,
  `visible_order_ids`, `evidence_*`, `can_upload_evidence` to `authenticated`). The same applies to `pg_temp` helpers in
  SQL sessions (the test prelude grants its own). Tables/sequences in `public` are not auto-granted to the API roles
  either (the platform enforces this from 2026-10-30 anyway).
- Advisors (2026-10-11, after `20261011043034`): security — no WARN/ERROR; two INFO 0008 (`private.sync_ops`,
  `private.order_assignments`: RLS on, no policies, no grants — by design); performance — only "unused index" INFO on the
  empty database.
- The platform event trigger `ensure_rls` (`public.rls_auto_enable()`) enables RLS on new `public` tables; its function is
  no longer executable through the API (migration `20261011023131`).
- Test runs advance the folio sequences and the `audit_log` identity (sequences are not transactional); on an empty
  database reset them with `setval(…, 1, false)` (README of `supabase/tests`).

## 14. Decisiones pendientes (para el dueño)

1. **Entorno**: hoy todo vive en el proyecto que se usa como producción. Antes del piloto: proyecto de desarrollo/staging
   o *branching*, y correr ahí las pruebas y las migraciones primero.
2. **Folios**: empiezan en `OS-00001`, `INC-0001`, `PV-0001`, globales (sin prefijo por unidad). Las secuencias pueden
   dejar huecos. ¿Número inicial o prefijo por unidad?
3. **Responsable de casos postventa**: el servidor solo acepta Administración de la unidad o el supervisor de la orden
   (el prototipo ofrecía cualquier supervisor de la unidad, que luego no vería el caso). ¿Se confirma?
4. **Catálogos de toda la empresa** (tipos de servicio, materiales): hoy los editan Dirección y Administración (como en el
   prototipo). ¿Solo Dirección? **Unidades**: solo Dirección (`users.admin`).
5. **Conformidad del cliente al cerrar**: el servidor la acepta opcional (el diálogo la exige). ¿Obligatoria?
   ¿La firma se queda como imagen dentro del cierre (≤ 512 kB) o como archivo en Storage?
6. **Retención**: fotos eliminadas (hoy se conservan), evidencia de órdenes archivadas, bitácora, `sync_ops`, archivos
   subidos cuyo `add_photo` nunca llegó; límite por foto (10 MB) y plan de almacenamiento. La purga de historial usa
   `pulkro.history_purge` en un trabajo del servidor: definir plazos.
7. **PDF del reporte**: hoy se genera en el dispositivo a partir de los datos + `snapshot`. ¿Guardar también el PDF de cada
   versión en Storage?
8. **Visibilidad de perfiles para supervisores**: hoy ven su perfil, quienes crearon sus órdenes y responsables de sus
   casos (nombres de la bitácora vienen guardados en cada registro). ¿Suficiente?
9. **Carga inicial de Dirección**: cuántos meses de historial bajan al dispositivo.
10. **Reloj del dispositivo**: hoy se rechaza lo que llega > 5 min adelantado o > 45 días de atraso (también en notas,
    incidencias, cierres, reportes y envíos). Alternativa: aceptar y marcar (ordenando por hora del servidor). ¿Cuál?
11. **Correo**: SMTP propio y plantillas en español para invitación y recuperación de contraseña (en el plan gratuito
    las plantillas no se pueden personalizar con el SMTP por defecto). Cambio de correo de un usuario: falta definir el
    flujo (Edge Function + RPC para sincronizar `profiles.email`).
12. **Sesiones**: duración del token, tiempo de inactividad y sesión única por usuario (algunas opciones requieren plan Pro).
13. **Encuesta pública**: vigencia del enlace y límite de intentos (los tokens ya son de 256 bits). El personal tiene los
    enlaces y podría contestar desde una ventana privada: ¿basta con la bitácora o se requiere algo más (p. ej. enviar el
    enlace solo por un canal del cliente)?
14. **Compartir una versión anterior** del reporte mientras la orden está reabierta: hoy se permite (igual que el prototipo).
15. **Indicadores/exportaciones**: hoy se calculan en el dispositivo con los datos visibles; si se requieren totales de
    toda la empresa sin bajar el detalle, agregar vistas/RPC de solo lectura para Dirección y Administración.
16. **Privacidad y residencia de datos**: proyecto en us-east-1; aviso de privacidad para fotos, GPS y firmas; respaldos
    (PITR) y política de recuperación.
17. **Capturas de un supervisor reasignado** (revisión F04): hoy el servidor responde `order_reassigned` y la app las pone
    en cuarentena para entregarlas a quien tiene la orden. ¿Se acepta en cambio lo capturado *antes* de la reasignación
    (ventana de gracia, p. ej. 72 h, con hora del dispositivo — que el dispositivo podría falsear) o se guarda en el
    servidor una bandeja de "capturas por revisar" para Administración?
18. **Jornada reprogramada con registro sin conexión** (`jornada_rescheduled`): ¿la cuadrilla sí trabajó ese día? Hoy no se
    revive la jornada; la app ofrece capturar en la jornada vigente. ¿Se permite reactivar la jornada original?
19. **Órdenes cerradas cuyo supervisor cambió de unidad o rol**: el servidor bloquea el cambio solo con órdenes *abiertas*;
    las cerradas conservan su supervisor histórico (reabrirlas sigue siendo suyo). ¿Permitir reasignar el responsable de
    una orden cerrada (seguimiento/reapertura)?
20. **Envío en lote** (`sync_push` con varias operaciones por llamada) para reconexiones con mucha cola: hoy una llamada por
    operación. ¿Cuándo vale la pena?
21. **Escala de Dirección**: la visibilidad se resuelve con la lista de ids de órdenes (rápido hasta decenas de miles).
    Por encima de ~100 000 órdenes conviene un rol de base de datos propio para Dirección (vía el *hook*).
