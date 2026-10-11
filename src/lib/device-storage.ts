"use client";

/**
 * The store's persistence (IndexedDB, debounced writes) and the coordination of the tabs that share it.
 *
 * Every tab holds the whole dataset in memory and writes it back whole. Once one tab signs an account out (or another account
 * signs in and replaces the data), the next write of any other tab would put the previous account back on the device —
 * signed in, without a password — or overwrite the new account's data. So:
 *  - The device's owner ("demo", or "supabase:<user id>") is stored next to the data. A write checks it and writes in one
 *    IndexedDB transaction, and is refused when the owner is no longer the one this tab last read or wrote.
 *  - The tab that changes the owner announces it on a BroadcastChannel once its write has been committed.
 *  - A tab whose owner was replaced (a refused write, the announcement, or a check when it becomes visible again) stops
 *    writing, drops its data from memory and starts over at /login (`leaveDevice`).
 * Two tabs of the same account share the owner, so the owner alone would let the last tab to write replace the other's
 * captures with its older snapshot. A revision is stored next to the data and bumped by every write, in the same
 * transaction: a tab whose last read or write is older than the device merges its changes into what is there (device-merge.ts)
 * instead of replacing it, and adopts the result. Every write is announced, so the other tabs merge it into their memory
 * right away (and again whenever they become visible): what one tab captured shows in the others.
 * A write that fails (storage full…) is reported to the store (`saveFailed`: the shell warns the person), retried, and — when
 * the storage is full — first frees the copies of server photos (the server can give them back).
 * The channel also answers "unsent changes?", so a sign-out counts the queue of every open tab of the account.
 */
import { createStore, del, get, getMany, promisifyRequest, type UseStore } from "idb-keyval";
import type { PersistStorage, StorageValue } from "zustand/middleware";
import { mergeSnapshots, type Snapshot } from "./device-merge";

export type DeviceOwner = "demo" | `supabase:${string}`;

type SessionLike = { mode?: string; userId?: string } | null | undefined;

/** Who the data on the device belongs to: an account, or the demo (a signed-out device included). */
export const ownerOf = (session: SessionLike): DeviceOwner =>
  session?.mode === "supabase" && session.userId ? `supabase:${session.userId}` : "demo";

const OWNER_KEY = "device-owner";
/** Bumped by every write of the data, in the same transaction. */
const REV_KEY = "device-rev";
const browser = typeof window !== "undefined";
const idb: UseStore | undefined = browser && typeof indexedDB !== "undefined" ? createStore("pulkro-cuadrillas", "state") : undefined;

/** What the store tells this module about the tab (registered once by store.ts). */
type TabHooks = {
  /** The owner of the data this tab holds in memory. */
  owner: () => DeviceOwner;
  /** Ids of this tab's queue items that have not reached the server. */
  unsent: () => string[];
  /** Empties the store in memory (the tab is about to start over). */
  drop: () => void;
  /** Another tab of the same owner wrote the device: merge `theirs` into memory (`base`: what this tab last read or wrote). */
  adopt: (theirs: Snapshot, base: Snapshot) => void;
  /** A write of the data failed (storage full, a closed database…), or works again (`null`). */
  saveFailed: (error: unknown) => void;
  /** Frees what the server can give back (kept copies of server photos) when the storage is full. */
  evict: () => Promise<void>;
};
let hooks: TabHooks | null = null;
export function registerTab(tab: TabHooks) {
  hooks = tab;
}

type Value = StorageValue<Snapshot>;

/** The owner on the device as this tab last read or wrote it (undefined until the store has been read). */
let ownerSeen: DeviceOwner | undefined;
/** The device's revision as this tab last read or wrote it. */
let revSeen: number | undefined;
/** What this tab last read from, or wrote to, the device (the base of a merge). */
let base: Value | undefined;
/** The key the store is saved under ("pulkro-cuadrillas"). */
let dataKey: string | undefined;
/** This tab gave the device up: it never writes again. */
let left = false;

/** Commits and reads of other tabs' writes, one after the other (each reads what the previous one left). */
let chain: Promise<unknown> = Promise.resolve();
function serial<T>(run: () => Promise<T>): Promise<T> {
  const next = chain.then(run);
  chain = next.catch(() => undefined);
  return next;
}

const parse = (raw: unknown): Value | undefined => {
  if (typeof raw !== "string") return undefined;
  try {
    return JSON.parse(raw) as Value;
  } catch {
    return undefined;
  }
};

/* ───────────── debounced writes ───────────── */

/** The value is serialized when it is written (once per debounce), not on every store update. */
type Write = { name: string; value: Value; owner: DeviceOwner };
let pending: Write | null = null;
let pendingSince = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
/** The last write failed (until one succeeds). */
let failing = false;
let failures = 0;

const isQuotaError = (e: unknown) =>
  !!e && typeof e === "object" && ((e as { name?: string }).name === "QuotaExceededError" || /quota/i.test(String((e as { message?: string }).message ?? "")));

