"use client";

import Link from "next/link";
import { use } from "react";
import { FileText, Lock } from "lucide-react";
import { useCan, useOrderBundle, useScopedData } from "@/lib/hooks";
import { PageHeader } from "@/components/pk/page";
import { EmptyState, Shimmer } from "@/components/pk/feedback";
import { OrderStatusPill } from "@/components/pk/status";
import { Button } from "@/components/ui/button";
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
  const { orderIds } = useScopedData();
  const canClose = useCan("closure.authorize");

  const crumbs = [{ label: "Órdenes", href: "/ordenes" }, { label: bundle?.order.folio ?? folio, href: bundle ? `/ordenes/${bundle.order.folio}` : undefined }, { label: "Reporte" }];

  if (!bundle)
    return (
      <div>
        <PageHeader breadcrumb={crumbs} title="Reporte final" />
        <EmptyState
          icon={<FileText />}
          title="No encontramos la orden"
          action={
            <Button asChild className="h-10 rounded-[12px] px-4 font-semibold">
              <Link href="/ordenes">Ir a órdenes</Link>
            </Button>
          }
        >
          El folio <b className="font-semibold text-ink">{folio}</b> no existe en este dispositivo.
        </EmptyState>
      </div>
    );

  if (!orderIds.has(bundle.order.id))
    return (
      <div>
        <PageHeader breadcrumb={crumbs} title="Reporte final" />
        <EmptyState
          icon={<Lock />}
          title="Sin acceso a esta orden"
          action={
            <Button asChild variant="outline" className="h-10 rounded-[12px] px-4 font-semibold">
              <Link href="/reportes">Ver mis reportes</Link>
            </Button>
          }
        >
          Su rol solo consulta las órdenes asignadas o de su unidad.
        </EmptyState>
      </div>
    );

  if (!bundle.order.closure)
    return (
      <div>
        <PageHeader
          breadcrumb={crumbs}
          title="Reporte final"
          titleAddon={<OrderStatusPill status={bundle.order.status} />}
          description={
            <>
              <b>{bundle.client.shortName}</b> · {bundle.site.name}. El reporte se habilita al <b>validar el cierre</b> del servicio.
            </>
          }
        />
        <ClosureGate bundle={bundle} canClose={canClose} />
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
