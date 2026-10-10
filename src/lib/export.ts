"use client";

/** Excel export (doc §6: "exportaciones PDF y Excel"). exceljs is lazy-loaded on demand. */
export type SheetSpec = {
  name: string;
  columns: { header: string; key: string; width?: number; numFmt?: string }[];
  rows: Record<string, string | number | Date | null | undefined>[];
};

/** Pulkro's operating time zone: every date in an export is Monterrey wall-clock time, whatever the device is set to. */
export const BUSINESS_TZ = "America/Monterrey";

const tzParts = new Intl.DateTimeFormat("en-US", {
  timeZone: BUSINESS_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/**
 * Excel cells have no time zone and exceljs writes a Date as its UTC value, so a check-in at 08:14 in Monterrey showed as
 * 14:14. This returns a Date whose UTC fields are the Monterrey wall-clock fields, which Excel then shows as 08:14.
 */
export function toBusinessWallClock(date: Date): Date {
  if (Number.isNaN(date.getTime())) return date;
  const p = Object.fromEntries(tzParts.formatToParts(date).map((x) => [x.type, x.value]));
  return new Date(Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second));
}

export async function exportToExcel(filename: string, sheets: SheetSpec[]) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Pulkro Cuadrillas";
  wb.created = toBusinessWallClock(new Date());
  for (const spec of sheets) {
    const ws = wb.addWorksheet(spec.name.slice(0, 31), { views: [{ state: "frozen", ySplit: 1 }] });
    ws.columns = spec.columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? Math.max(12, c.header.length + 4), style: c.numFmt ? { numFmt: c.numFmt } : undefined }));
    spec.rows.forEach((r) => ws.addRow(Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v instanceof Date ? toBusinessWallClock(v) : v]))));
    const header = ws.getRow(1);
    header.font = { bold: true, color: { argb: "FFFFFFFF" } };
    header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF07243F" } };
    header.alignment = { vertical: "middle" };
    header.height = 22;
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: spec.columns.length } };
  }
  const buffer = await wb.xlsx.writeBuffer();
  downloadBlob(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
}

/**
 * Saves a file: on touch devices that can share files it opens the native share sheet (WhatsApp, mail,
 * Files…); everywhere else — and when sharing fails — it downloads through a hidden anchor.
 * Stays synchronous so the share call keeps the tap's user activation.
 */
export function downloadBlob(blob: Blob, filename: string) {
  const file = shareableFile(blob, filename);
  if (!file) return saveViaAnchor(blob, filename);
  navigator.share({ files: [file], title: filename.replace(/\.[^.]+$/, "") }).catch((e) => {
    // Dismissing the sheet is not a failure; anything else falls back to the download.
    if (!(e instanceof DOMException && e.name === "AbortError")) saveViaAnchor(blob, filename);
  });
}

/** The file wrapped for `navigator.share`, only on coarse-pointer devices whose share sheet accepts it. */
function shareableFile(blob: Blob, filename: string) {
  try {
    if (typeof navigator === "undefined" || typeof navigator.share !== "function" || typeof navigator.canShare !== "function") return null;
    if (!window.matchMedia("(pointer: coarse)").matches) return null;
    const file = new File([blob], filename, { type: blob.type });
    return navigator.canShare({ files: [file] }) ? file : null;
  } catch {
    return null;
  }
}

function saveViaAnchor(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
