/**
 * The queue's rules, pure (no I/O): which item goes next, what each server answer means, how long to wait before retrying.
 * The push engine (push.ts) runs them; the sync sheet reads `waitsFor` to say why an item is held.
 *
 * Ordering (architecture §8): FIFO per device. Items of one order form a chain and run strictly in order (create_order →
 * schedule_jornadas → check-in → photos…), and so do the items of one catalog record or person. An item may also depend on
 * records created by other chains (a new client before the order that names it, a new worker before the crew that includes
 * them): `deps`. An item waits while an earlier unsent item of its chain or of one of its deps is still there — so a held
 * item (failed, or waiting to be retried) holds back the later items of that order only.
 */
import type { Photo, SyncItem, SyncProblem } from "@/lib/types";
import type { CatalogTable } from "./merge";

/** The chain an item belongs to: its order, or else the record it writes (`catalogo:<id>`, `usuario:<id>`). */
export const chainKey = (q: Pick<SyncItem, "orderId" | "entity" | "entityId">): string => (q.orderId ? `orden:${q.orderId}` : `${q.entity}:${q.entityId}`);

export const isUnsent = (q: SyncItem) => q.state !== "sincronizado";

/**
 * For every unsent item that must wait: the earlier unsent item it waits for (the first one of its chain or of a dep). A dep
 * holds the item while its record is being created, or while an edit of it is still on its way (a site moved to another
 * client lands before the order that relies on it); an edit of an existing record that the server refused does not: the
 * record is there, and an unrelated new order must not wait for someone to fix a contact e-mail.
 */
export function waitsFor(queue: readonly SyncItem[]): Map<string, SyncItem> {
  const heads = new Map<string, SyncItem>();
  const out = new Map<string, SyncItem>();
  for (const q of queue) {
    if (!isUnsent(q)) continue;
    const own = chainKey(q);
    const dep = (q.deps ?? []).map((k) => heads.get(k)).find((h) => h && (h.op?.creates || h.state !== "error"));
    const blocker = heads.get(own) ?? dep;
    if (blocker) out.set(q.id, blocker);
    if (!heads.has(own)) heads.set(own, q);
  }
  return out;
}

/** The next item to send at `now`, if any: the oldest pending item that waits for nothing and whose retry time has come. */
export function nextReady(queue: readonly SyncItem[], now: number): SyncItem | undefined {
  const waiting = waitsFor(queue);
  return queue.find((q) => q.state === "pendiente" && !waiting.has(q.id) && (!q.nextAt || Date.parse(q.nextAt) <= now));
}

/** When the earliest delayed retry is due (ms), if some item is waiting only for its retry time. */
export function nextWake(queue: readonly SyncItem[]): number | undefined {
  const waiting = waitsFor(queue);
  let at: number | undefined;
  for (const q of queue) {
    if (q.state !== "pendiente" || waiting.has(q.id) || !q.nextAt) continue;
    const t = Date.parse(q.nextAt);
    if (at === undefined || t < at) at = t;
  }
  return at;
}

/* ───────────── retries ───────────── */

/** Retryable answers from the server are capped (architecture §8): after both of these, the item goes to quarantine. */
export const MAX_ATTEMPTS = 20;
export const MAX_RETRY_MS = 24 * 60 * 60_000;

/** 4 s, 8 s, 16 s… up to 5 min, ±20 % so a fleet of phones coming back online does not retry in lockstep. */
export function retryDelay(attempts: number, random: () => number = Math.random): number {
  const base = Math.min(5 * 60_000, 4000 * 2 ** Math.max(0, attempts - 1));
  return Math.round(base * (0.8 + 0.4 * random()));
}

/* ───────────── what an answer means ───────────── */

