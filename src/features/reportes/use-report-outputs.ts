"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { useAppStore, useCan } from "@/lib/hooks";
import { PermissionDeniedError } from "@/lib/store";
import { useUi } from "@/lib/ui-store";
import { mailtoLink, whatsappLink } from "@/lib/domain";
import type { Report, ShareChannel } from "@/lib/types";
import { buildReportPdf } from "./pdf-build";
import { PhotosUnavailableError } from "./raster";
import { hasProvisionalFolio, reportFileName, reportFingerprint, type ReportContext } from "./report-model";
import { CHANNEL_TO_LABEL, DOWNLOAD_TARGET, canShareFile, downloadBlob, emailDraft, whatsappMessage } from "./share";

export type OutputStep = "registro" | "fotos" | "pdf" | "listo" | "error";

/** A PDF being composed (new version or re-render of an existing one). */
export type OutputTask = {
  orderId: string;
  reportId?: string;
  version: number;
  kind: "generate" | "prepare";
  step: OutputStep;
  done: number;
  total: number;
  error?: string;
};

/** sent = attempt logged · deferred = waiting for a fresh tap (toast action) · cancelled = user closed the share sheet. */
export type ShareResult = "sent" | "deferred" | "cancelled" | "error" | "denied";

type Opts = { root?: ParentNode | null; quiet?: boolean };
/** `log: false` = archival download of an older version (not a send attempt). */
type DownloadOpts = Opts & { log?: boolean };

/** Builds take a few seconds; past this, browsers may drop the click's user activation. */
const ACTIVATION_MS = 2500;

const firstShareFor = (orderId: string) =>
  useAppStore
    .getState()
    .reports.filter((r) => r.orderId === orderId)
    .every((r) => r.shares.length === 0);

/** Client-facing outputs never carry a provisional folio (OS-PEND-…, INC-PEND-…): the definitive PDF waits for the sync. */
function provisional(ctx: ReportContext) {
  if (!hasProvisionalFolio(ctx)) return false;
  toast.error("El reporte aún tiene folios provisionales", { description: "Se asignan al sincronizar: espere a que termine para enviar el PDF definitivo." });
  return true;
}

/**
 * PDF lifecycle for reports: generate a version (store.generateReport + PDF), re-render an existing
 * version on demand, and the three manual outputs. Every attempt is logged with store.logShare —
 * the store's note never claims delivery (doc §8).
 */
