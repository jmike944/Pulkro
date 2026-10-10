import type { Metadata } from "next";
import { Suspense } from "react";
import { CaseDetailView } from "@/features/postventa/case-detail-view";

export const metadata: Metadata = { title: "Caso postventa" };

export default function Page({ params }: { params: Promise<{ folio: string }> }) {
  return (
    <Suspense fallback={null}>
      <CaseDetailView params={params} />
    </Suspense>
  );
}
