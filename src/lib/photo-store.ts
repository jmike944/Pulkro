"use client";

/**
 * Real photo captures live in IndexedDB as compressed JPEG blobs (localStorage is too small).
 * The zustand store only keeps a reference: { type: "idb", key }.
 *
 * Evidence already on the server ({ type: "storage", path }) lives in the private bucket `evidencias`: it is shown through a
 * short-lived signed URL (architecture §7), and every picture that was displayed is also kept on the device (same IndexedDB
 * store, key `st:<path>`, the most recent ones only) so it still shows offline. Nothing is downloaded before it is shown.
 */
import { createStore, del, delMany, get, keys, set } from "idb-keyval";
import { readCaptureMeta, type CaptureMeta } from "./exif";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "./supabase/client";
import { stillWriter } from "./sync/writer";
import type { Photo, PhotoOrigin } from "./types";

const store = typeof indexedDB !== "undefined" ? createStore("pulkro-photos", "blobs") : undefined;
const urlCache = new Map<string, string>();

/** The browser could not open the file as a picture (HEIC on Chrome or Firefox, a damaged file…). */
export class UndecodableImageError extends Error {
  constructor(readonly heic: boolean) {
    super(
      heic
        ? "Formato HEIC no compatible con este navegador: conviértala a JPEG o use «Tomar foto»."
        : "El archivo no es una imagen que este navegador pueda abrir.",
    );
    this.name = "UndecodableImageError";
  }
}

const isHeic = (file: Blob) => /hei[cf]/i.test(file.type) || (file instanceof File && /\.hei[cf]$/i.test(file.name));

export async function compressImage(file: Blob, maxSide = 1600, quality = 0.82) {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new UndecodableImageError(isHeic(file));
  }
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  const blob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("No se pudo comprimir la imagen. Elija otra foto o tómela de nuevo."))), "image/jpeg", quality),
  );
  return { blob, width, height };
}

/**
 * Compress + persist a captured file. Returns the IndexedDB key and dimensions, plus the capture metadata read from the
 * ORIGINAL file before compression strips it (`exif.takenAt` = real shot time, `exif.lat/lng` = camera GPS when stored).
 * Turn them into the photo's time/origin with `describeCapture`, and its position with `lat`/`lng` + `geoSource: "exif"`.
 * Compression re-encodes the picture, so what stays on the device is the pixels plus the metadata the app keeps in the Photo record.
 */
export async function savePhotoFile(file: Blob): Promise<{ key: string; width: number; height: number; bytes: number; exif: CaptureMeta }> {
  const exif = await readCaptureMeta(file);
  const { blob, width, height } = await compressImage(file);
  const key = `ph_${crypto.randomUUID().slice(0, 12)}`;
  if (store) await set(key, blob, store);
  urlCache.set(key, URL.createObjectURL(blob));
  return { key, width, height, bytes: blob.size, exif };
}

/** Which file input the picture came through: the camera one (opens the rear camera on phones) or the gallery picker. */
export type CaptureInput = "camera" | "gallery";

/** A "camera" shot cannot be older than this: an older file was picked from the device, so it is flagged as a gallery photo. */
const FRESH_CAMERA_MS = 10 * 60_000;

export type CaptureDescription = Pick<Photo, "origin" | "takenAtSource"> & {
  /** Real capture time when known; undefined = "now" (the store stamps the attach time). */
  takenAt?: string;
};

/**
 * What we can honestly say about when a picture was taken and where it came from (doc §4.2 evidence integrity):
 *  - time: EXIF DateTimeOriginal (the shot) → else the file's last-modified date for gallery picks → else now (camera);
 *  - origin: "camera" only when it came through the camera input AND is fresh. A file that is minutes older than now was
 *    picked from the device (desktop browsers ignore `capture`, some phones offer the gallery), so it is flagged "gallery".
 */
export function describeCapture(file: Blob, input: CaptureInput, exif: CaptureMeta, now = Date.now()): CaptureDescription {
  const modified = file instanceof File && file.lastModified > 0 && file.lastModified <= now + 5 * 60_000 ? file.lastModified : undefined;
  const exifMs = exif.takenAt ? Date.parse(exif.takenAt) : undefined;
  const reference = exifMs ?? modified;
  const stale = reference !== undefined && now - reference > FRESH_CAMERA_MS;
  const origin: PhotoOrigin = input === "camera" && !stale ? "camera" : "gallery";
  if (exif.takenAt) return { origin, takenAt: exif.takenAt, takenAtSource: "exif" };
  if (origin === "gallery" && modified !== undefined) return { origin, takenAt: new Date(modified).toISOString(), takenAtSource: "file" };
  return { origin, takenAtSource: "device" };
}

export async function getPhotoUrl(key: string): Promise<string | null> {
  if (urlCache.has(key)) return urlCache.get(key)!;
  if (!store) return null;
  const blob = await get<Blob>(key, store);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  urlCache.set(key, url);
  return url;
}

export async function getPhotoBlob(key: string): Promise<Blob | null> {
  if (!store) return null;
  return (await get<Blob>(key, store)) ?? null;
}

