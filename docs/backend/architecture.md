# Pulkro Cuadrillas — backend architecture (Supabase)

Status (2026-10-11, after the PR #9 review): schema, RLS, business-rule RPCs, Storage and the auth hook function are
**applied** to the Supabase project "Pulkro" (ref `cbdzndpdpwtxbhshidyi`, us-east-1, Postgres 17.11) — the 22 migrations
below. The project holds the **demo dataset** (302 orders and their history, 11 password-less demo accounts; every row
registered in `private.demo_rows`, removed in one call by `select private.drop_demo_data();`, see `supabase/seed/README.md`);
no real accounts or data yet, no Storage objects. The app is wired to it on branch `supabase-wiring` (PR #10): an account
build (the two `NEXT_PUBLIC_SUPABASE_*` values set) signs in with Supabase Auth and syncs the on-device zustand store
through `src/lib/sync` (pull, push queue, one writer per device: §8, §11); the demo stays on behind `NEXT_PUBLIC_DEMO`.
What is left before the pilot is listed in §12.

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
| `20261011050457_demo_data_registry` | `private.demo_rows` (registry of the demo dataset), `private.demo_uuid()`, `private.drop_demo_data()` (one-step removal; refuses with `PT409 demo_in_use` while real data references demo rows) |
| `20261011050659_review_pr9_codex` | PR #9 review: a closed jornada keeps its crew (`jornada_closed`), the blocking flag of an open incident moves the order in/out of `con_incidencia` on edits, photos/incidents/cases re-read under the order lock, resolved/closed cases need their resolution (`resolution_required` + table check), validated rows locked `FOR SHARE` until commit (client, supervisor, case owner, crew), workers readable wherever they are on a visible crew (`private.crew_worker_ids()`) |
| `20261011052012_review_pr9_cubic` | PR #9 review (cubic): op ids fail closed when only one side carries the request digest, service hours 0.5–24 (RPC + table check), breakdown lines need numeric hours, survey tokens without repeated 6-character sequences, incident resolution fields all-or-nothing, a conformity method needs the client's name |
| `20261011053107_review_pr9_cubic_wrappers` | PR #9 review (cubic): request digests use SHA-256, wrappers map invalid input values to `PT422 invalid_value`, check-out derives the order status from every live jornada (`derived_status`) |
| `20261011054527_review_pr9_followups` | adversarial pass on the PR #9 fixes: `assign_crew` follows the reference contract (`parent_missing` / `jornada_order_mismatch` / `jornada_rescheduled`), an open incident carries no resolution text, reopening a case re-checks its owner, a supervisor of another unit cannot reopen an order (`supervisor_other_unit`), `crew_worker_ids` materializes the visible orders |
| `20261011061310_review_pr9_codex_round2` | PR #9 review (Codex, round 2): an order's open cases follow it to the new supervisor, reopening a case needs its reason, open blocking incidents stay authoritative when an order is flagged Reprogramada, people on visible orders and cases stay readable after a unit move (`private.referenced_profile_ids()`), `upsert_site` holds the client it authorized against |
| `20261011063116_review_pr9_cubic_round2` | PR #9 review (cubic, round 2): `update_incident` refuses an empty patch and never detaches an incident from its jornada (`jornada_required`); `drop_demo_data` refuses while a surviving order names a demo material or demo worker; check-in/out and rescheduling under an open blocking incident update the status the order resumes; a supervisor owns a case only inside the order's unit; `upsert_site` locks clients before the site |
| `20261011065308_review_pr9_cubic_round3` | PR #9 review (cubic, round 3): `referenced_profile_ids` reads every profile reference of a visible order and its records (field capture, incidents, photos, closures, reports, shares, surveys, cases) |
| `20261011125657_decision_closed_order_reassign` | owner decision 19 (§14): Administración reassigns the supervisor of a closed order (only that field) without reopening it |
| `20261011144326_admin_users_email_sync` | account administration (§2, decision 11): `sync_profile_email`, the RPC the `admin-users` Edge Function calls after changing a login e-mail |
| `20261011174019_admin_users_review` | account administration review: `sync_profile_email(p_op_id, p_user_id, p_email default null)` syncs only while the login still holds the address the request set (`PT409 email_changed` otherwise); `p_email` is part of the op digest |
| `20261011175442_admin_users_decisions` | owner decisions on account administration: an actual e-mail change also ends the person's sessions; the fail-safe trigger `pulkro_mirror_email_change` on `auth.users` copies a self-service e-mail change into `profiles.email` |

Edge Function `admin-users` **deployed** (version 3, 2026-10-11: the review fixes and `resend_invite`; `verify_jwt` on;
`APP_ORIGINS` allows localhost, `https://pulkro.vercel.app` and every Vercel preview of the project, and invitation links go
back to the origin they were sent from; `APP_URL` = localhost is only the fallback for calls without an Origin). Auth settings applied: sign-ups off, the password policy, the access-token hook
(enabled), redirect URLs `http://localhost:3000/**` and `http://localhost:3100/**` (Site URL `http://localhost:3000`).

Sources of truth mirrored here: `docs/requisitos.md`, `src/lib/types.ts`, `src/lib/permissions.ts`, `src/lib/hooks.ts`,
`src/lib/store.ts`, `src/lib/domain.ts`. Tests: `supabase/tests/` (files `00` to `20` pass, including the review regression
suites `09` to `16`, the owner-decision suite `17` and the account-administration suites `18` to `20`; they ignore the
rows of the demo dataset). Types: `src/lib/supabase/database.types.ts` (regenerated after migration `20261011043034`).

---

## 1. Shape of the system

```
PWA (Next.js 16, zustand + IndexedDB, works offline)
 ├─ reads:  PostgREST SELECT on public tables  → RLS decides the rows (scope = canSeeOrder & co.)
 ├─ writes: PostgREST RPC public.<action>(p_op_id, …)  → invoker wrapper → private.<action> (SECURITY DEFINER)
 │          re-checks role, scope and every business rule against server state, writes rows + audit, idempotent
 ├─ files:  Storage bucket `evidencias` (private): upload → then RPC add_photo links the metadata
 └─ auth:   Supabase Auth, e-mail + password; JWT carries role/unit hints from the hook (UI only)
Edge Function `admin-users` (deployed): invites/bans accounts with the secret key; profiles via RPC
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
- **Enabled** (2026-10-11: Dashboard → Authentication → Hooks → Custom access token → Postgres function
  `private.custom_access_token_hook`; config.toml: `uri = "pg-functions://postgres/private/custom_access_token_hook"`).
  Authorization never depended on it (RLS reads `profiles`); what it adds is the UI claims and the refusal. **Consequence:**
  no account without an active profile gets a session, not even from an e-mail link — Auth's `/verify` answers
  `#error=access_denied` (HTTP 403, no `error_code`) and `/acceso/definir-contrasena` shows "No puede entrar todavía". So in
  the bootstrap below the `profiles` insert must run **before** the invite link is opened; a link opened too early works
  again once the profile exists, as long as it has not expired.

**Stale claims**: claims can lag up to the JWT lifetime. Because RLS reads `profiles` on every statement, a role/unit
change or deactivation is effective **immediately** for data. The client calls `supabase.auth.refreshSession()` after any
`PT401`/`PT403` or when it pulls a changed own profile, so menus catch up (and runs a full re-sync, §8).

**Account lifecycle (Dirección = `users.admin`)** — Edge Function `admin-users` (`supabase/functions/admin-users/`,
**deployed**; contract, secrets, deploy and test steps in its `README.md`). `verify_jwt` on; the function
re-verifies the JWT with `@supabase/server` (`createSupabaseContext`, project JWKS), requires an **active Dirección**
profile before any Auth admin call, and writes every profile change **with the caller's JWT** so the database re-checks
`users.admin` and audits who did it. The secret key only reaches `auth.admin` (and the caller's own profile row).

| Action | Auth admin (secret key) | RPC (caller's JWT) |
|---|---|---|
| `invite {opId, email, name, role, unitId, title?, phone?, hue?}` | `inviteUserByEmail` (`redirectTo` = the calling app's allowed origin, else `APP_URL`, + `/acceso/definir-contrasena`); if the profile fails, the auth user is deleted again only when this call created it (a re-sent invitation to an existing, never-confirmed account without a profile leaves that account in place) | `provision_profile` |
| `deactivate` / `reactivate {opId, userId}` | ban (`876000h`) / unban, mirroring the profile's `active` | `update_profile {active}` (returns `open_orders`) |
| `change_email {opId, userId, email}` | `updateUserById {email, email_confirm: true}`; put back when the database refuses the sync (any 4xx); on no answer or a 5xx it stays changed and the same request completes it; on `email_changed` (another change of the same account won) it stays as the other request left it | `sync_profile_email` (with the request's address); when it changes the profile it **ends the person's sessions** (decision 2: they sign in again with the new address) |
| `resend_invite {opId, userId}` | `getUserById`; only while the invitation is pending (`invited_at` set, `last_sign_in_at` empty) `inviteUserByEmail` again (GoTrue re-sends to an unconfirmed account, with a new link); otherwise, or when GoTrue refuses a confirmed account, `409 already_active` → «¿Olvidó su contraseña?» | none: reads the profile (must exist and be active, else `out_of_scope` / `409 account_inactive`); nothing written or audited, `opId` not stored |

Answers `{ ok: true, …, profile }` (`resend_invite`: `{ ok: true, action, resent: true, user_id }`) or
`{ ok: false, code, message }` (stable code = the database hint for RPC refusals; Spanish message). `opId` makes retries
idempotent (not for `resend_invite`, which stores nothing: each call e-mails again). CORS only for `APP_ORIGINS`. The app
calls it from Configuración → Usuarios in account sessions, online only ("Necesita conexión" offline); the demo keeps its
local store. «Reenviar invitación» sits in the person's «Editar» (active accounts other than one's own); its
`already_active` answer is shown as information, not as an error.

**Known limitation, accepted (owner decision 4, 2026-10-11): two invitation e-mails on a retry of the same
`invite`.** The e-mail goes out before `provision_profile` stores the op: a second request with the same `opId` that finds
no profile yet also calls `inviteUserByEmail`, and GoTrue re-sends to the account the first one created. It finds none
while the first is still between `inviteUserByEmail` and `provision_profile` (a double submit, a retry after a lost
answer in that window), and also after the first crashed, timed out or was stopped between the e-mail and the profile
(its auth user stays without a profile until the retry provisions it). One account and one profile result; the person
gets two e-mails and uses the latest (each send issues a new link). No reservation step is added (it would need a
migration and a redeploy). The app never promises otherwise: after an unknown outcome the users screen says the
invitation can be sent again without creating another account, and that if two e-mails arrive the person uses the
latest.

**E-mail changes and sessions.** Dirección's change (`change_email`) ends the person's sessions in the same transaction as
the profile update (`sync_profile_email` deletes their `auth.sessions`, refresh tokens included, like a deactivation): a
device signed in with the old address keeps its access token at most until it expires (1 h) and cannot renew it. A no-op
sync (already in sync, a retry) or a refused one ends nothing. A change the person **makes themself**
(`supabase.auth.updateUser({ email })` and the confirmation link — the app does not offer it yet) is copied into
`profiles.email` by the trigger `pulkro_mirror_email_change` on `auth.users` (`AFTER UPDATE OF email`, SECURITY DEFINER
`private.mirror_auth_email_change`, not executable by any API role), audited as the person's own change ("Cambió su correo
de acceso", old → new, their unit). It acts only on the statement with which GoTrue completes a pending change: the e-mail
changed, the old row had a pending `email_change`, the new e-mail is that address and `email_change` is cleared in the same
statement (`ConfirmEmailChange`). Dirección's admin update writes `email` alone, so it never matches (not even when it
sets the very address the person had asked for): `sync_profile_email` stays the path that copies and audits it. The
trigger runs in GoTrue's transaction (no JWT, so not `private.actor()`) and never raises: an address another profile uses
(`profiles_email_key`), or any other error, leaves the profile unchanged with no audit row; anything GoTrue does that does
not look like a completed change leaves the status quo. It does not end sessions (the person is the one signed in).

**Deactivation is layered**: `update_profile(active=false)` (in the same transaction) sets `deactivated_at`, **deletes the
user's `auth.sessions`** (refresh tokens die with them) and returns `open_orders` (folios of the open orders the person
still supervises, also in the audit reason) so Dirección can reassign them; from the next statement RLS shows nothing and
RPCs return `PT401`; the hook refuses new tokens; the Edge Function also bans the user. Nobody can change their own role,
unit or status. **Unit or role changes are refused (`PT409 has_open_orders` / `has_open_cases`, listing the folios) while
the person supervises open orders or owns open post-sale cases**: reassign first. Auth users with a profile cannot be
deleted (`on delete restrict`): accounts are deactivated, history keeps names.

**Bootstrap of the first Dirección account** (once, by the owner, SQL editor as `postgres`). The pilot starts on a
clean project (owner decision, 2026-10-11): the demo dataset holds the unit codes `MTY`, `APO` and `SAL`, so first remove
it with `select private.drop_demo_data();` (and confirm `select count(*) from private.demo_rows` is 0). Then invite the
e-mail from Dashboard → Authentication → Users → Invite, and
`insert into public.units (id, name, code, city) values (gen_random_uuid(), 'Matriz Monterrey', 'MTY', 'Monterrey, N.L.');`
and `insert into public.profiles (id, name, initials, role, unit_id, email) select u.id, '<Nombre>', '<IN>', 'direccion', (select id from public.units where code = 'MTY'), lower(u.email) from auth.users u where u.email = '<correo>';`.
Run both inserts **before** opening the invite link: with the access-token hook enabled, the link of an account without
an active profile is refused ("No puede entrar todavía"; it works once the profile exists, if it has not expired).
After that every account goes through the app/Edge Function.

**E-mail links (invite, recovery)** land on `/acceso/definir-contrasena`, which accepts every form Supabase sends
(`src/features/auth/auth-link.ts`):
- **Default templates** (Free plan without custom SMTP: Supabase's own e-mails, **in English**): the link goes to Auth's
  `/verify` and comes back to `redirectTo`. Admin invites (`admin-users`, or the dashboard) are not PKCE, so the session
  comes back in the fragment (`#access_token=…&refresh_token=…&type=invite`) and the page calls `setSession`. A recovery
  asked for in the app is PKCE (`@supabase/ssr` forces it): it comes back as `?code=…` and the page calls
  `exchangeCodeForSession`. That only works in the browser that asked, which holds the code verifier: on iOS, a request
  made in the installed app and a link opened in Safari do not share it. A refused link comes back as
  `#error=access_denied&error_code=otp_expired…`.
- **Spanish templates** (`supabase/templates/`, used only with custom SMTP): `?token_hash=…&type=…`, and the page calls
  `verifyOtp`.

The browser client has `detectSessionInUrl: false`, so this page is the only code that turns a link into a session (with
detection on, the client would reject the implicit fragment and spend the one-time code before the page could). A link
that lands elsewhere goes on to the page through an inline script in the root layout, before the store or the client
read anything. That happens with a `redirectTo` outside the allow list, which falls back to the Site URL, and with a
dashboard invite, which has no `redirectTo`. Allow list: `<app>/acceso/definir-contrasena`, plus `http://localhost:3000/**`
and `http://localhost:3100/**` for local development.

The fragment's `type` is plain text, so the page takes a fragment session only as `invite` or `recovery` (the password
step always follows) and shows the account it opens; with an account open on the device it asks first, then flags that
account for re-authentication (its pull stops writing) and names both. A PKCE exchange that fails after reaching auth-js is
final (the verifier is gone: a new link is the way out). The service worker never caches a navigation whose query carries
a link's credential.

## 3. Data model (`src/lib/types.ts` → tables)

Conventions: `uuid` PKs generated on the device (recommend UUIDv7 in the client for index locality; Postgres 17 has no
native `uuidv7()`), snake_case, `text` + CHECK lengths, `timestamptz`, enums identical to the TS unions, `created_at` /
`updated_at` stamped by triggers with the **server clock** (client values are overwritten), `row_version` on mutable
rows, `deleted_at` tombstones where rows can disappear. Every FK has an index (asserted by test 00).

| Type | Table | Notes |
|---|---|---|
| `Unit` | `units` | `code` unique (`^[A-Z0-9]{2,8}$`) |
| `User` | `profiles` | PK/FK `auth.users(id)` restrict; `role`, `unit_id`, `active` + `deactivated_at`; `email` unique, lower-case, a copy of `auth.users.email` written only by `provision_profile` and `sync_profile_email` |
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
| `profiles` | all | `unit_id = U or role = 'direccion'`, or referenced by a visible record | self, or referenced by a visible record |
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

**People on visible records** (PR #9 review): `private.referenced_profile_ids()` (SECURITY DEFINER, once per statement)
collects every profile a visible order or its records names — current and former supervisors (`order_assignments`), the
order's creator, and every author column of its crew history, checks, notes, incidents (created/resolved), photos
(created/deleted), closures (validator, exception authorizer), reports, shares, surveys (sent/recorded), cases (owner,
creator) and case events — so history keeps its names after someone moves to another unit. `audit_log` keeps its own
`actor_name` snapshot. Suite 16 derives the list of columns from the catalog's foreign keys to `profiles`, so a new one
cannot be forgotten.

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
| `update_order` | general fields: order.edit · operational: + order.editOperational (own) | whitelisted keys; closed/cancelled refused, except the supervisor alone on a finalizada/reporte_enviado/seguimiento order (decision 19); supervisor reassignment within unit, audited "Reasignó la orden de A a B", recorded in `private.order_assignments`, `scope_changed_at` stamped; the order's open cases owned by the former supervisor move to the new one (timeline entry + audit) |
| `set_order_status` | order.reschedule | flag `reprogramada` (reason ≥ 5) or confirm dates: leaving `reprogramada` goes to the status the jornadas support (`derived_status`); while a blocking incident is open the order stays `con_incidencia` and the requested status becomes `previous_status` (check-in/out and `schedule_jornadas` update it the same way) (dates of an order that resumes `reprogramada` can be confirmed under the incident) — the requested target is not trusted |
| `cancel_order` | order.edit | open orders only, reason ≥ 5 |
| `reopen_order` | order.reopen (supervisor, own, still in the order's unit — `supervisor_other_unit`) | finalizada/reporte_enviado/seguimiento → `reabierta`, keeps `previous_status`, stamps `reopened_at` |
| `archive_order` | order.archive | reporte_enviado/seguimiento and no open cases |
| `assign_crew` | crew.assign | active workers of the order's unit (rows locked `FOR SHARE`); a named jornada follows the reference contract (`parent_missing` / `jornada_order_mismatch` / `jornada_rescheduled`) and must be pending or in progress — a closed day's crew is the record of who worked (`jornada_closed`); history row; borrador → programada |
| `schedule_jornadas` | order.reschedule / crew.assign | executed days kept with their numbers, pending ones tombstoned, new days numbered after the highest executed day; an empty list is refused while nothing was executed (`days_required`); execution states recomputed (`derived_status`) |
| `check_in` / `check_out` | field.capture | see §6 |
| `add_jornada_note`, `log_reminder`, `set_jornada_breakdown` | field.capture | breakdown: every line a named activity with numeric hours ≥ 0, ≤ 24 h in total; notes allowed until cancelled/archived |
| `add_photo`, `update_photo`, `delete_photo`, `set_photo_selected` | field.capture (postventa photos: postventa.manage) | object must already exist in Storage at `orders/<order>/<kind>/<photo>.<ext>`; references checked (`parent_missing` / `*_order_mismatch` / `jornada_rescheduled`); field photos frozen on closed orders; soft delete (`photo_deleted` afterwards) |
| `add_incident`, `update_incident`, `resolve_incident` | field.capture | blocking incident → `con_incidencia` (+ previous status); edits only on open orders, never empty (`empty_patch`), and an incident cannot be detached from its jornada (`jornada_required`); flagging an open incident as blocking enters `con_incidencia`, un-flagging or resolving the last blocking one recomputes the status (`derived_status`; previous `finalizada`/`reabierta`/`reprogramada` resume); the incident is re-read under the order lock, so a second resolution answers `already_resolved` |
| `validate_closure` | closure.authorize | see §6; new closure version |
| `generate_report`, `log_share` | report.share | see §6 |
| `create_case`, `update_case`, `add_case_note` | postventa.manage | owner = an active member of the order's unit — its Administración or the order's own supervisor; new cases start `abierto`/`en_proceso`; `resuelto`/`cerrado` need a resolution ≥ 10 characters (`resolution_required`; table check `post_sale_cases_resolution_required` as backstop); reopening a resolved/closed case needs its reason as the note (≥ 10 characters, `reason_required`) and re-checks its owner (`invalid_case_owner` — reassign in the same patch); case on reporte_enviado/archivada → seguimiento |
| `create_survey`, `record_manual_survey` | postventa.manage | token 256-bit (`^[A-Za-z0-9_-]{43,64}$`, ≥ 16 distinct characters, no repeated 6-character sequence — a broken generator's cycles are refused; a random token fails it with p ≈ 10⁻⁸ and the app regenerates), device-generated |
| `get_survey`, `submit_survey` | **anon only** | see §9 |
| `upsert_unit` | users.admin (Dirección) | code normalised, unique |
| `upsert_client`, `upsert_site`, `upsert_worker` | catalogs.admin (Administración own unit; Dirección all) | previous and new unit both checked; a client with orders cannot change unit (`client_in_use`), a client without orders that moves touches its sites; a site with orders cannot change client |
| `upsert_service_type`, `upsert_material` | catalogs.admin | company-wide (as coded in `store.ts`) |
| `provision_profile`, `update_profile` | users.admin | auth user must exist; no self role/unit/status change; no unit/role change with open orders or open cases; deactivation revokes sessions and returns `open_orders` |
| `sync_profile_email` | users.admin | after `admin-users` changed the login e-mail: copies `lower(auth.users.email)` into `profiles.email`, audited (old → new), and **deletes the person's `auth.sessions`** when it changes the address (decision 2); with `p_email` (the address the request set, in the op digest) only while the login still holds it, else `email_changed`; an address another profile uses → `email_taken`; already in sync → `changed: false`, nothing ended (migrations `admin_users_email_sync`, `admin_users_review`, `admin_users_decisions`) |
| `update_my_contact` | any active account | own phone only |
| *(trigger)* `pulkro_mirror_email_change` on `auth.users` | GoTrue (no JWT) | not an RPC: a self-service login e-mail change, once GoTrue completes it, is copied into `profiles.email` and audited as the person's own; never raises (§2 "E-mail changes and sessions"; migration `admin_users_decisions`) |
| `sync_reconcile` (read) | any active account (SECURITY INVOKER, plain RLS) | returns the subset of ids still visible |

**Error contract** (PostgREST maps `PTnnn` to HTTP status; `hint` is a stable machine reason — the complete list):
`PT401` (`no_session`, `no_profile`, `inactive`) · `PT403` (`forbidden:<action>`, `other_unit`) · `PT404`
(`out_of_scope`, `survey_not_found`, `auth_user_missing`) · `PT409` (`order_closed`, `order_cancelled`, `order_frozen`,
`order_not_open`, `duplicate_check`, `check_in_missing`, `not_closable`, `closure_blocked`, `evidence_missing`,
`revalidation_required`, `closure_required`, `open_cases`, `not_reopenable`, `not_archivable`, `not_rescheduled`,
`already_resolved`, `already_provisioned`, `self_change`, `site_in_use`, `site_changed`, `client_in_use`,
`has_open_orders`, `has_open_cases`, `email_taken`, `email_changed`, `op_id_reused`, `object_missing`, `parent_missing`, `order_reassigned`,
`jornada_rescheduled`, `jornada_closed`, `photo_deleted`, `supervisor_other_unit`, `append_only`; owner-only
`drop_demo_data`: `demo_in_use`, `demo_storage_objects`) · `PT422` (`invalid_value` — any malformed or out-of-range input,
mapped by the wrappers — and `invalid_activities`, `invalid_answers`, `invalid_breakdown`, `invalid_case_owner`,
`invalid_crew`, `invalid_days`, `invalid_hours`, `invalid_materials`, `invalid_mime`, `invalid_patch`, `invalid_profile`,
`invalid_service_type`, `invalid_storage_path`, `invalid_supervisor`, `invalid_table`, `invalid_text`, `invalid_unit`,
`device_time_future`, `device_time_stale`, `device_time_missing`, `location_missing`, `location_note_required`,
`check_sequence`, `days_required`, `due_date_required`, `empty_patch`, `field_not_editable`, `jornada_required`,
`op_id_required`, `reason_required`, `resolution_required`, `signature_missing`, `site_client_mismatch`,
`status_not_settable`, `survey_id_required`, `too_many_ids`, `weak_token`, `jornada_order_mismatch`,
`incident_order_mismatch`, `case_order_mismatch`) · `23505` duplicate id · `23503` missing reference · `42501` no
privilege. Messages are
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
- **Concurrency** (PR #9 review): every RPC that changes an existing order or its records locks the order first, then
  re-reads the row it edits (photo, incident, case) `FOR UPDATE`, so an edit or delete committed by another device while
  the call waited is seen. `create_order` has no order to lock yet: it holds its client and supervisor instead (below). A row that a validation
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
  - *retry with backoff*: network errors, 5xx, `408/429`, `PT409 object_missing` (upload still running),
    `PT409 parent_missing` (a parent still in the queue) and `PT422 device_time_future` (the phone's clock is ahead: the
    same request goes once the server's clock passes the stamped time) — server answers are capped (20 attempts / 24 h),
    then quarantine; requests that got no answer only space the retries out and never count toward the cap;
  - *re-authenticate, keep the queue*: `PT401`;
  - *conflict → quarantine* (keep the payload and blobs on the device, show "no se aplicó" with the server message, offer
    redo/hand-off/discard): `order_reassigned`, `jornada_rescheduled`, `photo_deleted`, `order_closed`, `order_cancelled`,
    `order_frozen`, `duplicate_check`, `op_id_reused`, a permanently failed upload. Exception: `photo_deleted` answering
    `delete_photo` means the photo is already deleted — the item counts as sent;
  - *permanent error* (bug or invalid input): other `PT403/PT404/PT409/PT422`; re-pull the order, let the user decide.
  - *never retried* — a resend of the same request cannot change the answer, so the sync sheet offers only "Descartar"
    and "Reintentar N envíos" skips them (`NO_RETRY_HINTS`, queue.ts): `op_id_reused`, `duplicate_check`,
    `already_resolved`, `already_provisioned`, `photo_lost`, `device_time_stale`, and a photo file the bucket can never
    take (Storage 413 → `upload_too_large`, 415 → `upload_bad_type`; the message says to take the photo again or attach
    a smaller one / another format).
  - *reversible refusals* (owner decision 2026-10-11, `REVERSIBLE_HINTS`): `order_closed`, `order_reassigned`,
    `out_of_scope`, `order_cancelled`, `jornada_rescheduled` and the bucket refusing the file for those reasons (Storage
    403 / RLS → `upload_forbidden`). A reopening, a reassignment back or a reschedule lets the very same request through,
    so «Reintentar» stays offered (per item and in "Reintentar N envíos"); the row keeps the server's message and adds
    when Reintentar helps. A refused resend changes nothing (the op rolls back).
  - *maybe applied*: an attempt whose answer was lost (no answer, 502/504, a device error after the request left) marks
    the item `maybeApplied` until a definite answer (applied / duplicate, a business refusal, a constraint, a privilege);
    busy answers (408/429/5xx, PostgREST, transient database states) prove nothing about it and keep the mark. While it
    holds, «Descartar» leaves what names the item queued (it may still apply), takes along only what depends on it without
    naming it (see below), deletes no picture a queued item still needs, and a discarded `create_order` is read back from
    the server by id.
  - an item the retry cap stopped is never resent by itself: its message says so (a phone clock ahead: "Corrija la fecha
    y hora del teléfono y pulse Reintentar").
  Field evidence is never dropped silently: a quarantined capture stays on the device until the person discards it, and
  the "Descartar" confirmation first offers «Guardar fotos en el teléfono» for every photo it would delete (the share
  sheet with the files where supported, else one download each, named `<folio>_<kind>_<yyyy-MM-dd_HH-mm-ss>`); the device
  copies are deleted only once the discard is confirmed (a picture the device fails to read is said so, with
  «Reintentar»). Discarding an item takes along the later items that name a record it creates (they could only answer
  `parent_missing`), or depend on it (`deps`: a case's «Agregó una foto» note goes with that photo). If its last attempt
  got no answer, the server may have applied it: what names it stays queued (the server answers `parent_missing` if it
  never arrived; a new order discarded that way keeps the pictures its still-queued photos need), and only what depends
  on it without naming it still goes along — the «Agregó una foto» note carries no photo id the server could check.
  Discarding a refused `validate_closure` or `check_in` also names the later `generate_report` / `log_share` of that order
  (or the `check_out` of that jornada): the server will probably refuse them too, but they are not taken along — they can
  be discarded when that happens.
- **Whose session**: a push burst and a pull cycle check once that the browser's session is the account's on the device,
  then send every request with that session's access token (`getTokenClient`): the cookies are shared by every tab, and
  an e-mail link or a sign-in in another tab may replace them mid-run. What an answer says about the account ("no
  access", "the session is gone") applies to the account the burst or cycle ran for, and only while the store still holds
  it: a request that stalled while the next person signed in on the phone never flags or signs out that person.
  Ending a deactivated account's session never revokes another account's (`endSessionOnDevice({ userId })`).
- **Conflicts**: field-level patches (`update_order`, `update_photo`, `update_incident`, `update_case` send only the
  touched keys) so Administración (general data) and the supervisor (operational data) never overwrite each other; the
  same field edited twice → last server arrival wins, both edits stay in the audit log. State conflicts (check-in on an
  order cancelled meanwhile, closure after an incident was opened on another device) are rejected by the rules — the
  server state wins.
- **Device time**: `p_device_at` (check-in/out, notes, incidents, closure, reports, shares) and `p_taken_at`/`p_attached_at`
  (photos) are stored next to the server time, bounded (§6) and never used for authorization, and the app never rewrites
  them (they are evidence). A time more than 5 minutes ahead of the server's clock (`device_time_future`) is retried as
  above until the server's clock passes it; one older than 45 days (`device_time_stale`) is never retried. The app keeps
  an estimate of the phone's clock offset (`sync.clock`, persisted, per device; sync/clock.ts) from server times it
  already receives: `server_at` of check-in/out and `reopened_at` of reopen_order (timed around the request; a
  `duplicate` answer is ignored), the `iat` of every access token a sign-in or refresh returns (read from a copy of the
  Auth answer in supabase/client.ts), and the newest `updated_at` a pull reads (a lower bound: it only raises the
  estimate). While the offset exceeds 5 minutes, the capture screens (check-in/out, photos, notes, incidents, closure)
  show a non-blocking warning to correct the phone's date and time (`ClockWarning`); nothing is blocked (policy in §14).
  When the app comes back to the screen and every minute, a wall clock that moved more than the time that passed
  (`performance.now()`) was set by hand: the estimate of the old clock is dropped, and while the warning shows (or after
  such a jump) the clock is measured again with a token refresh, at most every 2 minutes (`checkClock`). The first online
  check of each page load measures it too: the saved estimate may be stale (a clock set while the app was closed), and a
  phone set ahead would otherwise go unwarned while its captures are refused as `device_time_future`. The comparison
  of a send time with a read time (both the phone's clock) treats a send time later than now as earlier than the read
  (the clock went back since), so a corrected clock never holds an order in every pull.

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
  quarantine (above), not to the trash; an order kept that way keeps the client, site, people and crew it names. A read
  (page, subtree, reconcile) that started before an item reached the server treats that item's order as still unsent, so
  it never wipes what was just sent; catalog / profile rows held for an unsent edit are read again by id afterwards.
- **One writer per device** (owner decision 2026-10-11; `src/lib/device-storage.ts`). A tab holds the whole dataset in
  memory and saves it whole to IndexedDB, so two tabs saving would replace each other's captures. An earlier build merged
  the tabs' saves record by record (a revision next to the data, a three-way merge, every save announced and merged into
  the other tabs). Review found that merge fragile — another owner's data merged into a tab that had changed hands, a save
  queued behind a merge overwriting it, two tabs rewriting the dataset to each other forever, a tab's own in-flight item
  reset so «Descartar» showed mid-send, the queue re-sorted by the phone's clock (dependents ahead of their parents),
  discards that did not stick, pull cursors moved past rows a tab never applied, re-read lists erased — so it was dropped.
  Now one tab holds the data:
  - **Writer epoch**: `writer-epoch` is stored next to `device-owner`. A tab becomes the writer by incrementing it in one
    transaction and remembering its value; it never acts as the writer before that write is stored (a full device: the
    blocker asks to free space and the claim is retried; any other refusal — site data blocked, a broken database — says
    the data could not be read). Every save checks the epoch and the owner in the same readwrite transaction as
    the save, and is refused unless both are still what this tab expects. A refused tab stops writing for good, drops its
    data from memory and shows the blocker, so a tab that was frozen while another took over is harmless when it wakes up.
    The push and pull engines check the epoch too, before every RPC and every pull cycle (`sync/writer.ts`): a tab that lost
    the device never sends an item the new writer may have discarded meanwhile.
  - **Web Lock** `pulkro-writer`: the first tab takes it and holds it. Every other tab of the app shows a full-screen
    blocker, «Pulkro está abierta en otra ventana», with «Usar aquí», and becomes the writer by itself when the writer's
    tab closes. «Usar aquí» asks the writer over a BroadcastChannel to step aside: it stops pushing and pulling, saves its
    pending write, shows the blocker and starts over behind it. If it does not answer within 1.5 s (or does not finish
    within 10 s), the new tab takes over anyway (`steal`, then a new epoch, which refuses any late save of the old tab). A
    writer that cannot save what it holds (storage full) answers that it keeps the device: its captures exist only in its
    memory, so there is no takeover until it has saved them. While its saves fail it also marks the origin
    (`pulkro-unsaved`, localStorage): when it does not answer at all (frozen in the background) and the mark is set, the
    new tab does not take over silently — it says the other window does not answer and holds unsaved changes, and offers
    «Usar aquí de todos modos» (those changes are lost then). A browser that refuses Web Locks (site data blocked) falls
    back to the epoch alone, below.
  - Without Web Locks (older browsers, insecure origins): the epoch alone, plus a "writer?" question and a "writer"
    announcement on the channel. A writer that hears a newer epoch has lost; a waiting tab asks again when the writer's page
    goes away or when it becomes visible. The writer also stamps the origin every 1.5 s (`pulkro-writer-alive`, removed
    when its page goes away): a tab that gets no answer claims only once the stamp is 5 s old, so a writer busy for a few
    seconds (a PDF, a large save) keeps the device and the write waiting in its debounce. A writer frozen in the background
    misses both the question and the stamp, so a tab never claims by itself while `pulkro-unsaved` is set: it shows the
    same «La otra ventana no responde» blocker, with «Usar aquí de todos modos» as the explicit decision, and looks again
    when it becomes visible or the writer's page goes away. A tab that holds no data but keeps
    claiming (a full or unreadable device) starts over behind the blocker when another tab announces itself. Without
    BroadcastChannel either (Safari < 15.4), a recent stamp is the only sign of a writer: a new tab waits behind the
    blocker. Without BroadcastChannel (with or without Web Locks) «Usar aquí» cannot ask the writer to save first, so it
    never takes the device silently: the blocker says the other window cannot be asked, and only «Usar aquí de todos
    modos» takes it (what that window had not saved is lost) — two windows of the app at once are not supported on those
    browsers.
  - Only once it holds the epoch does a tab read IndexedDB and hydrate the store; a read that keeps failing is never
    hydrated over (the blocker offers to retry). The other tabs never read, persist, push or pull. A writer that steps
    aside shows the blocker at once and saves until nothing is pending, so a capture landing meanwhile goes with it; a
    photo batch still being stored (compressing, waiting for the position) is waited for too, and the requester is told the
    writer is still saving (its 10-second wait starts again). Only the writer keeps copies of server photos: a tab that lost the device
    while downloading one writes nothing afterwards.
    With one writer there is no cross-tab push lock: during a takeover the old tab stops at its next epoch check, and a
    request already in flight is deduplicated by its op id.
  - A sign-out, or another account's sign-in, counts this tab's unsent items plus the queue saved on the device (and, when
    this tab holds no account, the account saved there — a save that failed may have left it). Both first wait for photo
    batches still being stored (a photo is no queue item until then), and never wipe while one is. A sign-out says the
    account's data was erased only once the device stored the wipe; otherwise it says the data is still on the device (the
    wipe is retried). The photo blobs on the device when it changes hands are listed then and deleted once a save of the
    new owner's data commits — that save or a retry of it — so a refused or failed save leaves them with the data that
    names them, and the next account's own captures stay. A sign-out on a full device deletes them first (the person agreed
    to lose them) and tries the wipe again.
  - The public survey page (§9) takes part like any other page of the app, except that in an account build it never
    depends on the device: when the tab cannot hold the data (full, unreadable), the page is read and answered on the
    server without the store (the server still refuses a staff session it sees in the cookies).
  - **Deploying it** (owner decision 2026-10-11): no build before the writer epoch was deployed to users. Builds before it
    (the demo build, the record-by-record merge) neither check nor bump `writer-epoch`, so a tab still running one would
    write the dataset unchecked over the writer's: the first deploy of this build must not coexist with open tabs of an
    older build (close them, or reload every window once, before using the new one). From this build on the epoch is the
    fence: every later build keeps `writer-epoch`, `device-owner`, the lock and the channel `pulkro-writer` (a build that
    changes them carries its own fence), so a tab left open on an older epoch-aware build is refused like any stale tab.
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

A link is handed out only once its survey is on the server. «Generar encuesta» creates the survey on the device and queues
`create_survey`; until that item is sent, `get_survey` answers `PT404` for the token, and for good if the server refuses
it. So in account sessions every way of sharing (WhatsApp, correo, copiar enlace, QR) waits for the item
(`features/postventa/lib.ts` `surveyLink`): the row says «La encuesta se activa al sincronizar: compártala cuando esté en
línea» meanwhile, and the server's message if it was refused (Reintentar / Descartar in the sync sheet). The demo shares at
once, as before. The public page's «No encontramos esta encuesta» of an account build says that a link just received may
not be active yet and offers «Intentar de nuevo».

The page is a page of the app for the one-writer rule (§8). A client's phone only ever has this page open, so it is the
writer there and the client never sees the blocker; in account builds it answers through `submit_survey`, and the device
store it hydrates holds no staff session, so nothing more is written. It never depends on the device there: when the tab
cannot hold the app's data (storage full, site data blocked, a broken database), the page renders the server survey
without the store, and the server's `42501` still catches a staff session in the cookies. On a staff device where the app is open in another
window, the page shows the same blocker («Usar aquí»): it needs the writer's data to know whether a staff session is open
on the device (it asks to sign out first, and only the writer may sign out and wipe the device), and the demo answers its
own surveys into the device's store.

## 10. API keys and environment

- App (browser + Next.js server): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (`sb_publishable_…`).
  The publishable key maps to `anon` / `authenticated`; all protection is RLS + grants.
- **Secret key** (`sb_secret_…`): only inside the Edge Function (auto-provisioned `SUPABASE_SECRET_KEYS`, read by
  `@supabase/server`); never in Next.js, never `NEXT_PUBLIC_*`, never in the repo (`.env*` is git-ignored). The app needs
  no secret at all.
- Legacy `anon`/`service_role` keys are deprecated by end of 2026: create the new keys and disable the legacy ones once
  nothing uses them. Recommended: migrate to asymmetric JWT signing keys so `getClaims()` verifies locally.

## 11. Next.js integration (Next 16, App Router, `@supabase/ssr`)

Built on `supabase-wiring` (PR #10). Without the two `NEXT_PUBLIC_SUPABASE_*` values the app is demo-only (no account
sign-in, no proxy refresh).

- `src/lib/supabase/config.ts`: the project URL and publishable key, read as literal `process.env.NEXT_PUBLIC_…` (Next
  inlines them at build time); `isSupabaseConfigured`.
- `src/lib/supabase/client.ts`: the browser client, `createBrowserClient<Database>` with `detectSessionInUrl: false` (a
  link's session is taken only by `/acceso/definir-contrasena`); `getTokenClient` (a client bound to one access token: a
  request keeps the account it started for, §8); `endSessionOnDevice` (ends this device's session, scoped to one account
  with `userId`: a session another tab put in the shared cookies meanwhile stays).
- `src/lib/supabase/server.ts`: `createServerClient<Database>` with `cookies: { getAll, setAll }` (`setAll` in try/catch
  for Server Components). Nothing in the app uses it yet: every read and write runs from the device.
- `src/proxy.ts` (Next 16 renamed Middleware to Proxy): refreshes the session cookies on each request (`getClaims()`,
  `setAll` rebuilding the response and copying its cache headers) for every path but static assets, the service worker
  and the manifest. It **never redirects**: routes are gated on the client from the on-device store session (AppShell →
  `/login`), which also works offline; the database decides what an account may read or write.
- `/login` (`src/features/auth/login-view.tsx`, `account-sign-in.tsx`): `signInWithPassword`, «¿Olvidó su contraseña?»
  (`resetPasswordForEmail`, `/login?recuperar=1`), "Vuelva a entrar" for the account on the device, and «Entrar al demo»
  while the demo is on. `use-enter-account.tsx` reads the account's own profile and starts the store's account session.
- `/acceso/definir-contrasena` (`set-password-view.tsx`): invite / recovery / e-mail-change links (both link forms, §2),
  then `updateUser({ password })`. Sign-out (`use-sign-out.tsx`) ends the session and wipes the account's data only after
  the person saw the unsent changes (this tab's queue and the saved one, §8).
- The sync engine: `src/lib/sync/` — `pull.ts` (cursors, scope gain, reconcile), `push.ts` + `queue.ts` (the queue and its
  rules), `writer.ts` with `src/lib/device-storage.ts` (one writer per device), `clock.ts`, `use-pull-scheduler.ts`.
- `@supabase/server` (`createSupabaseContext`) is for the Edge Function only; no deprecated framework adapters.
- `src/lib/supabase/database.types.ts` is generated; regenerate after every migration.

## 12. Phased plan to wire the app

1. **Project settings** (dashboard): disable sign-ups; Site URL (the app's URL) + redirect URLs
   (`<app>/acceso/definir-contrasena`, `http://localhost:3000/**`, `http://localhost:3100/**`); enable the hook; custom
   SMTP + Spanish invite/recovery templates (until then Supabase sends its default English e-mails, whose links the app
   also accepts: §2 "E-mail links"); JWT expiry (keep ≤ 1 h) and session limits; new API keys; asymmetric signing keys.
   **Passwords** (Authentication → Providers → Email): minimum length 12, require lowercase, uppercase and digits (no
   symbol requirement: supervisors type on phones). Sign-ups off, the hook, the password policy, `jwt_exp` and refresh-token
   rotation are applied by `scripts/supabase-auth-config.mjs` (Management API, your own scoped access token; dry run by
   default; writing needs an explicit `--ref <project-ref> --apply`; `--pro` adds leaked-password protection). Leaked-password protection (HaveIBeenPwned) needs the **Pro plan**; the
   organization is on Free today. Move the project to Pro before the pilot — Free projects pause after a week without
   activity and have no daily backups — and turn leaked-password protection on then.
   Drop the demo dataset and bootstrap the first Dirección (§2). Create a **dev/staging project or branch** for everything
   that follows (the demo dataset can be loaded there instead).
2. **Auth in the app** — **built** (`supabase-wiring`, §11): Supabase clients, `proxy.ts`, `/login` and
   `/acceso/definir-contrasena`, the account session from Auth instead of the demo switcher (the demo stays behind
   `NEXT_PUBLIC_DEMO`).
3. **Read path** — **built**: the pull (cursors + scope gain + reconcile, §8) into the existing store, which no longer
   seeds demo data for an account.
4. **Write path** — **built**: a queue item `{op_id, rpc, args, order_id, deps, attempts, state}` per store action (the
   local optimistic update stays), pushed via RPC with the outcome classes of §8 (retry / quarantine / error); photos
   (upload → `add_photo`); folios from the results; one writer per device. The store guards mirror the server rules.
5. **Admin**: deploy `admin-users`, users screen calls it (shows `open_orders` after a deactivation) — **done** (function
   deployed, migration `admin_users_email_sync` applied, suite 18, users screen), and so are the review fixes and the owner
   decisions (migrations `admin_users_review` then `admin_users_decisions`, suites 19 and 20, function version 3 with
   `resend_invite`); catalogs via RPCs; import real catalogs.
6. **Pilot hardening**: run `supabase/tests` (and `npm run check:functions`) in CI against a branch, `pg_cron` purge of
   `private.sync_ops` (> 90 days), storage retention job, PITR/backups, monitoring of advisors and logs.

Still open from phase 1 before the pilot: custom SMTP with the Spanish templates, the Pro plan (leaked-password protection,
daily backups), the app's real URL (Site URL, redirect list, the function's `APP_URL` / `APP_ORIGINS`), dropping the demo
dataset and the first Dirección, and a staging project or branch.

## 13. Operations

- Edge Functions: type-check with `npm run check:functions` (scripts/check-edge-functions.mjs: tsc against the installed
  supabase-js types and the Deno / `@supabase/server` declarations in `supabase/functions/_check/`; no Deno needed) before
  every deploy — the app's `tsc` excludes `supabase/functions`, and neither deploy path type-checks.
- Migrations: `supabase/migrations/<applied version>_<name>.sql`, applied with the MCP `apply_migration` (name = file
  name without version) and verified byte-for-byte (`md5` of `supabase_migrations.schema_migrations.statements[1]` = file
  `md5`; all 22 match as of 2026-10-11: the first 19 in the PR #9 check, `admin_users_email_sync`, `admin_users_review`
  and `admin_users_decisions` right after each was applied). **Never edit an applied file**; fix forward with a new one. Dry run first: one `execute_sql` call
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

## 14. Decisiones (2026-10-11)

El dueño delegó estas decisiones ("your call"). Quedan como valores por defecto: cualquiera se puede revisar después;
las marcadas **[implementado]** ya están en el servidor y en la app.

1. **Entorno**: por decisión del dueño, la integración de la app se construye y prueba contra el proyecto "Pulkro" con los
   datos demo. Antes del piloto: plan Pro (respaldos diarios, sin pausa por inactividad) y un proyecto de staging o
   *branching* para pruebas y migraciones; el demo se quita con `select private.drop_demo_data();` (lo ejecuta el dueño).
2. **Folios**: globales `OS-00001`, `INC-0001`, `PV-0001`, sin prefijo por unidad; se aceptan huecos (las secuencias no
   son transaccionales). Mantienen la continuidad con los folios del demo mientras esté cargado.
3. **Responsable de casos postventa**: Administración de la unidad de la orden o el supervisor de la orden, dentro de la
   unidad. **[implementado]**
4. **Catálogos de toda la empresa** (tipos de servicio, materiales): Dirección y Administración (como en el prototipo).
   Unidades: solo Dirección. **[implementado]**
5. **Conformidad del cliente**: la app la exige al cerrar; el servidor la acepta opcional para no bloquear un cierre
   legítimo sin cliente presente (la excepción queda en el reporte). La firma se queda como imagen dentro del cierre
   (≤ 512 kB): viaja con el cierre y su versión.
6. **Retención** (a programar con `pg_cron` en la fase 6, usando `pulkro.history_purge`): fotos eliminadas → sus archivos
   se borran a los 90 días; evidencia de órdenes archivadas → 2 años; bitácora → sin purga; `private.sync_ops` → 90 días;
   archivos subidos sin `add_photo` → 7 días. Límite por foto: 10 MB (la app comprime a ~1600 px antes de subir).
7. **PDF del reporte**: se genera en el dispositivo a partir del `snapshot`; no se guarda en Storage (el snapshot congelado
   es la fuente). Se reconsidera si un cliente pide el PDF archivado.
8. **Visibilidad de perfiles**: toda persona que aparece en un registro visible (supervisores actuales y anteriores,
   autores de capturas, cierres, reportes, envíos, encuestas, casos). **[implementado]**
9. **Carga inicial**: 6 meses de historial para Dirección y Administración; el supervisor baja todas sus órdenes abiertas
   y 6 meses de cerradas. Lo anterior se consulta en línea.
10. **Reloj del dispositivo**: se mantiene el rechazo (> 5 min adelantado o > 45 días de atraso), con mensaje para revisar
    la hora del teléfono. **[implementado]** Decisión del dueño (CAP-1): lo adelantado se reintenta hasta que la hora del
    servidor lo alcanza (sin reescribir la hora del dispositivo), lo demasiado antiguo solo se puede descartar, y las
    pantallas de captura avisan sin bloquear mientras el reloj del teléfono difiere más de 5 min del servidor (§8).
11. **Correo**: por decisión del dueño, el remitente por defecto de Supabase por ahora (solo entrega a miembros del equipo,
    ~2 correos por hora); plantillas en español en `supabase/templates/`. SMTP propio antes del piloto. Cambio de correo
    de un usuario: acción `change_email` de la Edge Function `admin-users` (fase 5). **[desplegado y aplicado: función
    `admin-users`, RPC `sync_profile_email` (migración `admin_users_email_sync`), pantalla de usuarios; correcciones de la
    revisión (migración `admin_users_review`, nuevo despliegue de la función) pendientes]** Decisiones del dueño sobre las
    cuentas (escritas, pendientes de aplicar con la migración `admin_users_decisions` y el nuevo despliegue): Dirección
    puede **reenviar una invitación** pendiente («Reenviar invitación» en «Editar»; si la persona ya entró, se le indica
    «¿Olvidó su contraseña?»); **cambiar el correo de acceso cierra las sesiones** de esa persona; un cambio de correo que
    la persona confirma por su cuenta se **copia al perfil** (disparador en `auth.users`, sin bloquear nunca la
    confirmación); se aceptan **dos correos de invitación** si el mismo envío se reintenta muy rápido (§2).
12. **Sesiones**: token de acceso de 1 h y rotación de *refresh tokens* (valores por defecto). Inactividad y sesión única
    requieren Pro: se revisan al pasar a Pro.
13. **Encuesta pública**: un solo envío por enlace, sin vencimiento por ahora; la bitácora registra quién generó y envió
    cada enlace. Si hace falta, vencimiento a 30 días.
14. **Compartir una versión anterior** del reporte con la orden reabierta: se permite (como el prototipo). **[implementado]**
15. **Indicadores/exportaciones**: se calculan en el dispositivo con los datos visibles; vistas/RPC de totales solo si la
    carga inicial (punto 9) lo exige.
16. **Privacidad y residencia**: se acepta us-east-1. Antes del piloto: aviso de privacidad (fotos, GPS, firmas) redactado
    por el dueño/asesor legal y respaldos con Pro.
17. **Capturas de un supervisor reasignado**: se quedan en cuarentena en el dispositivo y se entregan a quien tiene la
    orden (sin ventana de gracia, porque la hora del dispositivo se puede falsear). **[implementado]**
18. **Jornada reprogramada con registro sin conexión**: no se revive la jornada original; la app ofrece capturar en la
    jornada vigente. **[implementado]**
19. **Orden cerrada cuyo supervisor cambió de unidad o rol**: Administración puede reasignar el supervisor de una orden
    finalizada, con reporte enviado o en seguimiento (solo ese campo) sin reabrirla; así el nuevo supervisor puede darle
    seguimiento o reabrirla. **[implementado: migración `decision_closed_order_reassign`, prueba 17]**
20. **Envío en lote**: una llamada por operación; se agrega `sync_push` en lote si las colas al reconectar pasan de ~50
    operaciones.
21. **Escala de Dirección**: la lista de ids de órdenes basta hasta ~100 000 órdenes; después, rol de base de datos propio.
