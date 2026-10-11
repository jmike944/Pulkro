/**
 * Pull engine: the read path of an account session (architecture §8, decision 9). It reads the tables as the signed-in user
 * (plain selects: RLS decides the rows) and merges them into the on-device store (merge.ts), never overwriting unsent work.
 *
 *  - First load: catalogs whole; orders that are open or changed in the last 6 months (every role: decision 9 gives
 *    Dirección/Administración 6 months and supervisors every open order + 6 months of closed ones — "open or changed in
 *    6 months" covers both), each with its whole subtree by `order_id`; Bitácora lines without an order from the same window.
 *  - Then per table: keyset pages on (updated_at, pk) from the table's cursor minus a 60 s overlap (transactions that
 *    committed late); rows already applied at the same updated_at are skipped (`seen`). A table's cursor only advances
 *    together with the page it read (one setState), so a failure re-reads from the last applied page.
 *  - Scope gain: an order new to the device, or whose scope_changed_at is newer than the orders cursor, and the order of any
 *    child row whose parent the device lacks, gets its subtree fetched by order_id (queued in `pull.subtrees`, persisted,
 *    so an interrupted pull resumes). Referenced clients, sites, people, workers… the device lacks are fetched by id.
 *  - A subtree read in full replaces what the device has of that order (merge.ts `whole`): records whose operation was
 *    discarded from the queue, or that the server refused, go. Catalog / people records whose edit was discarded are read
 *    again by id (`pull.refetch`).
 *  - Scope loss: sync_reconcile tells which local ids are still visible; the rest go (orders with their records).
 *  - Offline → nothing is tried; network failure → the data stays, retried later; an expired session, no session or another
 *    account's session in the browser → stop, flag `session.needsReauth` ("Vuelva a entrar"), keep everything on the device;
 *    a deactivated profile → also end the Supabase session and flag `session.noAccess` (the shell blocks the app).
 *  - verifyAccount: the same session check outside a pull (store bootstrap, auth events, /login).
 */
import { isAuthApiError, isAuthRetryableFetchError, isAuthSessionMissingError } from "@supabase/supabase-js";
import type { AppState } from "@/lib/store";
import { endSessionOnDevice, getSupabaseBrowserClient, getTokenClient, isSupabaseConfigured, type SupabaseBrowserClient } from "@/lib/supabase/client";
import { OPEN_STATUSES } from "@/lib/status";
import type { DataSnapshot, Role } from "@/lib/types";
import { noteServerTime } from "./clock";
import { mapProfile } from "./map";
import { catalogKey, dropRows, mergeRows, missingRefs, pendingIndex, type CatalogTable, type Drops } from "./merge";
import { usePullStatus } from "./status";
import { stillWriter, syncHalted } from "./writer";
import {
  CATALOG_TABLES,
  COLUMNS,
  ORDER_TABLES,
  RECONCILED_TABLES,
  SYNC_TABLES,
  isUuid,
  pkOf,
  type Row,
  type RowOf,
  type RowsByTable,
  type SyncTable,
} from "./tables";

/* ───────────── persisted state (session.pull) ───────────── */

export type PullCursor = {
  /** Highest updated_at applied (raw server value). */
  at: string;
  /** Rows applied inside the overlap window: id → updated_at, so the overlap does not apply them twice. */
  seen: Record<string, string>;
};

export type PullState = {
  userId: string;
  /** Role and unit the data was loaded for: a change means a full re-sync. */
  role: Role;
  unitId: string;
  /** Start of the first-load window. */
  since: string;
  /** The first load (catalogs + orders in the window) is on the device. */
  loadedAt?: string;
  cursors: Partial<Record<SyncTable, PullCursor>>;
  /** Orders whose whole subtree must still be fetched (scope gain, first load, held back while they had unsent work). */
  subtrees: string[];
  lastPullAt?: string;
  /** When the last successful pull started: everything the server had committed before this moment is on the device. */
  lastPullFrom?: string;
  reconciledAt?: string;
  ordersReconciledAt?: string;
  /**
   * Catalog / people records to read again by id (an edit of them was discarded from the queue): the server's row replaces
   * the device's, and a record the server does not return is removed.
   */
  refetch?: Partial<Record<CatalogTable, string[]>>;
};

/* ───────────── tuning ───────────── */

const PAGE = 1000;
const OVERLAP_MS = 60_000;
const WINDOW_DAYS = 183; // ≈ 6 months (decision 9)
const ID_CHUNK = 100; // ids per `in.(…)`: keeps the URL ≈ 4 kB
const SUBTREE_CHUNK = 60; // orders per subtree round
const RECONCILE_CHUNK = 2000; // sync_reconcile limit
const FULL_RECONCILE_MS = 12 * 60 * 60_000;
const ORDERS_RECONCILE_MS = 10 * 60_000;
const MIN_AUTO_GAP_MS = 15_000; // focus / visibility bursts
const MISS_TTL_MS = 30 * 60_000; // a referenced id RLS did not return is not asked again for this long
const EPOCH = "1970-01-01T00:00:00+00:00";

/* ───────────── errors ───────────── */

