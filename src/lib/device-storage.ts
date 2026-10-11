"use client";

/**
 * The store's persistence (IndexedDB, debounced writes) and the one tab per device that holds it: the writer.
 *
 * Every tab of the app would hold the whole dataset in memory and write it back whole, so two tabs would replace each other's
 * captures; merging their writes record by record proved fragile (architecture §8). So a device has ONE writer:
 *  - The writer epoch (`writer-epoch`, next to the data). A tab becomes the writer by incrementing it in an IndexedDB
 *    transaction and remembering its value. Every write checks it, together with the device's owner, in the same readwrite
 *    transaction as the write: unless the stored epoch is still this tab's, the write is refused, and the tab stops writing
 *    for good, drops its data from memory and shows the blocker. A tab that was frozen in the background while another took
 *    over is harmless when it wakes up. The push and pull engines check it too before every RPC and pull (sync/writer.ts).
 *  - The Web Lock `pulkro-writer` (where the browser has Web Locks). The first tab takes it and holds it while it lives; any
 *    other tab of the app waits for it behind a full-screen blocker («Pulkro está abierta en otra ventana»: WriterGate) and
 *    becomes the writer when the writer's tab closes. «Usar aquí» (`takeOver`) asks the writer over the BroadcastChannel to
 *    save what it has pending and step aside; it does, stops sending and reading, and shows the blocker. When it does not
 *    answer in time (frozen, discarded), the new tab takes over anyway (`steal`, then a new epoch: any late write of the old
 *    tab is refused). A writer that cannot save what it holds (storage full) says so and stays: its captures exist only in
 *    its memory.
 *  - Without Web Locks, the epoch alone: a tab asks on the channel whether a writer is there, and the writer announces its
 *    epoch (a writer that hears a newer one has lost).
 *  Only once it holds the epoch does a tab read IndexedDB and hydrate the store (bootstrapStore). The other tabs never read,
 *  write, push or pull: they hold nothing.
 * The device's owner ("demo", or "supabase:<user id>") is stored next to the data, and every write checks it too: a write
 * that finds another owner than the one this tab last read or wrote is refused (`leaveDevice`).
 * A write that fails (storage full…) is reported to the store (`saveFailed`: the shell warns the person), retried, and — when
 * the storage is full — first frees the copies of server photos (the server can give them back).
 */
import { createStore, del, get, getMany, promisifyRequest, type UseStore } from "idb-keyval";
import type { PersistStorage, StorageValue } from "zustand/middleware";
import { setWriterCheck } from "./sync/writer";

export type DeviceOwner = "demo" | `supabase:${string}`;

type SessionLike = { mode?: string; userId?: string } | null | undefined;

/** Who the data on the device belongs to: an account, or the demo (a signed-out device included). */
export const ownerOf = (session: SessionLike): DeviceOwner =>
  session?.mode === "supabase" && session.userId ? `supabase:${session.userId}` : "demo";

const OWNER_KEY = "device-owner";
/** Incremented by every tab that becomes the device's writer; every write checks it. */
const EPOCH_KEY = "writer-epoch";
const LOCK = "pulkro-writer";
/** «Usar aquí»: how long the writer has to answer, then to save what it has pending, before this tab takes over anyway. */
const ACK_MS = 1500;
const HANDOVER_MS = 10_000;
/** Without Web Locks: how long a writer has to answer "writer?". */
const PROBE_MS = 400;

const browser = typeof window !== "undefined";
const idb: UseStore | undefined = browser && typeof indexedDB !== "undefined" ? createStore("pulkro-cuadrillas", "state") : undefined;

/** What the store tells this module about the tab (registered once by store.ts). */
type TabHooks = {
  /** Empties the store in memory (the tab gives the device up). */
  drop: () => void;
  /** Stops (true) or resumes (false) sending and reading: a handover is under way, or the tab gave the device up. */
  halt: (on: boolean) => void;
  /** A write of the data failed (storage full, a closed database…), or works again (`null`). */
  saveFailed: (error: unknown) => void;
  /** Frees what the server can give back (kept copies of server photos) when the storage is full. */
  evict: () => Promise<void>;
};
let hooks: TabHooks | null = null;
export function registerTab(tab: TabHooks) {
  hooks = tab;
}

type Snapshot = Record<string, unknown>;
type Value = StorageValue<Snapshot>;

