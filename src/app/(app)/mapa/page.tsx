import type { Metadata } from "next";
import { Suspense } from "react";
import { MapaView } from "@/features/mapa/mapa-view";

export const metadata: Metadata = { title: "Mapa del día" };

// MapaView reads ?dia= with useSearchParams → must render inside Suspense.
export default function MapaPage() {
  return (
    <Suspense fallback={null}>
      <MapaView />
    </Suspense>
  );
}
