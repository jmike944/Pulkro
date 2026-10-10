"use client";

import { firstName, fmtDate } from "@/lib/format";
import type { ShareChannel } from "@/lib/types";
import type { ReportContext } from "./report-model";

/** Trigger a local download of a Blob (works after async work in all evergreen browsers). */
export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Web Share API with files — the phone share sheet (doc §4.3, MVP option). */
export function canShareFile(file: File) {
  return typeof navigator !== "undefined" && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });
}

const periodText = (ctx: ReportContext) => {
  const js = ctx.jornadas.filter((j) => j.orderId === ctx.order.id).sort((a, b) => a.dayIndex - b.dayIndex);
  const start = js[0]?.checkIn?.deviceAt ?? ctx.order.scheduledStart;
  const end = js.at(-1)?.checkOut?.deviceAt ?? ctx.order.scheduledEnd;
  const a = fmtDate(start);
  const b = fmtDate(end);
  return a === b ? a : `${a} al ${b}`;
};

export function whatsappMessage(ctx: ReportContext, version: number, attachManually: boolean) {
  const { order, site, supervisor } = ctx;
  return [
    `Hola ${firstName(order.siteContact.name.replace(/^(Lic\.|Ing\.|Arq\.|Dr\.|Dra\.|C\.P\.)\s+/i, ""))}, le compartimos el reporte final del servicio "${order.title}" realizado en ${site.name} (${periodText(ctx)}).`,
    `Folio ${order.folio} · versión ${version}.${attachManually ? " Le adjunto el PDF en este chat." : ""}`,
    `Quedamos atentos a cualquier comentario.`,
    `${supervisor?.name ?? "Supervisor"} · Pulkro Compañía de Servicios`,
  ].join("\n");
}

export function emailDraft(ctx: ReportContext, version: number, fileName: string) {
  const { order, client, site, supervisor } = ctx;
  const subject = `Reporte de servicio ${order.folio} · ${client.shortName} · Pulkro`;
  const body = [
    `Estimado(a) ${client.contactName}:`,
    ``,
    `Adjunto encontrará el reporte final del servicio "${order.title}" realizado en ${site.name} (${periodText(ctx)}).`,
    `Folio ${order.folio}, versión ${version} (archivo ${fileName}).`,
    ``,
    `El reporte incluye el resumen de jornadas, la evidencia fotográfica antes y después, las incidencias y la conformidad registrada.`,
    ``,
    `Quedamos a sus órdenes para cualquier aclaración.`,
    ``,
    supervisor?.name ?? "",
    supervisor?.title ?? "",
    `Pulkro Compañía de Servicios`,
    supervisor?.phone ?? "",
  ].join("\n");
  return { subject, body };
}

export const CHANNEL_TO_LABEL: Record<ShareChannel, string> = {
  whatsapp: "WhatsApp",
  email: "Correo",
  descarga: "Descarga",
};

/** Recipient recorded for a download attempt (no recipient: the PDF stays on the device). */
export const DOWNLOAD_TARGET = "Descarga en el dispositivo";
