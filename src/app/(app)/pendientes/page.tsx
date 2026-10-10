import type { Metadata } from "next";
import { PendientesView } from "@/features/pendientes/pendientes-view";

export const metadata: Metadata = { title: "Pendientes" };

export default function PendientesPage() {
  return <PendientesView />;
}
