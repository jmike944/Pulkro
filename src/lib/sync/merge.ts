/**
 * Puts pulled rows into the device's data (architecture §8: merge by id). Pure: no I/O, no store. The pull engine runs it
 * inside the store's setState so it always merges into the latest local state.
 *
 * Unsent local work wins: while an order has queue items that have not reached the server, every server row of that order
 * (the order, its jornadas, captures, incidents, photos, closure, reports, cases, surveys) is held back and the device keeps its
 * own version; the order is reported in `held` so the engine fetches its subtree again once the queue is empty. Catalog and
 * people records with unsent edits are held the same way. Bitácora lines are always taken (they are history, not state).
 *
 * Child rows whose parent is not on the device (a check-in of an unknown jornada, a share of an unknown report…) are not
 * applied: their order is reported in `orphans` and the engine fetches that order's whole subtree.
 */
import type { DataSnapshot, Order, SyncItem } from "@/lib/types";
import {
  byTime,
  mapAudit,
  mapCase,
  mapCaseEvent,
  mapCheck,
  mapClient,
  mapClosure,
  mapCrewChange,
  mapIncident,
  mapJornada,
  mapMaterial,
  mapNote,
  mapOrder,
  mapPhoto,
  mapProfile,
  mapReport,
  mapServiceType,
  mapShare,
  mapSite,
  mapSurvey,
  mapUnit,
  mapWorker,
  newerClosure,
} from "./map";
import { CATALOG_TABLES, SYNC_TABLES, isUuid, type RowOf, type RowsByTable, type SyncTable } from "./tables";

/** What the device has not sent yet: orders with queue items, and `${entity}:${id}` of every unsent record. */
export type PendingIndex = { orders: Set<string>; entities: Set<string> };

export function pendingIndex(queue: SyncItem[]): PendingIndex {
  const orders = new Set<string>();
  const entities = new Set<string>();
  for (const q of queue) {
    if (q.state === "sincronizado") continue;
    if (q.orderId) orders.add(q.orderId);
    if (q.entity === "orden") orders.add(q.entityId);
    entities.add(`${q.entity}:${q.entityId}`);
  }
  return { orders, entities };
}

export const NO_PENDING: PendingIndex = { orders: new Set(), entities: new Set() };

export type MergeResult = {
  data: DataSnapshot;
  /** Something on the device changed. */
  changed: boolean;
  /** Orders that were not on the device before this merge. */
  added: Set<string>;
  /** Orders whose rows were held back (unsent local changes). */
  held: Set<string>;
  /** Orders some of whose child rows arrived without their parent. */
  orphans: Set<string>;
};

type Keyed = { id: string };
type CollKey = keyof DataSnapshot;

/** Lazily copied collections: only the ones a batch touches are rebuilt. */
class Work {
  private maps = new Map<CollKey, Map<string, Keyed>>();
  readonly touched = new Set<CollKey>();
  constructor(private readonly base: DataSnapshot) {}
  map<K extends CollKey>(key: K): Map<string, DataSnapshot[K][number]> {
    let m = this.maps.get(key);
    if (!m) {
      m = new Map((this.base[key] as Keyed[]).map((x) => [x.id, x] as const));
      this.maps.set(key, m);
    }
    return m as Map<string, DataSnapshot[K][number]>;
  }
  get<K extends CollKey>(key: K, id: string) {
    return this.map(key).get(id);
  }
  has(key: CollKey, id: string) {
    return this.map(key).has(id);
  }
  /** Stores `item` unless the device already holds the same content (no rewrite, no re-render, no IndexedDB write). */
  put<K extends CollKey>(key: K, item: DataSnapshot[K][number]) {
    const m = this.map(key);
    if (sameValue(m.get((item as Keyed).id), item)) return;
    m.set((item as Keyed).id, item);
    this.touched.add(key);
  }
  remove(key: CollKey, id: string) {
    if (this.map(key).delete(id)) this.touched.add(key);
  }
  /** The collection as an array: existing items keep their place, new ones go at the end. */
  list<K extends CollKey>(key: K): DataSnapshot[K] {
    const m = this.map(key);
    const out: Keyed[] = [];
    const seen = new Set<string>();
    for (const x of this.base[key] as Keyed[]) {
      const cur = m.get(x.id);
      if (cur) {
        out.push(cur);
        seen.add(x.id);
      }
    }
    for (const [id, x] of m) if (!seen.has(id)) out.push(x);
    return out as DataSnapshot[K];
  }
}

