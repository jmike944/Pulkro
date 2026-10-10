import type { Metadata } from "next";
import { Suspense } from "react";
import { NewOrderView } from "@/features/ordenes/nueva/new-order-view";

export const metadata: Metadata = { title: "Nueva orden" };

/** Supports ?cliente=<clientId> prefill (useSearchParams → inside Suspense). */
export default function NuevaOrdenPage() {
  return (
    <Suspense fallback={null}>
      <NewOrderView />
    </Suspense>
  );
}
