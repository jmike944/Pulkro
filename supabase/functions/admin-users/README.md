# Edge Function `admin-users`

Account administration for **Dirección** (Pulkro Cuadrillas, `docs/backend/architecture.md` §2 and decision 11). The app's
users screen (Configuración → Usuarios) calls it in account sessions; the demo never does.

**Status (2026-10-11):** deployed to Pulkro (`cbdzndpdpwtxbhshidyi`), version 3 (the review fixes and `resend_invite`),
`verify_jwt` on; migrations `admin_users_email_sync`, `20261011174019_admin_users_review` and
`20261011175442_admin_users_decisions` applied, suites 18–20 pass; secrets `APP_URL=http://localhost:3000` and
`APP_ORIGINS=http://localhost:3000,http://localhost:3100` until the app has its own URL. Checked from outside (version 1):
no JWT → 401, preflight from an allowed origin → 204, from any other origin → 403. Not yet exercised with a real user JWT:
the platform's `verify_jwt` gate is documented to accept the project's ES256 user tokens, while the dashboard labels the
toggle "Verify JWT with legacy secret". If the first real call answers the gateway's `401 Invalid JWT`, redeploy with
`verify_jwt` off: the function verifies the user JWT itself against the project JWKS (`createSupabaseContext`, `auth: "user"`).

| Action | Body | What it does |
|---|---|---|
| `invite` | `{ action, opId, email, name, role, unitId, title?, phone?, hue? }` | `inviteUserByEmail` (`redirectTo` = `APP_URL` + `/acceso/definir-contrasena`), then `provision_profile` **with the caller's JWT**. If the profile fails, the auth user this call created is deleted again. |
| `deactivate` | `{ action, opId, userId }` | `update_profile {active:false}` with the caller's JWT (revokes the sessions, returns `open_orders`), then bans the auth user (`ban_duration` 876000h). |
| `reactivate` | `{ action, opId, userId }` | `update_profile {active:true}`, then lifts the ban. |
| `change_email` | `{ action, opId, userId, email }` | admin `updateUserById {email, email_confirm: true}`, then `sync_profile_email` with the caller's JWT and the requested address. When the sync changes the profile it also **ends the person's sessions** (their `auth.sessions` rows, refresh tokens included, in the same transaction, as on deactivation): devices signed in with the old address cannot renew their token, and the person signs in again with the new one (from migration `admin_users_decisions`). If the database refuses the sync (any 4xx, a missing RPC included), the auth e-mail goes back to the previous one; if its outcome is unknown (no answer, 5xx) it is left as is and the same request sent again completes it; `409 email_changed` (another change of the same account came in between and won) leaves the login as that change set it. |
| `resend_invite` | `{ action, opId, userId }` | The invitation e-mail again, to the account's login address: only for an **active** profile (`404 out_of_scope` if the caller cannot see it, `409 account_inactive` if it is deactivated) whose auth account was invited and never signed in (`invited_at` set, `last_sign_in_at` empty — the rule of `invite_pending`). Then `inviteUserByEmail` (same `redirectTo`); GoTrue re-sends to an invited account that is not confirmed yet, with a new link (the latest e-mail is the one to use). Otherwise — the person already signed in, or the account is confirmed (a `change_email` confirms the new address, and GoTrue then refuses to re-invite) — `409 already_active`, whose message points to «¿Olvidó su contraseña?» on the sign-in screen (the app shows it as information, not as an error). Nothing is written in the database: no audit row, and `opId` is accepted for symmetry but not stored (each call e-mails again). |

- **Who**: `verify_jwt` on (user JWT). The function re-verifies the JWT (`@supabase/server`, project JWKS) and requires an
  **active Dirección** profile before any Auth admin call; every RPC re-checks `users.admin` in the database and audits the
  caller. The secret key is used only for `auth.admin` and to read the caller's own profile row.