/** "auth": a JWT problem a refresh may fix. "reauth": no session / another account's (sign in again). "inactive": no active profile. */
type PullErrorKind = "network" | "auth" | "reauth" | "inactive" | "server" | "aborted";

/** `message` is what the person reads; `detail` (server code and text) goes to the console only. */
class PullError extends Error {
  constructor(
    readonly kind: PullErrorKind,
    message: string,
    readonly detail?: string,
  ) {
    super(message);
    this.name = "PullError";
  }
}

const NETWORK_TEXT = "Sin conexión con el servidor: se muestran los datos guardados en este dispositivo.";
const SERVER_TEXT = "No se pudieron actualizar los datos del servidor. Se reintentará en unos minutos.";

type PgError = { message: string; code?: string; details?: string | null; hint?: string | null };

const NETWORK_RE = /failed to fetch|fetch failed|networkerror|load failed|network request failed|aborterror|the user aborted/i;

function classify(error: PgError, status: number): PullError {
  if (status === 0 || NETWORK_RE.test(error.message)) return new PullError("network", NETWORK_TEXT);
  if (status === 401 || /^PGRST30[0-3]$/.test(error.code ?? "") || /jwt/i.test(error.message)) return new PullError("auth", error.message);
  return new PullError("server", SERVER_TEXT, `${error.code || status}: ${error.message}`);
}

/* ───────────── a loosely typed query builder (one code path for every table) ───────────── */

type Result = { data: unknown; error: PgError | null; status: number };
type Builder = PromiseLike<Result> & {
  gte(column: string, value: string): Builder;
  lt(column: string, value: string): Builder;
  or(filters: string): Builder;
  in(column: string, values: readonly string[]): Builder;
  is(column: string, value: null): Builder;
  eq(column: string, value: string): Builder;
  order(column: string, options?: { ascending?: boolean }): Builder;
  limit(count: number): Builder;
  range(from: number, to: number): Builder;
  maybeSingle(): PromiseLike<Result>;
};
type LooseClient = { from(table: string): { select(columns: string): Builder } };

async function run<T>(query: PromiseLike<Result>): Promise<T> {
  let res: Result;
  try {
    res = await query;
  } catch (e) {
    throw new PullError("network", NETWORK_TEXT, e instanceof Error ? e.message : String(e));
  }
  if (res.error) throw classify(res.error, res.status);
  return res.data as T;
}

/* ───────────── context ───────────── */

/**
 * The store as the engine sees it (store.ts passes zustand's getState / setState). Returning the state itself from an update
 * is a no-op (no listeners, no IndexedDB write).
 */
export type PullStore = {
  getState: () => AppState;
  setState: (fn: (st: AppState) => Partial<AppState>) => void;
};

type Ctx = {
  store: PullStore;
  /** The shared client: the browser's session (read, refreshed). */
  client: SupabaseBrowserClient;
  /** Tables and RPCs of this cycle: bound to the token checkSession verified (getTokenClient). */
  data: SupabaseBrowserClient;
  db: LooseClient;
  userId: string;
};

/** Referenced ids RLS did not return (`table:id` → retry after), for the account in `missesOf`. */
const misses = new Map<string, number>();
let missesOf = "";

const dataOf = (s: AppState): DataSnapshot => ({
  units: s.units, users: s.users, workers: s.workers, clients: s.clients, sites: s.sites, serviceTypes: s.serviceTypes,
  materials: s.materials, orders: s.orders, jornadas: s.jornadas, photos: s.photos, incidents: s.incidents, reports: s.reports,
  cases: s.cases, surveys: s.surveys, audit: s.audit,
});

const ms = (value: string) => Date.parse(value);
const shift = (value: string, delta: number) => new Date(ms(value) + delta).toISOString();
const quoted = (value: string) => `"${value.replace(/"/g, '\\"')}"`;
const pkValue = (table: SyncTable, row: RowOf<SyncTable>) => String((row as Record<string, unknown>)[pkOf(table)]);

/**
 * The account session this run belongs to is still the one on the device, and its Supabase session is still this
 * account's. Once re-authentication is due (the auth listener saw another account's session: an invite / recovery link
 * opened here) nothing more is written: the requests of a run already under way would carry that other account's JWT.
 */
const sameSession = (st: AppState, userId: string) =>
  !syncHalted() &&
  st.session.mode === "supabase" &&
  st.session.signedIn &&
  !st.session.needsReauth &&
  st.session.userId === userId &&
  st.session.pull?.userId === userId;

/* ───────────── commits ───────────── */

type CommitOptions = {
  /** The page this batch came from: its table's cursor advances with it. */
  page?: { table: SyncTable; rows: RowOf<SyncTable>[] };
  /** Orders rows newer than this (ms) changed scope since the last pull: fetch their subtree. */
  scopeSince?: number;
  /** Fetch the subtree of every order in the batch (first load). */
  subtreeAll?: boolean;
  /** Subtrees fetched in full by this batch. */
  subtreesDone?: string[];
  /**
   * When the batch was read: an order (or record) whose queue items reached the server after that is treated as still
   * unsent — its rows are held and its subtree read again — so a stale read never wipes what was just sent.
   */
  readAt?: string;
};

const nowIso = () => new Date().toISOString();

