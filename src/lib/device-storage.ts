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
 *    its memory. While its saves fail it also leaves a mark on the origin (`pulkro-unsaved`): when it does not answer at all
 *    (frozen in the background), the new tab does not take over silently — the person decides («Usar aquí de todos modos»).
 *  - Without Web Locks (or when the browser refuses them), the epoch alone: a tab asks on the channel whether a writer is
 *    there, and the writer announces its epoch (a writer that hears a newer one has lost). The writer also stamps the origin
 *    every 1.5 s (`pulkro-writer-alive`): a tab that gets no answer claims only once that stamp is 5 s old, since a writer
 *    busy for a few seconds (a PDF, a large save) answers nothing meanwhile. A tab that is still claiming, or waits on a
 *    full device, steps back when another becomes the writer. Without BroadcastChannel either (Safari < 15.4), a recent stamp
 *    is the only sign of a writer: the tab waits behind the blocker; it cannot ask that writer to save first.
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
/**
 * Without Web Locks the writer stamps the origin every BEAT_MS; a tab whose "writer?" gets no answer claims only once that
 * stamp is ALIVE_MS old (a writer busy for a few seconds answers nothing meanwhile, and must not lose its pending write).
 */
const ALIVE_KEY = "pulkro-writer-alive";
const BEAT_MS = 1500;
const ALIVE_MS = 5000;

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
 * "starting": finding out, or claiming the epoch (a few milliseconds). "writer": this tab holds the device. "blocked":
 * another tab does (the blocker shows). "taking": «Usar aquí» was pressed, the writer is saving and stepping aside. "kept":
 * the writer could not save what it holds and stays. "handing": this tab is saving and stepping aside for another.
 * "unanswered": the writer did not answer «Usar aquí» and its last save failed (what it holds is only in its memory): the
 * person decides. "lost": another tab took over (this one starts over behind the blocker). "full": the device refuses even
 * the epoch's write (storage full): this tab waits, without the data, until it can. "unreadable": the device could not be
 * read, or refuses the epoch's write for another reason (site data blocked, a broken database).
 */
export type WriterState = "starting" | "writer" | "blocked" | "taking" | "kept" | "unanswered" | "handing" | "lost" | "full" | "unreadable";

let writer: WriterState = browser ? "starting" : "writer";
/** This tab's writer epoch, once claimed: a tab is never the writer without one stored. */
let epoch: number | undefined;
/** This tab holds the lock (or, without Web Locks, decided to claim): it is claiming, or it is the writer. */
let held = false;
/** The epoch's transaction is under way. */
let claiming = false;
/** Another tab takes the device: this one stops claiming. */
let gaveUp = false;
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

/** This tab writes the device: the writer, or the writer saving what it holds before it steps aside. */
const writing = () => !left && (writer === "writer" || writer === "handing");

type Locks = {
  request(name: string, options: { ifAvailable?: boolean; steal?: boolean; signal?: AbortSignal }, run: (lock: unknown) => Promise<void>): Promise<void>;
};
/** The browser refused this page a Web Lock (site data blocked: SecurityError…): the epoch alone from then on. */
let locksDenied = false;
const locks = (): Locks | undefined => {
  if (locksDenied) return undefined;
  const l = browser ? (navigator as Navigator & { locks?: Locks }).locks : undefined;
  return typeof l?.request === "function" ? l : undefined;
};

/** A message id (crypto.randomUUID exists only on secure origins). */
const messageId = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");

let becoming: Promise<void> | undefined;
let becameWriter = () => {};
/** The queued request of a tab waiting for the lock (aborted when it takes over instead). */
let waiting: AbortController | undefined;

/**
 * Resolves once this tab holds the device (its writer epoch stored): only then may it read IndexedDB and hydrate the
 * store. While another tab holds it, this tab stays behind the blocker (WriterGate) and the promise waits.
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
    held = true;
    // Claiming: «Usar aquí» is not offered any more (it would take the lock from this very tab).
    if (writer === "blocked" || writer === "kept" || writer === "unanswered") setWriter("starting");
    await claim();
    // Held while this tab lives: a takeover reloads this tab (or steals the lock from it).
    await new Promise<void>(() => {});
  }).catch((error: unknown) => {
    // The lock was stolen from this tab (it held it): another tab took the device.
    if (held) return loseWriter();
    // This tab's own queued request, aborted because it takes over instead: nothing.
    if (how === "wait" && (error as { name?: string } | null)?.name === "AbortError") return;
    // The browser refuses Web Locks here (site data blocked…): the epoch alone, as without Web Locks — this tab never
    // waits for a lock that will not come.
    locksDenied = true;
    if (writer === "taking") void claim();
    else {
      setWriter("starting");
      void probe();
    }
  });
}

/** One attempt at incrementing the epoch in one transaction (a full device first frees the copies of server photos). */
async function claimEpoch(): Promise<{ epoch: number } | { error: unknown }> {
  for (let evicted = false; ; evicted = true) {
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
      return { epoch: next };
    } catch (error) {
      if (evicted || !isQuotaError(error) || !hooks) return { error };
      await hooks.evict().catch(() => undefined);
    }
  }
}

