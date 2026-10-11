# Database tests

Self-contained SQL tests for the Pulkro Cuadrillas backend (schema, RLS, grants, Storage policies, business-rule RPCs,
auth hook, sync guarantees). Every file:

- runs inside **one transaction that ends in `rollback;`** — fixtures (including `auth.users` / `auth.sessions` rows and
  `storage.objects`) never persist;
- switches persona exactly like PostgREST does: `set local role authenticated` (or `anon`) plus
  `request.jwt.claims` → `auth.uid()` (helpers `pg_temp.as_user(uuid)`, `pg_temp.as_anon()`, `pg_temp.as_owner()`);
- **fails loudly**: the first wrong allow/deny, wrong SQLSTATE/hint or broken rule raises `FAIL [label] …` and aborts;
- prints a single row `ok | <file>` when every check passed.

| File | Covers |
|---|---|
| `00_schema_and_grants.sql` | RLS on every table; anon has no table access; authenticated is SELECT-only; no default grants; every function pins `search_path`; no SECURITY DEFINER in `public`; RPC wrapper/implementation pairs, their EXECUTE grants and the op-args binding of every mutation wrapper; global default revoking `EXECUTE` from `PUBLIC`; append-only tables (reject UPDATE/DELETE/TRUNCATE triggers, service_role read + append only); `private.order_assignments` unreachable; FK indexes; Storage bucket + policies; the permission matrix (= `src/lib/permissions.ts`, 19 × 3); auth hook output |
| `01_rls_read_matrix.sql` | SELECT visibility of all 22 tables + Storage objects for Dirección, Administración (2 units), 3 supervisors, a deactivated account, an account without profile and anon; scope moving with a reassignment |
| `02_write_paths.sql` | Direct INSERT/UPDATE/DELETE refused on every table for every role (22 × 3 × 5); internal helpers not callable; Storage upload matrix (who may upload which kind of evidence to which order), no overwrite, no delete |
| `03_orders_scheduling.sql` | `create_order`, `update_order` (operational vs general fields, reassignment history), `cancel_order`, `assign_crew`, `set_order_status`, `schedule_jornadas` (tombstones, empty list refused while nothing was executed), idempotent retries, op-id reuse (other action or other payload), former supervisor → `order_reassigned` |
| `04_field_execution.sql` | `check_in` / `check_out` (role, scope, sequence, duplicates, device-time bounds, location justification), bitácora, desglose, photos (object must exist, path rules, integrity warnings, soft delete → `photo_deleted`, references not on the server yet → `parent_missing`), op id replayed for another jornada, incidents and the status they drive, frozen closed orders |
| `05_closure_reports.sql` | Closure blockers (open jornadas, blocking incidents, ANTES/DESPUÉS or authorized exception), conformity, closure + report versions, reopen → re-validation before a new report, sharing never claims delivery, archive rules, append-only history (UPDATE, DELETE and TRUNCATE refused; vetted purge path) |
| `06_postventa_survey.sql` | Cases (who, owner rules, timeline), survey links (256-bit tokens; short or low-entropy tokens refused), the public anon survey (read, answer once, staff cannot answer), manual capture |
| `07_catalogs_users.sql` | Units, clients, sites, workers, service types, materials per role/unit; user provisioning, self-protection, unit moves (refused with open orders/cases), clients with orders keep their unit, deactivation (RLS + session revocation + hook + open orders reported) and reactivation; self-service phone; auth users with a profile cannot be deleted |
| `08_sync_idempotency.sql` | Op-id idempotency, no hijacking, failed ops retryable, server time stamping, `row_version`, tombstones, `sync_reconcile` scope-loss reconciliation |
| `09_review_findings.sql` | **Adversarial review (2026-10-11) — regression suite, passes since migrations `review_history_and_defaults`, `review_sync_and_visibility`, `review_business_rules`.** One isolated block per finding (F01–F14: closure of never-executed orders, reschedule `day_index` collision, scope gain in the incremental pull (`scope_changed_at`, references, client unit moves), sync conflicts told apart from scope loss (`jornada_rescheduled`, `order_reassigned`, `parent_missing`), client/supervisor unit moves with open work, op ids bound to their payload, bounded device times, post-closure incident edits, 256-bit survey tokens, status derived from the jornadas, append-only DELETE/TRUNCATE, no default `EXECUTE` to `PUBLIC`, index-friendly visibility policies). Each block runs in a subtransaction that is always rolled back; the file raises `FAIL [review findings still open]` listing any regression and prints `ok` otherwise. F03 uses `ALTER TABLE … DISABLE TRIGGER` (rolled back) to backdate rows, so it holds `ACCESS EXCLUSIVE` locks on `clients`, `sites`, `jornadas` and `orders` while it runs |
| `10_review_round2.sql` | **PR #9 review (2026-10-11), migration `review_pr9_codex`.** A closed jornada keeps its crew (`jornada_closed`, in-progress days still editable); the blocking flag of an open incident moves the order in and out of `con_incidencia` (other blockers kept, resolved incidents ignored, change audited); deleted photos and resolved incidents refused on retry; cases resolved/closed only with a resolution ≥ 10 characters (new cases start open, reopening and notes unaffected, table check as backstop); a worker moved to another unit stays readable for the old unit's supervisor and Administración through the crew (not for other supervisors) and is no longer assignable there. The two-session races (re-read under the order lock, `FOR SHARE` on validated rows) cannot interleave inside one transaction, so those checks pin the code shape |
| `11_review_round3.sql` | **PR #9 review, cubic (2026-10-11), migration `review_pr9_cubic`.** Op id ↔ request digest fails closed (a stored op without digest and a call without the wrapper's binding are refused against each other; two unbound calls stay idempotent); service hours 0.5–24 in the RPC and the table; breakdown lines need a named activity and numeric hours; survey tokens with a 16-character cycle or a 37-character period refused while 500 random 256-bit tokens pass; incident resolution fields all-or-nothing; a conformity method needs the client's name |
| `12_review_round4.sql` | **PR #9 review, cubic (2026-10-11), migration `review_pr9_cubic_wrappers`.** Every binding wrapper digests with SHA-256 (stored digest is 64 hex characters); every RPC wrapper maps invalid input values (NULL into NOT NULL, CHECK, smallint overflow) to `PT422 invalid_value` while duplicates keep `23505` and business errors keep their hint; checking out one day while another is in progress keeps the order `en_ejecucion` |
| `13_review_round5.sql` | **Adversarial pass on the PR #9 fixes, migration `review_pr9_followups`.** `assign_crew` on a named jornada answers `parent_missing` / `jornada_order_mismatch` / `jornada_rescheduled`; an open incident cannot carry resolution text; reopening a case whose owner moved unit is refused unless reassigned in the same patch; a supervisor moved to another unit cannot reopen their closed order; `crew_worker_ids` materializes the visible orders |
| `14_review_round6.sql` | **PR #9 review, Codex round 2, migration `review_pr9_codex_round2`.** Reassigning an order moves its open cases (not the closed ones) to the new supervisor with a timeline entry and audit; reopening a case without a 10+ character reason is refused, then the owner is re-checked; flagging Reprogramada or confirming dates under a blocking incident keeps `con_incidencia` and sets the status to resume; a supervisor moved to another unit stays readable for the old unit's Administración and their former orders' supervisor, not for an unrelated supervisor; `upsert_site` locks its clients `FOR SHARE` |
| `15_review_round7.sql` | **PR #9 review, cubic round 2, migration `review_pr9_cubic_round2`.** `update_incident` refuses an empty patch, a null `jornada_id` and another order's jornada; while the demo dataset is loaded, `drop_demo_data` refuses (`demo_in_use`, nothing deleted) when a real order names a demo material or a real crew names a demo worker — the fixture also holds an incident and a case so no folio sequence could be reset even on a regression |