/** Adds held catalog / people ids to `pull.refetch` (read again by id once their edits are no longer unsent). */
function withRefetch(refetch: PullState["refetch"], held: Partial<Record<CatalogTable, Set<string>>> | undefined): PullState["refetch"] {
  if (!held || !Object.values(held).some((ids) => ids?.size)) return refetch;
  const out: NonNullable<PullState["refetch"]> = { ...(refetch ?? {}) };
  for (const [t, ids] of Object.entries(held) as [CatalogTable, Set<string>][]) out[t] = [...new Set([...(out[t] ?? []), ...ids])];
  return out;
}

/** Fetches what the batch references and the device lacks, then merges batch + references and moves the cursor, atomically. */
async function commit(ctx: Ctx, batch: RowsByTable, opts: CommitOptions = {}) {
  const refs = await fetchRefs(ctx, batch);
  const combined: RowsByTable = { ...refs };
  for (const t of SYNC_TABLES) {
    const rows = batch[t] as RowOf<SyncTable>[] | undefined;
    if (rows?.length) (combined as Record<string, RowOf<SyncTable>[]>)[t] = [...((combined[t] as RowOf<SyncTable>[] | undefined) ?? []), ...rows];
  }
  let aborted = false;
  ctx.store.setState((st) => {
    if (!sameSession(st, ctx.userId)) {
      aborted = true;
      return st;
    }
    const pull = st.session.pull!;
    const pending = pendingIndex(st.sync.queue, opts.readAt);
    // A subtree read in full is the server's whole truth for that order (merge.ts: `whole`).
    const merged = mergeRows(dataOf(st), combined, pending, { whole: opts.subtreesDone });
    const subtrees = new Set(pull.subtrees);
    const done = new Set(opts.subtreesDone ?? []);
    for (const id of done) if (!merged.held.has(id)) subtrees.delete(id);
    // Orphans of a subtree that was just read whole are inconsistent leftovers: do not loop on them.
    for (const id of merged.orphans) if (!done.has(id)) subtrees.add(id);
    for (const id of merged.held) if (isUuid(id)) subtrees.add(id);
    for (const r of batch.orders ?? []) {
      const scopeMoved = opts.scopeSince !== undefined && ms(r.scope_changed_at) >= opts.scopeSince;
      if (!done.has(r.id) && (opts.subtreeAll || merged.added.has(r.id) || scopeMoved)) subtrees.add(r.id);
    }
    const cursors = { ...pull.cursors };
    if (opts.page?.rows.length) {
      const { table, rows } = opts.page;
      const prev = cursors[table];
      const last = rows[rows.length - 1] as { updated_at: string };
      const at = prev && ms(prev.at) > ms(last.updated_at) ? prev.at : last.updated_at;
      const floor = ms(at) - OVERLAP_MS;
      const seen: Record<string, string> = {};
      for (const [id, u] of Object.entries(prev?.seen ?? {})) if (ms(u) >= floor) seen[id] = u;
      for (const r of rows) {
        const u = (r as { updated_at: string }).updated_at;
        if (ms(u) >= floor) seen[pkValue(table, r)] = u;
      }
      cursors[table] = { at, seen };
    }
    return {
      ...(merged.changed ? merged.data : {}),
      // A catalog / people row held for its unsent edit is read again by id later: the cursor moves past it now.
      session: { ...st.session, pull: { ...pull, cursors, subtrees: [...subtrees], refetch: withRefetch(pull.refetch, merged.heldCatalog) } },
    };
  });
  if (aborted) throw new PullError("aborted", "La sesión cambió durante la descarga.");
}

/** Referenced records the device lacks (§8 step 2), a few levels deep (order → client → unit). */
async function fetchRefs(ctx: Ctx, batch: RowsByTable): Promise<RowsByTable> {
  const out: RowsByTable = {};
  const data = dataOf(ctx.store.getState());
  for (let round = 0; round < 3; round++) {
    const probe: RowsByTable = { ...batch };
    for (const t of CATALOG_TABLES) {
      const extra = out[t] as RowOf<SyncTable>[] | undefined;
      if (extra?.length) (probe as Record<string, unknown[]>)[t] = [...((batch[t] as unknown[] | undefined) ?? []), ...extra];
    }
    const need = missingRefs(data, probe);
    let asked = false;
    for (const t of CATALOG_TABLES) {
      const now = Date.now();
      const ids = (need[t] ?? []).filter((id) => (misses.get(`${t}:${id}`) ?? 0) < now);
      if (!ids.length) continue;
      asked = true;
      const rows: RowOf<SyncTable>[] = [];
      for (let i = 0; i < ids.length; i += ID_CHUNK) {
        const chunk = ids.slice(i, i + ID_CHUNK);
        rows.push(...(await run<RowOf<SyncTable>[]>(ctx.db.from(t).select(COLUMNS[t]).in("id", chunk))));
      }
      const got = new Set(rows.map((r) => (r as { id: string }).id));
      for (const id of ids) if (!got.has(id)) misses.set(`${t}:${id}`, now + MISS_TTL_MS);
      (out as Record<string, unknown[]>)[t] = [...((out[t] as unknown[] | undefined) ?? []), ...rows];
    }
    if (!asked) break;
  }
  return out;
}

/* ───────────── reads ───────────── */

