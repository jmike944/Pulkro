"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import { maplibreGL } from "@maplibre/maplibre-gl-leaflet";
import { getVersion, setWorkerUrl } from "maplibre-gl";
import { useTheme } from "next-themes";
import { useMap } from "react-leaflet";

// The bundler doesn't emit MapLibre's module worker; scripts/vendor-maplibre.mjs copies it here (predev/prebuild).
setWorkerUrl(`/vendor/maplibre/${getVersion()}/maplibre-gl-worker.mjs`);

/**
 * Basemap for every Leaflet map: OpenFreeMap vector tiles (OpenStreetMap data) rendered by MapLibre.
 * Free, no API key, no view limits, commercial use allowed; self-hostable later. Light = Positron, dark = the
 * native Dark style (no CSS inversion). Must be rendered inside a react-leaflet <MapContainer>.
 */
const STYLE = {
  light: "https://tiles.openfreemap.org/styles/positron",
  dark: "https://tiles.openfreemap.org/styles/dark",
} as const;

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
    const layer = maplibreGL({ style: dark ? STYLE.dark : STYLE.light, attributionControl: false });
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
    return () => {
      gl.off("load", onLoad);
      gl.off("error", onError);
      map.removeLayer(layer);
    };
  }, [map, dark]);

  return null;
}
