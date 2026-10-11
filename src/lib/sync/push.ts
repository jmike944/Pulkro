/**
 * Push engine: the write path of an account session (architecture §8, §12 step 4). Every store action already applied its
 * change on the device and queued ONE item `{ op: { rpc, args } }` (ops.ts); this engine sends them to `public.<rpc>` and
 * never blocks the UI on the network.
 *
 *  - Order: FIFO; the items of an order (or of one catalog record / person) run strictly in order and an item also waits for
 *    records it depends on (queue.ts). A held item holds back the later items of its order only.
 *  - Idempotency: each item keeps its exact arguments, `p_op_id` included, and resends them unchanged; `{duplicate: true}`
 *    (the server already applied it) counts as sent.
 *  - Answers (queue.ts → classifyRpc): applied → sent, and the server's values (folios, statuses, server time, versions)
 *    replace the device's; network / timeout / 5xx / 429 / `parent_missing` / `object_missing` / `device_time_future` (the
 *    phone's clock ahead: it goes once the server's clock passes it) → retried with backoff (capped, then quarantine); PT401
 *    or an expired session → one refresh, else "Vuelva a entrar" and the queue waits; other PT409 → quarantine with the
 *    server's message; PT422 / PT403 / PT404 / 23505 / 23503 → error. The item and the person's data stay on the device in
 *    every case; the sync sheet offers "Reintentar" (unless a resend cannot help: NO_RETRY_HINTS) / "Descartar".
 *  - Server times in the answers (check-in/out `server_at`, `reopened_at`) also read the server's clock (clock.ts).
 *  - Photos: one item, two steps. The picture goes to Storage first (`orders/<order>/<kind>/<photo>.jpg`, bucket
 *    `evidencias`, never upserted; "already exists" is success), the item remembers it, then `add_photo` links it. The photo
 *    then shows from Storage; its device copy is freed once a pull that started after the push confirmed it.
 *  - After a burst that sent something, a pull brings the server's truth (merge.ts keeps rows with unsent items).
 */
import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import type { AppState } from "@/lib/store";
import { getSupabaseBrowserClient, getTokenClient, isSupabaseConfigured, type SupabaseBrowserClient } from "@/lib/supabase/client";
import { deletePhotoFile, getPhotoBlob, keepCaptureAs } from "@/lib/photo-store";
import type { DataSnapshot, OrderStatus, SyncItem, SyncProblem } from "@/lib/types";
import { noteServerTime } from "./clock";
import { iso } from "./map";
import { dropRows, pendingIndex, type CatalogTable } from "./merge";
import { endInactive, flagReauth, requestPull, tryRefresh, type PullStore } from "./pull";
import {
  CATALOG_RPC,
  MAX_ATTEMPTS,
  MAX_RETRY_MS,
  NETWORK_MESSAGE,
  classifyRpc,
  classifyUpload,
  discardSet,
  discardedCaptures,
  isRetryable,
  isUnsent,
  nextReady,
  nextWake,
  retryDelay,
  type Outcome,
  type RpcError,
  type UploadError,
} from "./queue";

const RPC_TIMEOUT_MS = 30_000;
const UPLOAD_TIMEOUT_MS = 120_000;
/** Sent items kept for the activity view (plus any whose photo copy is not freed yet). */
const KEEP_SENT = 60;
const BUCKET = "evidencias";
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const LEGACY_MESSAGE =
  "Este cambio se guardó con una versión anterior de la app y no se puede enviar. Descártelo y vuelva a capturarlo si hace falta.";
const LOST_PHOTO_MESSAGE = "La foto ya no está guardada en este dispositivo: no se puede enviar. Descarte este registro y tómela de nuevo.";

type Store = PullStore;

const offline = (st: AppState) => st.sync.forcedOffline || st.sync.browserOffline;
const canPush = (st: AppState) => st.session.mode === "supabase" && st.session.signedIn && !st.session.needsReauth && !offline(st);
const nowIso = () => new Date().toISOString();

/* ───────────── queue edits ───────────── */

function patchItem(store: Store, id: string, patch: Partial<SyncItem> | ((q: SyncItem) => Partial<SyncItem>)) {
  store.setState((st) => {
    if (!st.sync.queue.some((q) => q.id === id)) return st;
    return { sync: { ...st.sync, queue: st.sync.queue.map((q) => (q.id === id ? { ...q, ...(typeof patch === "function" ? patch(q) : patch) } : q)) } };
  });
}