/** One keyset page of `table` from `lower` (inclusive), after `after` within the same run. */
function page(ctx: Ctx, table: SyncTable, lower: string | undefined, after: { at: string; id: string } | undefined) {
  const pk = pkOf(table);
  let q = ctx.db.from(table).select(COLUMNS[table]);
  if (lower) q = q.gte("updated_at", lower);
  if (after) q = q.or(`updated_at.gt.${quoted(after.at)},and(updated_at.eq.${quoted(after.at)},${pk}.gt.${quoted(after.id)})`);
  return q.order("updated_at", { ascending: true }).order(pk, { ascending: true }).limit(PAGE);
}

/**
 * Reads `table` from its cursor (or `from` when it has none) to the end, page by page, each page committed with its cursor.
 * `subtreeAll`: every order read gets its subtree fetched (first load).
 */
async function pullTable(ctx: Ctx, table: SyncTable, opts: { from?: string; subtreeAll?: boolean } = {}) {
  const startCursor = ctx.store.getState().session.pull?.cursors[table];
  const lower = startCursor ? shift(startCursor.at, -OVERLAP_MS) : opts.from;
  const scopeSince = table === "orders" && startCursor ? ms(startCursor.at) - OVERLAP_MS : undefined;
  let after: { at: string; id: string } | undefined;
  for (let guard = 0; guard < 10_000; guard++) {
    const readAt = nowIso();
    const rows = await run<RowOf<SyncTable>[]>(page(ctx, table, lower, after));
    if (!rows.length) break;
    // The page's newest updated_at (server clock): the server's clock is at least there now (clock.ts).
    noteServerTime(ctx.store, { kind: "floor", server: ms((rows[rows.length - 1] as { updated_at: string }).updated_at), got: Date.now() });
    const cursor = ctx.store.getState().session.pull?.cursors[table];
    const seen = cursor?.seen ?? {};
    const fresh = rows.filter((r) => seen[pkValue(table, r)] !== (r as { updated_at: string }).updated_at);
    // Only the overlap came back (already applied, cursor unchanged): nothing to write.
    const unchanged = !fresh.length && !!cursor && rows.every((r) => ms((r as { updated_at: string }).updated_at) <= ms(cursor.at));
    if (!unchanged) await commit(ctx, { [table]: fresh }, { page: { table, rows }, scopeSince, subtreeAll: opts.subtreeAll, readAt });
    if (rows.length < PAGE) break;
    const last = rows[rows.length - 1] as { updated_at: string };
    after = { at: last.updated_at, id: pkValue(table, rows[rows.length - 1]) };
  }
}

/** Every row of `table` matching `filter`, in pk order, page by page (.range). */
async function readAll<T>(ctx: Ctx, table: SyncTable, filter: (q: Builder) => Builder): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const rows = await run<T[]>(filter(ctx.db.from(table).select(COLUMNS[table])).order(pkOf(table), { ascending: true }).range(from, from + PAGE - 1));
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

/** Highest updated_at the account sees in `table` (EPOCH when it sees nothing). */
async function head(ctx: Ctx, table: SyncTable): Promise<string> {
  const rows = await run<{ updated_at: string }[]>(ctx.db.from(table).select("updated_at").order("updated_at", { ascending: false }).limit(1));
  return rows[0]?.updated_at ?? EPOCH;
}

/**
 * Whole subtrees of the queued orders, a chunk at a time (orders with unsent work wait for the push). An order is read at
 * most twice per cycle: one whose read keeps being held (an item that reached the server during it) waits in
 * `pull.subtrees` for the next cycle, and the other queued orders are read meanwhile.
 */
async function pullSubtrees(ctx: Ctx) {
  const reads = new Map<string, number>();
  for (let guard = 0; guard < 1_000; guard++) {
    const st = ctx.store.getState();
    const pending = pendingIndex(st.sync.queue);
    const due = (st.session.pull?.subtrees ?? []).filter((id) => isUuid(id) && !pending.orders.has(id) && (reads.get(id) ?? 0) < 2);
    if (!due.length) return;
    usePullStatus.setState({ initial: true });
    const chunk = due.slice(0, SUBTREE_CHUNK);
    for (const id of chunk) reads.set(id, (reads.get(id) ?? 0) + 1);
    const readAt = nowIso();
    const batch: RowsByTable = {};
    batch.orders = await readAll<Row<"orders">>(ctx, "orders", (q) => q.in("id", chunk));
    for (const t of ORDER_TABLES) {
      (batch as Record<string, unknown[]>)[t] = await readAll(ctx, t, (q) => q.in("order_id", chunk));
    }
    // Orders that did not come back are no longer visible: nothing to fetch (reconcile removes local copies).
    await commit(ctx, batch, { subtreesDone: chunk, readAt });
  }
}

/* ───────────── first load ───────────── */