let retryClaimNow: (() => void) | undefined;
/** «Reintentar ahora» while the device is full ("full"). */
export function retryClaim() {
  retryClaimNow?.();
}

/**
 * Claims the epoch, then this tab is the writer. A tab never becomes the writer without its epoch stored: it could not
 * fence off a late write of the tab it replaced. When the device refuses even this small write, the tab waits without the
 * data and tries again: "full" (the blocker asks to free space), or "unreadable" for any other refusal (site data blocked, a
 * broken database: freeing space would not help).
 */
async function claim() {
  held = true;
  for (let attempt = 0; !gaveUp; attempt++) {
    claiming = true;
    const claimed = await claimEpoch();
    claiming = false;
    if (gaveUp) return;
    if ("epoch" in claimed) {
      epoch = claimed.epoch;
      // Whatever a previous writer could not save is gone with it now.
      markUnsaved(false);
      setWriter("writer");
      startBeat();
      post({ t: "writer", epoch });
      becameWriter();
      return;
    }
    setWriter(isQuotaError(claimed.error) ? "full" : "unreadable");
    await new Promise<void>((resolve) => {
      const t = setTimeout(resolve, Math.min(30_000, 2000 * 2 ** Math.min(attempt, 4)));
      retryClaimNow = () => {
        clearTimeout(t);
        resolve();
      };
    });
    retryClaimNow = undefined;
  }
}

/** Without Web Locks: does a writer answer "writer?" within PROBE_MS? */
function askForWriter(): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
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
}

/** Without Web Locks: is a writer there? None answers and none stamped lately → this tab becomes it. */
async function probe() {
  for (;;) {
    const answered = await askForWriter();
    if (held || writer === "taking" || writer === "lost") return;
    if (answered) return setWriter("blocked");
    if (!writerAlive()) break;
    // A writer stamped lately but did not answer: it is busy, ask again. With no channel to ask on, the stamp is all there is.
    if (!channel) return setWriter("blocked");
  }
  await claim();
}

let beat: ReturnType<typeof setInterval> | undefined;
function stampAlive() {
  try {
    window.localStorage.setItem(ALIVE_KEY, String(Date.now()));
  } catch {
    // no localStorage: a tab that gets no answer claims at once, as before
  }
}
/** A writer stamped the origin lately (a clock set back or forward meanwhile counts as not lately). */
const writerAlive = () => {
  try {
    const at = Number(window.localStorage.getItem(ALIVE_KEY));
    return at > 0 && Math.abs(Date.now() - at) < ALIVE_MS;
  } catch {
    return false;
  }
};
/** Without Web Locks, the writer stamps the origin while it writes the device. */
function startBeat() {
  if (locks()) return;
  stampAlive();
  clearInterval(beat);
  beat = setInterval(() => (writing() ? stampAlive() : clearInterval(beat)), BEAT_MS);
}

/**
 * «Usar aquí»: asks the writer to save what it has pending and step aside, then takes the device. A writer that does not
 * answer (frozen, discarded) loses it anyway — unless its last save failed ("unanswered": the person decides); one that cannot
 * save what it holds keeps it ("kept").
 */
export const takeOver = () => requestRelease(false);
/** «Usar aquí de todos modos»: a writer that does not answer loses even what it could not save. */
export const takeOverAnyway = () => requestRelease(true);