/** Structural equality of plain data (keys holding `undefined` count as absent). */
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => sameValue(x, b[i]));
  }
  const ra = a as Record<string, unknown>;
  const rb = b as Record<string, unknown>;
  const ka = Object.keys(ra).filter((k) => ra[k] !== undefined);
  const kb = Object.keys(rb).filter((k) => rb[k] !== undefined);
  return ka.length === kb.length && ka.every((k) => sameValue(ra[k], rb[k]));
}

/** Newest first, like the store's own inserts (ties by id, so every device lists them the same way). */
const newestFirst = <T>(time: (x: T) => string, id: (x: T) => string) => (a: T, b: T) => {
  const ta = time(a);
  const tb = time(b);
  return ta < tb ? 1 : ta > tb ? -1 : id(b).localeCompare(id(a), undefined, { numeric: true });
};

/** Upsert one entry into a nested list by id, kept in time order. */
const upsertById = <T extends { id?: string; at: string }>(list: T[], item: T): T[] => {
  const i = list.findIndex((x) => x.id === item.id);
  const next = i < 0 ? [...list, item] : list.map((x, k) => (k === i ? item : x));
  return next.sort(byTime);
};

const CATALOG_ENTITY: Partial<Record<SyncTable, string>> = {
  profiles: "usuario",
  workers: "catalogo",
  clients: "catalogo",
  sites: "catalogo",
  service_types: "catalogo",
  materials: "catalogo",
  units: "catalogo",
};