/** Account items without an operation (queued by a build before the write path): they cannot be sent. */
function markLegacy(store: Store) {
  if (!store.getState().sync.queue.some((q) => isUnsent(q) && !q.op && q.state !== "error")) return;
  store.setState((st) => ({
    sync: {
      ...st.sync,
      queue: st.sync.queue.map((q) => (isUnsent(q) && !q.op && q.state !== "error" ? { ...q, state: "error" as const, problem: { kind: "error" as const, message: LEGACY_MESSAGE } } : q)),
    },
  }));
}

/* ───────────── entry points ───────────── */

let inflight: Promise<void> | null = null;
let again = false;
let timer: ReturnType<typeof setTimeout> | undefined;
/** The session check could not reach Auth: look again a bit later even if no item has a retry time. */
let checkAgainAt = 0;

/**
 * Sends what is ready (single-flight: a call during a burst runs one more burst after it). Never throws; a no-op offline,
 * outside an account session and while re-authentication is due.
 */
export function pushQueue(store: Store): Promise<void> {
  if (!isSupabaseConfigured || !canPush(store.getState())) return Promise.resolve();
  if (inflight) {
    again = true;
    return inflight;
  }
  inflight = (async () => {
    store.setState((st) => (st.sync.processing ? st : { sync: { ...st.sync, processing: true } }));
    try {
      do {
        again = false;
        await exclusive(store, () => burst(store));
      } while (again && canPush(store.getState()));
    } catch (e) {
      console.warn("[push]", e instanceof Error ? e.message : e);
    } finally {
      inflight = null;
      store.setState((st) => (st.sync.processing ? { sync: { ...st.sync, processing: false } } : st));
      schedule(store);
    }
  })();
  return inflight;
}

/** The connection is back (or "Simular sin conexión" was switched off): items waiting on the network go now. */
export function resumeAfterReconnect(store: Store): Promise<void> {
  store.setState((st) =>
    st.sync.queue.some((q) => q.problem?.code === "network" && q.nextAt)
      ? { sync: { ...st.sync, queue: st.sync.queue.map((q) => (q.problem?.code === "network" ? { ...q, nextAt: undefined } : q)) } }
      : st,
  );
  return pushQueue(store);
}

/**
 * "Reintentar": stopped items go back in line (same arguments) and delayed retries run now. Without `ids` (the sheet's
 * "Reintentar N envíos"): only the stopped items a resend can help (isRetryable), never the ones the server would refuse again.
 */
export function retryItems(store: Store, ids?: string[]) {
  const pick = (q: SyncItem) => (ids ? ids.includes(q.id) : q.state !== "error" || isRetryable(q));
  store.setState((st) => ({
    sync: {
      ...st.sync,
      queue: st.sync.queue.map((q) => {
        if (!pick(q) || !q.op) return q;
        if (q.state === "error")
          return { ...q, state: "pendiente" as const, problem: undefined, attempts: 0, netAttempts: undefined, firstFailAt: undefined, nextAt: undefined };
        if (q.state === "pendiente" && q.nextAt) return { ...q, nextAt: undefined };
        return q;
      }),
    },
  }));
  return pushQueue(store);
}

/** Bursts of the same account in several tabs run one after the other (Web Locks where available). */
async function exclusive(store: Store, run: () => Promise<void>) {
  const locks = typeof navigator !== "undefined" ? (navigator as Navigator & { locks?: LockManager }).locks : undefined;
  if (!locks?.request) return run();
  await locks.request(`pulkro-push:${store.getState().session.userId}`, run);
}

function schedule(store: Store) {
  clearTimeout(timer);
  const st = store.getState();
  if (!canPush(st)) return;
  const due = [nextWake(st.sync.queue), checkAgainAt || undefined].filter((x): x is number => x !== undefined);
  if (!due.length) return;
  const at = Math.min(...due);
  timer = setTimeout(() => {
    checkAgainAt = 0;
    void pushQueue(store);
  }, Math.max(250, at - Date.now()));
}

/* ───────────── one burst ───────────── */

type AuthCheck = { state: "ok"; token: string } | { state: "missing" | "other" | "offline" };