async function firstLoad(ctx: Ctx, me: Row<"profiles">) {
  usePullStatus.setState({ initial: true });
  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60_000).toISOString();
  // Child-table cursors start where each table stands now: their rows of the loaded orders come with the subtrees, and
  // anything that changes from here on is ≥ this mark.
  const heads: Partial<Record<SyncTable, string>> = {};
  for (const t of ORDER_TABLES) heads[t] = await head(ctx, t);
  let aborted = false;
  ctx.store.setState((st) => {
    if (st.session.mode !== "supabase" || !st.session.signedIn || st.session.userId !== ctx.userId || st.session.needsReauth) {
      aborted = true;
      return st;
    }
    const fresh: PullState = { userId: ctx.userId, role: me.role, unitId: me.unit_id, since, cursors: {}, subtrees: st.session.pull?.subtrees ?? [] };
    return { session: { ...st.session, pull: fresh } };
  });
  if (aborted) throw new PullError("aborted", "La sesión cambió durante la descarga.");

  for (const t of CATALOG_TABLES) await pullTable(ctx, t);
  // Orders changed in the window (this read sets the orders cursor), then the open ones that are older.
  await pullTable(ctx, "orders", { from: since, subtreeAll: true });
  const openAt = nowIso();
  const open = await readAll<Row<"orders">>(ctx, "orders", (q) => q.in("status", OPEN_STATUSES).lt("updated_at", since));
  for (let i = 0; i < open.length; i += PAGE) await commit(ctx, { orders: open.slice(i, i + PAGE) }, { subtreeAll: true, readAt: openAt });
  // Bitácora lines without an order (catalog and account changes) from the window; order lines come with each subtree.
  const looseAt = nowIso();
  const loose = await readAll<Row<"audit_log">>(ctx, "audit_log", (q) => q.is("order_id", null).gte("updated_at", since));
  for (let i = 0; i < loose.length; i += PAGE) await commit(ctx, { audit_log: loose.slice(i, i + PAGE) }, { readAt: looseAt });

  ctx.store.setState((st) => {
    if (!sameSession(st, ctx.userId)) return st;
    const pull = st.session.pull!;
    const cursors = { ...pull.cursors };
    for (const t of ORDER_TABLES) cursors[t] ??= { at: heads[t] ?? EPOCH, seen: {} };
    return { session: { ...st.session, pull: { ...pull, cursors, loadedAt: new Date().toISOString() } } };
  });
}

/* ───────────── scope loss ───────────── */

async function reconcile(ctx: Ctx, tables: readonly (typeof RECONCILED_TABLES)[number][]) {
  // An order created (or a record written) by an item that reached the server after this moment may not be in the answers.
  const readAt = nowIso();
  const st = ctx.store.getState();
  const local: Record<(typeof RECONCILED_TABLES)[number], string[]> = {
    orders: st.orders.map((o) => o.id),
    units: st.units.map((u) => u.id),
    profiles: st.users.map((u) => u.id),
    workers: st.workers.map((w) => w.id),
    clients: st.clients.map((c) => c.id),
    sites: st.sites.map((s) => s.id),
  };
  const drops: Drops = {};
  for (const t of tables) {
    const ids = local[t].filter(isUuid);
    if (!ids.length) continue;
    const visible = new Set<string>();
    for (let i = 0; i < ids.length; i += RECONCILE_CHUNK) {
      const chunk = ids.slice(i, i + RECONCILE_CHUNK);
      const rpc = ctx.data.rpc("sync_reconcile", { p_table: t, p_ids: chunk }) as unknown as PromiseLike<Result>;
      for (const id of await run<string[]>(rpc)) visible.add(id);
    }
    const gone = ids.filter((id) => !visible.has(id));
    if (gone.length) drops[t] = gone;
  }
  // The account's own profile is always visible to it: if not, something is off — keep everything.
  if (drops.profiles?.includes(ctx.userId)) throw new PullError("server", SERVER_TEXT);
  const full = tables.length > 1;
  const now = new Date().toISOString();
  ctx.store.setState((s) => {
    if (!sameSession(s, ctx.userId)) return s;
    const me = s.users.find((u) => u.id === ctx.userId);
    const keep = new Set([ctx.userId, me?.unitId ?? ""]);
    const res = dropRows(dataOf(s), drops, pendingIndex(s.sync.queue, readAt), keep);
    const pull = s.session.pull!;
    // Subtrees of orders that are gone are no longer due.
    const goneOrders = new Set(drops.orders ?? []);
    return {
      ...(res.changed ? res.data : {}),
      session: {
        ...s.session,
        pull: {
          ...pull,
          subtrees: pull.subtrees.filter((id) => !goneOrders.has(id)),
          ordersReconciledAt: now,
          ...(full ? { reconciledAt: now } : {}),
        },
      },
    };
  });
}

/* ───────────── one cycle ───────────── */

async function checkSession(ctx: Ctx): Promise<Row<"profiles">> {
  const { data, error } = await ctx.client.auth.getSession();
  if (error) throw isAuthRetryableFetchError(error) ? new PullError("network", NETWORK_TEXT) : new PullError("auth", error.message);
  // No session, or another account's (an invite / recovery link opened on this device): no refresh brings this one back.
  if (!data.session || data.session.user.id !== ctx.userId) throw new PullError("reauth", "La sesión de Supabase no es la de esta cuenta.");
  // Every read and RPC of this cycle carries this session's token from here on: another account's session written to the
  // shared cookies meanwhile (an e-mail link opened in another tab) never reads, merges or reconciles in this account's name.
  ctx.data = getTokenClient(data.session.access_token);
  ctx.db = ctx.data as unknown as LooseClient;
  // The account's own profile, every cycle: a deactivation, or a role / unit change (full re-sync, §8 step 4). RLS hides an
  // inactive profile like a missing one.
  const me = await run<Row<"profiles"> | null>(ctx.db.from("profiles").select("*").eq("id", ctx.userId).maybeSingle());
  if (!me || !me.active) throw new PullError("inactive", "El perfil ya no está activo.");
  return me;
}

