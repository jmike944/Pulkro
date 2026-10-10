import type { Metadata } from "next";
import { Suspense } from "react";
import { JornadaSkeleton, JornadaView } from "@/features/jornada/jornada-view";

export const metadata: Metadata = { title: "Jornada en campo" };

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<JornadaSkeleton />}>
      <JornadaView params={params} />
    </Suspense>
  );
}