async function sessionCheck(client: SupabaseBrowserClient, userId: string): Promise<AuthCheck> {
  try {
    const { data, error } = await client.auth.getSession();
    if (error) return { state: isAuthRetryableFetchError(error) ? "offline" : "missing" };
    if (!data.session) return { state: "missing" };
    return data.session.user.id === userId ? { state: "ok", token: data.session.access_token } : { state: "other" };
  } catch {
    return { state: "offline" };
  }
}

async function burst(store: Store) {
  markLegacy(store);
  const userId = store.getState().session.userId;
  if (!nextReady(store.getState().sync.queue, Date.now())) return;
  // The browser's session must be this account's (never another account's, never none)…
  const auth = await sessionCheck(getSupabaseBrowserClient(), userId);
  if (auth.state === "offline") {
    checkAgainAt = Date.now() + 30_000;
    return;
  }
  if (auth.state !== "ok") {
    flagReauth(store);
    return;
  }
  // …and every request of the burst carries that session's token, even if another account's session lands in the cookies
  // meanwhile (an e-mail link opened in another tab during a two-minute upload).
  const client = getTokenClient(auth.token);
  let sent = 0;
  for (let guard = 0; guard < 10_000; guard++) {
    const st = store.getState();
    if (!canPush(st) || st.session.userId !== userId) break;
    const item = nextReady(st.sync.queue, Date.now());
    if (!item) break;
    const step = await send(store, client, item, userId);
    if (step === "sent") sent++;
    else if (step === "stop") break;
  }
  trimSent(store);
  if (sent) {
    // The server's truth replaces the device's guesses (statuses derived on the server, history, times).
    await requestPull(store, { manual: true });
    releaseBlobs(store);
  }
}

type Step = "sent" | "next" | "stop";

async function send(store: Store, client: SupabaseBrowserClient, item: SyncItem, userId: string): Promise<Step> {
  const op = item.op!;
  patchItem(store, item.id, { state: "sincronizando" });
  try {
    // 1 · the picture (add_photo), once: a retry after the upload resumes at the RPC.
    let noPicture = false;
    if (op.upload && !op.upload.uploaded) {
      const blob = await getPhotoBlob(op.upload.blobKey);
      if (blob) {
        const outcome = await upload(client, op.upload, blob);
        if (outcome.kind !== "ok") return await settle(store, item, outcome);
        patchItem(store, item.id, (q) => (q.op?.upload ? { op: { ...q.op, upload: { ...q.op.upload, uploaded: true } } } : {}));
      } else {
        // The device copy is gone (another tab of this account sent the photo and freed it): the RPC tells. Applied before
        // → `duplicate`, sent; no file in Storage → `object_missing`, which no retry can fix.
        noPicture = true;
      }
    }
    // The upload can take minutes: the account may have signed out (or the device changed hands) meanwhile. What the person
    // agreed to drop is not sent.
    const now = store.getState();
    if (!canPush(now) || now.session.userId !== userId || !now.sync.queue.some((q) => q.id === item.id)) {
      patchItem(store, item.id, { state: "pendiente" });
      return "stop";
    }
    // 2 · the RPC, with exactly the arguments stored when the action ran.
    if (!item.tried) patchItem(store, item.id, { tried: true });
    const sent = Date.now();
    const outcome = await call(client, op.rpc, op.args);
    if (noPicture && outcome.kind === "retry" && outcome.reupload)
      return await settle(store, item, { kind: "error", problem: { kind: "error", message: LOST_PHOTO_MESSAGE, code: outcome.problem.code, hint: "photo_lost" } });
    return await settle(store, item, outcome, { sent, got: Date.now() });
  } catch (e) {
    // Never leave an item "sincronizando" (it would hold its order until a reload): back in line, retried with backoff.
    console.warn("[push]", op.rpc, e instanceof Error ? e.message : e);
    retryLater(store, item, { kind: "reintento", message: "No se pudo enviar por un error del dispositivo; se reintentará." });
    return "next";
  }
}

type RpcResult = { data: unknown; error: RpcError | null; status: number };
type RpcBuilder = PromiseLike<RpcResult> & { abortSignal(signal: AbortSignal): PromiseLike<RpcResult> };
type LooseRpc = { rpc(fn: string, args: Record<string, unknown>): RpcBuilder };

