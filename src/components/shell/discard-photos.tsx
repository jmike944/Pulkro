"use client";

/**
 * "Descartar" with photo captures in it (sync sheet): an unsent capture's picture exists only on this device, so before the
 * discard deletes it the person can save it on the phone — the share sheet with the files where the browser supports it
 * («Guardar imagen», Files…), else a download per photo. Nothing here deletes anything: the pictures leave the device only
 * when the discard is confirmed (discardItems).
 */
import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Check, Download, Loader2 } from "lucide-react";
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

/** The pictures of `captures` still on this device, as named files (a picture already gone is left out). */
async function readFiles(captures: readonly DiscardedCapture[], folios: ReadonlyMap<string, string>): Promise<File[]> {
  const files: File[] = [];
  const names = new Set<string>();
  for (const c of captures) {
    const blob = await getPhotoBlob(c.key).catch(() => null);
    if (!blob) continue;
    const type = blob.type || "image/jpeg";
    const base = captureFileName(c, c.orderId ? folios.get(c.orderId) : undefined, type);
    let name = base;
    for (let i = 2; names.has(name); i++) name = base.replace(/(\.\w+)$/, `_${i}$1`);
    names.add(name);
    const taken = c.takenAt ? Date.parse(c.takenAt) : NaN;
    files.push(new File([blob], name, { type, lastModified: Number.isNaN(taken) ? Date.now() : taken }));
  }
  return files;
}

const keysOf = (captures: readonly DiscardedCapture[]) => captures.map((c) => c.key).join(" ");

/**
 * The files to offer for `captures` (empty while they are read, and when none is on the device any more). Read when the
 * dialog opens, so the tap on «Guardar» can open the share sheet right away (Safari allows it only straight from a tap).
 */
export function useCaptureFiles(captures: readonly DiscardedCapture[], folios: ReadonlyMap<string, string>): File[] {
  const [loaded, setLoaded] = useState<{ keys: string; files: File[] } | null>(null);
  useEffect(() => {
    if (!captures.length) return;
    let live = true;
    void readFiles(captures, folios).then((files) => {
      if (live) setLoaded({ keys: keysOf(captures), files });
    });
    return () => {
      live = false;
    };
  }, [captures, folios]);
  return captures.length && loaded?.keys === keysOf(captures) ? loaded.files : [];
}

type Saved = "shared" | "downloaded" | "cancelled";

/** Hands `files` to the person: the share sheet with files where supported, else one download each. */
async function saveFiles(files: File[]): Promise<Saved> {
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (typeof nav.share === "function" && nav.canShare?.({ files })) {
    try {
      await nav.share({ files });
      return "shared";
    } catch (e) {
      if ((e as { name?: string } | null)?.name === "AbortError") return "cancelled";
      // The tap's permission expired, the share target failed…: download them instead.
    }
  }
  for (const [i, file] of files.entries()) {
    if (i) await new Promise((r) => setTimeout(r, 250)); // browsers drop downloads started in the same instant
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
  return "downloaded";
}

/** The save step of the Descartar confirmation: shown above the checkbox while the discard deletes photos from the device. */
export function SaveCapturesBox({ files, saved, onSaved }: { files: File[]; saved: boolean; onSaved: () => void }) {
  const [busy, setBusy] = useState(false);
  const one = files.length === 1;
  const save = async () => {
    setBusy(true);
    try {
      const how = await saveFiles(files);
      if (how !== "cancelled") onSaved();
    } catch {
      toast.error(one ? "No se pudo guardar la foto" : "No se pudieron guardar las fotos", { description: "Intente de nuevo antes de descartar." });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt-3 rounded-[14px] border border-amber-line bg-amber-wash px-4 py-3 text-[13.5px] leading-snug text-ink">
      {saved ? (
        <p className="flex gap-2">
          <Check className="mt-0.5 size-4 shrink-0 text-teal-fg" aria-hidden />
          <span>
            {one ? "Foto guardada en el teléfono." : `${files.length} fotos guardadas en el teléfono.`} Al descartar se borran de la app; las copias
            guardadas siguen en la galería o en Descargas.
          </span>
        </p>
      ) : (
        <p>
          {one ? "Esta foto solo está en este teléfono." : `Estas ${files.length} fotos solo están en este teléfono.`} Guárdelas antes de descartar: al
          descartar se borran de la app.
        </p>
      )}
      <Button type="button" variant="outline" disabled={busy} onClick={() => void save()} className="mt-2.5 h-10 w-full rounded-[12px] border-line px-4 font-semibold">
        {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Download aria-hidden />} Guardar fotos en el teléfono
      </Button>
    </div>
  );
}