/** Applies `batch` (any tables, applied parents first) to `data`. */
export function mergeRows(data: DataSnapshot, batch: RowsByTable, pending: PendingIndex = NO_PENDING): MergeResult {
  const w = new Work(data);
  const added = new Set<string>();
  const held = new Set<string>();
  const orphans = new Set<string>();
  const isHeld = (orderId: string) => {
    if (!pending.orders.has(orderId)) return false;
    held.add(orderId);
    return true;
  };
  /** The parent order must be on the device (and not held) for its rows to apply. */
  const orderOk = (orderId: string) => {
    if (isHeld(orderId)) return false;
    if (w.has("orders", orderId)) return true;
    orphans.add(orderId);
    return false;
  };
  const catalogHeld = (table: SyncTable, id: string) => pending.entities.has(`${CATALOG_ENTITY[table]}:${id}`);
  const patchOrder = (id: string, patch: (o: Order) => Order) => {
    const o = w.get("orders", id);
    if (o) w.put("orders", patch(o));
  };

  for (const table of SYNC_TABLES) {
    const rows = batch[table] as RowOf<typeof table>[] | undefined;
    if (!rows?.length) continue;
    switch (table) {
      case "units":
        for (const r of batch.units!) if (!catalogHeld(table, r.id)) w.put("units", mapUnit(r));
        break;
      case "profiles":
        for (const r of batch.profiles!) if (!catalogHeld(table, r.id)) w.put("users", mapProfile(r));
        break;
      case "workers":
        for (const r of batch.workers!) if (!catalogHeld(table, r.id)) w.put("workers", mapWorker(r));
        break;
      case "clients":
        for (const r of batch.clients!) if (!catalogHeld(table, r.id)) w.put("clients", mapClient(r, w.get("clients", r.id)?.siteIds));
        break;
      case "sites":
        for (const r of batch.sites!) if (!catalogHeld(table, r.id)) w.put("sites", mapSite(r));
        break;
      case "service_types":
        for (const r of batch.service_types!) if (!catalogHeld(table, r.id)) w.put("serviceTypes", mapServiceType(r));
        break;
      case "materials":
        for (const r of batch.materials!) if (!catalogHeld(table, r.id)) w.put("materials", mapMaterial(r));
        break;
      case "orders":
        for (const r of batch.orders!) {
          if (isHeld(r.id)) continue;
          const prev = w.get("orders", r.id);
          if (!prev) added.add(r.id);
          w.put("orders", mapOrder(r, prev));
        }
        break;
      case "jornadas":
        for (const r of batch.jornadas!) {
          if (!orderOk(r.order_id)) continue;
          const j = mapJornada(r, w.get("jornadas", r.id));
          if (j) w.put("jornadas", j);
          else w.remove("jornadas", r.id);
        }
        break;
      case "crew_changes":
        for (const r of batch.crew_changes!) {
          if (!orderOk(r.order_id)) continue;
          patchOrder(r.order_id, (o) => ({ ...o, crewHistory: upsertById(o.crewHistory, mapCrewChange(r)) }));
        }
        break;
      case "jornada_checks":
        for (const r of batch.jornada_checks!) {
          if (!orderOk(r.order_id)) continue;
          const j = w.get("jornadas", r.jornada_id);
          if (!j) {
            orphans.add(r.order_id);
            continue;
          }
          w.put("jornadas", r.kind === "entrada" ? { ...j, checkIn: mapCheck(r) } : { ...j, checkOut: mapCheck(r) });
        }
        break;
      case "jornada_notes":
        for (const r of batch.jornada_notes!) {
          if (!orderOk(r.order_id)) continue;
          const j = w.get("jornadas", r.jornada_id);
          if (!j) {
            orphans.add(r.order_id);
            continue;
          }
          w.put("jornadas", { ...j, log: upsertById(j.log, mapNote(r)) });
        }
        break;
      case "incidents":
        for (const r of batch.incidents!) if (orderOk(r.order_id)) w.put("incidents", mapIncident(r, w.get("incidents", r.id)));
        break;
      case "post_sale_cases":
        for (const r of batch.post_sale_cases!) if (orderOk(r.order_id)) w.put("cases", mapCase(r, w.get("cases", r.id)));
        break;
      case "case_events":
        for (const r of batch.case_events!) {
          if (!orderOk(r.order_id)) continue;
          const c = w.get("cases", r.case_id);
          if (!c) {
            orphans.add(r.order_id);
            continue;
          }
          w.put("cases", { ...c, timeline: upsertById(c.timeline, mapCaseEvent(r)) });
        }
        break;
      case "photos":
        for (const r of batch.photos!) {
          if (!orderOk(r.order_id)) continue;
          const p = mapPhoto(r);
          if (p) w.put("photos", p);
          else w.remove("photos", r.id);
        }
        break;
      case "order_closures":
        for (const r of batch.order_closures!) {
          if (!orderOk(r.order_id)) continue;
          patchOrder(r.order_id, (o) => ({ ...o, closure: newerClosure(o.closure, mapClosure(r)) }));
        }
        break;
      case "reports":
        for (const r of batch.reports!) if (orderOk(r.order_id)) w.put("reports", mapReport(r, w.get("reports", r.id)));
        break;
      case "report_shares":
        for (const r of batch.report_shares!) {
          if (!orderOk(r.order_id)) continue;
          const rep = w.get("reports", r.report_id);
          if (!rep) {
            orphans.add(r.order_id);
            continue;
          }
          w.put("reports", { ...rep, shares: upsertById(rep.shares, mapShare(r)) });
        }
        break;
      case "surveys":
        for (const r of batch.surveys!) if (orderOk(r.order_id)) w.put("surveys", mapSurvey(r, w.get("surveys", r.id)));
        break;
      case "survey_tokens":
        for (const r of batch.survey_tokens!) {
          if (!orderOk(r.order_id)) continue;
          const s = w.get("surveys", r.survey_id);
          if (!s) {
            orphans.add(r.order_id);
            continue;
          }
          if (s.token !== r.token) w.put("surveys", { ...s, token: r.token });
        }
        break;
      case "audit_log":
        for (const r of batch.audit_log!) {
          // A line of an order the device does not have: fetch that order (it changed, so it matters now).
          if (r.order_id && !w.has("orders", r.order_id)) {
            if (!pending.orders.has(r.order_id)) orphans.add(r.order_id);
            continue;
          }
          w.put("audit", mapAudit(r));
        }
        break;
    }
  }

  return finish(data, w, pending, { added, held, orphans });
}

