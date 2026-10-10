"use client";

/**
 * Real photo captures live in IndexedDB as compressed JPEG blobs (localStorage is too small).
 * The zustand store only keeps a reference: { type: "idb", key }.
 */
import { createStore, del, get, set } from "idb-keyval";

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

/** Compress + persist a captured file. Returns the IndexedDB key and dimensions. */
export async function savePhotoFile(file: Blob) {
  const { blob, width, height } = await compressImage(file);
  const key = `ph_${crypto.randomUUID().slice(0, 12)}`;
  if (store) await set(key, blob, store);
  urlCache.set(key, URL.createObjectURL(blob));
  return { key, width, height, bytes: blob.size };
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