/** The owner on the device as this tab last read or wrote it (undefined until the store has been read). */
let ownerSeen: DeviceOwner | undefined;
/** What this tab last read from, or wrote to, the device (an update that changes nothing persisted is not written). */
let base: Value | undefined;
/** The key the store is saved under ("pulkro-cuadrillas"). */
let dataKey: string | undefined;
/** This tab gave the device up: it never writes again. */
let left = false;

/** Commits, one after the other. */
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ───────────── the writer ───────────── */

/**
 * "starting": finding out (a few milliseconds). "writer": this tab holds the device. "blocked": another tab does (the
 * blocker shows). "taking": «Usar aquí» was pressed, the writer is saving and stepping aside. "kept": the writer could not
 * save what it holds and stays. "lost": this tab was the writer and another took over (it starts over behind the blocker).
 */
export type WriterState = "starting" | "writer" | "blocked" | "taking" | "kept" | "lost";

let writer: WriterState = browser ? "starting" : "writer";
/** This tab's writer epoch; undefined until claimed (or when the claim could not be stored: the first write claims it). */
let epoch: number | undefined;
const watchers = new Set<() => void>();

function setWriter(next: WriterState) {
  if (writer === next) return;
  writer = next;
  watchers.forEach((fn) => fn());
}

export const writerState = (): WriterState => writer;
export function subscribeWriter(fn: () => void): () => void {
  watchers.add(fn);
  return () => watchers.delete(fn);
}

type Locks = {
  request(name: string, options: { ifAvailable?: boolean; steal?: boolean; signal?: AbortSignal }, run: (lock: unknown) => Promise<void>): Promise<void>;
};
const locks = (): Locks | undefined => {
  const l = browser ? (navigator as Navigator & { locks?: Locks }).locks : undefined;
  return typeof l?.request === "function" ? l : undefined;
};

let becoming: Promise<void> | undefined;
let becameWriter = () => {};
/** The queued request of a tab waiting for the lock (aborted when it takes over instead). */
let waiting: AbortController | undefined;

/**
 * Resolves once this tab holds the device (its writer epoch): only then may it read IndexedDB and hydrate the store. While
 * another tab holds it, this tab stays behind the blocker (WriterGate) and the promise waits.
 */
export function becomeWriter(): Promise<void> {
  if (!becoming) {
    becoming = new Promise<void>((resolve) => (becameWriter = resolve));
    if (!idb) {
      // Nothing on the device to share (no IndexedDB): every tab keeps its own memory.
      setWriter("writer");
      becameWriter();
    } else if (locks()) requestLock("first");
    else void probe();
  }
  return becoming;
}

/** "first": take the lock if it is free. "wait": queue for it. "steal": take it from the tab that holds it («Usar aquí»). */
function requestLock(how: "first" | "wait" | "steal") {
  const l = locks()!;
  let options: { ifAvailable?: boolean; steal?: boolean; signal?: AbortSignal };
  if (how === "first") options = { ifAvailable: true };
  else if (how === "steal") options = { steal: true };
  else {
    waiting = new AbortController();
    options = { signal: waiting.signal };
  }
  l.request(LOCK, options, async (lock) => {
    if (!lock) {
      // Another tab holds it: wait behind the blocker (it comes to this tab when that one closes).
      setWriter("blocked");
      requestLock("wait");
      return;
    }
    waiting = undefined;
    await claim();
    // Held while this tab lives: a takeover reloads this tab (or steals the lock from it).
    await new Promise<void>(() => {});
  }).catch(() => {
    // The queued request was aborted (this tab takes over instead), or the lock was stolen from this tab: it lost the device.
    if (writer === "writer") loseWriter();
  });
}

/** The epoch, incremented in one transaction (retried a little: a full device can refuse even this small write). */
async function claimEpoch(): Promise<number | undefined> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      let next = 0;
      await idb!("readwrite", (store) => {
        const current = store.get(EPOCH_KEY);
        current.onsuccess = () => {
          next = (typeof current.result === "number" ? current.result : 0) + 1;
          store.put(next, EPOCH_KEY);
        };
        return promisifyRequest(store.transaction);
      });
      return next;
    } catch {
      await sleep(300 * (attempt + 1));
    }
  }
  // Still refused: this tab works from memory and its first write that the device accepts claims the epoch.
  return undefined;
}

