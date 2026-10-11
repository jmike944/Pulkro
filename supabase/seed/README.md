# Demo dataset (`demo.sql`)

The app's demo dataset (`src/lib/seed.ts` → `generateSeed(now)`, the same data the prototype shows) mapped to the
database schema, so the backend can be explored with realistic data before real accounts exist. The owner approved
loading it into the project; it is fully tagged and leaves in **one call**.

| File | Role |
|---|---|
| `scripts/build-demo-seed.mjs` | Generator: transpiles `seed.ts` / `permissions.ts` with the installed `typescript`, runs `generateSeed`, maps every entity to the schema, asserts every derivation, writes `demo.sql` |
| `supabase/seed/demo.sql` | Generated load script: 7 load chunks (one transaction each) + 1 read-only verification chunk |
| `supabase/migrations/20261011050457_demo_data_registry.sql` | `private.demo_rows` (registry), `private.demo_uuid(app_id)`, `private.drop_demo_data()` |

## Load

Prerequisite: the migration `20261011050457_demo_data_registry` is applied and no demo is loaded
(`select count(*) from private.demo_rows` = 0).

1. Regenerate so the dataset is anchored to today: `node scripts/build-demo-seed.mjs`
   (`DEMO_TZ` defaults to `America/Monterrey`, the wall clock the crews work on; `DEMO_NOW=<ISO>` pins "now").
2. Run the chunks **in order, as the database owner** (`postgres`): SQL editor or Supabase MCP `execute_sql`, one chunk
   per call (each ≤ 45 KB), or the whole file with `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/seed/demo.sql`.
3. The last chunk only reads: every row must say `ok = true` (row counts **and** an md5 fingerprint of each table's
   content, computed by the generator from the app dataset itself).

