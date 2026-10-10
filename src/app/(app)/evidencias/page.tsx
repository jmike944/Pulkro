import type { Metadata } from "next";
import { Suspense } from "react";
import { EvidenceView } from "@/features/evidencias/evidence-view";

export const metadata: Metadata = { title: "Evidencias" };

/** `?orden=<folio>` and `?tab=` are read with useSearchParams, so the client view sits inside Suspense. */
export default function EvidenciasPage() {
  return (
    <Suspense fallback={null}>
      <EvidenceView />
    </Suspense>
  );
}
