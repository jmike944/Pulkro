/**
 * Three-way merge of the persisted store (device-storage.ts). Every tab of an account holds the whole dataset in memory and
 * writes it back whole; when another tab wrote since this tab last read or wrote the device, its write is merged instead of
 * replaced, so neither tab's captures are lost:
 *  - `base`: what this tab last read from, or wrote to, the device (its memory shares the records it has not changed);
 *  - `mine`: this tab's state now;
 *  - `theirs`: what is on the device now (another tab's write).
 * Record by record (every collection holds records with an `id`, the queue included): a record this tab changed, added or
 * deleted since `base` follows this tab; every other record follows the device. A record both sides changed (a jornada with
 * a note from each tab) merges field by field — this tab's fields where it changed them — and its lists of entries with ids
 * (notes, crew changes, timeline, shares) entry by entry. An item of the queue both sides changed keeps the furthest state
 * (sent > failed > waiting), so a resend never brings back an item another tab already sent. The session, meta and the
 * queue's flags follow this tab when it changed them. Pure: no I/O.
 */

type Keyed = { id: string };
export type Snapshot = Record<string, unknown>;

/** Collections whose new records the store puts first (newest first); the rest append. */
const PREPENDED = new Set(["orders", "incidents", "reports", "cases", "surveys", "audit"]);
const COLLECTIONS = new Set([
  "units", "users", "workers", "clients", "sites", "serviceTypes", "materials", "orders", "jornadas", "photos", "incidents",
  "reports", "cases", "surveys", "audit",
]);

const isKeyedList = (v: unknown): v is Keyed[] => Array.isArray(v) && v.every((x) => !!x && typeof x === "object" && typeof (x as Keyed).id === "string");

/** A record both sides changed: the other side's, with this tab's changed fields (lists of entries merged entry by entry). */
function mergeRecord<T>(mine: T, theirs: T, base: T): T {
  if (!base || !mine || !theirs || typeof base !== "object" || typeof mine !== "object" || typeof theirs !== "object") return mine;
  const b = base as Snapshot;
  const m = mine as Snapshot;
  const out: Snapshot = { ...(theirs as Snapshot) };
  for (const f of new Set([...Object.keys(b), ...Object.keys(m)])) {
    if (m[f] === b[f]) continue;
    const [bf, mf, tf] = [b[f], m[f], (theirs as Snapshot)[f]];
    out[f] = isKeyedList(bf) && isKeyedList(mf) && isKeyedList(tf) ? mergeById(bf, mf, tf) : mf;
  }
  return out as T;
}

function mergeById<T extends Keyed>(base: T[], mine: T[], theirs: T[], opts: { prepend?: boolean; both?: (mine: T, theirs: T, base: T) => T } = {}): T[] {
  const b = new Map(base.map((x) => [x.id, x] as const));
  const m = new Map(mine.map((x) => [x.id, x] as const));
  const seen = new Set<string>();
  const out: T[] = [];
  for (const t of theirs) {
    seen.add(t.id);
    const bx = b.get(t.id);
    const mx = m.get(t.id);
    if (!bx) {
      // Added on the device (or by both sides): this tab's copy when it has one.
      out.push(mx ?? t);
      continue;
    }
    if (!mx) continue; // this tab deleted it
    out.push(mx === bx ? t : (opts.both ?? mergeRecord)(mx, t, bx));
  }
  // Records only this tab has: added here, or changed here while the other tab deleted them.
  const mineOnly = mine.filter((x) => !seen.has(x.id) && (!b.has(x.id) || b.get(x.id) !== x));
  return opts.prepend ? [...mineOnly, ...out] : [...out, ...mineOnly];
}

const RANK: Record<string, number> = { sincronizado: 3, error: 2, sincronizando: 1, pendiente: 1 };
type QueueItem = Keyed & { state?: string; at?: string };

/** The furthest state of an item both tabs changed (sent > failed > waiting); a tie keeps this tab's. */
const furthest = (mine: QueueItem, theirs: QueueItem) => ((RANK[theirs.state ?? ""] ?? 0) > (RANK[mine.state ?? ""] ?? 0) ? theirs : mine);

export function mergeSnapshots(base: Snapshot, mine: Snapshot, theirs: Snapshot): Snapshot {
  const out: Snapshot = { ...theirs };
  for (const key of Object.keys(theirs)) {
    const b = base[key];
    const m = mine[key];
    const t = theirs[key];
    if (COLLECTIONS.has(key) && isKeyedList(b) && isKeyedList(m) && isKeyedList(t)) {
      out[key] = m === b ? t : mergeById(b, m, t, { prepend: PREPENDED.has(key) });
    } else if (key === "sync" && b && m && t && typeof b === "object" && typeof m === "object" && typeof t === "object") {
      const bs = b as Snapshot;
      const ms = m as Snapshot;
      const ts = t as Snapshot;
      const sync: Snapshot = { ...ts };
      for (const f of Object.keys(ts)) {
        if (f === "queue") continue;
        if (ms[f] !== bs[f]) sync[f] = ms[f];
      }
      const [bq, mq, tq] = [bs.queue, ms.queue, ts.queue];
      if (isKeyedList(bq) && isKeyedList(mq) && isKeyedList(tq) && mq !== bq) {
        // FIFO: items of both tabs in the order they were created.
        sync.queue = mergeById<QueueItem>(bq, mq, tq, { both: furthest })
          .map((q, i) => [q, i] as const)
          .sort(([x, i], [y, j]) => (x.at ?? "").localeCompare(y.at ?? "") || i - j)
          .map(([q]) => q);
      }
      out[key] = sync;
    } else if (m !== undefined && m !== b) {
      out[key] = m;
    }
  }
  return out;
}