function commit(w: Write): Promise<boolean> {
  return serial(() => commitNow(w, false));
}

async function commitNow(w: Write, evicted: boolean): Promise<boolean> {
  if (!idb || left) return true;
  const expected = ownerSeen;
  // Optimistic: transactions on the store run in the order they are created, so the next write already expects this owner.
  ownerSeen = w.owner;
  let refused: DeviceOwner | undefined;
  let rev = 0;
  let merged: Value | undefined;
  try {
    await idb("readwrite", (store) => {
      const write = (value: Value) => {
        store.put(JSON.stringify(value), w.name);
        store.put(w.owner, OWNER_KEY);
        store.put(rev, REV_KEY);
      };
      const owner = store.get(OWNER_KEY);
      owner.onsuccess = () => {
        const stored = owner.result as DeviceOwner | undefined;
        if (stored !== undefined && stored !== expected) {
          refused = stored;
          return;
        }
        const current = store.get(REV_KEY);
        current.onsuccess = () => {
          const storedRev = current.result as number | undefined;
          rev = (storedRev ?? 0) + 1;
          // Another tab of this owner wrote since this tab last read or wrote: merge, never replace its captures. A write
          // that hands the device to another owner (a sign-out, another account) replaces it: the person was asked first.
          if (storedRev === revSeen || !base || stored !== w.owner) return write(w.value);
          const data = store.get(w.name);
          data.onsuccess = () => {
            const theirs = parse(data.result);
            merged = theirs ? { ...w.value, state: mergeSnapshots(base!.state, w.value.state, theirs.state) } : undefined;
            write(merged ?? w.value);
          };
        };
      };
      return promisifyRequest(store.transaction);
    });
  } catch (error) {
    ownerSeen = expected;
    // Full: free the copies of server photos (the server gives them back), then try once more.
    if (!evicted && isQuotaError(error) && hooks) {
      await hooks.evict().catch(() => undefined);
      return commitNow(w, true);
    }
    console.warn("[store] No se pudieron guardar los datos en el dispositivo.", error);
    failing = true;
    failures++;
    hooks?.saveFailed(error);
    // Retried (unless a newer write is waiting: it carries this one's changes).
    if (!pending) pending = w;
    clearTimeout(timer);
    timer = setTimeout(() => void flushWrite(), Math.min(60_000, 2000 * 2 ** Math.min(failures - 1, 5)));
    return false;
  }
  // Before this tab read the device (expected undefined) a write would clobber unread data: dropped, nothing else.
  if (refused !== undefined) {
    if (expected !== undefined) leaveDevice();
    return true;
  }
  revSeen = rev;
  base = merged ?? w.value;
  if (failing) {
    failing = false;
    failures = 0;
    hooks?.saveFailed(null);
  }
  if (expected !== undefined && expected !== w.owner) post({ t: "owner", owner: w.owner });
  post({ t: "rev", rev });
  // What the other tab wrote is in the device now: bring it into memory too (this tab's newer changes stay).
  if (merged) hooks?.adopt(merged.state, w.value.state);
  return true;
}

/**
 * Writes the debounced state now (sign-in, sign-out, a capture, the page going away). Resolves once it is committed (or
 * refused): `false` when the device could not store it (the change lives only in this tab's memory for now).
 */
export function flushWrite(): Promise<boolean> {
  clearTimeout(timer);
  if (!pending) return serial(async () => !failing);
  const w = pending;
  pending = null;
  return commit(w);
}

/** The same persisted state (partialize rebuilds `sync` on every update: compare its fields). */
function sameState(a: Snapshot, b: Snapshot): boolean {
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((k) => {
    if (a[k] === b[k]) return true;
    if (k !== "sync" || !a[k] || !b[k] || typeof a[k] !== "object" || typeof b[k] !== "object") return false;
    const x = a[k] as Snapshot;
    const y = b[k] as Snapshot;
    const fields = Object.keys(x);
    return fields.length === Object.keys(y).length && fields.every((f) => x[f] === y[f]);
  });
}

/** zustand `persist` storage over IndexedDB: debounced, owner-checked, merging writes. */
export function createDeviceStorage<S extends { session?: SessionLike }>(): PersistStorage<S> {
  return {
    getItem: async (name) => {
      if (!idb) return null;
      dataKey = name;
      const [raw, owner, rev] = await getMany<unknown>([name, OWNER_KEY, REV_KEY], idb);
      const value = parse(raw) ?? null;
      // Devices saved before the owner was stored: the saved session says whose data it is.
      ownerSeen = (owner as DeviceOwner | undefined) ?? ownerOf((value?.state as { session?: SessionLike } | undefined)?.session);
      revSeen = rev as number | undefined;
      base = value ?? undefined;
      return value as StorageValue<S> | null;
    },
    setItem: (name, value) => {
      if (!idb || left) return;
      const v = value as unknown as Value;
      // A store update that changed nothing persisted (a no-op setState): nothing to write.
      const last = pending?.value ?? base;
      if (last && sameState(v.state, last.state)) return;
      const waiting = pending !== null;
      pending = { name, value: v, owner: ownerOf(value.state.session) };
      // Debounce 350 ms, but never let a stream of updates postpone the write by more than ~1 s (a sign-in or a capture
      // followed by constant store activity used to stay unsaved until the stream stopped).
      if (!waiting) pendingSince = Date.now();
      clearTimeout(timer);
      timer = setTimeout(() => void flushWrite(), Date.now() - pendingSince >= 1000 ? 0 : 350);
    },
    removeItem: async (name) => {
      if (idb) await del(name, idb);
    },
  };
}

