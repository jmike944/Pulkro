import type { Metadata } from "next";
import { Suspense } from "react";
import { SurveyLoader } from "@/features/encuesta/survey-shell";
import { SurveyView } from "@/features/encuesta/survey-view";

export const metadata: Metadata = {
  title: { absolute: "¿Cómo quedó su servicio? · Pulkro" },
  description: "Encuesta de satisfacción de Pulkro Compañía de Servicios.",
};

/** Public client survey: no app shell and no session (the (public) group has no layout). */
export default function Page({ params }: { params: Promise<{ token: string }> }) {
  return (
    <Suspense fallback={<SurveyLoader />}>
      <SurveyView params={params} />
    </Suspense>
  );
}