function requestRelease(anyway: boolean) {
  if (held || (writer !== "blocked" && writer !== "kept" && writer !== "unanswered")) return;
  setWriter("taking");
  waiting?.abort();
  waiting = undefined;
  const id = messageId();
  let done = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const finish = (how: "take" | "kept" | "silent") => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    channel?.removeEventListener("message", onMessage);
    if (held || writer === "lost") return;
    // No answer at all, from a writer whose last save failed: taking over would lose what it holds. The person decides.
    const unsaved = how === "silent" && !anyway && unsavedElsewhere();
    if (how === "kept" || unsaved) {
      setWriter(unsaved ? "unanswered" : "kept");
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
  timer = setTimeout(() => finish("silent"), channel ? ACK_MS : 0);
}

/** The writer's side of «Usar aquí»: stop, save what is pending, step aside (or say it cannot). Every requester is answered. */
const requesters = new Set<string>();
async function handOver(id: string) {
  requesters.add(id);
  post({ t: "releasing", id });
  if (writer === "handing") return;
  // The blocker shows at once: nothing new is captured here while it saves.
  setWriter("handing");
  hooks?.halt(true);
  let saved: SaveResult;
  for (;;) {
    // What lands while a write is under way goes with the next one.
    do saved = await flushWrite();
    while (saved === "committed" && pending);
    // A photo batch still being stored (compressing, waiting for the position) goes too: this tab waits for it, and tells
    // the requester it is still saving (its timeout starts again).
    if (saved !== "committed" || capturing === 0) break;
    for (const r of requesters) post({ t: "releasing", id: r });
    await whenCapturesSettled(5000);
  }
  if (saved === "failed") {
    // What this tab holds is not on the device: stepping aside would lose it.
    setWriter("writer");
    hooks?.halt(false);
    for (const r of requesters) post({ t: "kept", id: r });
    requesters.clear();
    return;
  }
  // From here nothing more is written: everything this tab holds is on the device (same task as the last check).
  stopWriting();
  for (const r of requesters) post({ t: "released", id: r });
  requesters.clear();
  startOver();
}

/** A tab that holds the lock but not the data (claiming, a full device, an unreadable one) lets another tab take it. */
function giveUp(id: string) {
  post({ t: "releasing", id });
  stopWriting();
  post({ t: "released", id });
  startOver();
}

function stopWriting() {
  left = true;
  gaveUp = true;
  pending = null;
  clearTimeout(timer);
  hooks?.halt(true);
}

/** Drops the data from memory and starts over: a fresh page waits behind the blocker (and takes the device when it is free). */
function startOver() {
  if (writer === "lost" || !browser) return;
  hooks?.drop();
  setWriter("lost");
  window.location.reload();
}

/** Another tab holds the device now: stop writing for good, drop the data from memory, start over behind the blocker. */
function loseWriter() {
  if (writer === "lost" || !browser) return;
  stopWriting();
  startOver();
}

/** The stored epoch is still this tab's (the push and pull engines ask before every request: sync/writer.ts). */
async function stillWriter(): Promise<boolean> {
  if (left || writer !== "writer") return false;
  if (!idb) return true;
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

/**
 * Set on this origin while the writer's saves fail (its captures exist only in its memory), cleared once one works or another
 * tab claims the device: a tab whose «Usar aquí» gets no answer at all does not take over silently then.
 */
const UNSAVED_KEY = "pulkro-unsaved";
function markUnsaved(on: boolean) {
  try {
    if (on) window.localStorage.setItem(UNSAVED_KEY, String(epoch ?? ""));
    else window.localStorage.removeItem(UNSAVED_KEY);
  } catch {
    // no localStorage (blocked, private mode): a writer that does not answer is taken over, as before
  }
}
const unsavedElsewhere = () => {
  try {
    return window.localStorage.getItem(UNSAVED_KEY) !== null;
  } catch {
    return false;
  }
};

/** "committed": on the device. "refused": this tab no longer writes (another tab holds the device, or another owner). "failed": the device could not store it (kept and retried). */
export type SaveResult = "committed" | "refused" | "failed";

export const isQuotaError = (e: unknown) =>
  !!e && typeof e === "object" && ((e as { name?: string }).name === "QuotaExceededError" || /quota/i.test(String((e as { message?: string }).message ?? "")));

async function commitNow(w: Write, evicted: boolean): Promise<SaveResult> {
  if (!idb || !writing() || ownerSeen === undefined) return "refused";
  const expected = ownerSeen;
  // Optimistic: transactions on the store run in the order they are created, so the next write already expects this owner.
  ownerSeen = w.owner;
  let refused: "epoch" | "owner" | undefined;
  try {
    await idb("readwrite", (store) => {
      const owner = store.get(OWNER_KEY);
      const current = store.get(EPOCH_KEY);
      // Requests complete in order: the owner is read by now.
      current.onsuccess = () => {
        if (current.result !== epoch) return void (refused = "epoch");
        const storedOwner = owner.result as DeviceOwner | undefined;
        if (storedOwner !== undefined && storedOwner !== expected) return void (refused = "owner");
        store.put(JSON.stringify(w.value), w.name);
        store.put(w.owner, OWNER_KEY);
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
    markUnsaved(true);
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
  base = w.value;
  if (handover?.to === w.owner) {
    const { done } = handover;
    handover = undefined;
    done();
  }
  if (failing) {
    failing = false;
    failures = 0;
    markUnsaved(false);
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
  // Nothing waiting: whatever this tab holds is on the device — unless it does not write it (or never read it).
  if (!pending) return serial(async () => (!writing() || ownerSeen === undefined ? "refused" : failing ? "failed" : "committed"));
  const w = pending;
  pending = null;
  return serial(() => commitNow(w, false));
}

/**
 * Runs `done` once a save of `to`'s data has committed in this tab (the caller's flush or a retry's): the device holds the
 * new owner's data from then on, so what the previous owner left (its photo blobs) can go. A later handover replaces it.
 */
let handover: { to: DeviceOwner; done: () => void } | undefined;
export function afterHandover(to: DeviceOwner, done: () => void) {
  handover = { to, done };
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
      let got: unknown[] | undefined;
      for (let attempt = 0; attempt < 3 && !got; attempt++) {
        try {
          got = await getMany<unknown>([name, OWNER_KEY], idb);
        } catch {
          await sleep(300 * (attempt + 1));
        }
      }
      // Never start from nothing over data that is there: this tab does not hydrate (the blocker offers to try again).
      if (!got) {
        setWriter("unreadable");
        throw new Error("No se pudieron leer los datos del dispositivo.");
      }
      const [raw, owner] = got;
      const value = parse(raw) ?? null;
      // Devices saved before the owner was stored: the saved session says whose data it is.
      ownerSeen = (owner as DeviceOwner | undefined) ?? ownerOf((value?.state as { session?: SessionLike } | undefined)?.session);
      base = value ?? undefined;
      return value as StorageValue<S> | null;
    },
    setItem: (name, value) => {
      // Not the writer, or the device not read yet (a write would clobber data this tab never saw): nothing is written.
      if (!idb || !writing() || ownerSeen === undefined) return;
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
      if (idb && writing()) await del(name, idb);
    },
  };
}

/* ───────────── photos being stored ───────────── */

/**
 * Photo batches still being stored (photo-capture: compressed, written, then queued). Until a photo is queued it is in no
 * write and no count of unsent changes: a handover waits for it, and so do a sign-out and another account's sign-in.
 */
let capturing = 0;
const settledWaiters = new Set<() => void>();

/** A photo batch starts: returns its end (call it once, when the batch is over, whatever happened). */
export function holdForCapture(): () => void {
  capturing++;
  let over = false;
  return () => {
    if (over) return;
    over = true;
    if (--capturing === 0) [...settledWaiters].forEach((fn) => fn());
  };
}

export const capturesInProgress = () => capturing;

/** Resolves true once no photo is being stored, or false after `ms` (some still are). */
export function whenCapturesSettled(ms: number): Promise<boolean> {
  if (capturing === 0) return Promise.resolve(true);
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(wait);
      settledWaiters.delete(done);
      resolve(capturing === 0);
    };
    const wait = setTimeout(done, ms);
    settledWaiters.add(done);
  });
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
  /** The writer, once it holds the device (and to answer "writer?"). */
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
  if ((writer === "writer" || writer === "handing") && !left) {
    if (m.t === "writer?") post({ t: "writer", epoch });
    // Another tab claimed a newer epoch (it stole the lock, or took over without Web Locks): this one lost.
    else if (m.t === "writer" && m.epoch !== undefined && epoch !== undefined && m.epoch > epoch) loseWriter();
    else if (m.t === "release?") void handOver(m.id);
  } else if (held && !left && m.t === "release?") {
    // Claiming, or waiting on a full or unreadable device: this tab holds no data, so it lets the other take over.
    giveUp(m.id);
  } else if (held && !left && !claiming && !locks() && m.t === "writer") {
    // Without Web Locks: waiting on a full or unreadable device while another tab became the writer. This tab holds no data:
    // it starts over behind the blocker instead of claiming over that writer later.
    stopWriting();
    startOver();
  } else if (writer === "blocked" && m.t === "bye" && !locks()) {
    void probe();
  }
});

if (browser) {
  // A reload / app switch right after a capture must not lose the debounced write (the service worker may hard-navigate offline).
  window.addEventListener("pagehide", () => {
    void flushWrite();
    if (writer === "writer" && !locks()) {
      post({ t: "bye" });
      // A reload, or a waiting tab, need not wait for the stamp to age.
      try {
        window.localStorage.removeItem(ALIVE_KEY);
      } catch {
        // no localStorage: nothing was stamped
      }
    }
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