/* ───────────── other tabs' writes ───────────── */

/**
 * Brings what other tabs of this owner wrote into this tab's memory (merged: this tab's unsaved changes stay). Run when
 * another tab announces a write, and whenever this tab becomes visible again (a missed announcement), before it syncs. Also
 * notices a replaced owner (another account signed in, or a sign-out) and leaves the device.
 */
export function syncFromDevice(): Promise<void> {
  return serial(async () => {
    if (!idb || left || ownerSeen === undefined || !dataKey) return;
    const [owner, rev] = await getMany<unknown>([OWNER_KEY, REV_KEY], idb);
    if (left) return;
    if (owner !== undefined && owner !== ownerSeen) {
      leaveDevice();
      return;
    }
    if (rev === revSeen || !base || !hooks) return;
    const theirs = parse(await get(dataKey, idb));
    if (!theirs || left) return;
    const prev = base;
    base = theirs;
    revSeen = rev as number | undefined;
    hooks.adopt(theirs.state, prev.state);
  });
}

/** The unsent queue items saved on the device for `owner` (tabs that are closed or frozen hold nothing else). */
export async function persistedUnsent(owner: DeviceOwner): Promise<string[]> {
  if (!idb || !dataKey) return [];
  try {
    const [raw, stored] = await getMany<unknown>([dataKey, OWNER_KEY], idb);
    const value = parse(raw);
    const whose = (stored as DeviceOwner | undefined) ?? ownerOf((value?.state as { session?: SessionLike } | undefined)?.session);
    if (whose !== owner) return [];
    const queue = ((value?.state as { sync?: { queue?: { id: string; state: string }[] } } | undefined)?.sync?.queue ?? []);
    return queue.filter((q) => q.state !== "sincronizado").map((q) => q.id);
  } catch {
    return [];
  }
}

/* ───────────── giving the device up ───────────── */

/** Another tab signed out or replaced the account: stop writing, drop the data in memory, start over from /login. */
export function leaveDevice() {
  if (left || !browser) return;
  left = true;
  pending = null;
  clearTimeout(timer);
  hooks?.drop();
  // A client's survey page stays where it is; every other screen starts again at the sign-in.
  if (window.location.pathname.startsWith("/encuesta")) window.location.reload();
  else window.location.replace("/login");
}

/* ───────────── between tabs ───────────── */

type Message =
  | { t: "owner"; owner: DeviceOwner }
  | { t: "rev"; rev: number }
  | { t: "unsent?"; id: string; owner: DeviceOwner }
  | { t: "unsent"; id: string; ids: string[] };

const channel = browser && typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("pulkro-device") : null;

function post(message: Message) {
  try {
    channel?.postMessage(message);
  } catch {
    // a closed channel: the owner and revision checks on the next write still hold
  }
}

channel?.addEventListener("message", (event: MessageEvent<Message>) => {
  const m = event.data;
  if (!hooks || left) return;
  if (m.t === "owner") {
    if (m.owner !== hooks.owner()) leaveDevice();
  } else if (m.t === "rev") {
    if (m.rev !== revSeen) void syncFromDevice();
  } else if (m.t === "unsent?" && m.owner === hooks.owner()) {
    const ids = hooks.unsent();
    if (ids.length) post({ t: "unsent", id: m.id, ids });
  }
});

/** Unsent queue items that the other open tabs of `owner` hold (their memory may be ahead of the device). */
export function askOtherTabsUnsent(owner: DeviceOwner, waitMs = 300): Promise<string[]> {
  if (!channel) return Promise.resolve([]);
  const id = crypto.randomUUID();
  const ids = new Set<string>();
  const onMessage = (event: MessageEvent<Message>) => {
    const m = event.data;
    if (m.t === "unsent" && m.id === id) m.ids.forEach((x) => ids.add(x));
  };
  channel.addEventListener("message", onMessage);
  post({ t: "unsent?", id, owner });
  return new Promise((resolve) =>
    setTimeout(() => {
      channel.removeEventListener("message", onMessage);
      resolve([...ids]);
    }, waitMs),
  );
}

if (browser) {
  // A reload / app switch right after a capture must not lose the debounced write (the service worker may hard-navigate offline).
  window.addEventListener("pagehide", () => void flushWrite());
  window.addEventListener("pageshow", (e) => {
    if (e.persisted) void syncFromDevice();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void flushWrite();
    else void syncFromDevice();
  });
}
