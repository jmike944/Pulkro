"use client";

/**
 * Real photo captures live in IndexedDB as compressed JPEG blobs (localStorage is too small).
 * The zustand store only keeps a reference: { type: "idb", key }.
 */
import { createStore, del, get, set } from "idb-keyval";
import { readCaptureMeta, type CaptureMeta } from "./exif";
import type { Photo, PhotoOrigin } from "./types";

const store = typeof indexedDB !== "undefined" ? createStore("pulkro-photos", "blobs") : undefined;
const urlCache = new Map<string, string>();

export async function compressImage(file: Blob, maxSide = 1600, quality = 0.82) {
  const bitmap = await createImageBitmap(file);
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
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("No se pudo comprimir la imagen"))), "image/jpeg", quality),
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
