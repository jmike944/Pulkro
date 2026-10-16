"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import { maplibreGL } from "@maplibre/maplibre-gl-leaflet";
import { getVersion, setWorkerUrl, type LayerSpecification, type StyleSpecification } from "maplibre-gl";
import { useTheme } from "next-themes";
import { useMap } from "react-leaflet";

// The bundler doesn't emit MapLibre's module worker; scripts/vendor-maplibre.mjs copies it here (predev/prebuild).
setWorkerUrl(`/vendor/maplibre/${getVersion()}/maplibre-gl-worker.mjs`);

/**
 * Basemap for every Leaflet map: OpenFreeMap vector tiles (OpenStreetMap data) rendered by MapLibre.
 * Free, no API key, no view limits, commercial use allowed; self-hostable later. Both themes start from the Positron style
 * and are recolored with the app palette (`--map-*` tokens in globals.css) before MapLibre draws a tile, so the map reads as
 * part of the UI: cool greys and sky water in light, the navy family in dark. Must be rendered inside a react-leaflet
 * <MapContainer>.
 */
const STYLE_URL = "https://tiles.openfreemap.org/styles/positron";

/** The `--map-*` tokens, read for one theme (a hidden probe carries the theme's class, so the page's current class doesn't matter). */
type MapPalette = Record<
  | "land" | "water" | "waterLabel" | "park" | "residential" | "building" | "buildingLine" | "road" | "roadCasing" | "path"
  | "motorway" | "motorwayCasing" | "rail" | "boundary" | "label" | "labelStrong" | "roadLabel" | "halo",
  string
>;

const TOKENS: Record<keyof MapPalette, string> = {
  land: "--map-bg",
  water: "--map-water",
  waterLabel: "--map-water-label",
  park: "--map-park",
  residential: "--map-residential",
  building: "--map-building",
  buildingLine: "--map-building-line",
  road: "--map-road",
  roadCasing: "--map-road-casing",
  path: "--map-path",
  motorway: "--map-motorway",
  motorwayCasing: "--map-motorway-casing",
  rail: "--map-rail",
  boundary: "--map-boundary",
  label: "--map-label",
  labelStrong: "--map-label-strong",
  roadLabel: "--map-road-label",
  halo: "--map-halo",
};

function readPalette(dark: boolean): MapPalette {
  const probe = document.createElement("div");
  probe.className = dark ? "dark" : "theme-light";
  probe.hidden = true;
  document.body.appendChild(probe);
  const css = getComputedStyle(probe);
  const palette = Object.fromEntries(Object.entries(TOKENS).map(([k, v]) => [k, css.getPropertyValue(v).trim()])) as MapPalette;
  probe.remove();
  return palette;
}

/**
 * Paint for each Positron layer, by id (most specific first). A layer no rule names keeps Positron's own colors (shields,
 * anything OpenFreeMap adds later); a token that comes back empty leaves that property alone.
 */
const RULES: [RegExp, (p: MapPalette) => Record<string, string>][] = [
  [/^background$/, (p) => ({ "background-color": p.land })],
  [/^(park|landcover_wood|landuse_park)$/, (p) => ({ "fill-color": p.park })],
  [/^landcover_(ice|glacier)/, (p) => ({ "fill-color": p.land })],
  [/^landuse_residential$/, (p) => ({ "fill-color": p.residential })],
  [/^water$/, (p) => ({ "fill-color": p.water })],
  [/^waterway$/, (p) => ({ "line-color": p.water })],
  [/^building$/, (p) => ({ "fill-color": p.building, "fill-outline-color": p.buildingLine })],
  [/^road_area_pier$/, (p) => ({ "fill-color": p.land })],
  [/^road_pier$/, (p) => ({ "line-color": p.land })],
  [/^aeroway-area$/, (p) => ({ "fill-color": p.path })],
  [/^aeroway-runway$/, (p) => ({ "line-color": p.road })],
  [/^aeroway-(taxiway|runway-casing)$/, (p) => ({ "line-color": p.roadCasing })],
  [/motorway.*casing|motorway_subtle/, (p) => ({ "line-color": p.motorwayCasing })],
  [/motorway.*inner/, (p) => ({ "line-color": p.motorway })],
  [/^highway_path$/, (p) => ({ "line-color": p.path })],
  [/^highway_major_(casing|subtle)$/, (p) => ({ "line-color": p.roadCasing })],
  [/^highway_(minor|major_inner)$/, (p) => ({ "line-color": p.road })],
  [/^railway.*dashline$/, (p) => ({ "line-color": p.land })],
  [/^railway/, (p) => ({ "line-color": p.rail })],
  [/^boundary/, (p) => ({ "line-color": p.boundary })],
  [/^(waterway_line_label|water_name)/, (p) => ({ "text-color": p.waterLabel, "text-halo-color": p.halo })],
  [/^highway[-_]name/, (p) => ({ "text-color": p.roadLabel, "text-halo-color": p.halo })],
  [/^label_(city|town|country)/, (p) => ({ "text-color": p.labelStrong, "text-halo-color": p.halo })],
  [/^(label_|airport$)/, (p) => ({ "text-color": p.label, "text-halo-color": p.halo })],
];

function recolor(style: StyleSpecification, p: MapPalette): StyleSpecification {
  const layers = style.layers.map((layer): LayerSpecification => {
    const rule = RULES.find(([re]) => re.test(layer.id));
    if (!rule) return layer;
    const paint = Object.fromEntries(Object.entries(rule[1](p)).filter(([, color]) => color));
    return { ...layer, paint: { ...layer.paint, ...paint } } as LayerSpecification;
  });
  return { ...style, layers };
}

/** One fetch of the Positron style per page (the service worker keeps it for offline use); a failed fetch is retried next time. */
let positron: Promise<StyleSpecification> | null = null;
function loadPositron() {
  positron ??= fetch(STYLE_URL).then((r) => {
    if (!r.ok) throw new Error(`style ${r.status}`);
    return r.json() as Promise<StyleSpecification>;
  });
  positron.catch(() => (positron = null));
  return positron;
}

const ATTRIBUTION =
  '<a href="https://openfreemap.org" target="_blank" rel="noreferrer">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/" target="_blank" rel="noreferrer">OpenMapTiles</a> · © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>';

/** `onFailed(true)` when the style/tiles can't load before the first render (offline, blocked); `false` once it renders. */
export function Basemap({ onFailed }: { onFailed?: (failed: boolean) => void }) {
  const map = useMap();
  const dark = useTheme().resolvedTheme === "dark";
  const report = useRef(onFailed);
  useEffect(() => {
    report.current = onFailed;
  });

  useEffect(() => {
    let cancelled = false;
    let teardown = () => {};
    loadPositron().then(
      (base) => {
        if (cancelled) return;
        const layer = maplibreGL({ style: recolor(base, readPalette(dark)), attributionControl: false });
        layer.options.attribution = ATTRIBUTION;
        layer.addTo(map);
        const gl = layer.getMaplibreMap();
        let loaded = false;
        let errors = 0;
        const onLoad = () => {
          loaded = true;
          report.current?.(false);
        };
        const onError = () => {
          if (!loaded && ++errors >= 3) report.current?.(true);
        };
        gl.on("load", onLoad);
        gl.on("error", onError);
        teardown = () => {
          gl.off("load", onLoad);
          gl.off("error", onError);
          map.removeLayer(layer);
        };
      },
      // No style (offline before it was ever cached, blocked): the same "no basemap" state as tiles that never load.
      () => !cancelled && report.current?.(true),
    );
    return () => {
      cancelled = true;
      teardown();
    };
  }, [map, dark]);

  return null;
}
