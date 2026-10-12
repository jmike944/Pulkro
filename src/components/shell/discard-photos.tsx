"use client";

/**
 * "Descartar" with photo captures in it (sync sheet): an unsent capture's picture exists only on this device, so before the
 * discard deletes it the person can save it on the phone.
 *  - Where the browser shares files (Android Chrome, iOS Safari: the share sheet's «Guardar imagen», Archivos…): up to 10
 *    photos and 45 MB per tap, as a share takes at most 10 files / 50 MB. A share the sheet took only means some target
 *    accepted the files — WhatsApp, Mail, or «Guardar imagen» — and the page cannot tell which: those photos are
 *    "compartidas", never "guardadas", and nothing claims a copy stayed on the phone.
 *  - Elsewhere, or when the share sheet cannot open: one download per tap, each its own button. A browser holds or blocks
 *    downloads that start without a tap, and a page cannot tell whether a download was kept: once every photo was
 *    downloaded they count as "descargadas", and the person is asked to check Descargas.
 * Nothing here deletes anything: the pictures leave the device only when the discard is confirmed (discardItems), and the
 * confirmation waits while a save is under way.
 */
import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { Check, Download, Loader2, Share2 } from "lucide-react";
import { toast } from "sonner";
import { getPhotoBlob } from "@/lib/photo-store";
import type { DiscardedCapture } from "@/lib/sync/queue";
import { Button } from "@/components/ui/button";

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** "OS-00102_antes_2026-10-11_14-32-05.jpg": the order's folio, the kind of photo and when it was taken (local time). */
export function captureFileName(c: DiscardedCapture, folio: string | undefined, type: string): string {
  const t = c.takenAt ? Date.parse(c.takenAt) : NaN;
  const parts = [slug(folio ?? "") || "foto", slug(c.kind ?? ""), Number.isNaN(t) ? "" : format(t, "yyyy-MM-dd_HH-mm-ss")].filter(Boolean);
  return `${parts.join("_")}.${EXT[type] ?? "jpg"}`;
}

/**
 * The pictures of `captures` still on this device, as named files (`read`: the captures they are, in order). A picture
 * already gone (null) is left out; one the device failed to read is counted in `unreadable`: it may well be there, and the
 * discard would delete it unsaved.
 */
async function readFiles(
  captures: readonly DiscardedCapture[],
  folios: ReadonlyMap<string, string>,
): Promise<{ files: File[]; read: DiscardedCapture[]; unreadable: number }> {
  const files: File[] = [];
  const read: DiscardedCapture[] = [];
  const names = new Set<string>();
  let unreadable = 0;
  for (const c of captures) {
    let blob: Blob | null;
    try {
      blob = await getPhotoBlob(c.key);
    } catch {
      unreadable++;
      continue;
    }
    if (!blob) continue;
    const type = blob.type || "image/jpeg";
    const base = captureFileName(c, c.orderId ? folios.get(c.orderId) : undefined, type);
    let name = base;
    for (let i = 2; names.has(name); i++) name = base.replace(/(\.\w+)$/, `_${i}$1`);
    names.add(name);
    const taken = c.takenAt ? Date.parse(c.takenAt) : NaN;
    files.push(new File([blob], name, { type, lastModified: Number.isNaN(taken) ? Date.now() : taken }));
    read.push(c);
  }
  return { files, read, unreadable };
}

const keysOf = (captures: readonly DiscardedCapture[]) => captures.map((c) => c.key).join(" ");

const NO_FILES: File[] = [];

/**
 * The files to offer for `captures` (empty while they are read, and when none is on the device any more). Read when the
 * dialog opens, so the tap on «Guardar» can open the share sheet right away (Safari allows it only straight from a tap).
 * `unreadable`: pictures the device failed to read (the dialog says so); `retry` reads them all again. `filesKey`: which
 * captures `files` are (their keys): a retry may read another set of the same size, and what was saved is tracked per file.
 */
export function useCaptureFiles(
  captures: readonly DiscardedCapture[],
  folios: ReadonlyMap<string, string>,
): { files: File[]; filesKey: string; unreadable: number; retry: () => void } {
  const [loaded, setLoaded] = useState<{ keys: string; files: File[]; filesKey: string; unreadable: number } | null>(null);
  const [round, setRound] = useState(0);
  useEffect(() => {
    if (!captures.length) return;
    let live = true;
    void readFiles(captures, folios).then(({ files, read, unreadable }) => {
      if (live) setLoaded({ keys: keysOf(captures), files, filesKey: keysOf(read), unreadable });
    });
    return () => {
      live = false;
    };
  }, [captures, folios, round]);
  const retry = useCallback(() => setRound((n) => n + 1), []);
  const current = captures.length && loaded?.keys === keysOf(captures) ? loaded : null;
  return { files: current?.files ?? NO_FILES, filesKey: current?.filesKey ?? "", unreadable: current?.unreadable ?? 0, retry };
}