const timeoutSignal = (ms: number) => (typeof AbortSignal !== "undefined" && "timeout" in AbortSignal ? AbortSignal.timeout(ms) : undefined);

async function call(client: SupabaseBrowserClient, rpc: string, args: Record<string, unknown>): Promise<Outcome> {
  try {
    const builder = (client as unknown as LooseRpc).rpc(rpc, args);
    const signal = timeoutSignal(RPC_TIMEOUT_MS);
    const res = await (signal ? builder.abortSignal(signal) : builder);
    return classifyRpc(res.error, res.status, res.data, rpc);
  } catch {
    // An aborted request may have been applied: the retry carries the same op id and arguments (→ duplicate).
    return { kind: "network", message: NETWORK_MESSAGE };
  }
}

async function upload(client: SupabaseBrowserClient, u: NonNullable<NonNullable<SyncItem["op"]>["upload"]>, blob: Blob): Promise<Outcome> {
  const type = IMAGE_TYPES.includes(blob.type) ? blob.type : "image/jpeg";
  const file = blob.type === type ? blob : new Blob([blob], { type });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const res = await Promise.race([
      client.storage.from(BUCKET).upload(u.path, file, { upsert: false, contentType: type, cacheControl: "31536000" }),
      new Promise<"timeout">((resolve) => (timer = setTimeout(() => resolve("timeout"), UPLOAD_TIMEOUT_MS))),
    ]);
    if (res === "timeout") return { kind: "network", message: NETWORK_MESSAGE };
    return classifyUpload((res.error as UploadError | null) ?? null);
  } catch (e) {
    return classifyUpload({ name: "StorageUnknownError", message: e instanceof Error ? e.message : String(e) });
  } finally {
    clearTimeout(timer);
  }
}

/** When the RPC went out and when its answer arrived (device ms): a server time in the answer reads the server's clock. */
type Timing = { sent: number; got: number };

/** Records what happened to the item; tells the burst whether to go on. */
async function settle(store: Store, item: SyncItem, outcome: Outcome, timing?: Timing): Promise<Step> {
  switch (outcome.kind) {
    case "ok": {
      const at = nowIso();
      patchItem(store, item.id, { state: "sincronizado", syncedAt: at, problem: undefined, nextAt: undefined, attempts: undefined, netAttempts: undefined, firstFailAt: undefined });
      store.setState((st) => ({ sync: { ...st.sync, lastSyncAt: at } }));
      await applyResult(store, item, outcome.data, timing);
      return "sent";
    }
    case "network":
      retryLater(store, item, { kind: "reintento", message: outcome.message, code: "network" });
      return "stop";
    case "retry":
      retryLater(store, item, outcome.problem, outcome.reupload);
      return "next";
    case "conflict":
    case "error":
      patchItem(store, item.id, { state: "error", problem: outcome.problem, nextAt: undefined });
      return "next";
    case "inactive":
      patchItem(store, item.id, { state: "pendiente" });
      await endInactive(store);
      return "stop";
    case "auth": {
      patchItem(store, item.id, { state: "pendiente" });
      // One refresh (shared with the pull, at most once a minute): an access token that expired offline comes back here.
      const refreshed = await tryRefresh(store);
      // A new token: the next burst checks the session again and binds its requests to it.
      if (refreshed === "ok") {
        again = true;
        return "stop";
      }
      if (refreshed === "inactive") await endInactive(store);
      else if (refreshed === "offline") retryLater(store, item, { kind: "reintento", message: NETWORK_MESSAGE, code: "network" });
      else flagReauth(store);
      return "stop";
    }
  }
}

/**
 * Back in line after a delay. Server answers count toward the cap (then quarantine); the network never does: a day without
 * reaching the server must not quarantine the item at the first busy answer once it is reachable again.
 */