Each chunk registers what it inserts in the same statement, so a load that stops halfway is removed exactly like a
complete one. The data is a snapshot anchored to the generation time (live jornadas "in progress now", work "later
today"): unlike the app's local seed it does not re-anchor itself. To refresh it: drop, regenerate, load again.

### What was loaded (2026-10-11, anchor 2026-10-10 23:26 America/Monterrey)

| Table | Rows | | Table | Rows |
|---|---|---|---|---|
| auth.users | 11 | | jornada_notes | 741 |
| units | 3 | | incidents | 90 |
| profiles | 11 | | post_sale_cases | 18 |
| workers | 42 | | case_events | 51 |
| clients | 17 | | order_closures | 264 |
| sites | 20 | | reports | 262 |
| service_types | 8 | | report_shares | 295 |
| materials | 12 | | surveys | 222 |
| orders | 302 | | survey_tokens | 222 |
| jornadas | 420 | | audit_log | 855 |
| crew_changes | 300 | | photos | 0 (see below) |
| jornada_checks | 741 | | **registry** | **4 907** |

Orders each persona sees through RLS = the app's `canSeeOrder`: Daniela Ortiz Peña (supervisor) 53 · Mariana Treviño
Ríos (Administración, MTY) 154 · Alejandro Garza Lozano (Dirección) 302; their jornadas, checks, incidents, closures,
reports, shares, cases, surveys and bitácora match the app as well (Dirección sees no survey tokens, by design).

## Remove (one step)

```sql
select private.drop_demo_data();
```

Run it as the owner (SQL editor / MCP). It returns the rows deleted per table. Inside the caller's transaction, all or
nothing, children first, it deletes:

- every registered row (registry: `private.demo_rows`, one row per demo row);
- whatever only exists because of a demo order (its whole subtree, including rows created later through the RPCs),
  bitácora entries about demo orders, units or accounts, `private.order_assignments` of demo orders and the op journal
  (`private.sync_ops`) of demo accounts — history tables through their vetted escape hatch (`pulkro.history_purge`,
  switched on transaction-locally and restored before the function returns);
- the 11 demo accounts in `auth.users` (sessions, identities, factors… cascade);
- and, when `orders`, `incidents`, `post_sale_cases` or `audit_log` end up empty, restarts their folio sequence / identity.

It refuses, deleting nothing, when:

- **`PT409 demo_in_use`** — real data still references demo data (a real order for a demo client, a real account in a
  demo unit, a real order listing a demo material, a real crew with a demo worker…; the error's detail names the folios).
  Real rows are never deleted: reassign or delete them first.
- **`PT409 demo_storage_objects`** — evidence files were uploaded to a demo order (the seed uploads none). Delete them
  through the Storage API (Dashboard → Storage → `evidencias` → `orders/<order id>`) and run again, or call
  `private.drop_demo_data(p_delete_storage_rows => true)` to drop only their metadata rows (the files stay as orphans).

Dry run: `begin; select private.drop_demo_data(); …checks…; rollback;` — then re-run the folio-sequence block at the end
of chunk 7 of `demo.sql`: sequences are **not** transactional, so a rolled-back drop leaves them restarted at 1.

The function is `SECURITY DEFINER` in the non-exposed `private` schema with `search_path = ''` and no `EXECUTE` for
`anon`, `authenticated` or `service_role`; the registry has RLS on, no policies and no grants (advisor INFO 0008, like
`private.sync_ops`).

## Choices

**Accounts.** One `auth.users` row per demo persona (11), **no password** (`encrypted_password = ''`), e-mail
`firstname.lastname@demo.pulkro.test` — `.test` is a reserved TLD (RFC 2606/6761), so no invitation, recovery or magic
link can ever reach a mailbox. Marked `email_confirmed_at` (a sign-up with the same address cannot claim them),
`app_metadata.pulkro_demo = true`, never invited (`invited_at` null). No `auth.identities`: RLS and the access-token hook
only read `public.profiles`. Nobody can sign in as a demo persona. Client contact e-mails (the seed's
`contacto.*@ejemplo.mx`, a real domain) and e-mail share recipients use the same reserved domain; phones stay as the seed
makes them, non-dialable (`+52 81 0000 xxxx`, Saltillo clients `+52 844 0000 xxxx`). Client company names are the real
Pulkro clients (approved by the owner).

**Photos — not loaded.** The app's 1 816 seeded photos are procedural scene illustrations drawn by the client, not files,
and a `photos` row must point at a stored object (`add_photo` refuses otherwise; `bytes`/`mime_type` come from the
object). Faking objects or rows would break that invariant, so demo orders have no evidence rows: `reports.photo_ids` is
empty and the report snapshots list no photos, as the server does for photos that do not exist. Validated closures keep
their recorded state; re-validating a demo order after reopening it would need the evidence exception.

**Historical times.** `created_at`/`updated_at` (and `audit_log.at`) are stamped with the server clock by the
`stamp_insert` triggers. Each chunk disables exactly those triggers on the tables it loads **inside its own transaction**
and re-enables them before `COMMIT` (`ALTER TABLE … DISABLE TRIGGER stamp_insert`), so other sessions never see them
off; the verification chunk checks none is left disabled. Everything else stays on: foreign keys, CHECKs, append-only
triggers (the load only inserts) and `track_scope` (`orders.scope_changed_at` = load time). Follow-ups the seed dates
after "now" (11 future order creations of upcoming work, their crew assignments, one incident resolution) are capped at
the anchor: a server-side time cannot be in the future.

**Mapping.** Ids: `private.demo_uuid('<app id>')` = `uuid_generate_v5('010bd357-25ea-5b0b-9a32-47d44503f380', '<app id>')`
(`'sup_daniela'`, `'ord_0012'`, `'jor_00031:entrada'`…), deterministic across reloads. Folios are the app's
(`OS-24121…OS-24422`, `INC-0301…`, `PV-0041…`); the folio sequences continue after the highest (`OS-24423`, `INC-0391`,
`PV-0059`). The bitácora is derived from the loaded rows exactly as the app writes it (orders older than 60 days have no
detail, like in the app) and its ids follow time. Report snapshots are rebuilt with the shape `generate_report` stores
(order status as of version 1, `finalizada`). Closures with conformity `firma` need a signature: a generic pen squiggle
(the same placeholder for all), nobody's signature. Survey tokens are random 256-bit values generated by the database at
load time — they are never written to the repository. `demo.sql` is compact (epoch seconds, numeric ids, small
dictionaries, derived values) so each chunk fits one `execute_sql` call; the generator asserts every derivation against
the dataset and the fingerprints prove the loaded content equals it.

## Interactions to know

- **Unit codes** `MTY`, `APO`, `SAL` belong to the demo units. Owner decision (2026-10-11): the pilot starts on a clean
  project — drop the demo, then bootstrap the real Dirección with the §2 snippet of `docs/backend/architecture.md`. No
  real account goes into a demo unit (it would block the drop with `demo_in_use` until moved).
- **Client contact e-mails** stay on `@demo.pulkro.test` (owner decision, 2026-10-11): a report or survey sent from the
  demo can never reach a real mailbox.
- **Folios** of real orders created while the demo is loaded continue after the demo's (`OS-24423`…).
- **Database tests**: all suites pass with the demo loaded — the shared prelude copies `private.demo_rows` into `t_demo`
  and the visibility checks skip those rows. They still lock what they touch while they run (see `supabase/tests/README.md`).