/** Derived fields and array order, then the new snapshot. */
function finish(
  data: DataSnapshot,
  w: Work,
  pending: PendingIndex,
  sets: Pick<MergeResult, "added" | "held" | "orphans">,
): MergeResult {
  const t = w.touched;
  // Client.siteIds = the client's sites on the device.
  if (t.has("sites") || t.has("clients")) {
    const byClient = new Map<string, string[]>();
    for (const s of w.list("sites")) byClient.set(s.clientId, [...(byClient.get(s.clientId) ?? []), s.id]);
    for (const c of w.list("clients")) {
      const ids = byClient.get(c.id) ?? [];
      if (ids.length !== c.siteIds.length || ids.some((id, i) => c.siteIds[i] !== id)) w.put("clients", { ...c, siteIds: ids });
    }
  }
  // Incident / case photoIds = the photos that point at them (orders with unsent work keep the device's lists).
  if (t.has("photos") || t.has("incidents") || t.has("cases")) {
    const byIncident = new Map<string, string[]>();
    const byCase = new Map<string, string[]>();
    for (const p of w.list("photos")) {
      if (p.incidentId) byIncident.set(p.incidentId, [...(byIncident.get(p.incidentId) ?? []), p.id]);
      if (p.caseId) byCase.set(p.caseId, [...(byCase.get(p.caseId) ?? []), p.id]);
    }
    const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
    for (const i of w.list("incidents")) {
      if (pending.orders.has(i.orderId)) continue;
      const ids = byIncident.get(i.id) ?? [];
      if (!same(ids, i.photoIds)) w.put("incidents", { ...i, photoIds: ids });
    }
    for (const c of w.list("cases")) {
      if (pending.orders.has(c.orderId)) continue;
      const ids = byCase.get(c.id) ?? [];
      if (!same(ids, c.photoIds)) w.put("cases", { ...c, photoIds: ids });
    }
  }
  if (!t.size) return { data, changed: false, ...sets };
  const next: DataSnapshot = { ...data };
  for (const key of t) (next as Record<CollKey, unknown>)[key] = w.list(key);
  if (t.has("orders")) next.orders = [...next.orders].sort(newestFirst((o) => o.createdAt, (o) => o.id));
  if (t.has("incidents")) next.incidents = [...next.incidents].sort(newestFirst((i) => i.createdAt, (i) => i.id));
  if (t.has("cases")) next.cases = [...next.cases].sort(newestFirst((c) => c.createdAt, (c) => c.id));
  if (t.has("reports")) next.reports = [...next.reports].sort(newestFirst((r) => r.generatedAt, (r) => r.id));
  if (t.has("surveys")) next.surveys = [...next.surveys].sort(newestFirst((s) => s.sentAt, (s) => s.id));
  if (t.has("audit")) next.audit = [...next.audit].sort(newestFirst((a) => a.at, (a) => a.id));
  return { data: next, changed: true, ...sets };
}

/* ───────────── scope loss ───────────── */

export type Drops = Partial<Record<"orders" | "units" | "profiles" | "workers" | "clients" | "sites", string[]>>;

/**
 * Removes what the account no longer sees (sync_reconcile): orders with everything that hangs from them, and catalog / people
 * records. Orders with unsent work stay (the push decides about them), and so do records with unsent edits and `keep`
 * (the signed-in account and its unit).
 */
export function dropRows(data: DataSnapshot, drops: Drops, pending: PendingIndex = NO_PENDING, keep: Set<string> = new Set()): MergeResult {
  const none = { added: new Set<string>(), held: new Set<string>(), orphans: new Set<string>() };
  const orderIds = new Set((drops.orders ?? []).filter((id) => !pending.orders.has(id) && !keep.has(id)));
  const ids = (table: keyof Drops, entity: string) =>
    new Set((drops[table] ?? []).filter((id) => !keep.has(id) && !pending.entities.has(`${entity}:${id}`)));
  const units = ids("units", "catalogo");
  const users = ids("profiles", "usuario");
  const workers = ids("workers", "catalogo");
  const clients = ids("clients", "catalogo");
  const sites = ids("sites", "catalogo");
  const total = orderIds.size + units.size + users.size + workers.size + clients.size + sites.size;
  if (!total) return { data, changed: false, ...none };
  const byOrder = <T extends { orderId?: string }>(xs: T[]) => (orderIds.size ? xs.filter((x) => !x.orderId || !orderIds.has(x.orderId)) : xs);
  const byId = <T extends { id: string }>(xs: T[], gone: Set<string>) => (gone.size ? xs.filter((x) => !gone.has(x.id)) : xs);
  const nextSites = byId(data.sites, sites);
  const siteIds = new Set(nextSites.map((s) => s.id));
  const next: DataSnapshot = {
    ...data,
    orders: byId(data.orders, orderIds),
    jornadas: byOrder(data.jornadas),
    photos: byOrder(data.photos),
    incidents: byOrder(data.incidents),
    reports: byOrder(data.reports),
    cases: byOrder(data.cases),
    surveys: byOrder(data.surveys),
    audit: byOrder(data.audit),
    units: byId(data.units, units),
    users: byId(data.users, users),
    workers: byId(data.workers, workers),
    clients: byId(data.clients, clients).map((c) =>
      c.siteIds.every((id) => siteIds.has(id)) ? c : { ...c, siteIds: c.siteIds.filter((id) => siteIds.has(id)) },
    ),
    sites: nextSites,
  };
  return { data: next, changed: true, ...none };
}

