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
import type { SyncItem, SyncProblem } from "@/lib/types";

/** The chain an item belongs to: its order, or else the record it writes (`catalogo:<id>`, `usuario:<id>`). */
export const chainKey = (q: Pick<SyncItem, "orderId" | "entity" | "entityId">): string => (q.orderId ? `orden:${q.orderId}` : `${q.entity}:${q.entityId}`);

export const isUnsent = (q: SyncItem) => q.state !== "sincronizado";

/** For every unsent item that must wait: the earlier unsent item it waits for (the first one of its chain or of a dep). */
export function waitsFor(queue: readonly SyncItem[]): Map<string, SyncItem> {
  const heads = new Map<string, SyncItem>();
  const out = new Map<string, SyncItem>();
  for (const q of queue) {
    if (!isUnsent(q)) continue;
    const own = chainKey(q);
    const blocker = [own, ...(q.deps ?? [])].map((k) => heads.get(k)).find(Boolean);
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

/** What a PostgREST answer to `public.<rpc>` means for the queue. */
export function classifyRpc(error: RpcError | null, status: number, data?: unknown): Outcome {
  if (!error) return { kind: "ok", data };
  const code = error.code ?? "";
  const hint = error.hint ?? "";
  if (status === 0 || (!code && NETWORK_RE.test(error.message))) return { kind: "network", message: NETWORK_MESSAGE };
  if (code === "PT401") {
    if (hint === "inactive" || hint === "no_profile") return { kind: "inactive", message: error.message };
    return { kind: "auth", message: error.message };
  }
  if (status === 401 || /^PGRST30\d$/.test(code) || (!/^PT\d{3}$/.test(code) && /\bjwt\b/i.test(error.message))) return { kind: "auth", message: error.message };
  const problem = (kind: SyncProblem["kind"], message = messageOf(error, code)): SyncProblem => ({ kind, message, code: code || String(status), hint: hint || undefined });
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
  const problem = (kind: SyncProblem["kind"], message: string): SyncProblem => ({ kind, message, code: `storage ${code || status}` });
  if (code === "413" || status === 413 || /too large|payload/i.test(msg))
    return { kind: "conflict", problem: problem("conflicto", "La foto es demasiado grande para el servidor (máximo 10 MB).") };
  if (code === "415" || status === 415 || /mime|content type|invalid_mime_type/i.test(msg))
    return { kind: "conflict", problem: problem("conflicto", "El servidor no acepta este tipo de archivo (solo JPEG, PNG o WebP).") };
  if (code === "403" || status === 403 || /row[- ]level security|unauthorized|not allowed/i.test(msg))
    return {
      kind: "conflict",
      problem: problem("conflicto", "El servidor no permitió subir la foto: la orden ya no admite evidencia o ya no está a su cargo."),
    };
  if (status === 408 || status === 429 || status >= 500 || /^5\d\d$/.test(code) || code === "429")
    return { kind: "retry", problem: problem("reintento", BUSY_MESSAGE) };
  return { kind: "conflict", problem: problem("conflicto", `El servidor rechazó el archivo de la foto${msg ? `: ${msg}` : "."}`) };
}

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
    default:
      return q.op?.creates ? pick("p_client_id", "p_site_id", "p_worker_id", "p_service_type_id", "p_material_id") : [];
  }
}

/** The operation names one of `ids` anywhere in its arguments (or belongs to one of those orders). */
function names(q: SyncItem, ids: Set<string>): boolean {
  if (q.orderId && ids.has(q.orderId)) return true;
  const walk = (v: unknown): boolean =>
    typeof v === "string" ? ids.has(v) : Array.isArray(v) ? v.some(walk) : !!v && typeof v === "object" && Object.values(v).some(walk);
  return walk(q.op?.args);
}

/**
 * The items "Descartar" removes with `id`: the item and every later unsent item that depends on a record it creates — the
 * photo edits of a discarded photo, the check-ins of discarded days, the order on a discarded client, every change of a
 * discarded new order… They could never be applied (the server would answer `parent_missing` until the retry cap).
 */
export function discardSet(queue: readonly SyncItem[], id: string): SyncItem[] {
  const at = queue.findIndex((q) => q.id === id);
  const item = queue[at];
  if (!item || item.state === "sincronizado" || item.state === "sincronizando") return [];
  const out = [item];
  const ids = new Set(createdIds(item));
  for (const q of queue.slice(at + 1)) {
    if (!isUnsent(q) || q.state === "sincronizando" || !ids.size || !names(q, ids)) continue;
    out.push(q);
    for (const x of createdIds(q)) ids.add(x);
  }
  return out;
}

/** Server answers after which retrying the same request cannot help (only discarding it does). */
export const NO_RETRY_HINTS = new Set(["op_id_reused", "duplicate_check", "already_resolved", "already_provisioned"]);
