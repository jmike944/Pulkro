import type { Metadata } from "next";
import { Suspense } from "react";
import { ClientDetailView } from "@/features/clientes/client-detail-view";

export const metadata: Metadata = { title: "Cliente" };

export default function Page({ params }: { params: Promise<{ clientId: string }> }) {
  return (
    <Suspense fallback={null}>
      <ClientDetailView params={params} />
    </Suspense>
  );
}