const SHARE_MAX_FILES = 10;
const SHARE_MAX_BYTES = 45 * 1024 * 1024;

/** The files in share-sized groups: at most 10 files and 45 MB each (a larger photo goes alone). */
export function shareBatches(files: readonly File[]): File[][] {
  const out: File[][] = [];
  let cur: File[] = [];
  let bytes = 0;
  for (const f of files) {
    if (cur.length && (cur.length >= SHARE_MAX_FILES || bytes + f.size > SHARE_MAX_BYTES)) {
      out.push(cur);
      cur = [];
      bytes = 0;
    }
    cur.push(f);
    bytes += f.size;
  }
  if (cur.length) out.push(cur);
  return out;
}

type ShareNav = { share?: (data: ShareData) => Promise<void>; canShare?: (data: ShareData) => boolean };

/** The share sheet with `files`: "shared" (it took them), "cancelled" (the person closed it), "failed" (it cannot share them). */
export async function shareFiles(files: File[], nav: ShareNav): Promise<"shared" | "cancelled" | "failed"> {
  if (typeof nav.share !== "function" || !nav.canShare?.({ files })) return "failed";
  try {
    await nav.share({ files });
    return "shared";
  } catch (e) {
    return (e as { name?: string } | null)?.name === "AbortError" ? "cancelled" : "failed";
  }
}

