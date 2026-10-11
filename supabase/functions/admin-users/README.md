# Edge Function `admin-users`

Account administration for **Dirección** (Pulkro Cuadrillas, `docs/backend/architecture.md` §2 and decision 11). The app's
users screen (Configuración → Usuarios) calls it in account sessions; the demo never does.

**Status (2026-10-11):** deployed to Pulkro (`cbdzndpdpwtxbhshidyi`), version 1, `verify_jwt` on; migration
`admin_users_email_sync` applied; secrets `APP_URL=http://localhost:3000` and
`APP_ORIGINS=http://localhost:3000,http://localhost:3100` until the app has its own URL. Checked from outside: no JWT → 401,
preflight from an allowed origin → 204, from any other origin → 403. **Pending:** the review fixes in `index.ts` (version 2)
need the migration `20261011154423_admin_users_review` first, then a redeploy (see "Before deploying").

| Action | Body | What it does |
|---|---|---|
| `invite` | `{ action, opId, email, name, role, unitId, title?, phone?, hue? }` | `inviteUserByEmail` (`redirectTo` = `APP_URL` + `/acceso/definir-contrasena`), then `provision_profile` **with the caller's JWT**. If the profile fails, the auth user this call created is deleted again. |
| `deactivate` | `{ action, opId, userId }` | `update_profile {active:false}` with the caller's JWT (revokes the sessions, returns `open_orders`), then bans the auth user (`ban_duration` 876000h). |
| `reactivate` | `{ action, opId, userId }` | `update_profile {active:true}`, then lifts the ban. |
| `change_email` | `{ action, opId, userId, email }` | admin `updateUserById {email, email_confirm: true}`, then `sync_profile_email` with the caller's JWT and the requested address. If the database refuses the sync (any 4xx, a missing RPC included), the auth e-mail goes back to the previous one; if its outcome is unknown (no answer, 5xx) it is left as is and the same request sent again completes it; `409 email_changed` (another change of the same account came in between and won) leaves the login as that change set it. |

- **Who**: `verify_jwt` on (user JWT). The function re-verifies the JWT (`@supabase/server`, project JWKS) and requires an
  **active Dirección** profile before any Auth admin call; every RPC re-checks `users.admin` in the database and audits the
  caller. The secret key is used only for `auth.admin` and to read the caller's own profile row.
- **Idempotent**: `opId` is the RPC op id. Sending the same request again (same payload) answers the stored result with
  `duplicate: true` — an invitation is not e-mailed twice, a deactivation is not repeated. The ban always mirrors the
  profile's current `active` (re-checked after it is set, for two people switching the same account at once), and
  `active` in the answer is the profile's, which can differ from the request on a stale retry.
- **Response** `200`: `{ ok: true, action, duplicate, user_id, profile, open_orders?, active?, email?, invite_pending? }`.
  `profile` is the `public.profiles` row after the change (or `null` if reading it failed). `open_orders` (deactivate) lists
  the folios the person still supervises. `invite_pending` (change_email) means the person never accepted the invitation
  (invited, never signed in — also on a retry of the same request): they set a password with "¿Olvidó su contraseña?" and
  the new address. A pending invitation cannot be re-sent (`409 email_taken`, whose message says so): «¿Olvidó su
  contraseña?» completes it.
- **Errors**: `{ ok: false, code, message }` — `message` is Spanish (usted) for the person, `code` is stable:
  - refusals from the database keep its hint and status (`PTnnn` → nnn): `forbidden:users.admin`, `self_change`,
    `already_provisioned`, `auth_user_missing`, `out_of_scope`, `invalid_profile`, `op_id_reused`, `email_taken`,
    `email_changed`, `invalid_value`, …;
  - from the function: `no_session` 401, `no_profile` / `inactive` 401, `forbidden:users.admin` 403, `origin_not_allowed`
    403, `method_not_allowed` 405, `invalid_body` 400, `unknown_action` 400, `invalid_value` / `invalid_email` /
    `invalid_unit` 422, `email_taken` 409, `stale_retry` 409, `email_changed` 409, `email_not_authorized` 422,
    `rate_limited` 429,
    `auth_user_missing` 404, `invite_failed` / `email_update_failed` / `ban_failed` / `unban_failed` / `server_error` 502,
    `unavailable` 503, `payload_too_large` 413, `server_misconfigured` 500.
