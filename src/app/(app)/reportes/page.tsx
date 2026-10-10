import type { Metadata } from "next";
import { Suspense } from "react";
import { ReportsHubView } from "@/features/reportes/reports-hub-view";

export const metadata: Metadata = { title: "Reportes" };

/** The active tab lives in the URL (?tab=), so the client view sits inside Suspense. */
export default function ReportesPage() {
  return (
    <Suspense fallback={null}>
      <ReportsHubView />
    </Suspense>
  );
}