## Sources and generation

The files in this folder are **generated**: the shared prelude (helpers + base fixtures: units U1/U2, staff DIR, ADM1,
ADM2, SUP1–3, INACT, NEWBIE, clients, sites, workers) lives in `src/_prelude.sql` and each test body in
`src/NN_*.sql`. After editing a source run:

```bash
node scripts/build-db-tests.mjs
```

## Running

**Today — Supabase MCP (`execute_sql`).** Paste the whole content of one generated file into a single `execute_sql`
call against the project. The call returns `[{"result":"ok","test":"…"}]` or an error whose message starts with
`FAIL [label]`. Run the files in order 00 → 15; each one is independent and must print `ok`.

**Later — psql / Supabase CLI** (any of them works the same way, the files only need a Postgres connection with the
`postgres` role):

```bash
# against a local stack (supabase start) or a branch / staging project
for f in supabase/tests/[0-9][0-9]_*.sql; do
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$f" || exit 1
done
```

Notes:

- The tests need the `postgres` role (they insert fixtures into `auth.users`, switch roles and inspect catalogs).
- Functions created by `postgres` are no longer executable by `PUBLIC` (global default privilege, migration
  `review_history_and_defaults`). The prelude therefore grants `EXECUTE` on its own `pg_temp` helpers to `public` so the
  `authenticated`/`anon` personas can call them; a test that defines more `pg_temp` functions must grant them too (09 does).
- Retries must resend the **same** payload: an op id is bound to a digest of its arguments (`op_id_reused` otherwise).
- Sequences are not transactional: a run advances the folio sequences (`private.order_folio_seq`, …) and the
  `audit_log` identity even though every row is rolled back. That only creates gaps in folio numbers. On an empty
  database you can reset them with `select setval('private.order_folio_seq', 1, false)` (same for
  `incident_folio_seq`, `case_folio_seq` and `public.audit_log_id_seq`) — the test runs on 2026-10-11 did exactly that
  (guarded so it only runs while `orders`, `incidents`, `post_sale_cases` and `audit_log` are empty).
- The demo dataset (`supabase/seed/`) may be loaded: every demo row is registered in `private.demo_rows`, and the prelude
  copies that registry into `t_demo` so the visibility checks (`pg_temp.seen`, audit lists) look at the fixtures only.
- Run them against a branch or a staging project. The rollback keeps fixtures out of the data, but the files still lock
  what they touch for their whole duration — row locks everywhere, and `09` (F03) takes `ACCESS EXCLUSIVE` locks on
  `clients`, `sites`, `jornadas` and `orders`, which blocks every read and write of those tables until it ends. Against a
  production database run them only while nobody uses it (as on 2026-10-11, before the pilot); once real users are on
  it, use staging.