export function useReportOutputs() {
  const generateReport = useAppStore((s) => s.generateReport);
  const logShare = useAppStore((s) => s.logShare);
  const canShare = useCan("report.share");
  const canExport = useCan("export.pdf");
  // Each composed PDF with the fingerprint of what it printed (reportFingerprint): a sync that changed a folio, the version or
  // the photo list since makes it stale, and it is composed again before it is shared.
  const [blobs, setBlobs] = useState<Record<string, { blob: Blob; key: string }>>({});
  const [task, setTask] = useState<OutputTask | null>(null);

  const compose = useCallback(async (ctx: ReportContext, report: Report, kind: OutputTask["kind"], root?: ParentNode | null) => {
    const base = { orderId: ctx.order.id, reportId: report.id, version: report.version, kind };
    setTask({ ...base, step: kind === "generate" ? "registro" : "fotos", done: 0, total: report.photoIds.length });
    try {
      const blob = await buildReportPdf({
        ctx,
        report,
        root,
        onStage: (st) =>
          setTask((t) => (t && t.reportId === report.id ? { ...t, step: st.step, ...(st.step === "fotos" ? { done: st.done, total: st.total } : {}) } : t)),
      });
      setBlobs((b) => ({ ...b, [report.id]: { blob, key: reportFingerprint(ctx, report) } }));
      setTask((t) => (t && t.reportId === report.id ? { ...t, step: "listo" } : t));
      setTimeout(() => setTask((t) => (t && t.reportId === report.id && t.step === "listo" ? null : t)), 2200);
      return blob;
    } catch (err) {
      // A server photo that could not be read now: nothing is cached (a placeholder in its place would be shared as the report).
      if (err instanceof PhotosUnavailableError) {
        setTask((t) => (t && t.reportId === report.id ? { ...t, step: "error", error: err.message } : t));
        toast.error("No se pudo componer el PDF", { description: err.message });
        return null;
      }
      console.error(err);
      setTask((t) => (t && t.reportId === report.id ? { ...t, step: "error", error: "No se pudo componer el PDF en este dispositivo." } : t));
      toast.error("No se pudo componer el PDF", { description: "Intente de nuevo. Si persiste, recargue la página." });
      return null;
    }
  }, []);

  /** A PDF of this version, composed from what the device has now, is in memory. */
  const hasFresh = useCallback((ctx: ReportContext, report: Report) => blobs[report.id]?.key === reportFingerprint(ctx, report), [blobs]);

  /** Blob for a version, composing it if it is not in memory yet (or what it printed changed since). */
  const prepare = useCallback(
    async (ctx: ReportContext, report: Report, root?: ParentNode | null) => {
      const cached = blobs[report.id];
      if (cached && cached.key === reportFingerprint(ctx, report)) return { blob: cached.blob, slow: false };
      const t0 = performance.now();
      const blob = await compose(ctx, report, "prepare", root);
      return blob ? { blob, slow: performance.now() - t0 > ACTIVATION_MS } : null;
    },
    [blobs, compose],
  );

  /** New version → store.generateReport(orderId, photoIds, summary), then the PDF Blob. */
  const generate = useCallback(
    async (ctx: ReportContext, photoIds: string[], summary: string, opts: Opts = {}) => {
      if (!canShare) return null;
      let rep: Report;
      try {
        rep = generateReport(ctx.order.id, photoIds, summary.trim());
      } catch (e) {
        // The store refuses a reopened order whose closure was not validated again (or a role without the permission) and has
        // already told the user why with a toast; never let the rejection escape the click handler.
        if (e instanceof PermissionDeniedError) return null;
        throw e;
      }
      const blob = await compose(ctx, rep, "generate", opts.root);
      if (blob && !opts.quiet)
        toast.success(`Reporte v${rep.version} generado`, {
          description: rep.version > 1 ? `La v${rep.version - 1} queda en el historial de versiones.` : "Revíselo y compártalo manualmente con el cliente.",
        });
      return blob ? rep : null;
    },
    [canShare, compose, generateReport],
  );

  const record = useCallback(
    (report: Report, channel: ShareChannel, to: string, first: boolean, quiet?: boolean, hint?: string) => {
      logShare(report.id, channel, to);
      if (first) useUi.getState().fireCelebrate();
      if (!quiet)
        toast.success(channel === "descarga" ? `PDF v${report.version} descargado` : `Envío iniciado por ${CHANNEL_TO_LABEL[channel]}`, {
          description: `${hint ? `${hint} ` : ""}Sin confirmación de entrega.`,
        });
    },
    [logShare],
  );

  const shareWhatsApp = useCallback(
    async (ctx: ReportContext, report: Report, opts: Opts = {}): Promise<ShareResult> => {
      if (!canShare) return "denied";
      if (provisional(ctx)) return "error";
      const ready = await prepare(ctx, report, opts.root);
      if (!ready) return "error";
      const fileName = reportFileName(ctx.order.folio, report.version);
      const phone = ctx.order.siteContact.phone;
      const file = new File([ready.blob], fileName, { type: "application/pdf" });
      const quiet = opts.quiet;

      async function attempt(): Promise<ShareResult> {
        const first = firstShareFor(ctx.order.id);
        try {
          await navigator.share({ files: [file], title: `Reporte ${ctx.order.folio}`, text: whatsappMessage(ctx, report.version, false) });
          record(report, "whatsapp", phone, first, quiet, "Hoja de compartir del teléfono.");
          return "sent";
        } catch (err) {
          const name = err instanceof DOMException ? err.name : "";
          if (name === "AbortError") {
            if (!quiet) toast("Envío cancelado", { description: "No se registró ningún intento." });
            return "cancelled";
          }
          if (name === "NotAllowedError") return defer();
          toast.error("No se pudo abrir la hoja de compartir", { description: "Use Descargar PDF y adjúntelo manualmente." });
          return "error";
        }
      }
      function defer(): ShareResult {
        toast(`PDF v${report.version} listo`, {
          description: "Toque para abrir la hoja de compartir.",
          action: { label: "Compartir", onClick: () => void attempt() },
        });
        return "deferred";
      }

      if (canShareFile(file)) return ready.slow ? defer() : attempt();

      // No file sharing (desktop): download + wa.me with the message; the supervisor attaches the PDF.
      const first = firstShareFor(ctx.order.id);
      const link = whatsappLink(phone, whatsappMessage(ctx, report.version, true));
      downloadBlob(ready.blob, fileName);
      const win = window.open(link, "_blank");
      if (win) win.opener = null;
      else
        toast("Abra WhatsApp para enviar", {
          description: `Adjunte ${fileName} en el chat.`,
          action: { label: "Abrir WhatsApp", onClick: () => window.open(link, "_blank") },
        });
      record(report, "whatsapp", phone, first, opts.quiet, `PDF descargado: adjúntelo en el chat con ${ctx.order.siteContact.name}.`);
      return "sent";
    },
    [canShare, prepare, record],
  );

  const shareEmail = useCallback(
    async (ctx: ReportContext, report: Report, opts: Opts = {}): Promise<ShareResult> => {
      if (!canShare) return "denied";
      if (provisional(ctx)) return "error";
      const ready = await prepare(ctx, report, opts.root);
      if (!ready) return "error";
      const fileName = reportFileName(ctx.order.folio, report.version);
      const { subject, body } = emailDraft(ctx, report.version, fileName);
      const href = mailtoLink(ctx.client.contactEmail, subject, body);
      const go = () => {
        const first = firstShareFor(ctx.order.id);
        downloadBlob(ready.blob, fileName);
        window.location.href = href;
        record(report, "email", ctx.client.contactEmail, first, opts.quiet, `Adjunte ${fileName} (descargado) antes de enviar.`);
      };
      if (ready.slow) {
        toast(`PDF v${report.version} listo`, { description: "Toque para preparar el correo.", action: { label: "Abrir correo", onClick: go } });
        return "deferred";
      }
      go();
      return "sent";
    },
    [canShare, prepare, record],
  );

  /** Download; for the role that delivers reports (Supervisor) it counts as a manual send attempt. */
  const download = useCallback(
    async (ctx: ReportContext, report: Report, opts: DownloadOpts = {}): Promise<ShareResult> => {
      if (!canExport) return "denied";
      // A logged download is a send attempt (it goes to the client): definitive folios only.
      if (canShare && opts.log !== false && provisional(ctx)) return "error";
      const ready = await prepare(ctx, report, opts.root);
      if (!ready) return "error";
      const fileName = reportFileName(ctx.order.folio, report.version);
      downloadBlob(ready.blob, fileName);
      if (canShare && opts.log !== false) record(report, "descarga", DOWNLOAD_TARGET, firstShareFor(ctx.order.id), opts.quiet, `${fileName} guardado en el dispositivo.`);
      else if (!opts.quiet) toast.success(`PDF v${report.version} descargado`, { description: fileName });
      return "sent";
    },
    [canExport, canShare, prepare, record],
  );

  return { task, hasFresh, prepare, generate, shareWhatsApp, shareEmail, download };
}

export type ReportOutputs = ReturnType<typeof useReportOutputs>;