export async function deletePhotoFile(key: string) {
  const url = urlCache.get(key);
  if (url) URL.revokeObjectURL(url);
  urlCache.delete(key);
  if (store) await del(key, store);
}

/**
 * Bumped by cancelPhotoWork (also when the device changes hands: handOverPhotos): work started before, on the previous
 * owner's pictures or in a tab that gave the device up (a server photo being kept for offline viewing, a download for a
 * report), never writes into the store afterwards.
 */
let epoch = 0;

/**
 * This tab gives the device up (another tab holds it now, or another owner's data is on it): the copies of server photos
 * still being kept here are not written (store.ts, registerTab's drop).
 */
export function cancelPhotoWork() {
  epoch++;
  keeping.clear();
  keepChain = Promise.resolve();
}

/**
 * The device changes hands (an account's sign-out, another account's sign-in replacing its data). The work under way on the
 * previous owner's pictures stops now, and the blobs on the device now — its captures and the copies of server photos — are
 * listed: the function returned deletes exactly those. store.ts runs it once the save that hands the device over has
 * committed (device-storage `afterHandover`), so a save that was refused or failed leaves them with the data that names
 * them, and what the next account captures meanwhile stays. Never throws.
 */
export function handOverPhotos(): () => Promise<void> {
  cancelPhotoWork();
  const waiting = signQueue;
  signQueue = null;
  waiting?.forEach((waiters) => waiters.forEach((done) => done({ url: null, retry: false })));
  urlCache.forEach((url) => URL.revokeObjectURL(url));
  urlCache.clear();
  signedUrls.clear();
  // Listed right away: the next account's first capture comes later.
  const listed: Promise<IDBValidKey[]> = store ? keys(store).catch(() => []) : Promise.resolve([]);
  return async () => {
    try {
      const previous = await listed;
      if (store && previous.length) await delMany(previous, store);
    } catch {
      // a closed database: they stay until the next handover lists them again
    }
  };
}

/**
 * The device is out of space: free the copies of server photos kept for offline viewing (the server gives them back).
 * Captures that have not been sent are never touched.
 */
export async function evictKeptPhotos(): Promise<void> {
  if (!store) return;
  epoch++; // copies being written now would only fill the space again
  keeping.clear();
  keepChain = Promise.resolve();
  const kept = (await keys<string>(store)).filter((k) => typeof k === "string" && k.startsWith("st:"));
  for (const k of kept) {
    const url = urlCache.get(k);
    if (url) URL.revokeObjectURL(url);
    urlCache.delete(k);
  }
  if (kept.length) await delMany(kept, store);
}

/* ───────────── server evidence (Storage bucket `evidencias`) ───────────── */

const BUCKET = "evidencias";
/** Signed URLs live 10 minutes (architecture §7: a link made before a deactivation or reassignment dies soon). */
const SIGN_SECONDS = 600;
/** Sign again when less than this is left, so an <img> never starts loading an about-to-expire link. */
const RENEW_BEFORE_MS = 90_000;
/** How many displayed server photos stay on the device for offline viewing (≈ 300 × 300 kB). */
const KEEP_OFFLINE = 300;
const INDEX_KEY = "st:__index";
const blobKey = (path: string) => `st:${path}`;

const signedUrls = new Map<string, { url: string; expiresAt: number }>();

/**
 * Where a server photo can be shown from. `url: null, retry: true`: the server could not be reached (a weak signal while the
 * browser says online) — show it like offline and ask again later; `retry: false`: not readable for this account.
 */
export type StoragePhotoUrl = { url: string } | { url: null; retry: boolean };

let signQueue: Map<string, ((result: StoragePhotoUrl) => void)[]> | null = null;

/** Signs every path asked for in the same tick in one request (a gallery asks for dozens at once). */
function signSoon(path: string): Promise<StoragePhotoUrl> {
  return new Promise((resolve) => {
    if (!signQueue) {
      signQueue = new Map();
      setTimeout(() => void flushSigning(), 20);
    }
    signQueue.set(path, [...(signQueue.get(path) ?? []), resolve]);
  });
}

async function flushSigning() {
  const batch = signQueue;
  signQueue = null;
  if (!batch) return;
  const paths = [...batch.keys()];
  const got = new Map<string, string>();
  // Paths whose request got no answer from the server (vs. an answer that denied them).
  const unreached = new Set<string>();
  const transport = (error: { name?: string; status?: number } | null) =>
    !!error && (error.name === "StorageUnknownError" || (typeof error.status === "number" && (error.status >= 500 || error.status === 408 || error.status === 429)));
  try {
    const bucket = getSupabaseBrowserClient().storage.from(BUCKET);
    for (let i = 0; i < paths.length; i += 100) {
      const chunk = paths.slice(i, i + 100);
      const issuedAt = Date.now();
      const { data, error } = await bucket.createSignedUrls(chunk, SIGN_SECONDS);
      if (error || !data) {
        if (!error || transport(error as { name?: string; status?: number })) chunk.forEach((p) => unreached.add(p));
        continue;
      }
      for (const d of data) {
        if (!d.path || !d.signedUrl || d.error) continue;
        signedUrls.set(d.path, { url: d.signedUrl, expiresAt: issuedAt + SIGN_SECONDS * 1000 });
        got.set(d.path, d.signedUrl);
      }
    }
  } catch {
    // offline or not configured: ask again later
    paths.forEach((p) => unreached.add(p));
  }
  for (const [path, waiters] of batch) {
    const url = got.get(path);
    waiters.forEach((done) => done(url ? { url } : { url: null, retry: unreached.has(path) }));
  }
}

