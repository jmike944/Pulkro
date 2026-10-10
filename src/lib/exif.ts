/**
 * Minimal EXIF reader for photo evidence (doc §4.2): when a photo was really taken and, if the camera stored it, where.
 * JPEG only (what phone cameras and the browser's file input hand us); anything else returns {}. Never throws.
 */
export type CaptureMeta = {
  /** ISO time from DateTimeOriginal (or DateTimeDigitized), with OffsetTimeOriginal when present, else device-local. */
  takenAt?: string;
  lat?: number;
  lng?: number;
};

const TAG = {
  exifIfd: 0x8769,
  gpsIfd: 0x8825,
  dateTimeOriginal: 0x9003,
  dateTimeDigitized: 0x9004,
  offsetTimeOriginal: 0x9011,
  gpsLatRef: 0x0001,
  gpsLat: 0x0002,
  gpsLngRef: 0x0003,
  gpsLng: 0x0004,
} as const;

const TYPE_SIZE: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };

export async function readCaptureMeta(file: Blob): Promise<CaptureMeta> {
  try {
    const buf = await file.slice(0, 256 * 1024).arrayBuffer();
    const view = new DataView(buf);
    if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return {};
    let offset = 2;
    while (offset + 4 <= view.byteLength) {
      const marker = view.getUint16(offset);
      if ((marker & 0xff00) !== 0xff00 || marker === 0xffda) return {};
      const size = view.getUint16(offset + 2);
      if (marker === 0xffe1 && offset + 10 <= view.byteLength && view.getUint32(offset + 4) === 0x45786966 /* "Exif" */) {
        return parseTiff(view, offset + 10);
      }
      offset += 2 + size;
    }
  } catch {
    // unreadable file: no metadata
  }
  return {};
}

function parseTiff(view: DataView, tiff: number): CaptureMeta {
  const little = view.getUint16(tiff) === 0x4949;
  const u16 = (at: number) => view.getUint16(at, little);
  const u32 = (at: number) => view.getUint32(at, little);
  if (u16(tiff + 2) !== 0x002a) return {};

  type Entry = { type: number; count: number; valueAt: number };
  const readIfd = (ifdOffset: number) => {
    const out = new Map<number, Entry>();
    const at = tiff + ifdOffset;
    if (at + 2 > view.byteLength) return out;
    const n = u16(at);
    for (let i = 0; i < n; i++) {
      const e = at + 2 + i * 12;
      if (e + 12 > view.byteLength) break;
      const type = u16(e + 2);
      const count = u32(e + 4);
      const bytes = (TYPE_SIZE[type] ?? 1) * count;
      out.set(u16(e), { type, count, valueAt: bytes <= 4 ? e + 8 : tiff + u32(e + 8) });
    }
    return out;
  };
  const ascii = (e?: Entry) => {
    if (!e || e.valueAt + e.count > view.byteLength) return undefined;
    let s = "";
    for (let i = 0; i < e.count; i++) {
      const c = view.getUint8(e.valueAt + i);
      if (c === 0) break;
      s += String.fromCharCode(c);
    }
    return s.trim() || undefined;
  };
  const rationals = (e?: Entry) => {
    if (!e || e.type !== 5 || e.valueAt + e.count * 8 > view.byteLength) return undefined;
    return Array.from({ length: e.count }, (_, i) => {
      const den = u32(e.valueAt + i * 8 + 4);
      return den ? u32(e.valueAt + i * 8) / den : 0;
    });
  };

  const ifd0 = readIfd(u32(tiff + 4));
  const meta: CaptureMeta = {};

  const exifPtr = ifd0.get(TAG.exifIfd);
  if (exifPtr) {
    const exif = readIfd(u32(exifPtr.valueAt));
    const raw = ascii(exif.get(TAG.dateTimeOriginal)) ?? ascii(exif.get(TAG.dateTimeDigitized));
    const takenAt = raw ? exifDateToIso(raw, ascii(exif.get(TAG.offsetTimeOriginal))) : undefined;
    if (takenAt) meta.takenAt = takenAt;
  }

  const gpsPtr = ifd0.get(TAG.gpsIfd);
  if (gpsPtr) {
    const gps = readIfd(u32(gpsPtr.valueAt));
    const lat = dms(rationals(gps.get(TAG.gpsLat)), ascii(gps.get(TAG.gpsLatRef)));
    const lng = dms(rationals(gps.get(TAG.gpsLng)), ascii(gps.get(TAG.gpsLngRef)));
    if (lat !== undefined && lng !== undefined && (lat !== 0 || lng !== 0)) {
      meta.lat = lat;
      meta.lng = lng;
    }
  }
  return meta;
}

function dms(v: number[] | undefined, ref: string | undefined) {
  if (!v || v.length < 3) return undefined;
  const deg = v[0] + v[1] / 60 + v[2] / 3600;
  if (!Number.isFinite(deg)) return undefined;
  return ref === "S" || ref === "W" ? -deg : deg;
}

/** "2026:10:09 08:14:03" (+ "-06:00") → ISO. Without an offset the camera's clock is taken as the device's local time. */
function exifDateToIso(raw: string, offset?: string): string | undefined {
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(raw);
  if (!m) return undefined;
  const [y, mo, d, h, mi, s] = m.slice(1).map(Number);
  let date: Date;
  const off = offset && /^([+-])(\d{2}):?(\d{2})$/.exec(offset);
  if (off) {
    const sign = off[1] === "-" ? -1 : 1;
    const minutes = sign * (Number(off[2]) * 60 + Number(off[3]));
    date = new Date(Date.UTC(y, mo - 1, d, h, mi, s) - minutes * 60_000);
  } else {
    date = new Date(y, mo - 1, d, h, mi, s);
  }
  const t = date.getTime();
  // Cameras with an unset clock report 2000-01-01 or similar; a time in the future is not a capture time either.
  if (Number.isNaN(t) || y < 2010 || t > Date.now() + 5 * 60_000) return undefined;
  return date.toISOString();
}