/** Starts one download. Call it straight from a tap: browsers hold or block downloads that start without one. */
export function downloadFile(file: File) {
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * How the photos left the app before the discard, once every one did (null: not yet). The confirmation's copy follows it;
 * it never removes the confirmation's checkbox, and nothing is deleted before the discard is confirmed.
 *  - "compartidas": the share sheet took at least one of them (the rest, if any, downloaded): no local copy is claimed;
 *  - "descargadas": every one was downloaded — the only save that leaves a file, still to be checked in Descargas.
 */
export type CapturesKept = "compartidas" | "descargadas";

/** `count` photos; the ones the share sheet took and the ones downloaded (indexes). */
export function capturesKept(count: number, shared: ReadonlySet<number>, downloaded: ReadonlySet<number>): CapturesKept | null {
  if (!count) return null;
  for (let i = 0; i < count; i++) if (!shared.has(i) && !downloaded.has(i)) return null;
  for (let i = 0; i < count; i++) if (!downloaded.has(i)) return "compartidas";
  return "descargadas";
}

/** "fotos 1–10", "foto 11": the photos of a batch, numbered as the person sees them. */
const batchName = (from: number, count: number) => (count === 1 ? `foto ${from + 1}` : `fotos ${from + 1}–${from + count}`);

/**
 * The save step of the Descartar confirmation: shown above the checkbox while the discard deletes photos from the device.
 * `kept` / `onKept`: how every photo left the app (capturesKept), once it did. `onBusy`: a share is under way (the
 * confirmation waits). The buttons stay: a photo shared to a chat can still be shared again to «Guardar imagen».
 */
export function SaveCapturesBox({ files, kept, onKept, onBusy }: { files: File[]; kept: CapturesKept | null; onKept: (how: CapturesKept) => void; onBusy: (busy: boolean) => void }) {
  const [busy, setBusy] = useState<number | null>(null);
  const [shared, setShared] = useState<ReadonlySet<number>>(new Set());
  const [downloaded, setDownloaded] = useState<ReadonlySet<number>>(new Set());
  // Without file sharing (or once the share sheet failed): one download per tap.
  const [downloads, setDownloads] = useState(() => {
    const nav = typeof navigator !== "undefined" ? (navigator as ShareNav) : {};
    return typeof nav.share !== "function" || !nav.canShare?.({ files: files.slice(0, 1) });
  });
  const one = files.length === 1;
  const batches = shareBatches(files);
  const starts = batches.map((_, i) => batches.slice(0, i).reduce((n, b) => n + b.length, 0));

  /** The photos (indexes) in the batches the share sheet took. */
  const filesOf = (taken: ReadonlySet<number>) => new Set(batches.flatMap((b, k) => (taken.has(k) ? b.map((_, j) => starts[k] + j) : [])));
  const settle = (sharedBatches: ReadonlySet<number>, got: ReadonlySet<number>) => {
    const how = capturesKept(files.length, filesOf(sharedBatches), got);
    if (how && how !== kept) onKept(how);
  };

  const share = async (i: number) => {
    setBusy(i);
    onBusy(true);
    try {
      const how = await shareFiles(batches[i], navigator as ShareNav);
      if (how === "shared") {
        // A target took them (a chat, the mail, or «Guardar imagen»): shared, not saved.
        const next = new Set(shared).add(i);
        setShared(next);
        settle(next, downloaded);
      } else if (how === "failed") {
        setDownloads(true);
        toast.message("No se pudo abrir el menú para compartir", { description: "Descargue las fotos una por una." });
      }
    } finally {
      setBusy(null);
      onBusy(false);
    }
  };
  const download = (i: number) => {
    downloadFile(files[i]);
    const next = new Set(downloaded).add(i);
    setDownloaded(next);
    settle(shared, next);
  };

  // Files already in a batch the share sheet took are not offered for download.
  const sharedFiles = filesOf(shared);
  const toDownload = files.map((_, i) => i).filter((i) => !sharedFiles.has(i));
  const requested = toDownload.filter((i) => downloaded.has(i)).length;

  const mixed = kept === "compartidas" && downloaded.size > 0;
  return (
    <div className="mt-3 rounded-[14px] border border-amber-line bg-amber-wash px-4 py-3 text-[13.5px] leading-snug text-ink">
      {kept === "compartidas" ? (
        <p className="flex gap-2">
          <Share2 className="mt-0.5 size-4 shrink-0 text-amber-fg" aria-hidden />
          <span>
            {one
              ? "La compartió desde el teléfono; si no eligió «Guardar imagen», no quedó copia. Al descartar se borra de la app."
              : "Las compartió desde el teléfono; si no eligió «Guardar imagen», no quedó copia. Al descartar se borran de la app."}
            {mixed && " Las que descargó: revise que estén en Descargas."}
          </span>
        </p>
      ) : kept === "descargadas" ? (
        <p className="flex gap-2">
          <Check className="mt-0.5 size-4 shrink-0 text-teal-fg" aria-hidden />
          <span>
            {one
              ? "Se descargó; revise que esté en Descargas antes de descartar: el navegador puede pedir permiso o no guardarla. Al descartar se borra de la app."
              : "Se descargaron; revise que estén en Descargas antes de descartar: el navegador puede pedir permiso o no guardarlas. Al descartar se borran de la app."}
          </span>
        </p>
      ) : (
        <p>
          {one ? "Esta foto solo está en este teléfono." : `Estas ${files.length} fotos solo están en este teléfono.`}{" "}
          {downloads
            ? one
              ? "Descárguela antes de descartar: al descartar se borra de la app."
              : "Descárguelas una por una antes de descartar: al descartar se borran de la app."
            : one
              ? "Guárdela antes de descartar: al descartar se borra de la app."
              : "Guárdelas antes de descartar: al descartar se borran de la app."}
          {/* a share sheet also offers chats and the mail, which keep no copy here */}
          {!downloads && (one ? " Al compartirla, elija «Guardar imagen» para que quede una copia en el teléfono." : " Al compartirlas, elija «Guardar imagen» para que quede una copia en el teléfono.")}
        </p>
      )}
      {!downloads && (
        <div className="mt-2.5 space-y-2">
          {batches.map((b, i) => {
            const label = batches.length === 1 ? (one ? "foto" : "fotos") : batchName(starts[i], b.length);
            return (
              <Button key={i} type="button" variant="outline" disabled={busy !== null} onClick={() => void share(i)} className="h-auto min-h-10 w-full rounded-[12px] border-line px-4 py-2 font-semibold">
                {busy === i ? <Loader2 className="animate-spin" aria-hidden /> : shared.has(i) ? <Share2 aria-hidden /> : <Download aria-hidden />}
                {shared.has(i)
                  ? `${label.charAt(0).toUpperCase()}${label.slice(1)} ${b.length === 1 ? "compartida" : "compartidas"} · compartir de nuevo`
                  : batches.length === 1
                    ? one
                      ? "Guardar foto en el teléfono"
                      : "Guardar fotos en el teléfono"
                    : `Guardar ${batchName(starts[i], b.length)}`}
              </Button>
            );
          })}
        </div>
      )}
      {downloads && (
        <>
          <ul className="mt-2.5 space-y-2">
            {toDownload.map((i) => (
              <li key={i}>
                <Button type="button" variant="outline" onClick={() => download(i)} className="h-auto min-h-10 w-full justify-start rounded-[12px] border-line px-4 py-2 text-left font-semibold">
                  {downloaded.has(i) ? <Check className="text-teal-fg" aria-hidden /> : <Download aria-hidden />}
                  <span className="min-w-0">
                    <span className="block">{one ? "Descargar la foto" : `Descargar foto ${i + 1} de ${files.length}`}</span>
                    <span className="block truncate text-[12px] font-normal text-subtle">{files[i].name}</span>
                  </span>
                </Button>
              </li>
            ))}
          </ul>
          {requested > 0 && requested < toDownload.length && (
            <p className="mt-2.5 text-[13px] text-amber-olive" aria-live="polite">
              Se pidieron {requested} de {toDownload.length} descargas. Revise en Descargas que estén todas antes de descartar: el navegador puede pedir
              permiso para descargar, o no guardarlas.
            </p>
          )}
        </>
      )}
    </div>
  );
}