/** A copy of the picture kept on the device, as an object URL. */
async function keptUrl(path: string): Promise<string | null> {
  const key = blobKey(path);
  if (urlCache.has(key)) return urlCache.get(key)!;
  if (!store) return null;
  const blob = await get<Blob>(key, store).catch(() => undefined);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  urlCache.set(key, url);
  return url;
}

/**
 * What to put in <img src> for a server photo: the copy kept on this device, else a signed URL (reused until shortly before
 * it expires), else none — offline or unreachable and never displayed here (`retry`), or not readable for this account.
 */
export async function getStoragePhotoUrl(path: string, online: boolean): Promise<StoragePhotoUrl> {
  const kept = await keptUrl(path);
  if (kept) return { url: kept };
  const signed = signedUrls.get(path);
  if (signed && signed.expiresAt - Date.now() > RENEW_BEFORE_MS) return { url: signed.url };
  if (!online || !isSupabaseConfigured) return { url: null, retry: true };
  return signSoon(path);
}

/** The signed URL failed (expired early, revoked): sign again next time. */
export function forgetSignedUrl(path: string) {
  signedUrls.delete(path);
}

const keeping = new Set<string>();

let keepChain: Promise<void> = Promise.resolve();

/**
 * Stores a server photo's copy and trims the oldest beyond KEEP_OFFLINE (serialized: the index is read-modify-write).
 * `since`: the epoch the work started in; a handover or a drop since then (handOverPhotos, cancelPhotoWork) cancels the write.
 */
function keepBlob(path: string, blob: Blob, since: number): Promise<void> {
  const run = keepChain.then(() => writeKept(path, blob, since));
  keepChain = run.catch(() => undefined);
  return run;
}

async function writeKept(path: string, blob: Blob, since: number) {
  // Only the device's writer keeps copies: a tab that lost the device while it downloaded (frozen in the background) never
  // writes into the new writer's store — the previous account's picture after its sign-out's wipe, a trim of its index.
  if (!store || since !== epoch || !(await stillWriter())) return;
  await set(blobKey(path), blob, store);
  if (since !== epoch) return void (await del(blobKey(path), store));
  const index = ((await get<string[]>(INDEX_KEY, store)) ?? []).filter((p) => p !== path);
  index.push(path);
  const drop = index.splice(0, Math.max(0, index.length - KEEP_OFFLINE));
  if (since !== epoch) return void (await del(blobKey(path), store));
  await set(INDEX_KEY, index, store);
  for (const p of drop) {
    const key = blobKey(p);
    const url = urlCache.get(key);
    if (url) URL.revokeObjectURL(url);
    urlCache.delete(key);
    await del(key, store);
  }
}

/**
 * After a server photo was displayed from its signed URL: keep a copy for offline viewing. The browser usually answers from
 * its HTTP cache (same URL), so this rarely downloads twice. Best effort, never throws.
 */
export function rememberStoragePhoto(path: string, signedUrl: string) {
  if (!store || keeping.has(path) || urlCache.has(blobKey(path))) return;
  keeping.add(path);
  const since = epoch;
  void (async () => {
    try {
      if (await get(blobKey(path), store)) return;
      const res = await fetch(signedUrl);
      if (res.ok) await keepBlob(path, await res.blob(), since);
    } catch {
      // offline or quota: it shows online anyway
    } finally {
      keeping.delete(path);
    }
  })();
}

/**
 * A capture that just reached Storage (push engine, add_photo): its blob is also kept as the copy of `path`, so the photo —
 * now `{ type: "storage", path }` — still shows offline without a download. The capture's own key is freed later (after a
 * pull confirmed the photo). Best effort, never throws.
 */
export async function keepCaptureAs(key: string, path: string): Promise<void> {
  if (!store) return;
  const since = epoch;
  try {
    const blob = await get<Blob>(key, store);
    if (blob) await keepBlob(path, blob, since);
  } catch {
    // quota or a closed database: the photo shows through its signed URL online
  }
}

/** The picture itself (report PDF): the kept copy, else a download with the account's session (then kept). */
export async function getStoragePhotoBlob(path: string): Promise<Blob | null> {
  if (store) {
    const kept = await get<Blob>(blobKey(path), store).catch(() => undefined);
    if (kept) return kept;
  }
  if (!isSupabaseConfigured) return null;
  const since = epoch;
  try {
    const { data, error } = await getSupabaseBrowserClient().storage.from(BUCKET).download(path);
    if (error || !data) return null;
    await keepBlob(path, data, since).catch(() => undefined);
    return data;
  } catch {
    return null;
  }
}