function retryLater(store: Store, item: SyncItem, problem: SyncProblem, reupload = false) {
  patchItem(store, item.id, (q) => {
    const now = Date.now();
    if (problem.code === "network") {
      const netAttempts = (q.netAttempts ?? 0) + 1;
      return { state: "pendiente", netAttempts, nextAt: new Date(now + retryDelay(netAttempts)).toISOString(), problem };
    }
    const attempts = (q.attempts ?? 0) + 1;
    const firstFailAt = q.firstFailAt ?? new Date(now).toISOString();
    const upload = reupload && q.op?.upload ? { op: { ...q.op, upload: { ...q.op.upload, uploaded: false } } } : {};
    if (attempts >= MAX_ATTEMPTS && now - Date.parse(firstFailAt) >= MAX_RETRY_MS)
      return {
        ...upload,
        state: "error",
        attempts,
        firstFailAt,
        nextAt: undefined,
        problem: { ...problem, kind: "conflicto", message: `No se pudo enviar tras ${attempts} intentos en 24 horas. ${problem.message}` },
      };
    return { ...upload, state: "pendiente", attempts, netAttempts: undefined, firstFailAt, nextAt: new Date(now + retryDelay(attempts)).toISOString(), problem };
  });
}

/** Keeps the last sent items for the activity view (and every one whose photo copy is not freed yet). */
function trimSent(store: Store) {
  store.setState((st) => {
    const sent = st.sync.queue.filter((q) => q.state === "sincronizado");
    if (sent.length <= KEEP_SENT) return st;
    const keep = new Set(sent.slice(-KEEP_SENT).map((q) => q.id));
    const queue = st.sync.queue.filter((q) => q.state !== "sincronizado" || keep.has(q.id) || (q.op?.upload && !q.op.upload.released));
    return { sync: { ...st.sync, queue } };
  });
}

/* ───────────── the server's answer replaces the device's guesses ───────────── */

const ORDER_STATUSES = new Set<OrderStatus>([
  "borrador", "programada", "en_ejecucion", "jornada_cerrada", "pendiente_validacion", "finalizada", "reporte_enviado",
  "seguimiento", "archivada", "cancelada", "reprogramada", "con_incidencia", "reabierta",
]);
const str = (v: unknown) => (typeof v === "string" ? v : undefined);