- **Idempotent**: `opId` is the RPC op id. Sending the same request again (same payload) answers the stored result with
  `duplicate: true` — an invitation is not e-mailed twice (but see "Known limitations"), a deactivation is not repeated.
  `resend_invite` is the exception: it stores nothing, so every call sends the e-mail again. The ban always mirrors the
  profile's current `active` (re-checked after it is set, for two people switching the same account at once), and
  `active` in the answer is the profile's, which can differ from the request on a stale retry.
- **Response** `200`: `{ ok: true, action, duplicate, user_id, profile, open_orders?, active?, email?, invite_pending? }`;
  `resend_invite` answers `{ ok: true, action, resent: true, user_id }`.
  `profile` is the `public.profiles` row after the change (or `null` if reading it failed). `open_orders` (deactivate) lists
  the folios the person still supervises. `invite_pending` (change_email) means the person never accepted the invitation
  (invited, never signed in — also on a retry of the same request): they set a password with "¿Olvidó su contraseña?" and
  the new address (the change confirmed the new address, so GoTrue no longer re-sends that invitation: `resend_invite`
  answers `already_active`). Before any e-mail change, a pending invitation is re-sent with `resend_invite` («Reenviar
  invitación» in the person's «Editar»); `invite` with another `opId` for an address that already has an account answers
  `409 email_taken`, whose message points there (or to the «Activo» switch when the account is deactivated).
- **Errors**: `{ ok: false, code, message }` — `message` is Spanish (usted) for the person, `code` is stable:
  - refusals from the database keep its hint and status (`PTnnn` → nnn): `forbidden:users.admin`, `self_change`,
    `already_provisioned`, `auth_user_missing`, `out_of_scope`, `invalid_profile`, `op_id_reused`, `email_taken`,
    `email_changed`, `invalid_value`, …;
  - from the function: `no_session` 401, `no_profile` / `inactive` 401, `forbidden:users.admin` 403, `origin_not_allowed`
    403, `method_not_allowed` 405, `invalid_body` 400, `unknown_action` 400, `invalid_value` / `invalid_email` /
    `invalid_unit` 422, `email_taken` 409, `stale_retry` 409, `email_changed` 409, `already_active` 409 (`resend_invite`: no
    pending invitation), `account_inactive` 409 (`resend_invite` of a deactivated account), `email_not_authorized` 422,
    `rate_limited` 429,
    `auth_user_missing` 404, `invite_failed` / `email_update_failed` / `ban_failed` / `unban_failed` / `server_error` 502,
    `unavailable` 503, `payload_too_large` 413, `server_misconfigured` 500.
- **Logs** carry the action and error codes. Unexpected failures (the context setup, a profile read, the cleanup
  `deleteUser`, a ban or unban, a login put back, an exception) also log the error's name, code, status and the first 200
  characters of its message, not scrubbed: the provider's own text, which may name an address. Never tokens, keys or
  request bodies, and the function logs no addresses itself.
- **A change the person makes themself** (`supabase.auth.updateUser({ email })` and the confirmation link) does not go
  through this function: the trigger `pulkro_mirror_email_change` on `auth.users` (migration `admin_users_decisions`)
  copies it into `profiles.email` when GoTrue completes it, audited as the person's own change ("Cambió su correo de
  acceso", old → new). It ignores this function's admin update (which `sync_profile_email` copies and audits under
  Dirección) and never raises: an address another profile uses leaves the profile as it was.

## Known limitations

