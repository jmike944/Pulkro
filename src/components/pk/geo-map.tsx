"use client";

import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";

export type GeoMarker = {
  lat: number;
  lng: number;
  kind?: "site" | "checkin" | "checkout" | "live" | "alert";
  label?: string;
  tooltip?: string;
};

export type GeoMapProps = {
  markers: GeoMarker[];
  /** accuracy circle in meters around a point */
  accuracy?: { lat: number; lng: number; radius: number };
  zoom?: number;
  className?: string;
  interactive?: boolean;
  /** draw a dashed line between markers (e.g. site → check-in) */
  connect?: boolean;
};

const Inner = dynamic(() => import("./geo-map-inner"), {
  ssr: false,
  loading: () => <div className="h-full w-full shimmer" />,
});

/** Soft, on-brand Leaflet map (CARTO light tiles). Client-only, lazy-loaded. */
export function GeoMap({ className, ...props }: GeoMapProps) {
  return (
    <div className={cn("relative isolate h-[220px] overflow-hidden rounded-[20px] ring-1 ring-edge dark:[&_.pk-route]:stroke-sky", className)}>
      <Inner {...props} />
    </div>
  );
}

/** Haversine distance in meters. */
export function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371e3;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export type GeoReading = { lat: number; lng: number; accuracy: number; source: "gps" | "manual" };

/**
 * Read the device position. Falls back to a simulated reading near `fallback` (the site) when the
 * browser denies or lacks GPS — the caller must then ask for a justification (doc §4.2 PENDIENTE).
 */
export function readPosition(fallback: { lat: number; lng: number }, timeoutMs = 8000): Promise<GeoReading & { simulated: boolean; error?: string }> {
  return new Promise((resolve) => {
    const simulate = (error?: string) =>
      resolve({
        lat: fallback.lat + (Math.random() - 0.5) * 0.0005,
        lng: fallback.lng + (Math.random() - 0.5) * 0.0005,
        accuracy: Math.round(6 + Math.random() * 12),
        source: "gps",
        simulated: true,
        error,
      });
    if (typeof navigator === "undefined" || !navigator.geolocation) return simulate("GPS no disponible en este dispositivo");
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: Math.round(p.coords.accuracy), source: "gps", simulated: false }),
      (e) => simulate(e.code === e.PERMISSION_DENIED ? "Permiso de ubicación denegado" : "No se obtuvo señal GPS"),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30_000 },
    );
  });
}