- **Logs** carry the action and error codes only — never tokens, keys, request bodies or e-mail addresses.

## Before deploying

1. Migrations: `supabase/migrations/20261011144326_admin_users_email_sync.sql` (adds `sync_profile_email`; applied) and
   `20261011154423_admin_users_review.sql` (adds its `p_email`), then run `supabase/tests/00`, `18` and `19`. Apply the
   second one **before** deploying version 2 of the function, which sends `p_email`: against the old signature PostgREST
   answers 404 (`PGRST202`), `change_email` answers `502 server_error` and puts the login back (a definite refusal). The
   migration keeps the old two-argument call working, so version 1 runs fine after it. The other actions need neither.
2. Auth settings (Dashboard → Authentication → URL Configuration, or `scripts/supabase-auth-config.mjs --site-url …
   --redirect …`):
   - **Site URL**: the app's URL (`APP_URL`, no trailing slash).
   - **Redirect URLs**: `APP_URL/acceso/definir-contrasena`, plus `http://localhost:3000/**` and `http://localhost:3100/**`
     for local development. A `redirectTo` outside the list falls back to the Site URL.
   - **E-mail links**: without custom SMTP (Free plan) Supabase sends its **default templates, in English**. The Spanish
     ones in `supabase/templates/` are only used once custom SMTP is set up. `/acceso/definir-contrasena` accepts both
     link forms:
     - default template: the link goes to Auth's `/verify` and comes back to `redirectTo`. An invite brings the session in
       the fragment (`#access_token=…&refresh_token=…&type=invite`). A recovery asked for in the app brings a PKCE
       `?code=…`, which works only in the browser that asked for it. A used or expired link brings
       `#error=access_denied&error_code=otp_expired…`;
     - Spanish template: `?token_hash=…&type=invite|recovery`.

     A link that lands on the Site URL (an invite sent from the dashboard has no `redirectTo`) or on any other page of the
     app is forwarded to `/acceso/definir-contrasena` before the app reads the session.
3. JWT signing: the function verifies user tokens against the project's JWKS. The project publishes an ES256 key; if the
   project still **signs** with the legacy HS256 secret, every call answers `server_misconfigured` / `no_session`: rotate to
   the asymmetric key first (Dashboard → Project Settings → JWT Keys).
4. E-mail: with Supabase's default sender (decision 11) invitations only reach the project's team members (`email_not_authorized`)
   and about 2 e-mails per hour (`rate_limited`). Set up custom SMTP before inviting real people.

## Secrets to set

Only these two; `SUPABASE_URL`, the publishable/secret keys (`SUPABASE_PUBLISHABLE_KEYS` / `SUPABASE_SECRET_KEYS`, or the
legacy `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`) and `SUPABASE_JWKS` are provided by the platform.

| Secret | Example | Use |
|---|---|---|
| `APP_URL` | `https://cuadrillas.pulkro.com.mx` | Base URL of the app: the invitation's `redirectTo` is `APP_URL/acceso/definir-contrasena`. Without it `invite` answers `server_misconfigured`. |
| `APP_ORIGINS` | `https://cuadrillas.pulkro.com.mx,http://localhost:3000` | Browser origins allowed to call (comma-separated, exact origins). Defaults to the origin of `APP_URL`. Requests from any other `Origin` get `403 origin_not_allowed` and no CORS headers. |

