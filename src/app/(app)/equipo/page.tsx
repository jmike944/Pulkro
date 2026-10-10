import type { Metadata } from "next";
import { Suspense } from "react";
import { EquipoView } from "@/features/equipo/equipo-view";

export const metadata: Metadata = { title: "Equipo" };

// EquipoView reads ?w= (worker profile) with useSearchParams → must render inside Suspense.
export default function EquipoPage() {
  return (
    <Suspense fallback={null}>
      <EquipoView />
    </Suspense>
  );
}
