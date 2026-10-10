import type { Metadata } from "next";
import { DashboardView } from "@/features/inicio/dashboard-view";

export const metadata: Metadata = { title: "Inicio" };

export default function InicioPage() {
  return <DashboardView />;
}