/**
 * Catalog / people records queued for a fresh read (`pull.refetch`): replaced by the server's row, or removed. A record whose
 * edit is still unsent waits in the list (its row would be held anyway) and is read once the edit went or was discarded.
 */
async function refetchRecords(ctx: Ctx) {
  const st0 = ctx.store.getState();
  const stored = st0.session.pull?.refetch;
  if (!stored || !Object.values(stored).some((ids) => ids?.length)) return;
  const pending0 = pendingIndex(st0.sync.queue);
  const want: NonNullable<PullState["refetch"]> = {};
  for (const t of CATALOG_TABLES) {
    const ids = (stored[t] ?? []).filter((id) => isUuid(id) && !pending0.entities.has(catalogKey(t, id)));
    if (ids.length) want[t] = ids;
  }
  if (!Object.keys(want).length) return;
  const readAt = nowIso();
  const batch: RowsByTable = {};
  const gone: Drops = {};
  for (const t of CATALOG_TABLES) {
    const ids = want[t] ?? [];
    if (!ids.length) continue;
    const rows: RowOf<SyncTable>[] = [];
    for (let i = 0; i < ids.length; i += ID_CHUNK) {
      rows.push(...(await run<RowOf<SyncTable>[]>(ctx.db.from(t).select(COLUMNS[t]).in("id", ids.slice(i, i + ID_CHUNK)))));
    }
    (batch as Record<string, unknown[]>)[t] = rows;
    const got = new Set(rows.map((r) => (r as { id: string }).id));
    const missing = ids.filter((id) => !got.has(id));
    if (missing.length) gone[t] = missing;
  }
  ctx.store.setState((st) => {
    if (!sameSession(st, ctx.userId)) return st;
    const pending = pendingIndex(st.sync.queue, readAt);
    const merged = mergeRows(dataOf(st), batch, pending);
    const me = st.users.find((u) => u.id === ctx.userId);
    const dropped = dropRows(merged.data, gone, pending, new Set([ctx.userId, me?.unitId ?? ""]));
    const pull = st.session.pull!;
    const rest: PullState["refetch"] = {};
    for (const t of CATALOG_TABLES) {
      // Read now: done — unless its row was held (an edit queued meanwhile) or it is missing while an edit is unsent.
      const keepIt = (id: string) => merged.heldCatalog?.[t]?.has(id) || (gone[t]?.includes(id) && pending.entities.has(catalogKey(t, id)));
      const left = (pull.refetch?.[t] ?? []).filter((id) => !(want[t] ?? []).includes(id) || keepIt(id));
      if (left.length) rest[t] = left;
    }
    return {
      ...(merged.changed || dropped.changed ? dropped.data : {}),
      session: { ...st.session, pull: { ...pull, refetch: rest } },
    };
  });
}

async function cycle(store: PullStore, opts: { full?: boolean }) {
  // Another tab may hold the device now (lib/device-storage): this one reads nothing more for it.
  if (!(await stillWriter())) throw new PullError("aborted", "Otra ventana usa los datos de este dispositivo.");
  const startedAt = new Date().toISOString();
  const st0 = store.getState();
  const client = getSupabaseBrowserClient();
  const ctx: Ctx = { store, client, data: client, db: client as unknown as LooseClient, userId: st0.session.userId };
  if (missesOf !== ctx.userId) {
    misses.clear();
    missesOf = ctx.userId;
  }
  const me = await checkSession(ctx);

  const pull0 = st0.session.pull;
  const scopeChanged = !!pull0 && (pull0.role !== me.role || pull0.unitId !== me.unit_id);
  let aborted = false;
  store.setState((st) => {
    if (st.session.mode !== "supabase" || st.session.userId !== ctx.userId || st.session.needsReauth) {
      aborted = true;
      return st;
    }
    const server = mapProfile(me);
    const prev = st.users.find((u) => u.id === server.id);
    // An unsent edit of one's own profile (phone, name…) stays on screen: only what decides access comes from the server.
    const user =
      prev && pendingIndex(st.sync.queue).entities.has(`usuario:${server.id}`)
        ? { ...prev, role: server.role, unitId: server.unitId, active: server.active, email: server.email }
        : server;
    const sameUser = !!prev && (Object.keys(user) as (keyof typeof user)[]).every((k) => prev[k] === user[k]);
    // A role without view.allUnits never keeps a unit filter (setUnitFilter's rule).
    const unitFilter = me.role === "direccion" ? st.session.unitFilter : "all";
    if (sameUser && unitFilter === st.session.unitFilter) return st;
    return {
      users: prev ? st.users.map((u) => (u.id === user.id ? user : u)) : [...st.users, user],
      session: { ...st.session, unitFilter },
    };
  });
  if (aborted) throw new PullError("aborted", "La sesión cambió durante la descarga.");
  if (scopeChanged) {
    // Menus follow the new claims; the data follows RLS already.
    try {
      await client.auth.refreshSession();
    } catch {
      // the next cycle refreshes
    }
  }

  const pull = store.getState().session.pull;
  const needsFirstLoad = opts.full || scopeChanged || !pull || pull.userId !== ctx.userId || !pull.loadedAt;
  if (needsFirstLoad) {
    await firstLoad(ctx, me);
  } else {
    for (const t of SYNC_TABLES) await pullTable(ctx, t);
  }
  await refetchRecords(ctx);
  await pullSubtrees(ctx);

  const after = store.getState().session.pull!;
  const now = Date.now();
  if (needsFirstLoad || !after.reconciledAt || now - ms(after.reconciledAt) > FULL_RECONCILE_MS) {
    await reconcile(ctx, RECONCILED_TABLES);
  } else if (!after.ordersReconciledAt || now - ms(after.ordersReconciledAt) > ORDERS_RECONCILE_MS) {
    await reconcile(ctx, ["orders"]);
  }

  store.setState((st) =>
    sameSession(st, ctx.userId)
      ? { session: { ...st.session, pull: { ...st.session.pull!, lastPullAt: new Date().toISOString(), lastPullFrom: startedAt } } }
      : st,
  );
}