export type Outcome =
  | { kind: "ok"; data?: unknown }
  /** No answer (offline, DNS, timeout): stop this burst, retry later. */
  | { kind: "network"; message: string }
  /** The JWT is missing / expired / rejected: refresh once, else "Vuelva a entrar". */
  | { kind: "auth"; message: string }
  /** PT401 for the profile itself (deactivated, removed): no access. */
  | { kind: "inactive"; message: string }
  /** Try again later (server busy, a parent still on its way, the photo file not there yet). */
  | { kind: "retry"; problem: SyncProblem; reupload?: boolean }
  /** The server's state refused it (quarantine): the item stays, the person decides. */
  | { kind: "conflict"; problem: SyncProblem }
  /** Invalid or not allowed: a bug or bad input; the item stays, the person decides. */
  | { kind: "error"; problem: SyncProblem };

export const NETWORK_MESSAGE = "Sin conexión con el servidor: se reintentará.";
const BUSY_MESSAGE = "El servidor no respondió a tiempo: se reintentará en unos minutos.";
const NETWORK_RE = /failed to fetch|fetch failed|networkerror|network request failed|load failed|aborterror|the user aborted|timeout|timed out/i;

export type RpcError = { message: string; code?: string | null; details?: string | null; hint?: string | null };

/** Business errors (`PTnnn`) carry the user-facing Spanish message; the rest get one here. */
function messageOf(error: RpcError, code: string): string {
  if (/^PT\d{3}$/.test(code) && error.message) return error.message;
  if (code === "23505") return "El servidor ya tiene un registro con ese identificador: este cambio no se aplicó.";
  if (code === "23503") return "Falta en el servidor un registro del que depende este cambio: no se aplicó.";
  if (code === "42501") return "El servidor no permite este cambio a su cuenta.";
  return `El servidor no aceptó el cambio${code ? ` (código ${code})` : ""}.`;
}

/** Retryable state conflicts: something this item needs is not on the server yet (architecture §8). */
const RETRY_HINTS = new Set(["parent_missing", "object_missing"]);
/** Transient database states. */
const RETRY_CODES = new Set(["40001", "40P01", "57014", "53300", "55P03"]);
/**
 * A device time more than 5 minutes ahead of the server's clock (the phone's clock is fast). The time is evidence and is
 * never rewritten: once the server's clock passes it, the very same request goes through, so it is retried like a busy
 * server (backoff, then the cap). The capture screens warn while the phone's clock is off (clock.ts).
 */
const CLOCK_AHEAD = "device_time_future";

/**
 * Refusals that mean the requested end state already holds: the item counts as sent. delete_photo of a photo someone else
 * already deleted (`photo_deleted`): holding the order's later items behind it would protect nothing.
 */
const ALREADY_DONE: Record<string, { code: string; hint: string }> = { delete_photo: { code: "PT409", hint: "photo_deleted" } };

/** What a PostgREST answer to `public.<rpc>` means for the queue. */
export function classifyRpc(error: RpcError | null, status: number, data?: unknown, rpc?: string): Outcome {
  if (!error) return { kind: "ok", data };
  const code = error.code ?? "";
  const hint = error.hint ?? "";
  if (status === 0 || (!code && NETWORK_RE.test(error.message))) return { kind: "network", message: NETWORK_MESSAGE };
  const done = rpc ? ALREADY_DONE[rpc] : undefined;
  if (done && done.code === code && done.hint === hint) return { kind: "ok", data: {} };
  if (code === "PT401") {
    if (hint === "inactive" || hint === "no_profile") return { kind: "inactive", message: error.message };
    return { kind: "auth", message: error.message };
  }
  if (status === 401 || /^PGRST30\d$/.test(code) || (!/^PT\d{3}$/.test(code) && /\bjwt\b/i.test(error.message))) return { kind: "auth", message: error.message };
  const problem = (kind: SyncProblem["kind"], message = messageOf(error, code)): SyncProblem => ({ kind, message, code: code || String(status), hint: hint || undefined });
  if (code === "PT422" && hint === CLOCK_AHEAD)
    return { kind: "retry", problem: problem("reintento", `${messageOf(error, code)} Se enviará cuando la hora del servidor alcance la del registro.`) };
  if (code === "PT409" && RETRY_HINTS.has(hint)) return { kind: "retry", problem: problem("reintento"), reupload: hint === "object_missing" };
  if (code === "PT409") return { kind: "conflict", problem: problem("conflicto") };
  if (RETRY_CODES.has(code) || status === 408 || status === 429 || (status >= 500 && !/^PT\d{3}$/.test(code)))
    return { kind: "retry", problem: problem("reintento", BUSY_MESSAGE) };
  return { kind: "error", problem: problem("error") };
}