```bash
supabase secrets set --project-ref cbdzndpdpwtxbhshidyi \
  APP_URL=https://<app-domain> \
  APP_ORIGINS=https://<app-domain>,http://localhost:3000
```

(or Dashboard → Edge Functions → Secrets). Functions read a new secret immediately; no redeploy needed.

## Deploy

From the repository root, with the Supabase CLI logged in (a scoped access token is enough):

```bash
supabase functions deploy admin-users --project-ref cbdzndpdpwtxbhshidyi
```

Without Docker running, add `--use-api` (the bundle is built server-side). `verify_jwt` stays **on** (the default): never
pass `--no-verify-jwt`. Dependencies are pinned in the imports
(`npm:@supabase/server@1.9.1`, `npm:@supabase/supabase-js@2.117.2`). Alternatively, deploy with the Supabase MCP
`deploy_edge_function` (name `admin-users`, entrypoint `index.ts`, `verify_jwt: true`, the file `index.ts`).

## Test it

Values used below: `URL=https://cbdzndpdpwtxbhshidyi.supabase.co`, `PK=<publishable key>`, and `TOKEN` = the access token
of an **active Dirección** account:

```bash
TOKEN=$(curl -s "$URL/auth/v1/token?grant_type=password" -H "apikey: $PK" -H 'Content-Type: application/json' \
  -d '{"email":"<direccion e-mail>","password":"<password>"}' | jq -r .access_token)
call() { curl -s -i "$URL/functions/v1/admin-users" -H "apikey: $PK" -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d "$1"; }
```

1. **Gate**: `curl -i -X POST $URL/functions/v1/admin-users` → `401` (gateway). The same call with the token of an
   Administración or supervisor account → `403 forbidden:users.admin`.
2. **CORS**: `curl -i -X OPTIONS $URL/functions/v1/admin-users -H 'Origin: https://<app-domain>' -H 'Access-Control-Request-Method: POST'`
   → `204` with `Access-Control-Allow-Origin: https://<app-domain>`; with `Origin: https://example.com` → `403`, no CORS headers.
3. **Invite** (an address the default sender can reach): `call '{"action":"invite","opId":"<uuid>","email":"…","name":"Nombre Apellido","role":"supervisor","unitId":"<unit uuid>"}'`
   → `200`, the e-mail arrives (Supabase's English template until custom SMTP), its link passes through Auth's `/verify`
   and opens `/acceso/definir-contrasena` ("Defina su contraseña"), the person sets a password and signs in.
   Send the same body again → `duplicate: true`, no second e-mail. Another `opId` with the same e-mail → `409 email_taken`.
4. **Deactivate**: `call '{"action":"deactivate","opId":"<uuid>","userId":"<id>"}'` → `open_orders` lists the open orders
   the person supervises; signing in as that person fails ("Su cuenta no tiene acceso activo…", `user_banned`); a device
   still signed in reads nothing from that moment and cannot renew its session. `userId` = your own id → `409 self_change`.
5. **Reactivate**: same with `"reactivate"` → the person signs in again with the same password.
6. **Change e-mail**: `call '{"action":"change_email","opId":"<uuid>","userId":"<id>","email":"nuevo@…"}'` → the person
   signs in with the new address; `profiles.email` shows it; the Bitácora has "Cambió el correo de …" (old → new).
7. **In the app**: sign in as Dirección (account session) → Configuración → Usuarios: "Nuevo usuario" sends the invitation;
   the "Activo" switch deactivates (dialog → notice with the folios to reassign) and reactivates; "Editar" changes the
   e-mail. With "Simular sin conexión" (or the network off) the button, the switches and the e-mail change say
   "Necesita conexión".
8. **Logs**: Dashboard → Edge Functions → `admin-users` → Logs (errors only carry codes).

Local runs (`supabase functions serve admin-users --env-file supabase/functions/.env`) need a local stack (`supabase init` +
`supabase start`), which this repository does not set up yet.