/* ───────────── references the device lacks (scope gain, §8 step 2) ───────────── */

export type CatalogTable = (typeof CATALOG_TABLES)[number];

/**
 * Ids that `batch` points at and neither the device nor the batch itself has: clients, sites, service types, materials,
 * people, workers and units. The engine fetches them by id (RLS answers with what the account may see).
 */
export function missingRefs(data: DataSnapshot, batch: RowsByTable): Partial<Record<CatalogTable, string[]>> {
  const want: Record<CatalogTable, Set<string>> = {
    units: new Set(), profiles: new Set(), workers: new Set(), clients: new Set(), sites: new Set(), service_types: new Set(), materials: new Set(),
  };
  const add = (table: CatalogTable, id: string | null | undefined) => {
    if (id && isUuid(id)) want[table].add(id);
  };
  for (const r of batch.profiles ?? []) add("units", r.unit_id);
  for (const r of batch.workers ?? []) add("units", r.unit_id);
  for (const r of batch.clients ?? []) add("units", r.unit_id);
  for (const r of batch.sites ?? []) add("clients", r.client_id);
  for (const r of batch.orders ?? []) {
    add("units", r.unit_id);
    add("clients", r.client_id);
    add("sites", r.site_id);
    add("service_types", r.service_type_id);
    add("profiles", r.supervisor_id);
    add("profiles", r.created_by);
    for (const m of Array.isArray(r.materials) ? r.materials : []) {
      if (m && typeof m === "object" && !Array.isArray(m) && typeof m.material_id === "string") add("materials", m.material_id);
    }
  }
  for (const r of batch.jornadas ?? []) for (const id of r.worker_ids ?? []) add("workers", id);
  for (const r of batch.crew_changes ?? []) {
    add("profiles", r.created_by);
    for (const id of r.worker_ids ?? []) add("workers", id);
  }
  for (const r of batch.jornada_checks ?? []) add("profiles", r.created_by);
  for (const r of batch.jornada_notes ?? []) add("profiles", r.created_by);
  for (const r of batch.incidents ?? []) {
    add("profiles", r.created_by);
    add("profiles", r.resolved_by);
  }
  for (const r of batch.post_sale_cases ?? []) {
    add("profiles", r.owner_id);
    add("profiles", r.created_by);
    add("clients", r.client_id);
  }
  for (const r of batch.case_events ?? []) add("profiles", r.created_by);
  for (const r of batch.photos ?? []) if (!r.deleted_at) add("profiles", r.created_by);
  for (const r of batch.order_closures ?? []) {
    add("profiles", r.validated_by);
    add("profiles", r.exception_authorized_by);
  }
  for (const r of batch.reports ?? []) add("profiles", r.generated_by);
  for (const r of batch.report_shares ?? []) add("profiles", r.created_by);
  for (const r of batch.surveys ?? []) {
    add("profiles", r.sent_by);
    add("profiles", r.recorded_by);
    add("clients", r.client_id);
  }
  for (const r of batch.audit_log ?? []) add("profiles", r.actor_id);

  const ids = (xs: { id: string }[]) => new Set(xs.map((x) => x.id));
  const have: Record<CatalogTable, Set<string>> = {
    units: ids(data.units),
    profiles: ids(data.users),
    workers: ids(data.workers),
    clients: ids(data.clients),
    sites: ids(data.sites),
    service_types: ids(data.serviceTypes),
    materials: ids(data.materials),
  };
  const out: Partial<Record<CatalogTable, string[]>> = {};
  for (const table of CATALOG_TABLES) {
    const inBatch = ids(batch[table] ?? []);
    const missing = [...want[table]].filter((id) => !inBatch.has(id) && !have[table].has(id));
    if (missing.length) out[table] = missing;
  }
  return out;
}
