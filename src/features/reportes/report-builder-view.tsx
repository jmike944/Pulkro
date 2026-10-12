"use client";

import { use } from "react";
import { useCan, useCanonicalFolio, useOrderBundle, useScopedData } from "@/lib/hooks";
import { PageHeader } from "@/components/pk/page";
import { Shimmer } from "@/components/pk/feedback";
import { NotFoundOrOutOfScope } from "@/components/shell/out-of-scope";
import { OrderStatusPill } from "@/components/pk/status";
import { ClosureGate } from "./closure-gate";
import { ReportWorkspace } from "./report-workspace";

/** /ordenes/[folio]/reporte — final client report builder. */
export function ReportBuilderView({ params }: { params: Promise<{ folio: string }> }) {
  const { folio } = use(params);
  const decoded = decodeURIComponent(folio);
  return <ReportBuilder key={decoded} folio={decoded} />;
}

function ReportBuilder({ folio }: { folio: string }) {
  const bundle = useOrderBundle(folio);
  useCanonicalFolio(folio, bundle?.order.folio, "/ordenes/", "/reporte");
  const { orderIds } = useScopedData();
  const canClose = useCan("closure.authorize");

  // One state for "doesn't exist" and "outside your scope" (doc §2): never which of the two, never the folio typed in the URL.
  if (!bundle || !orderIds.has(bundle.order.id))
    return (
      <div>
        <PageHeader breadcrumb={[{ label: "Órdenes", href: "/ordenes" }, { label: "Reporte" }]} title="Reporte final" />
        <NotFoundOrOutOfScope subject="Esta orden" backHref="/reportes" backLabel="Volver a reportes" />
      </div>
    );

  const crumbs = [{ label: "Órdenes", href: "/ordenes" }, { label: bundle.order.folio, href: `/ordenes/${bundle.order.folio}` }, { label: "Reporte" }];

  // Same rule as store.generateReport: a reopened order keeps its old closure, but a new version needs the closure validated again.
  const { order } = bundle;
  const revalidate = !!order.closure && (order.status === "reabierta" || (!!order.reopenedAt && order.closure.validatedAt < order.reopenedAt));

  if (!order.closure || revalidate)
    return (
      <div>
        <PageHeader
          breadcrumb={crumbs}
          title="Reporte final"
          titleAddon={<OrderStatusPill status={order.status} />}
          description={
            revalidate ? (
              <>
                <b>{bundle.client.shortName}</b> · {bundle.site.name}. La orden se reabrió: <b>valide el cierre otra vez</b> para generar la nueva versión del reporte.
              </>
            ) : (
              <>
                <b>{bundle.client.shortName}</b> · {bundle.site.name}. El reporte se habilita al <b>validar el cierre</b> del servicio.
              </>
            )
          }
        />
        <ClosureGate bundle={bundle} canClose={canClose} revalidate={revalidate} />
      </div>
    );

  return <ReportWorkspace bundle={bundle} />;
}

export function ReportBuilderSkeleton() {
  return (
    <div>
      <Shimmer className="mb-4 h-5 w-48" />
      <Shimmer className="mb-8 h-11 w-72" />
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Shimmer className="aspect-[210/297] w-full rounded-[24px]" />
        <Shimmer className="h-[520px] rounded-[28px]" />
      </div>
    </div>
  );
}
