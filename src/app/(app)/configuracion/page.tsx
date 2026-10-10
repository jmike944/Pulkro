import type { Metadata } from "next";
import { Suspense } from "react";
import { SettingsView } from "@/features/configuracion/settings-view";

export const metadata: Metadata = { title: "Configuración" };

export default function ConfiguracionPage() {
  return (
    <Suspense fallback={null}>
      <SettingsView />
    </Suspense>
  );
}
