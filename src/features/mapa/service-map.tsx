"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { CloudOff, MapPinOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsOffline } from "@/lib/hooks";
import type { Tone } from "@/lib/status";

/** One service on the map, at its site. */
export type MapaPin = {
  id: string;
  lat: number;
  lng: number;
  tone: Tone;
  /** En curso: the pin pulses (motion-safe only). */
  live: boolean;
  /** Open incident: small red "!" badge. */
  alert: boolean;
  /** Chip shown above the pin while it is hovered / selected ("09:00 · Hotel Safi"). */
  label: string;
  /** Accessible name of the pin. */
  title: string;
  /** Horizontal pixel nudge when several services share a site. */
  nudge: number;
};

export type ServiceMapInnerProps = {
  pins: MapaPin[];
  /** Changes only when the set of visible pins changes: the map refits then (not on hover, selection or store ticks). */
  fitKey: string;
  activeId: string | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  onTilesFailed: (failed: boolean) => void;
};

/** The Leaflet chunk itself can fail to load offline (not cached yet): fall back to the calm offline state. */
function ChunkFailed() {
  return <MapOffline />;
}

const Inner = dynamic(() => import("./service-map-inner").catch(() => ({ default: ChunkFailed })), {
  ssr: false,
  loading: () => <div className="h-full w-full shimmer" />,
});

/**
 * Multi-pin map of the day's services. Same library, CARTO tiles and dark-mode tile filter as the shared GeoMap (globals.css
 * `.leaflet-*`), client-only and lazy. Offline — or when the tiles do not load — the map area turns into a calm "Mapa sin conexión"
 * state; the list next to it keeps working because it never depends on the map.
 */
export function ServiceMap({ className, ...props }: Omit<ServiceMapInnerProps, "onTilesFailed"> & { className?: string }) {
  const offline = useIsOffline();
  const [tilesFailed, setTilesFailed] = useState(false);
  return (
    <div className={cn("relative isolate overflow-hidden rounded-[22px] bg-[var(--map-bg)] ring-1 ring-edge", className)}>
      {offline ? (
        <MapOffline />
      ) : (
        <>
          <Inner {...props} onTilesFailed={setTilesFailed} />
          {tilesFailed && <MapOffline overlay />}
          {!tilesFailed && props.pins.length === 0 && (
            <div className="pointer-events-none absolute inset-x-0 top-3 z-[500] flex justify-center px-3">
              <span className="inline-flex items-center gap-2 rounded-full bg-surface/90 px-3.5 py-2 text-[13px] font-medium text-ink shadow-soft ring-1 ring-edge backdrop-blur-sm">
                <MapPinOff className="size-4 text-subtle" /> Sin servicios para mostrar
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** "Mapa sin conexión": fills the map area; as an overlay it covers a map whose tiles failed. */
function MapOffline({ overlay }: { overlay?: boolean }) {
  return (
    <div
      role="status"
      className={cn(
        "flex h-full w-full flex-col items-center justify-center gap-3 px-6 text-center",
        // above Leaflet's panes (markers 600) and controls (1000); the wrapper is `isolate`, so this stays inside the map
        overlay ? "absolute inset-0 z-[1100] bg-surface/85 backdrop-blur-sm" : "bg-soft",
      )}
    >
      <span className="inline-flex size-12 items-center justify-center rounded-[16px] bg-surface text-subtle shadow-soft ring-1 ring-edge [&_svg]:size-[22px]">
        <CloudOff />
      </span>
      <div>
        <p className="font-serif text-[20px] text-ink">Mapa sin conexión</p>
        <p className="mx-auto mt-1 max-w-[300px] text-[13.5px] leading-snug text-subtle">
          Los servicios del día siguen en la lista. El mapa vuelve en cuanto haya señal.
        </p>
      </div>
    </div>
  );
}
