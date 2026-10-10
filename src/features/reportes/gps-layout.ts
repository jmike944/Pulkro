/**
 * Projects check-in/out coordinates around the site into a small schematic map (meters → px),
 * used by the A4 preview and the PDF so both draw the same "Ubicación GPS" plot.
 */
export type GpsInput = { key: string; lat: number; lng: number; accuracy: number; kind: "entrada" | "salida" };

const NICE = [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];

export function gpsLayout(site: { lat: number; lng: number }, points: GpsInput[], w: number, h: number, pad = 14) {
  const cos = Math.cos((site.lat * Math.PI) / 180);
  const proj = points.map((p) => ({
    ...p,
    mx: (p.lng - site.lng) * 111_320 * cos,
    my: -(p.lat - site.lat) * 111_320,
  }));
  const extent = Math.max(30, ...proj.map((p) => Math.max(Math.abs(p.mx), Math.abs(p.my)) + Math.min(p.accuracy, 80)));
  const scale = Math.min(w / 2 - pad, h / 2 - pad) / extent; // px per meter
  const cx = w / 2;
  const cy = h / 2;
  const target = extent / 2;
  const meters = NICE.reduce((best, n) => (Math.abs(n - target) < Math.abs(best - target) ? n : best), NICE[0]);
  return {
    cx,
    cy,
    points: proj.map((p) => ({
      ...p,
      x: cx + p.mx * scale,
      y: cy + p.my * scale,
      r: Math.max(3, Math.min(p.accuracy, 80) * scale),
      distance: Math.round(Math.hypot(p.mx, p.my)),
    })),
    scaleBar: { meters, px: meters * scale },
  };
}
