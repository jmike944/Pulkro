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
 * The channel also answers "unsent changes?", so a sign-out counts the queue of every open tab of the account.
 */
import { createStore, del, get, getMany, promisifyRequest, type UseStore } from "idb-keyval";
import type { PersistStorage, StorageValue } from "zustand/middleware";

export type DeviceOwner = "demo" | `supabase:${string}`;

type SessionLike = { mode?: string; userId?: string } | null | undefined;

/** Who the data on the device belongs to: an account, or the demo (a signed-out device included). */
export const ownerOf = (session: SessionLike): DeviceOwner =>
  session?.mode === "supabase" && session.userId ? `supabase:${session.userId}` : "demo";

const OWNER_KEY = "device-owner";
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
};
let hooks: TabHooks | null = null;
export function registerTab(tab: TabHooks) {
  hooks = tab;
}

/** The owner on the device as this tab last read or wrote it (undefined until the store has been read). */
let ownerSeen: DeviceOwner | undefined;
/** This tab gave the device up: it never writes again. */
let left = false;

/* ───────────── debounced writes ───────────── */

type Write = { name: string; value: string; owner: DeviceOwner };
let pending: Write | null = null;
let pendingSince = 0;
let timer: ReturnType<typeof setTimeout> | undefined;

function commit(w: Write): Promise<void> {
  if (!idb || left) return Promise.resolve();
  const expected = ownerSeen;
  // Optimistic: transactions on the store run in the order they are created, so the next write already expects this owner.
  ownerSeen = w.owner;
  let refused: DeviceOwner | undefined;
  return idb("readwrite", (store) => {
    const read = store.get(OWNER_KEY);
    read.onsuccess = () => {
      const stored = read.result as DeviceOwner | undefined;
      if (stored !== undefined && stored !== expected) {
        refused = stored;
        return;
      }
      store.put(w.value, w.name);
      store.put(w.owner, OWNER_KEY);
    };
    return promisifyRequest(store.transaction);
  }).then(
    () => {
      // Before this tab read the device (expected undefined) a write would clobber unread data: dropped, nothing else.
      if (refused !== undefined) {
        if (expected !== undefined) leaveDevice();
      } else if (expected !== undefined && expected !== w.owner) post({ t: "owner", owner: w.owner });
    },
    (error) => console.warn("[store] No se pudieron guardar los datos en el dispositivo.", error),
  );
}

/** Writes the debounced state now (sign-in, sign-out, the page going away). Resolves once it is committed (or refused). */
export function flushWrite(): Promise<void> {
  clearTimeout(timer);
  if (!pending) return Promise.resolve();
  const w = pending;
  pending = null;
  return commit(w);
}

/** zustand `persist` storage over IndexedDB: debounced, owner-checked writes. */
export function createDeviceStorage<S extends { session?: SessionLike }>(): PersistStorage<S> {
  return {
    getItem: async (name) => {
      if (!idb) return null;
      const [raw, owner] = await getMany<string | undefined>([name, OWNER_KEY], idb);
      let value: StorageValue<S> | null = null;
      try {
        value = typeof raw === "string" ? (JSON.parse(raw) as StorageValue<S>) : null;
      } finally {
        // Devices saved before the owner was stored: the saved session says whose data it is.
        ownerSeen = (owner as DeviceOwner | undefined) ?? ownerOf(value?.state.session);
      }
      return value;
    },
    setItem: (name, value) => {
      if (!idb || left) return;
      const waiting = pending !== null;
      pending = { name, value: JSON.stringify(value), owner: ownerOf(value.state.session) };
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

/** The owner may have changed while this tab was hidden or frozen (a missed announcement): check before showing anything. */
async function checkOwner() {
  if (!idb || left || ownerSeen === undefined) return;
  const expected = ownerSeen;
  const stored = await get<DeviceOwner>(OWNER_KEY, idb);
  if (left || ownerSeen !== expected) return; // this tab changed the owner meanwhile
  if (stored !== undefined && stored !== expected) leaveDevice();
}

/* ───────────── between tabs ───────────── */

type Message =
  | { t: "owner"; owner: DeviceOwner }
  | { t: "unsent?"; id: string; owner: DeviceOwner }
  | { t: "unsent"; id: string; ids: string[] };

const channel = browser && typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("pulkro-device") : null;

function post(message: Message) {
  try {
    channel?.postMessage(message);
  } catch {
    // a closed channel: the owner check on the next write still holds
  }
}

channel?.addEventListener("message", (event: MessageEvent<Message>) => {
  const m = event.data;
  if (!hooks || left) return;
  if (m.t === "owner") {
    if (m.owner !== hooks.owner()) leaveDevice();
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
    if (e.persisted) void checkOwner();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void flushWrite();
    else void checkOwner();
  });
}
