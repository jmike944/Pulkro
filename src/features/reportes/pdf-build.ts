"use client";

import type { Photo, Report } from "@/lib/types";
import { buildReportModel, pairPhotos, type ReportContext, type ReportPhotoPair } from "./report-model";
import { rasterizePhotos } from "./raster";

export type BuildStage =
  | { step: "fotos"; done: number; total: number }
  | { step: "pdf" };

const printed = (pairs: ReportPhotoPair[]) => pairs.flatMap((p) => [p.antes, p.despues].filter((x) => x !== undefined));

/** The photos a version of `photoIds` prints, in the PDF's order (the ANTES / DESPUÉS pairs of buildReportModel). */
export function reportPhotos(ctx: ReportContext, photoIds: readonly string[]): Photo[] {
  const ids = new Set(photoIds);
  return printed(pairPhotos(ctx.photos.filter((p) => ids.has(p.id))));
}

/**
 * Compose the definitive PDF for one generated version. react-pdf and the <Document> module are
 * imported lazily here (from the click handler), so neither weighs on the page bundle.
 * `images`: the photos already rasterized (a new version reads them before it is registered); otherwise they are read here.
 */
export async function buildReportPdf({
  ctx,
  report,
  root,
  images,
  onStage,
}: {
  ctx: ReportContext;
  report: Pick<Report, "version" | "generatedAt" | "generatedBy" | "photoIds" | "summary">;
  root?: ParentNode | null;
  images?: Record<string, string>;
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
  const pictures =
    images ?? (await rasterizePhotos(printed(model.pairs), { root, onProgress: (done, total) => onStage?.({ step: "fotos", done, total }) }));
  onStage?.({ step: "pdf" });
  const [{ pdf }, { buildReportDocument }] = await Promise.all([import("@react-pdf/renderer"), import("./report-pdf")]);
  return pdf(buildReportDocument(model, pictures)).toBlob();
}