async function claim() {
  epoch = await claimEpoch();
  setWriter("writer");
  post({ t: "writer", epoch });
  becameWriter();
}

/** Without Web Locks: is a writer there? None answers → this tab becomes it. */
async function probe() {
  const answered = await new Promise<boolean>((resolve) => {
    if (!channel) return resolve(false);
    const onMessage = (event: MessageEvent<Message>) => {
      if (event.data.t !== "writer") return;
      channel.removeEventListener("message", onMessage);
      resolve(true);
    };
    channel.addEventListener("message", onMessage);
    post({ t: "writer?" });
    setTimeout(() => {
      channel.removeEventListener("message", onMessage);
      resolve(false);
    }, PROBE_MS);
  });
  if (writer === "writer" || writer === "taking") return;
  if (answered) setWriter("blocked");
  else await claim();
}

/**
 * «Usar aquí»: asks the writer to save what it has pending and step aside, then takes the device. A writer that does not
 * answer (frozen, discarded) loses it anyway; one that cannot save what it holds keeps it ("kept").
 */
export function takeOver() {
  if (writer !== "blocked" && writer !== "kept") return;
  setWriter("taking");
  waiting?.abort();
  waiting = undefined;
  const id = crypto.randomUUID();
  let done = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const finish = (how: "take" | "kept") => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    channel?.removeEventListener("message", onMessage);
    if (how === "kept") {
      setWriter("kept");
      if (locks()) requestLock("wait");
    } else if (locks()) requestLock("steal");
    else void claim();
  };
  const onMessage = (event: MessageEvent<Message>) => {
    const m = event.data;
    if (!("id" in m) || m.id !== id) return;
    if (m.t === "releasing") {
      clearTimeout(timer);
      timer = setTimeout(() => finish("take"), HANDOVER_MS);
    } else if (m.t === "released") finish("take");
    else if (m.t === "kept") finish("kept");
  };
  channel?.addEventListener("message", onMessage);
  post({ t: "release?", id });
  timer = setTimeout(() => finish("take"), channel ? ACK_MS : 0);
}

/** The writer's side of «Usar aquí»: stop, save what is pending, step aside (or say it cannot). */
let handingOver = false;
async function handOver(id: string) {
  if (handingOver) return;
  handingOver = true;
  post({ t: "releasing", id });
  hooks?.halt(true);
  const saved = await flushWrite();
  if (saved === "failed") {
    // What this tab holds is not on the device: stepping aside would lose it.
    handingOver = false;
    hooks?.halt(false);
    post({ t: "kept", id });
    return;
  }
  post({ t: "released", id });
  loseWriter();
}

/** Another tab holds the device now: stop writing for good, drop the data from memory, start over behind the blocker. */
function loseWriter() {
  if (writer === "lost" || !browser) return;
  left = true;
  pending = null;
  clearTimeout(timer);
  hooks?.halt(true);
  hooks?.drop();
  setWriter("lost");
  // A fresh page waits for the device behind the blocker (and takes it when the other tab closes).
  window.location.reload();
}

/** The stored epoch is still this tab's (the push and pull engines ask before every request: sync/writer.ts). */
async function stillWriter(): Promise<boolean> {
  if (left || writer !== "writer") return false;
  if (!idb || epoch === undefined) return true;
  let stored: unknown;
  try {
    stored = await get(EPOCH_KEY, idb);
  } catch {
    return true; // cannot read: the write's own check still holds
  }
  if (stored === epoch) return true;
  loseWriter();
  return false;
}
setWriterCheck(stillWriter);

/* ───────────── debounced writes ───────────── */

/** The value is serialized when it is written (once per debounce), not on every store update. */
type Write = { name: string; value: Value; owner: DeviceOwner };
let pending: Write | null = null;
let pendingSince = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
/** The last write failed (until one succeeds). */
let failing = false;
let failures = 0;

/** "committed": on the device. "refused": this tab no longer writes (another tab holds the device, or another owner). "failed": the device could not store it (kept and retried). */
export type SaveResult = "committed" | "refused" | "failed";

export const isQuotaError = (e: unknown) =>
  !!e && typeof e === "object" && ((e as { name?: string }).name === "QuotaExceededError" || /quota/i.test(String((e as { message?: string }).message ?? "")));