/** A Storage error as storage-js reports it (StorageApiError / StorageUnknownError). */
export type UploadError = { name?: string; message: string; status?: number; statusCode?: string | number; code?: string };

/**
 * What a Storage answer to the upload means. The bucket never upserts: a retried upload answers "Duplicate" (409), which is
 * success (the file is there). Too large / wrong type / refused by the bucket's policy are permanent: quarantine (§7).
 */
export function classifyUpload(error: UploadError | null): Outcome {
  if (!error) return { kind: "ok" };
  const status = Number(error.status ?? 0);
  const code = String(error.statusCode ?? status ?? "");
  const msg = error.message ?? "";
  if (error.name === "StorageUnknownError" || NETWORK_RE.test(msg)) return { kind: "network", message: NETWORK_MESSAGE };
  if (code === "409" || status === 409 || /already exists|duplicate/i.test(msg)) return { kind: "ok" };
  if (status === 401 || error.code === "InvalidJWT" || /\bjwt\b|token (is )?expired|invalid (jwt|token)|"exp" claim|claim timestamp/i.test(msg))
    return { kind: "auth", message: msg };
  const problem = (kind: SyncProblem["kind"], message: string, hint?: string): SyncProblem => ({ kind, message, code: `storage ${code || status}`, hint });
  if (code === "413" || status === 413 || /too large|payload/i.test(msg))
    return { kind: "conflict", problem: problem("conflicto", "La foto es demasiado grande para el servidor (máximo 10 MB).") };
  if (code === "415" || status === 415 || /mime|content type|invalid_mime_type/i.test(msg))
    return { kind: "conflict", problem: problem("conflicto", "El servidor no acepta este tipo de archivo (solo JPEG, PNG o WebP).") };
  // The bucket's policy refused it (the order closed, or it is no longer this supervisor's): `upload_forbidden`, which a
  // resend of the same file cannot change (NO_RETRY_HINTS).
  if (code === "403" || status === 403 || /row[- ]level security|unauthorized|not allowed/i.test(msg))
    return {
      kind: "conflict",
      problem: problem("conflicto", "El servidor no permitió subir la foto: la orden ya no admite evidencia o ya no está a su cargo.", "upload_forbidden"),
    };
  if (status === 408 || status === 429 || status >= 500 || /^5\d\d$/.test(code) || code === "429")
    return { kind: "retry", problem: problem("reintento", BUSY_MESSAGE) };
  return { kind: "conflict", problem: problem("conflicto", `El servidor rechazó el archivo de la foto${msg ? `: ${msg}` : "."}`) };
}

/** Catalog and people upserts: the table each writes and the parameter naming its record (the one a creation creates). */
export const CATALOG_RPC: Record<string, { table: CatalogTable; id: string }> = {
  upsert_client: { table: "clients", id: "p_client_id" },
  upsert_site: { table: "sites", id: "p_site_id" },
  upsert_worker: { table: "workers", id: "p_worker_id" },
  upsert_service_type: { table: "service_types", id: "p_service_type_id" },
  upsert_material: { table: "materials", id: "p_material_id" },
  update_profile: { table: "profiles", id: "p_user_id" },
};

/** Ids of the records an operation creates on the server (what later operations may name). */
function createdIds(q: SyncItem): string[] {
  const a = q.op?.args ?? {};
  const pick = (...keys: string[]) => keys.map((k) => a[k]).filter((v): v is string => typeof v === "string");
  switch (q.op?.rpc) {
    case "create_order":
      return [...pick("p_order_id"), ...(Array.isArray(a.p_days) ? (a.p_days as { id?: unknown }[]).map((d) => d.id).filter((v): v is string => typeof v === "string") : [])];
    case "schedule_jornadas":
      return Array.isArray(a.p_days) ? (a.p_days as { id?: unknown }[]).map((d) => d.id).filter((v): v is string => typeof v === "string") : [];
    case "add_photo":
      return pick("p_photo_id");
    case "add_incident":
      return pick("p_incident_id");
    case "create_case":
      return pick("p_case_id");
    case "generate_report":
      return pick("p_report_id");
    case "create_survey":
      return pick("p_survey_id");
    default: {
      // Only the record the upsert writes: a new site names its (existing) client, which it does not create.
      const cat = q.op ? CATALOG_RPC[q.op.rpc] : undefined;
      return q.op?.creates && cat ? pick(cat.id) : [];
    }
  }
}

