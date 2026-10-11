"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import { useReducedMotion } from "motion/react";
import { MapContainer, Marker, useMap } from "react-leaflet";
import { Basemap } from "@/components/pk/basemap";
import { toneDot, type Tone } from "@/lib/status";
import { INCIDENT_TONE } from "./mapa-model";
import type { MapaPin, ServiceMapInnerProps } from "./service-map";

/** Monterrey, when there is nothing to fit. */
const DEFAULT_CENTER: [number, number] = [25.6866, -100.3161];
const DEFAULT_ZOOM = 11;
/** Closest zoom a fit may reach (one pin, or pins a few blocks apart). */
const FIT_MAX_ZOOM = 15;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

/**
 * Pin HTML (Leaflet divIcon) built from theme tokens, so it follows light/dark like the rest of the app. 44px hit area,
 * 18px dot; the "active" look (bigger dot, halo, label chip) is CSS on `data-active`, toggled without rebuilding the icon,
 * so hover feels instant. The live ring only pulses for users who allow motion.
 */
function pinIcon(tone: Tone, live: boolean, alert: boolean, label: string, nudge: number) {
  const dot = toneDot[tone];
  const badge = toneDot[INCIDENT_TONE];
  return L.divIcon({
    className: "group rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/60",
    iconSize: [44, 44],
    iconAnchor: [22 - nudge, 22],
    html: `
      <span class="pointer-events-none absolute inset-0 grid place-items-center">
        ${live ? `<span class="absolute inset-0 m-auto size-[18px] rounded-full ${dot} opacity-0 motion-safe:animate-ping-soft"></span>` : ""}
        <span class="relative block size-[18px] rounded-full border-[3px] border-surface ${dot} shadow-[0_3px_10px_rgb(2_58_99/0.35)] ring-0 ring-ink/20 transition-all duration-200 group-data-[active]:size-[26px] group-data-[active]:ring-[6px]"></span>
        ${alert ? `<span class="absolute left-[26px] top-[7px] grid size-[15px] place-items-center rounded-full border-2 border-surface ${badge} text-[9px] font-bold leading-none text-white transition-transform duration-200 group-data-[active]:translate-x-[3px] group-data-[active]:-translate-y-[3px]">!</span>` : ""}
      </span>
      <span class="pointer-events-none absolute bottom-[calc(100%-4px)] left-1/2 -translate-x-1/2 translate-y-1 whitespace-nowrap rounded-[8px] bg-surface px-2 py-1 text-[11.5px] font-semibold text-ink opacity-0 shadow-[0_2px_10px_rgb(16_24_40/0.18)] ring-1 ring-edge transition duration-200 group-data-[active]:translate-y-0 group-data-[active]:opacity-100">${esc(label)}</span>`,
  });
}

function PinMarker({
  pin,
  active,
  onSelect,
  onHover,
}: {
  pin: MapaPin;
  active: boolean;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
}) {
  const ref = useRef<L.Marker>(null);
  const { id, tone, live, alert, label, title, nudge } = pin;
  const icon = useMemo(() => pinIcon(tone, live, alert, label, nudge), [tone, live, alert, label, nudge]);
  const handlers = useMemo(
    () => ({ click: () => onSelect(id), mouseover: () => onHover(id), mouseout: () => onHover(null) }),
    [id, onSelect, onHover],
  );

  // Leaflet owns the icon element: reflect the active state and the accessible name on it (also after the icon is rebuilt).
  useEffect(() => {
    const el = ref.current?.getElement();
    if (!el) return;
    el.toggleAttribute("data-active", active);
    el.setAttribute("aria-label", title);
    el.removeAttribute("title");
  }, [active, title, icon]);

  return <Marker ref={ref} position={[pin.lat, pin.lng]} icon={icon} keyboard zIndexOffset={active ? 1000 : live ? 200 : 0} eventHandlers={handlers} />;
}

/** Refit to the visible pins when the set changes (`fitKey`), never on hover/selection, so a user who panned is left alone. */
function FitToPins({ pins, fitKey, animate }: { pins: MapaPin[]; fitKey: string; animate: boolean }) {
  const map = useMap();
  const latest = useRef(pins);
  useEffect(() => {
    latest.current = pins;
  });
  useEffect(() => {
    const points = latest.current.map((p) => [p.lat, p.lng] as [number, number]);
    if (points.length === 0) map.setView(DEFAULT_CENTER, DEFAULT_ZOOM, { animate: false });
    else if (points.length === 1) map.setView(points[0], FIT_MAX_ZOOM, { animate });
    else map.fitBounds(L.latLngBounds(points), { padding: [56, 56], maxZoom: FIT_MAX_ZOOM, animate });
    // `animate` is read at fit time only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, fitKey]);
  return null;
}

/** Bring a pin selected from the list into view (no-op when it is already comfortably visible). */
function RevealSelected({ point, animate }: { point: { id: string; lat: number; lng: number } | null; animate: boolean }) {
  const map = useMap();
  const id = point?.id;
  const lat = point?.lat;
  const lng = point?.lng;
  useEffect(() => {
    if (!id || lat === undefined || lng === undefined) return;
    map.panInside([lat, lng], { padding: [64, 64], animate });
    // `animate` is read at pan time only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, id, lat, lng]);
  return null;
}

/** The map's box changes with the layout (phone 45dvh ↔ desktop sticky column): keep Leaflet's size in sync. */
function KeepSized() {
  const map = useMap();
  useEffect(() => {
    const ro = new ResizeObserver(() => map.invalidateSize({ pan: false }));
    ro.observe(map.getContainer());
    return () => ro.disconnect();
  }, [map]);
  return null;
}

/** Same rule as the shared GeoMap: on touch screens one finger scrolls the page (no scroll trap); pinch / two fingers move the map. */
const touchScreen = () => L.Browser.mobile || window.matchMedia("(pointer: coarse)").matches;

export default function ServiceMapInner({ pins, fitKey, activeId, selectedId, onSelect, onHover, onTilesFailed }: ServiceMapInnerProps) {
  const reduced = useReducedMotion() ?? false;
  const selected = pins.find((p) => p.id === selectedId) ?? null;


  return (
    <MapContainer
      center={DEFAULT_CENTER}
      zoom={DEFAULT_ZOOM}
      scrollWheelZoom={false}
      dragging={!touchScreen()}
      zoomAnimation={!reduced}
      fadeAnimation={!reduced}
      markerZoomAnimation={!reduced}
      attributionControl
      style={{ height: "100%", width: "100%" }}
    >
      <Basemap onFailed={onTilesFailed} />
      {pins.map((p) => (
        <PinMarker key={p.id} pin={p} active={p.id === activeId} onSelect={onSelect} onHover={onHover} />
      ))}
      <FitToPins pins={pins} fitKey={fitKey} animate={!reduced} />
      <RevealSelected point={selected} animate={!reduced} />
      <KeepSized />
    </MapContainer>
  );
}
