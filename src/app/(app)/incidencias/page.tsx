import type { Metadata } from "next";
import { Suspense } from "react";
import { IncidentsView } from "@/features/incidencias/incidents-view";

export const metadata: Metadata = { title: "Incidencias" };

/** `?i=<incidentId>` opens the detail, read with useSearchParams — so the client view sits inside Suspense. */
export default function IncidenciasPage() {
  return (
    <Suspense fallback={null}>
      <IncidentsView />
    </Suspense>
  );
}
