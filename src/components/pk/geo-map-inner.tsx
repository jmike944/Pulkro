"use client";

import "leaflet/dist/leaflet.css";
import { useEffect } from "react";
import L from "leaflet";
import { Circle, MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from "react-leaflet";
import type { GeoMapProps } from "./geo-map";

const COLORS = { site: "#023a63", checkin: "#2f80ed", checkout: "#12a594", live: "#7ad1f4", alert: "#e5484d" } as const;

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
        <span style="position:absolute;inset:6px;border-radius:999px;background:${color};border:3px solid #fff;box-shadow:0 4px 12px rgba(2,58,99,.35)"></span>
        ${label ? `<span style="position:absolute;left:50%;top:-18px;transform:translateX(-50%);white-space:nowrap;font:600 11px/1 var(--font-geist),system-ui;color:#0e1726;background:#fff;padding:3px 6px;border-radius:6px;box-shadow:0 2px 8px rgba(16,24,40,.15)">${label}</span>` : ""}
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
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>'
        subdomains="abcd"
        maxZoom={20}
      />
      {accuracy && <Circle center={[accuracy.lat, accuracy.lng]} radius={accuracy.radius} pathOptions={{ color: "#2f80ed", weight: 1, fillColor: "#7ad1f4", fillOpacity: 0.18 }} />}
      {connect && points.length > 1 && <Polyline positions={points} pathOptions={{ color: "#023a63", weight: 2, dashArray: "4 6", opacity: 0.6 }} />}
      {markers.map((m, i) => (
        <Marker key={`${m.lat}-${m.lng}-${i}`} position={[m.lat, m.lng]} icon={pin(m.kind ?? "site", m.label)}>
          {m.tooltip && <Tooltip direction="top" offset={[0, -12]}>{m.tooltip}</Tooltip>}
        </Marker>
      ))}
      <FitBounds points={points} />
    </MapContainer>
  );
}
