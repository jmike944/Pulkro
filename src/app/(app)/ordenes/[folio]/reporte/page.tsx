import type { Metadata } from "next";
import { Suspense } from "react";
import { ReportBuilderSkeleton, ReportBuilderView } from "@/features/reportes/report-builder-view";

type Props = { params: Promise<{ folio: string }> };

/** The folio comes from the URL, so the tab title streams with the rest of the (deferred) page. */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { folio } = await params;
  return { title: `Reporte ${decodeURIComponent(folio)}` };
}

/** Final client report (one per service): A4 preview, photo selection, PDF, manual sharing. */
export default function ReporteOrdenPage({ params }: Props) {
  return (
    <Suspense fallback={<ReportBuilderSkeleton />}>
      <ReportBuilderView params={params} />
    </Suspense>
  );
}
