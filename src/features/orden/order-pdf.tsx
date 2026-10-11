"use client";

import { useMemo, useState } from "react";
import { useReportOutputs } from "@/features/reportes/use-report-outputs";
import type { ReportContext } from "@/features/reportes/report-model";
import { useOrder } from "./order-context";

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
