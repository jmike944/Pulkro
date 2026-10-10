"use client";

import type { Report } from "@/lib/types";
import { buildReportModel, type ReportContext } from "./report-model";
import { rasterizePhotos } from "./raster";

export type BuildStage =
  | { step: "fotos"; done: number; total: number }
  | { step: "pdf" };

/**
 * Compose the definitive PDF for one generated version. react-pdf and the <Document> module are
 * imported lazily here (from the click handler), so neither weighs on the page bundle.
 */
export async function buildReportPdf({
  ctx,
  report,
  root,
  onStage,
}: {
  ctx: ReportContext;
  report: Pick<Report, "version" | "generatedAt" | "generatedBy" | "photoIds" | "summary">;
  root?: ParentNode | null;
  onStage?: (stage: BuildStage) => void;
}): Promise<Blob> {
  const model = buildReportModel(ctx, {
    photoIds: report.photoIds,
    summary: report.summary,
    version: report.version,
    issuedAt: report.generatedAt,
    issuedBy: ctx.users.get(report.generatedBy)?.name ?? ctx.supervisor?.name ?? "Supervisor",
    draft: false,
  });
  const photos = model.pairs.flatMap((p) => [p.antes, p.despues].filter((x) => x !== undefined));
  const images = await rasterizePhotos(photos, { root, onProgress: (done, total) => onStage?.({ step: "fotos", done, total }) });
  onStage?.({ step: "pdf" });
  const [{ pdf }, { buildReportDocument }] = await Promise.all([import("@react-pdf/renderer"), import("./report-pdf")]);
  return pdf(buildReportDocument(model, images)).toBlob();
}
