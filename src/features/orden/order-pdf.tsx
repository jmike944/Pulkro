"use client";

import { useMemo, useState } from "react";
import { FileDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useReportOutputs } from "@/features/reportes/use-report-outputs";
import type { ReportContext } from "@/features/reportes/report-model";
import { useOrder } from "./order-context";
import { Gated } from "./ui";

/**
 * The order's PDF for roles that only consult (Dirección, Administración): doc §10 "exportar PDF de orden".
 * They cannot open the report share/send workspace (supervisor-only), so the latest generated version is
 * downloaded from here. The download is not a send attempt (it only logs for the role that delivers reports).
 */
export function useOrderPdf() {
  const { d } = useOrder();
  const outputs = useReportOutputs();
  const [busy, setBusy] = useState(false);
  const report = d.latestReport;

  const ctx = useMemo<ReportContext>(
    () => ({
      order: d.order,
      client: d.client,
      site: d.site,
      serviceType: d.serviceType,
      supervisor: d.supervisor,
      unit: d.unit,
      jornadas: d.jornadas,
      photos: d.photos,
      incidents: d.incidents,
      reports: d.reports,
      workers: d.lk.workers,
      users: d.lk.users,
    }),
    [d.order, d.client, d.site, d.serviceType, d.supervisor, d.unit, d.jornadas, d.photos, d.incidents, d.reports, d.lk.workers, d.lk.users],
  );

  const download = async () => {
    if (!report || busy) return;
    setBusy(true);
    try {
      await outputs.download(ctx, report);
    } finally {
      setBusy(false);
    }
  };

  const reason = !d.perms.exportPdf
    ? "Su rol no exporta el PDF de la orden."
    : !report
      ? "Aún no hay un reporte generado: lo genera el supervisor al validar el cierre."
      : null;

  return { report, busy, download, reason, ready: !reason };
}

/** "Descargar PDF · v2" button; disabled with the reason when there is no report yet. */
export function OrderPdfButton({ variant = "outline", className }: { variant?: "outline" | "ghost" | "default"; className?: string }) {
  const pdf = useOrderPdf();
  const button = (
    <Button variant={variant} disabled={!pdf.ready || pdf.busy} onClick={() => void pdf.download()} className={className}>
      {pdf.busy ? <Loader2 className="size-4 animate-spin" /> : <FileDown className="size-4" />}
      Descargar PDF{pdf.report ? ` · v${pdf.report.version}` : ""}
    </Button>
  );
  if (pdf.ready) return button;
  return <Gated gate={{ ok: false, reason: pdf.reason ?? undefined }}>{button}</Gated>;
}
