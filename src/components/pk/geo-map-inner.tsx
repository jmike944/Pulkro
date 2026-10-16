"use client";

import "leaflet/dist/leaflet.css";
import { useEffect } from "react";
import L from "leaflet";
import { Circle, MapContainer, Marker, Polyline, Tooltip, useMap } from "react-leaflet";
import { Basemap } from "./basemap";
import type { GeoMapProps } from "./geo-map";

// CSS variables (the pin HTML lives in the page DOM, and SVG paint attributes accept var()), so pins follow the theme; the ring
// is the surface color, like the Mapa pins (features/mapa/service-map-inner.tsx).
const COLORS = { site: "var(--brand)", checkin: "var(--st-blue)", checkout: "var(--st-teal)", live: "var(--sky)", alert: "var(--st-red)" } as const;

function pin(kind: keyof typeof COLORS, label?: string) {
  const color = COLORS[kind];
  const pulse = kind === "live" || kind === "checkin";
  return L.divIcon({
    className: "",
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    html: `
      <div style="position:relative;width:28px;height:28px">
        ${pulse ? `<span style="position:absolute;inset:0;border-radius:999px;background:${color};opacity:.35;animation:ping-soft 2.4s cubic-bezier(0,0,.2,1) infinite"></span>` : ""}
        <span style="position:absolute;inset:6px;border-radius:999px;background:${color};border:3px solid var(--surface);box-shadow:0 4px 12px rgba(2,58,99,.35)"></span>
        ${label ? `<span style="position:absolute;left:50%;top:-18px;transform:translateX(-50%);white-space:nowrap;font:600 11px/1 var(--font-geist),system-ui;color:var(--ink);background:var(--surface);padding:3px 6px;border-radius:6px;box-shadow:0 2px 8px rgba(16,24,40,.15)">${label}</span>` : ""}
      </div>`,
  });
}

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length > 1) map.fitBounds(L.latLngBounds(points), { padding: [36, 36], maxZoom: 17 });
    else if (points.length === 1) map.setView(points[0], map.getZoom());
  }, [map, points]);
  return null;
}

/**
 * Leaflet gives a draggable map `touch-action: none`, so on a touch screen a one-finger swipe that starts
 * on it pans the map instead of scrolling the page (a scroll trap in long phone pages). Touch screens get a
 * map that doesn't drag: the page scrolls over it and pinch / the zoom buttons still work ("Abrir en Maps"
 * is the way to roam). Mouse keeps dragging.
 */
const touchScreen = () => L.Browser.mobile || window.matchMedia("(pointer: coarse)").matches;

export default function GeoMapInner({ markers, accuracy, zoom = 16, className, interactive = true, connect }: GeoMapProps) {
  const points = markers.map((m) => [m.lat, m.lng] as [number, number]);
  const center = points[0] ?? [25.6866, -100.3161];
  return (
    <MapContainer
      center={center}
      zoom={zoom}
      scrollWheelZoom={false}
      dragging={interactive && !touchScreen()}
      zoomControl={interactive}
      attributionControl
      className={className}
      style={{ height: "100%", width: "100%" }}
    >
      <Basemap />
      {accuracy && <Circle center={[accuracy.lat, accuracy.lng]} radius={accuracy.radius} pathOptions={{ color: "var(--st-blue)", weight: 1, fillColor: "var(--sky)", fillOpacity: 0.18 }} />}
      {connect && points.length > 1 && <Polyline positions={points} pathOptions={{ color: "var(--brand)", weight: 2, dashArray: "4 6", opacity: 0.6, className: "pk-route" }} />}
      {markers.map((m, i) => (
        <Marker key={`${m.lat}-${m.lng}-${i}`} position={[m.lat, m.lng]} icon={pin(m.kind ?? "site", m.label)}>
          {m.tooltip && <Tooltip direction="top" offset={[0, -12]}>{m.tooltip}</Tooltip>}
        </Marker>
      ))}
      <FitBounds points={points} />
    </MapContainer>
  );
}