/**
 * Arguments that do not make an operation depend on the records they name: generate_report keeps only the live photos of
 * the order among `p_photo_ids` (a missing one is left out of the report, never refused).
 */
const LOOSE_ARGS: Record<string, string[]> = { generate_report: ["p_photo_ids"] };

/** The operation names one of `ids` anywhere in its arguments (or belongs to one of those orders). */
function names(q: SyncItem, ids: Set<string>): boolean {
  if (q.orderId && ids.has(q.orderId)) return true;
  const walk = (v: unknown): boolean =>
    typeof v === "string" ? ids.has(v) : Array.isArray(v) ? v.some(walk) : !!v && typeof v === "object" && Object.values(v).some(walk);
  const loose = (q.op && LOOSE_ARGS[q.op.rpc]) ?? [];
  return Object.entries(q.op?.args ?? {}).some(([k, v]) => !loose.includes(k) && walk(v));
}

/**
 * The item's last attempt went out and got no answer (network, a gateway timeout, a device error after sending): the server
 * may have applied it. Only a resend can tell (an applied op answers `duplicate`), so nothing that depends on it is judged
 * by it.
 */
export function outcomeUnknown(q: SyncItem): boolean {
  if (!q.tried || !q.problem || q.state === "sincronizado") return false;
  const code = q.problem.code ?? "";
  return code === "" || code === "network" || code === "502" || code === "504";
}

/**
 * The items "Descartar" removes with `id`: the item and every later unsent item that depends on a record it creates — the
 * photo edits of a discarded photo, the check-ins of discarded days, the order on a discarded client, every change of a
 * discarded new order… They could never be applied (the server would answer `parent_missing` until the retry cap).
 * An item whose outcome is unknown (outcomeUnknown) goes alone: if the server applied it, what depends on it still applies;
 * if not, those items answer `parent_missing` and can be discarded then, on a definite answer.
 */
export function discardSet(queue: readonly SyncItem[], id: string): SyncItem[] {
  const at = queue.findIndex((q) => q.id === id);
  const item = queue[at];
  if (!item || item.state === "sincronizado" || item.state === "sincronizando") return [];
  const out = [item];
  if (outcomeUnknown(item)) return out;
  const ids = new Set(createdIds(item));
  for (const q of queue.slice(at + 1)) {
    if (!isUnsent(q) || q.state === "sincronizando" || !ids.size || !names(q, ids)) continue;
    out.push(q);
    for (const x of createdIds(q)) ids.add(x);
  }
  return out;
}

/** A photo capture that "Descartar" deletes from the device: its picture (IndexedDB key) and what names it. */
export type DiscardedCapture = { key: string; orderId?: string; kind?: string; takenAt?: string };

/**
 * The device copies of photos that discarding `set` (discardSet) deletes — discardItems deletes exactly these, and only once
 * the person confirmed, so the sync sheet can offer to save them first: the picture of every add_photo in the set, and the
 * captures of a discarded new order, except a picture that an item left in the queue still needs (a new order whose answer
 * was lost goes alone: if the server had it, its photos still go).
 */
