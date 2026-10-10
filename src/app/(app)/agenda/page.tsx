import type { Metadata } from "next";
import { Suspense } from "react";
import { AgendaView } from "@/features/agenda/agenda-view";

export const metadata: Metadata = { title: "Agenda y asignación" };

// AgendaView reads ?fecha= with useSearchParams → must render inside Suspense.
export default function AgendaPage() {
  return (
    <Suspense fallback={null}>
      <AgendaView />
    </Suspense>
  );
}
