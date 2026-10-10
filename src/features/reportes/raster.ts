"use client";

/**
 * Photo rasterization for the PDF. react-pdf only embeds JPG/PNG, so:
 *  · procedural seed scenes (inline <svg>) are serialized with XMLSerializer → <img> → <canvas> → JPEG data URL
 *    (JPEG keeps a 12-photo report light enough for WhatsApp; the grime/noise filters make PNGs huge);
 *  · real captures stored in IndexedDB are read back as data URLs.
 * The rendered preview is the first source of SVGs (`[data-raster="<photoId>"] svg`); photos that are not
 * mounted (older versions, the reports hub) are rendered offscreen with the same <ScenePhoto> component.
 */
import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { ScenePhoto } from "@/components/pk/scene-photo";
import { getPhotoBlob } from "@/lib/photo-store";
import type { Photo } from "@/lib/types";

const SVG_NS = "http://www.w3.org/2000/svg";
const RASTER_W = 960;
const RASTER_H = 720;

const nextFrame = () => new Promise<void>((r) => setTimeout(r, 0));

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("No se pudo leer la imagen"));
    img.src = src;
  });
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("No se pudo leer la foto"));
    reader.readAsDataURL(blob);
  });
}

async function svgToJpeg(svg: SVGSVGElement) {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("width", String(RASTER_W));
  clone.setAttribute("height", String(RASTER_H));
  clone.removeAttribute("class");
  let xml = new XMLSerializer().serializeToString(clone);
  if (!/^<svg[^>]*\sxmlns=/.test(xml)) xml = xml.replace(/^<svg/, `<svg xmlns="${SVG_NS}"`);
  const img = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`);
  const canvas = document.createElement("canvas");
  canvas.width = RASTER_W;
  canvas.height = RASTER_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas no disponible");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, RASTER_W, RASTER_H);
  ctx.drawImage(img, 0, 0, RASTER_W, RASTER_H);
  return canvas.toDataURL("image/jpeg", 0.86);
}

/** Render a seed scene offscreen and hand back a detached copy of its <svg>. */
function renderSceneOffscreen(photo: Photo): SVGSVGElement | null {
  if (photo.source.type !== "scene") return null;
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = "position:fixed;left:-10000px;top:0;width:400px;height:300px;pointer-events:none;opacity:0;";
  document.body.appendChild(host);
  const root = createRoot(host, { identifierPrefix: "pkraster-" });
  try {
    flushSync(() =>
      root.render(
        createElement(ScenePhoto, {
          scene: photo.source.type === "scene" ? photo.source.scene : "oficina",
          seed: photo.source.type === "scene" ? photo.source.seed : 0,
          dirty: photo.kind === "antes" || photo.kind === "incidencia",
        }),
      ),
    );
    const svg = host.querySelector("svg");
    return svg ? (svg.cloneNode(true) as SVGSVGElement) : null;
  } finally {
    root.unmount();
    host.remove();
  }
}

export async function photoToDataUrl(photo: Photo, root?: ParentNode | null): Promise<string | null> {
  if (photo.source.type === "idb") {
    const blob = await getPhotoBlob(photo.source.key);
    return blob ? blobToDataUrl(blob) : null;
  }
  const mounted = root?.querySelector<SVGSVGElement>(`[data-raster="${photo.id}"] svg`);
  const svg = mounted ?? renderSceneOffscreen(photo);
  return svg ? svgToJpeg(svg) : null;
}

/** Rasterize photos sequentially (keeps the main thread breathing so progress can animate). */
export async function rasterizePhotos(
  photos: Photo[],
  opts: { root?: ParentNode | null; onProgress?: (done: number, total: number) => void } = {},
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  let done = 0;
  opts.onProgress?.(0, photos.length);
  for (const p of photos) {
    try {
      const url = await photoToDataUrl(p, opts.root);
      if (url) out[p.id] = url;
    } catch {
      // a missing capture becomes a placeholder in the PDF
    }
    done++;
    opts.onProgress?.(done, photos.length);
    await nextFrame();
  }
  return out;
}