export function discardedCaptures(
  queue: readonly SyncItem[],
  set: readonly SyncItem[],
  photos: readonly Pick<Photo, "orderId" | "kind" | "takenAt" | "source">[],
): DiscardedCapture[] {
  const gone = new Set(set.map((q) => q.id));
  const needed = new Set(queue.flatMap((q) => (!gone.has(q.id) && q.op?.upload && !q.op.upload.released ? [q.op.upload.blobKey] : [])));
  const text = (v: unknown) => (typeof v === "string" ? v : undefined);
  const out = new Map<string, DiscardedCapture>();
  for (const q of set) {
    const a = q.op?.args ?? {};
    if (q.op?.upload) out.set(q.op.upload.blobKey, { key: q.op.upload.blobKey, orderId: text(a.p_order_id) ?? q.orderId, kind: text(a.p_kind), takenAt: text(a.p_taken_at) });
    if (q.op?.rpc !== "create_order") continue;
    for (const p of photos)
      if (p.orderId === a.p_order_id && p.source.type === "idb" && !needed.has(p.source.key) && !out.has(p.source.key))
        out.set(p.source.key, { key: p.source.key, orderId: p.orderId, kind: p.kind, takenAt: p.takenAt });
  }
  return [...out.values()];
}

/**
 * Later unsent changes of the same order that need, on the server, what `id` records there without naming it — a report
 * and its shares need the validated closure, a check-out needs its jornada's check-in. Discarding `id` does not take them
 * along (discardSet follows only the records an item creates: these may still apply, and they are the person's captures):
 * the server will probably refuse them too, and they can be discarded then. None when the item's last answer was lost (it
 * may have been applied).
 */
export function likelyRefusedAfter(queue: readonly SyncItem[], id: string): SyncItem[] {
  const at = queue.findIndex((q) => q.id === id);
  const item = queue[at];
  if (!item?.op || !item.orderId || outcomeUnknown(item)) return [];
  const { rpc, args } = item.op;
  const needs = (q: SyncItem) =>
    rpc === "validate_closure"
      ? q.op?.rpc === "generate_report" || q.op?.rpc === "log_share"
      : rpc === "check_in" && q.op?.rpc === "check_out" && q.op.args.p_jornada_id === args.p_jornada_id;
  return queue.slice(at + 1).filter((q) => isUnsent(q) && q.orderId === item.orderId && needs(q));
}

/**
 * Server answers after which retrying the same request cannot help (only discarding it does): the sheet offers no
 * "Reintentar" for them. Besides the request itself (a reused op id, a check already there, a lost photo): a device time
 * older than the server accepts (`device_time_stale`), a jornada rescheduled or an order reassigned, out of the person's
 * scope, closed or cancelled meanwhile (field evidence of those orders stays on the device until it is discarded, and the
 * discard offers to save its photos first), and a photo file the bucket refused (`upload_forbidden`, classifyUpload).
 */
export const NO_RETRY_HINTS = new Set([
  "op_id_reused", "duplicate_check", "already_resolved", "already_provisioned", "photo_lost",
  "device_time_stale", "jornada_rescheduled", "order_reassigned", "out_of_scope", "order_closed", "order_cancelled", "upload_forbidden",
]);

/**
 * The person decides about it (the sync sheet offers Reintentar / Descartar): stopped items, and items being retried after
 * a server answer (a parent that may never arrive, a server that keeps failing). Waiting for the network is not one of them.
 */
export const isStopped = (q: SyncItem) => q.state === "error" || (q.state === "pendiente" && !!q.problem && q.problem.code !== "network");

/** "Reintentar" can help: a stopped item with a request to resend, refused for a reason a resend may not meet again. */
export const isRetryable = (q: SyncItem) => q.state === "error" && !!q.op && !NO_RETRY_HINTS.has(q.problem?.hint ?? "");

/** What a discard set holds, by kind (the confirmation names the field captures that leave the device). */
export type DiscardSummary = { photos: number; checks: number; notes: number; other: number };

export function discardSummary(set: readonly SyncItem[]): DiscardSummary {
  const out: DiscardSummary = { photos: 0, checks: 0, notes: 0, other: 0 };
  for (const q of set) {
    const rpc = q.op?.rpc;
    if (rpc === "add_photo") out.photos++;
    else if (rpc === "check_in" || rpc === "check_out") out.checks++;
    else if (rpc === "add_jornada_note") out.notes++;
    else out.other++;
  }
  return out;
}
