import type { Metadata } from "next";
import { Suspense } from "react";
import { IndicadoresView } from "@/features/indicadores/indicadores-view";

export const metadata: Metadata = { title: "Indicadores" };

// The view reads ?tab, ?p and ?d with useSearchParams, so it must sit inside a Suspense boundary.
export default function IndicadoresPage() {
  return (
    <Suspense fallback={null}>
      <IndicadoresView />
    </Suspense>
  );
}