async function commitNow(w: Write, evicted: boolean): Promise<SaveResult> {
  if (!idb || left || writer !== "writer") return "refused";
  const expected = ownerSeen;
  // Optimistic: transactions on the store run in the order they are created, so the next write already expects this owner.
  ownerSeen = w.owner;
  let refused: "epoch" | "owner" | undefined;
  let claimed: number | undefined;
  try {
    await idb("readwrite", (store) => {
      const owner = store.get(OWNER_KEY);
      const current = store.get(EPOCH_KEY);
      // Requests complete in order: the owner is read by now.
      current.onsuccess = () => {
        const stored = typeof current.result === "number" ? current.result : undefined;
        if (epoch === undefined) claimed = (stored ?? 0) + 1;
        else if (stored !== epoch) return void (refused = "epoch");
        const storedOwner = owner.result as DeviceOwner | undefined;
        if (storedOwner !== undefined && storedOwner !== expected) return void (refused = "owner");
        store.put(JSON.stringify(w.value), w.name);
        store.put(w.owner, OWNER_KEY);
        if (claimed !== undefined) store.put(claimed, EPOCH_KEY);
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
    return "failed";
  }
  if (refused === "epoch") {
    ownerSeen = expected;
    loseWriter();
    return "refused";
  }
  if (refused === "owner") {
    // Before this tab read the device (expected undefined) a write would clobber unread data: dropped, nothing else.
    if (expected !== undefined) leaveDevice();
    return "refused";
  }
  if (claimed !== undefined) epoch = claimed;
  base = w.value;
  if (failing) {
    failing = false;
    failures = 0;
    hooks?.saveFailed(null);
  }
  return "committed";
}

/**
 * Writes the debounced state now (sign-in, sign-out, a capture, the page going away, a handover). Resolves once it is
 * committed, refused or failed (the change then lives only in this tab's memory for now, and is retried).
 */
export function flushWrite(): Promise<SaveResult> {
  clearTimeout(timer);
  if (!pending) return serial(async () => (left || writer !== "writer" ? "refused" : failing ? "failed" : "committed"));
  const w = pending;
  pending = null;
  return serial(() => commitNow(w, false));
}

/** Keys whose value is not undefined (a key set to undefined in memory is missing once saved as JSON). */
const definedKeys = (o: Snapshot) => Object.keys(o).filter((k) => o[k] !== undefined);

/** The same persisted state (partialize rebuilds `sync` on every update: compare its fields). */
function sameState(a: Snapshot, b: Snapshot): boolean {
  const keys = definedKeys(a);
  if (keys.length !== definedKeys(b).length) return false;
  return keys.every((k) => {
    if (a[k] === b[k]) return true;
    if (k !== "sync" || !a[k] || !b[k] || typeof a[k] !== "object" || typeof b[k] !== "object") return false;
    const x = a[k] as Snapshot;
    const y = b[k] as Snapshot;
    const fields = definedKeys(x);
    return fields.length === definedKeys(y).length && fields.every((f) => x[f] === y[f]);
  });
}

/** zustand `persist` storage over IndexedDB: debounced, written only by the device's writer, owner- and epoch-checked. */
export function createDeviceStorage<S extends { session?: SessionLike }>(): PersistStorage<S> {
  return {
    getItem: async (name) => {
      // Only the writer reads the device (bootstrapStore waits for becomeWriter first).
      if (!idb || writer !== "writer") return null;
      dataKey = name;
      const [raw, owner] = await getMany<unknown>([name, OWNER_KEY], idb);
      const value = parse(raw) ?? null;
      // Devices saved before the owner was stored: the saved session says whose data it is.
      ownerSeen = (owner as DeviceOwner | undefined) ?? ownerOf((value?.state as { session?: SessionLike } | undefined)?.session);
      base = value ?? undefined;
      return value as StorageValue<S> | null;
    },
    setItem: (name, value) => {
      // Not the writer, or the device not read yet (a write would clobber data this tab never saw): nothing is written.
      if (!idb || left || writer !== "writer" || ownerSeen === undefined) return;
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
      if (idb && writer === "writer" && !left) await del(name, idb);
    },
  };
}

/* ───────────── what is saved on the device ───────────── */

type Saved = { owner: DeviceOwner; state?: { users?: { id: string; name?: string }[]; sync?: { queue?: { id: string; state: string }[] } } };

async function readSaved(): Promise<Saved | undefined> {
  if (!idb || !dataKey) return undefined;
  const [raw, stored] = await getMany<unknown>([dataKey, OWNER_KEY], idb);
  const value = parse(raw);
  const owner = (stored as DeviceOwner | undefined) ?? ownerOf((value?.state as { session?: SessionLike } | undefined)?.session);
  return { owner, state: value?.state as Saved["state"] };
}

const unsentOf = (saved: Saved | undefined) => (saved?.state?.sync?.queue ?? []).filter((q) => q.state !== "sincronizado").map((q) => q.id);

/** The unsent queue items saved on the device for `owner` (what this tab last wrote, or a write of its that failed left). */
export async function persistedUnsent(owner: DeviceOwner): Promise<string[]> {
  try {
    const saved = await readSaved();
    return saved?.owner === owner ? unsentOf(saved) : [];
  } catch {
    return [];
  }
}

/**
 * The account whose data is saved on the device, with its name and unsent queue items (null: the demo, or nothing saved).
 * This tab's memory may hold another session than the device when a write of its failed (a sign-out whose wipe the device
 * refused, an account whose first write never landed).
 */
export async function savedAccount(): Promise<{ userId: string; name?: string; ids: string[] } | null> {
  try {
    const saved = await readSaved();
    if (!saved?.owner.startsWith("supabase:")) return null;
    const userId = saved.owner.slice("supabase:".length);
    return { userId, name: saved.state?.users?.find((u) => u.id === userId)?.name, ids: unsentOf(saved) };
  } catch {
    return null;
  }
}

/* ───────────── giving the device up ───────────── */

/**
 * The device holds another owner's data than this tab expected (a write was refused for it): stop writing, drop the data
 * in memory, start over from /login (which reads the device afresh).
 */
export function leaveDevice() {
  if (left || !browser) return;
  left = true;
  pending = null;
  clearTimeout(timer);
  hooks?.halt(true);
  hooks?.drop();
  // A client's survey page stays where it is; every other screen starts again at the sign-in.
  if (window.location.pathname.startsWith("/encuesta")) window.location.reload();
  else window.location.replace("/login");
}

/* ───────────── between tabs ───────────── */

type Message =
  /** The writer, once it holds the device (and to answer "writer?"): `epoch` undefined while its claim is not stored. */
  | { t: "writer"; epoch?: number }
  /** Without Web Locks: is a writer there? */
  | { t: "writer?" }
  /** «Usar aquí» in another tab: save what is pending and step aside. */
  | { t: "release?"; id: string }
  | { t: "releasing"; id: string }
  | { t: "released"; id: string }
  /** The writer could not save what it holds: it stays. */
  | { t: "kept"; id: string }
  /** Without Web Locks: the writer's page is going away. */
  | { t: "bye" };

const channel = browser && typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("pulkro-writer") : null;

function post(message: Message) {
  try {
    channel?.postMessage(message);
  } catch {
    // a closed channel: the epoch check on the next write still holds
  }
}

channel?.addEventListener("message", (event: MessageEvent<Message>) => {
  const m = event.data;
  if (writer === "writer" && !left) {
    if (m.t === "writer?") post({ t: "writer", epoch });
    // Another tab claimed a newer epoch (it stole the lock, or took over without Web Locks): this one lost.
    else if (m.t === "writer" && m.epoch !== undefined && (epoch === undefined || m.epoch > epoch)) loseWriter();
    else if (m.t === "release?") void handOver(m.id);
  } else if (writer === "blocked" && m.t === "bye" && !locks()) {
    void probe();
  }
});

if (browser) {
  // A reload / app switch right after a capture must not lose the debounced write (the service worker may hard-navigate offline).
  window.addEventListener("pagehide", () => {
    void flushWrite();
    if (writer === "writer" && !locks()) post({ t: "bye" });
  });
  const wake = () => {
    // A writer back from the background (or the back-forward cache) may have been taken over meanwhile: blocker at once.
    if (writer === "writer") void stillWriter();
    // Without Web Locks, a waiting tab looks again (the writer may have closed without a word).
    else if (writer === "blocked" && !locks()) void probe();
  };
  window.addEventListener("pageshow", (e) => {
    if (e.persisted) wake();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void flushWrite();
    else wake();
  });
}