async function applyResult(store: Store, item: SyncItem, data: unknown, timing?: Timing) {
  const op = item.op!;
  const a = op.args;
  const r = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;

  // The server's clock (clock.ts): a time it stamped while this request was under way. A duplicate answer carries the time
  // of the first application, which says nothing about now.
  const stamped = str(r.server_at) ?? str(r.reopened_at);
  if (stamped && timing && r.duplicate !== true) noteServerTime(store, { kind: "between", server: Date.parse(stamped), sent: timing.sent, got: timing.got });

  /** The order's status, unless later changes of that order are still queued (their own answers will say). */
  const status = (orderId: unknown, value: unknown) => {
    const id = str(orderId);
    const next = str(value) as OrderStatus | undefined;
    if (!id || !next || !ORDER_STATUSES.has(next)) return;
    store.setState((st) => {
      if (st.sync.queue.some((q) => q.orderId === id && isUnsent(q))) return st;
      const o = st.orders.find((x) => x.id === id);
      return o && o.status !== next ? { orders: st.orders.map((x) => (x.id === id ? { ...x, status: next } : x)) } : st;
    });
  };
  /** The server-assigned folio replaces the provisional one, in the record and in the queue's labels. */
  const folio = (key: "orders" | "incidents" | "cases", id: unknown, value: unknown) => {
    const rid = str(id);
    const next = str(value);
    if (!rid || !next) return;
    store.setState((st) => {
      const list = st[key] as { id: string; folio: string }[];
      const before = list.find((x) => x.id === rid)?.folio;
      if (!before || before === next) return st;
      return {
        [key]: list.map((x) => (x.id === rid ? { ...x, folio: next } : x)),
        sync: { ...st.sync, queue: st.sync.queue.map((q) => (q.label.includes(before) ? { ...q, label: q.label.split(before).join(next) } : q)) },
      } as Partial<AppState>;
    });
  };

  switch (op.rpc) {
    case "create_order":
      folio("orders", a.p_order_id, r.folio);
      status(a.p_order_id, r.status);
      break;
    case "add_incident":
      folio("incidents", a.p_incident_id, r.folio);
      status(a.p_order_id, r.order_status);
      break;
    case "create_case":
      folio("cases", a.p_case_id, r.folio);
      status(a.p_order_id, r.order_status);
      break;
    case "set_order_status":
    case "cancel_order":
    case "reopen_order":
    case "archive_order":
    case "assign_crew":
    case "schedule_jornadas":
    case "validate_closure":
      status(a.p_order_id, r.status);
      if (op.rpc === "validate_closure" && typeof r.version === "number") {
        const version = r.version;
        store.setState((st) => ({
          orders: st.orders.map((o) => (o.id === a.p_order_id && o.closure && (o.closure.id ?? a.p_closure_id) === a.p_closure_id ? { ...o, closure: { ...o.closure, id: str(a.p_closure_id), version } } : o)),
        }));
      }
      break;
    case "check_in":
    case "check_out": {
      const serverAt = str(r.server_at);
      const key = op.rpc === "check_in" ? "checkIn" : "checkOut";
      if (serverAt)
        store.setState((st) => ({
          jornadas: st.jornadas.map((j) => {
            const stamp = j[key];
            return j.id === a.p_jornada_id && stamp && stamp.deviceAt === a.p_device_at ? { ...j, [key]: { ...stamp, serverAt: iso(serverAt) } } : j;
          }),
        }));
      status(r.order_id ?? item.orderId, r.order_status);
      break;
    }
    case "resolve_incident":
    case "log_share":
    case "create_survey":
      status(item.orderId, r.order_status);
      break;
    case "generate_report": {
      const version = typeof r.version === "number" ? r.version : undefined;
      const photoIds = Array.isArray(r.photo_ids) ? (r.photo_ids as unknown[]).filter((x): x is string => typeof x === "string") : undefined;
      store.setState((st) => ({
        reports: st.reports.map((x) => (x.id === a.p_report_id ? { ...x, version: version ?? x.version, photoIds: photoIds ?? x.photoIds } : x)),
      }));
      break;
    }
    case "record_manual_survey":
      // The server filled an unanswered survey this device did not have: the one created here is not on the server.
      if (str(r.survey_id) && r.survey_id !== a.p_survey_id) store.setState((st) => ({ surveys: st.surveys.filter((s) => s.id !== a.p_survey_id) }));
      break;
    case "add_photo": {
      const u = op.upload;
      if (!u) break;
      // The picture now shows from Storage; the capture's blob also stands in as its offline copy until it is freed.
      await keepCaptureAs(u.blobKey, u.path);
      store.setState((st) => ({
        photos: st.photos.map((p) =>
          p.id === a.p_photo_id && p.source.type === "idb" && p.source.key === u.blobKey
            ? { ...p, source: { type: "storage" as const, path: u.path, width: p.source.width, height: p.source.height } }
            : p,
        ),
      }));
      break;
    }
  }
}

/**
 * Frees the device copy of pushed photos once a pull that started after the push completed (the server's row is on the
 * device, or the photo was deleted meanwhile). Called after every pull of the account.
 */
export function releaseBlobs(store: Store) {
  const st = store.getState();
  const from = st.session.pull?.lastPullFrom;
  if (!from || st.session.mode !== "supabase") return;
  // (Same millisecond counts: the burst only starts its pull after the item was marked sent.)
  const due = st.sync.queue.filter((q) => q.state === "sincronizado" && q.op?.upload && !q.op.upload.released && q.syncedAt && q.syncedAt <= from);
  if (!due.length) return;
  const keys = new Map(due.map((q) => [q.op!.upload!.blobKey, q.op!.upload!.path]));
  store.setState((s) => ({
    photos: s.photos.map((p) => {
      if (p.source.type !== "idb" || !keys.has(p.source.key)) return p;
      return { ...p, source: { type: "storage" as const, path: keys.get(p.source.key)!, width: p.source.width, height: p.source.height } };
    }),
    sync: {
      ...s.sync,
      queue: s.sync.queue.map((q) => (due.some((d) => d.id === q.id) && q.op?.upload ? { ...q, op: { ...q.op, upload: { ...q.op.upload, released: true } } } : q)),
    },
  }));
  for (const key of keys.keys()) void deletePhotoFile(key);
}

/* ───────────── "Descartar" ───────────── */

const dataOf = (s: AppState): DataSnapshot => ({
  units: s.units, users: s.users, workers: s.workers, clients: s.clients, sites: s.sites, serviceTypes: s.serviceTypes,
  materials: s.materials, orders: s.orders, jornadas: s.jornadas, photos: s.photos, incidents: s.incidents, reports: s.reports,
  cases: s.cases, surveys: s.surveys, audit: s.audit,
});