/* ───────────── entry points ───────────── */

let inflight: Promise<void> | null = null;
let again = false;
let againFull = false;
let lastStart = 0;

export type PullRequest = {
  /** "Actualizar ahora", reconnecting, signing in: ignore the automatic throttle and backoff. */
  manual?: boolean;
  /** Reload the first-load window and reconcile everything. */
  full?: boolean;
};

/**
 * Runs a pull for the account session (single-flight: a request during a run schedules one more run). Never throws: the
 * outcome lands in usePullStatus and, for an expired session, in session.needsReauth.
 */
export function requestPull(store: PullStore, req: PullRequest = {}): Promise<void> {
  const st = store.getState();
  if (!isSupabaseConfigured || syncHalted() || st.session.mode !== "supabase" || !st.session.signedIn || st.session.needsReauth) return Promise.resolve();
  if (st.sync.forcedOffline || st.sync.browserOffline) return Promise.resolve();
  if (inflight) {
    again = true;
    againFull ||= !!req.full;
    return inflight;
  }
  const status = usePullStatus.getState();
  const now = Date.now();
  if (!req.manual && !req.full && (now < status.retryAt || now - lastStart < MIN_AUTO_GAP_MS)) return Promise.resolve();
  inflight = (async () => {
    let full = !!req.full;
    try {
      do {
        again = false;
        lastStart = Date.now();
        await once(store, full);
        full = againFull;
        againFull = false;
      } while (again && !store.getState().session.needsReauth && !syncHalted());
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

async function once(store: PullStore, full: boolean) {
  const loaded = !!store.getState().session.pull?.loadedAt;
  usePullStatus.setState({ running: true, initial: full || !loaded });
  try {
    await cycle(store, { full });
    usePullStatus.setState({ running: false, initial: false, error: undefined, errorAt: undefined, failures: 0, retryAt: 0 });
  } catch (e) {
    const err = e instanceof PullError ? e : new PullError("server", SERVER_TEXT, e instanceof Error ? e.message : String(e));
    if (err.kind === "server") console.warn("[pull]", err.detail ?? err.message);
    if (err.kind === "reauth" || err.kind === "inactive") {
      if (err.kind === "inactive") await endInactive(store);
      else flagReauth(store);
      usePullStatus.setState({ running: false, initial: false });
      return;
    }
    if (err.kind === "auth") {
      // One refresh attempt: an access token that expired while offline is renewed here; a dead refresh token is not.
      const refreshed = await tryRefresh(store);
      if (refreshed === "ok") {
        again = true;
        usePullStatus.setState({ running: false, initial: false });
        return;
      }
      if (refreshed === "inactive") {
        await endInactive(store);
        usePullStatus.setState({ running: false, initial: false });
        return;
      }
      if (refreshed === "dead") flagReauth(store);
    }
    if (err.kind === "aborted") {
      usePullStatus.setState({ running: false, initial: false });
      return;
    }
    const failures = usePullStatus.getState().failures + 1;
    usePullStatus.setState({
      running: false,
      initial: false,
      error: err.kind === "auth" ? undefined : err.message,
      errorAt: new Date().toISOString(),
      failures,
      retryAt: Date.now() + Math.min(5 * 60_000, 30_000 * 2 ** (failures - 1)),
    });
  }
}

let refreshTried = 0;
let refreshLast: "ok" | "dead" | "inactive" | "offline" = "dead";

/** The access-token hook refuses an account without an active profile with a 403 and no error code. */
const isNoProfileRefusal = (error: unknown) =>
  typeof error === "object" && error !== null && (error as { status?: unknown }).status === 403 && !(error as { code?: unknown }).code;

/**
 * "ok" → the session is alive again; "dead" → sign in again; "inactive" → no active profile; "offline" → try later. Shared
 * with the push engine (one attempt per minute for both).
 */
export async function tryRefresh(store: PullStore): Promise<"ok" | "dead" | "inactive" | "offline"> {
  // At most one refresh attempt per minute (a server that keeps answering 401 must not loop). Within that minute the
  // pull and the push share its outcome; after a successful one a new 401 is retried later, never "Vuelva a entrar".
  if (Date.now() - refreshTried < 60_000) return refreshLast === "ok" ? "offline" : refreshLast;
  refreshTried = Date.now();
  refreshLast = await (async () => {
    try {
      const { data, error } = await getSupabaseBrowserClient().auth.refreshSession();
      if (error && isNoProfileRefusal(error)) return "inactive" as const;
      if (error) return isAuthRetryableFetchError(error) ? ("offline" as const) : ("dead" as const);
      return data.session?.user.id === store.getState().session.userId ? ("ok" as const) : ("dead" as const);
    } catch {
      return "offline" as const;
    }
  })();
  return refreshLast;
}

/**
 * The account's Supabase session is gone (or belongs to someone else): keep the data, stop pulling, let the shell offer to
 * sign in again ("Vuelva a entrar"). `noAccess`: the profile is no longer active — the shell blocks the app as well.
 */
export function flagReauth(store: PullStore, { noAccess = false }: { noAccess?: boolean } = {}) {
  store.setState((st) => {
    if (st.session.mode !== "supabase" || !st.session.signedIn) return st;
    if (st.session.needsReauth && (st.session.noAccess || !noAccess)) return st;
    return { session: { ...st.session, needsReauth: true, ...(noAccess ? { noAccess: true } : {}) } };
  });
}

/**
 * A deactivated (or deleted) profile: block the app first, then end the Supabase session on this device — this account's
 * only: by now the browser may hold another account's (signed in, or an e-mail link opened, in another tab), and that one
 * stays.
 */
export async function endInactive(store: PullStore) {
  const userId = store.getState().session.userId;
  flagReauth(store, { noAccess: true });
  try {
    const { data } = await getSupabaseBrowserClient().auth.getSession();
    if (data.session && data.session.user.id !== userId) return;
  } catch {
    // cannot tell: end it (the cookies are this device's, and the account on the device has no access)
  }
  // Only this account's session (another may have landed in the cookies since the check above: it stays).
  await endSessionOnDevice({ timeoutMs: 5000, userId });
}

/* ───────────── the browser's Supabase session vs the account on the device ───────────── */

/**
 * "match": the browser's Supabase session is this account's (its JWT verified when online). "missing": no session, or Auth
 * no longer accepts it. "other": another account's session (an invite or recovery link opened on this device). "unknown":
 * cannot tell (offline with an expired access token, Auth unreachable).
 */
export type AccountAuth = "match" | "missing" | "other" | "unknown";

export async function accountAuthState(client: SupabaseBrowserClient, userId: string): Promise<AccountAuth> {
  try {
    // The cookies, read locally (the network only to refresh an expired access token): enough to see a missing or foreign one.
    const { data, error } = await client.auth.getSession();
    if (error) return isAuthRetryableFetchError(error) ? "unknown" : "missing";
    if (!data.session) return "missing";
    if (data.session.user.id !== userId) return "other";
    // getSession trusts the cookie; getClaims verifies the JWT (JWKS, or the Auth server for a symmetric key).
    const claims = await client.auth.getClaims();
    if (claims.data?.claims) return claims.data.claims.sub === userId ? "match" : "other";
    const e = claims.error;
    if (!e) return "missing";
    if (isAuthRetryableFetchError(e)) return "unknown";
    if (isAuthSessionMissingError(e) || e.name === "AuthInvalidJwtError") return "missing";
    if (isAuthApiError(e) && (e.status === 401 || e.status === 403 || e.status === 404)) return "missing";
    return "unknown";
  } catch {
    return "unknown";
  }
}

let verifying: Promise<AccountAuth | null> | null = null;

/**
 * Compares the account on the device with the browser's Supabase session (store bootstrap, auth events, /login), outside a
 * pull. None, or another account's → "Vuelva a entrar": syncing stops, the data stays. This account's → re-authentication is
 * over (if it was due) and a pull starts, which re-reads the profile (deactivated → no access; new role / unit → full re-sync).
 * Offline ("unknown") the device keeps working as it was. Resolves with the comparison (null: no account session).
 */
export function verifyAccount(store: PullStore): Promise<AccountAuth | null> {
  if (verifying) return verifying;
  verifying = (async () => {
    const st = store.getState();
    if (!isSupabaseConfigured || st.session.mode !== "supabase" || !st.session.signedIn) return null;
    const userId = st.session.userId;
    const auth = await accountAuthState(getSupabaseBrowserClient(), userId);
    const now = store.getState().session;
    if (now.mode !== "supabase" || !now.signedIn || now.userId !== userId) return auth; // the session changed meanwhile
    if (auth === "missing" || auth === "other") {
      flagReauth(store);
      return auth;
    }
    if (auth === "match" && now.needsReauth)
      store.setState((s) => (s.session.userId === userId ? { session: { ...s.session, needsReauth: false, noAccess: undefined } } : s));
    void requestPull(store, { manual: true });
    return auth;
  })().finally(() => {
    verifying = null;
  });
  return verifying;
}