- **Two invitation e-mails on a retry of the same `invite`** (accepted, owner decision 2026-10-11). The op id makes
  the profile idempotent, but the e-mail is sent before it: a second request with the same `opId` that finds no profile
  yet calls `inviteUserByEmail` too. That happens when it arrives while the first is still between `inviteUserByEmail`
  and `provision_profile` (a double submit, or the app retrying after a lost answer within that window), and also when
  the first never got to `provision_profile` at all — the function crashed, timed out or was stopped between the e-mail
  and the profile: the auth user it created stays without a profile, and the app's retry of the unknown outcome (same
  `opId`) e-mails again. GoTrue re-sends to the account the first call created, so the person gets two invitations; one
  account and one profile result (the retry provisions it, or its `provision_profile` answers `duplicate`). Each send
  issues a new link, so the earlier e-mail's link may no longer work: the person uses the latest. No reservation step is
  added for this (it would need a migration and a redeploy). The app never promises that a retry sends no second e-mail:
  after an unknown outcome the users screen says «si a la persona le llegan dos correos de invitación, que use el más
  reciente» (`INVITE_UNKNOWN_MESSAGE`).

## Before deploying

0. Type-check: `npm run check:functions` (scripts/check-edge-functions.mjs; no Deno needed). The app's `tsc` excludes
   `supabase/functions`, and neither `supabase functions deploy` nor the MCP `deploy_edge_function` type-checks: this is the
   only check of the function's types. It also fails when the pinned `npm:@supabase/supabase-js@…` differs from the
   version in `package.json`.
1. Migrations: `supabase/migrations/20261011144326_admin_users_email_sync.sql` (adds `sync_profile_email`; applied), then,
   in this order, `20261011174019_admin_users_review.sql` (adds its `p_email`) and
   `20261011175442_admin_users_decisions.sql` (the sync ends the person's sessions; the self-service mirror trigger), then
   run `supabase/tests/00`, `18`, `19` and `20`. Apply them **before** deploying version 2 of the function, which sends
   `p_email`: against the old signature PostgREST answers 404 (`PGRST202`), `change_email` answers `502 server_error` and
   puts the login back (a definite refusal). Both migrations keep the old two-argument call working, so version 1 runs
   fine after them. The other actions need neither (`resend_invite` writes nothing in the database).
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

Without Docker running, add `--use-api` (the bundle is built server-side). `verify_jwt` stays **on** (the default). Pass
`--no-verify-jwt` only for the fallback in "Status" (the gateway answers `401 Invalid JWT` to a valid ES256 user token):
the function then verifies the user JWT itself against the project JWKS and still requires an active Dirección.
Dependencies are pinned in the imports (`npm:@supabase/server@1.9.1`, `npm:@supabase/supabase-js@2.117.2`).
Alternatively, deploy with the Supabase MCP `deploy_edge_function` (name `admin-users`, entrypoint `index.ts`,
`verify_jwt: true` — `false` only for that same fallback —, the file `index.ts`).

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
   signs in with the new address; `profiles.email` shows it; the Bitácora has "Cambió el correo de …" (old → new); a device
   where the person was signed in cannot renew its session (sign in again with the new address).
7. **Resend an invitation**: invite someone (step 3) and, before they accept,
   `call '{"action":"resend_invite","opId":"<uuid>","userId":"<id>"}'` → `200 {resent: true}` and a new e-mail (its link
   works; the earlier one may not). After they set their password and sign in, the same call → `409 already_active`. For a
   deactivated account → `409 account_inactive`.
8. **In the app**: sign in as Dirección (account session) → Configuración → Usuarios: "Nuevo usuario" sends the invitation;
   the "Activo" switch deactivates (dialog → notice with the folios to reassign) and reactivates; "Editar" changes the
   e-mail and, for an active account, has «Reenviar invitación» (toast when it goes out; for an account already in use, a
   blue notice pointing to «¿Olvidó su contraseña?»). With "Simular sin conexión" (or the network off) the button, the
   switches, the e-mail change and «Reenviar invitación» say "Necesita conexión".
9. **Logs**: Dashboard → Edge Functions → `admin-users` → Logs (codes; unexpected failures add the error's name, status and
   the start of its message: see "Logs" above).

Local runs (`supabase functions serve admin-users --env-file supabase/functions/.env`) need a local stack (`supabase init` +
`supabase start`), which this repository does not set up yet.