/**
 * "Descartar": the item and what depends on it (see discardSet) leave the queue and are never sent; the device goes back to
 * the server's truth —
 * a record the item created here is removed, anything else is read again from the server (the order's whole subtree, the
 * catalog record by id). The Bitácora lines this device wrote for it go too. Returns how many items were removed.
 */
export function discardItems(store: Store, id: string): number {
  const chain = discardSet(store.getState().sync.queue, id);
  if (!chain.length) return 0;
  const gone = new Set(chain.map((q) => q.id));
  const opIds = new Set(chain.map((q) => str(q.op?.args.p_op_id)).filter(Boolean));
  const blobs: string[] = [];
  store.setState((s) => {
    // The photo copies that leave the device: the very ones the confirmation offered to save (discardedCaptures).
    blobs.push(...discardedCaptures(s.sync.queue, chain, s.photos).map((c) => c.key));
    const queue = s.sync.queue.filter((q) => !gone.has(q.id));
    let d: DataSnapshot = { ...dataOf(s), audit: s.audit.filter((x) => !x.opId || !opIds.has(x.opId)) };
    const subtrees = new Set(s.session.pull?.subtrees ?? []);
    const refetch: Partial<Record<CatalogTable, string[]>> = { ...(s.session.pull?.refetch ?? {}) };
    const again = (table: CatalogTable, rid: unknown) => {
      const x = str(rid);
      if (x) refetch[table] = [...new Set([...(refetch[table] ?? []), x])];
    };
    for (const q of chain) {
      const a = q.op?.args ?? {};
      switch (q.op?.rpc) {
        case "create_order": {
          const oid = str(a.p_order_id)!;
          d = dropRows(d, { orders: [oid] }, pendingIndex(queue)).data;
          subtrees.delete(oid);
          continue;
        }
        case "add_photo":
          d = { ...d, photos: d.photos.filter((p) => p.id !== a.p_photo_id) };
          break;
        case "add_incident":
          d = { ...d, incidents: d.incidents.filter((x) => x.id !== a.p_incident_id) };
          break;
        case "create_case":
          d = { ...d, cases: d.cases.filter((x) => x.id !== a.p_case_id) };
          break;
        case "add_jornada_note":
          d = { ...d, jornadas: d.jornadas.map((j) => (j.id === a.p_jornada_id ? { ...j, log: j.log.filter((e) => e.id !== a.p_note_id) } : j)) };
          break;
        case "generate_report":
          d = { ...d, reports: d.reports.filter((x) => x.id !== a.p_report_id) };
          break;
        case "log_share":
          d = { ...d, reports: d.reports.map((x) => (x.id === a.p_report_id ? { ...x, shares: x.shares.filter((sh) => sh.id !== a.p_share_id) } : x)) };
          break;
        case "create_survey":
        case "record_manual_survey":
          d = { ...d, surveys: d.surveys.filter((x) => x.id !== a.p_survey_id) };
          break;
        case "update_my_contact":
          again("profiles", q.entityId);
          continue;
        default: {
          const cat = q.op ? CATALOG_RPC[q.op.rpc] : undefined;
          if (cat) {
            const rid = str(a[cat.id]);
            if (q.op?.creates && rid) {
              const key = cat.table === "service_types" ? "serviceTypes" : cat.table === "profiles" ? "users" : cat.table;
              d = { ...d, [key]: (d[key as keyof DataSnapshot] as { id: string }[]).filter((x) => x.id !== rid) };
              if (cat.table === "sites") d = { ...d, clients: d.clients.map((c) => (c.siteIds.includes(rid) ? { ...c, siteIds: c.siteIds.filter((x) => x !== rid) } : c)) };
            } else again(cat.table, rid);
            continue;
          }
        }
      }
      // Everything else of the order is read again in full: the server's subtree replaces the device's.
      if (q.orderId) subtrees.add(q.orderId);
    }
    const pull = s.session.pull ? { ...s.session.pull, subtrees: [...subtrees], refetch } : s.session.pull;
    return { ...d, sync: { ...s.sync, queue }, session: { ...s.session, pull } };
  });
  for (const key of blobs) void deletePhotoFile(key);
  void requestPull(store, { manual: true });
  return chain.length;
}
