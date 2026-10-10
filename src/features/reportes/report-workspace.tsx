"use client";

import Link from "next/link";
import { useCallback, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Eye, Images, Layers, Maximize2, Pencil, RotateCcw, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore, useCan, useCurrentUser, useIsOffline, useLookups, useMediaQuery, useNow, type OrderBundle } from "@/lib/hooks";
import { useUi } from "@/lib/ui-store";
import { fmtHours, plural } from "@/lib/format";
import { PageHeader, Segmented, UnderlineTabs } from "@/components/pk/page";
import { OrderStatusPill } from "@/components/pk/status";
import { Button } from "@/components/ui/button";
import { buildReportModel, isDirty, isReportPhoto, type ReportContext } from "./report-model";
import { EDITOR_BOX, SummaryTextarea, buildPaperBlocks, type BlockMode, type EditorFocus } from "./paper-blocks";
import { PaperPreview, type Zoom } from "./paper-preview";
import { PhotoSelector } from "./photo-selector";
import { ReportCard, type ReportStats } from "./report-card";
import { HistoryHeading, ShareHistory, VersionsList } from "./report-history";
import { DescriptionFlow, MobileReportCard, ReportFlow, type SentInfo } from "./report-mobile";
import { useReportOutputs } from "./use-report-outputs";
import type { SyncGate } from "./task-progress";
import { REASON, WithReason } from "./guard";

type Tab = "preview" | "fotos";

/** Report builder for an order with a validated closure (doc §3 steps 12–13, §4.3). */
export function ReportWorkspace({ bundle }: { bundle: OrderBundle }) {
  const { order, client, site, reports, photos, jornadas, pendingSync } = bundle;
  const closure = order.closure!;
  const latest = reports[0];
  const lk = useLookups();
  const user = useCurrentUser();
  const now = useNow(60_000);
  const offline = useIsOffline();
  const desktop = useMediaQuery("(min-width: 1024px)");
  const canShare = useCan("report.share");
  const canExport = useCan("export.pdf");
  const canPostventa = useCan("postventa.manage");
  const togglePhoto = useAppStore((s) => s.togglePhotoForReport);
  const outputs = useReportOutputs();

  const [summary, setSummary] = useState(() => latest?.summary ?? closure.summary);
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState<Tab>("preview");
  const [zoom, setZoom] = useState<Zoom>("fit");
  const [sweep, setSweep] = useState(0);
  const [pages, setPages] = useState(0);
  const [flowOpen, setFlowOpen] = useState(false);
  const [descOpen, setDescOpen] = useState(false);
  const [sent, setSent] = useState<SentInfo | null>(null);
  const [busyVersion, setBusyVersion] = useState<string | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const editorFocus = useRef<EditorFocus>({ want: false, start: 0, end: 0 });

  const ctx: ReportContext = useMemo(
    () => ({ ...bundle, workers: lk.workers, users: lk.users }),
    [bundle, lk.workers, lk.users],
  );

  const reportPhotos = useMemo(() => photos.filter(isReportPhoto).sort((a, b) => a.takenAt.localeCompare(b.takenAt)), [photos]);
  const selectedIds = useMemo(() => reportPhotos.filter((p) => p.selectedForReport).map((p) => p.id), [reportPhotos]);
  const pendingPhotoIds = useMemo(() => new Set(pendingSync.filter((q) => q.entity === "foto").map((q) => q.entityId)), [pendingSync]);
  // Reopened after closure (doc §8): any later edit must ship as a new version, even with the same photos/text.
  const reopened = order.status === "reabierta";
  const dirty = reopened || isDirty(latest, selectedIds, summary);
  const nextVersion = (latest?.version ?? 0) + 1;
  const task = outputs.task?.orderId === order.id ? outputs.task : null;
  const busy = !!task && task.step !== "listo" && task.step !== "error";

  const model = useMemo(
    () =>
      buildReportModel(ctx, {
        photoIds: selectedIds,
        summary,
        version: dirty || !latest ? nextVersion : latest.version,
        issuedAt: dirty || !latest ? now.toISOString() : latest.generatedAt,
        issuedBy: dirty || !latest ? user.name : (lk.users.get(latest.generatedBy)?.name ?? user.name),
        draft: dirty || !latest,
      }),
    [ctx, selectedIds, summary, dirty, latest, nextVersion, now, user.name, lk.users],
  );

  const inPaperEditor = desktop && editing && canShare;
  const editor = useMemo(
    () =>
      inPaperEditor
        ? (mode: BlockMode) =>
            mode === "measure" ? (
              <div className={cn(EDITOR_BOX, "whitespace-pre-wrap break-words")}>
                {summary || "Describa el trabajo realizado para el cliente…"}
                {summary.endsWith("\n") ? " " : ""}
              </div>
            ) : (
              <SummaryTextarea value={summary} onChange={setSummary} focusRef={editorFocus} />
            )
        : undefined,
    [inPaperEditor, summary],
  );
  const blocks = useMemo(() => buildPaperBlocks(model, { editor }), [model, editor]);

  const gate: SyncGate = useMemo(() => {
    if (!pendingSync.length) return { kind: "ok" };
    const error = pendingSync.some((q) => q.state === "error");
    if (!offline && !error) return { kind: "syncing", count: pendingSync.length };
    return { kind: "blocked", count: pendingSync.length, offline, error };
  }, [pendingSync, offline]);

  const stats: ReportStats = {
    photos: model.photoCount,
    pairs: model.pairs.length,
    jornadas: model.jornadas.length,
    incidents: model.incidents.length,
    pages,
  };
  const contact = { name: order.siteContact.name, phone: order.siteContact.phone, emailName: client.contactName, email: client.contactEmail };
  const openSync = useCallback(() => useUi.getState().setSyncOpen(true), []);
  const root = () => previewRef.current;

  /* ── actions ── */
  const applySelection = (ids: Set<string>) => reportPhotos.forEach((p) => p.selectedForReport !== ids.has(p.id) && togglePhoto(p.id));

  const onGenerate = async () => {
    if (!canShare || busy) return;
    if (!desktop) {
      setSent(null);
      setFlowOpen(true);
    }
    const rep = await outputs.generate(ctx, selectedIds, summary, { root: root(), quiet: !desktop });
    if (rep) {
      setEditing(false);
      setSummary(rep.summary);
      setSweep((k) => k + 1);
    }
  };

  const openShareFlow = () => {
    setSent(null);
    setFlowOpen(true);
    if (latest && !outputs.blobs[latest.id]) void outputs.prepare(ctx, latest, root());
  };

  const flowShare = async (channel: "whatsapp" | "email" | "descarga") => {
    if (!latest) return;
    const fn = channel === "whatsapp" ? outputs.shareWhatsApp : channel === "email" ? outputs.shareEmail : outputs.download;
    const r = await fn(ctx, latest, { root: root(), quiet: true });
    if (r === "sent") setSent({ channel, at: new Date().toISOString(), version: latest.version });
  };

  const downloadVersion = async (r: (typeof reports)[number]) => {
    setBusyVersion(r.id);
    await outputs.download(ctx, r, { root: root(), log: r.id === latest?.id });
    setBusyVersion(null);
  };

  const description = (
    <>
      <b>{client.shortName}</b> · {site.name}. <b>{plural(jornadas.length, "jornada", "jornadas")}</b> en un solo reporte
      {model.totalMinutes ? (
        <>
          , <b>{fmtHours(model.totalMinutes)}</b> reales
        </>
      ) : null}{" "}
      y <b>{plural(selectedIds.length, "foto", "fotos")}</b> seleccionadas.
    </>
  );

  const summaryChanged = summary.trim() !== closure.summary.trim();

  /* ── left column: preview / photos ── */
  const workArea = (
    <div>
      <UnderlineTabs
        id="report-tabs"
        value={tab}
        onChange={(v) => setTab(v as Tab)}
        items={[
          { value: "preview", label: "Vista previa", count: pages ? plural(pages, "pág.", "págs.") : undefined },
          { value: "fotos", label: "Fotos", count: `${selectedIds.length}/${reportPhotos.length}` },
        ]}
      />

      <div className={cn("pt-5", tab !== "preview" && "hidden")}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <WithReason reason={canShare ? null : REASON.share}>
              <Button
                variant={editing && desktop ? "default" : "outline"}
                disabled={!canShare}
                aria-pressed={editing && desktop}
                onClick={() => (desktop ? setEditing((e) => !e) : setDescOpen(true))}
                className={cn("h-10 rounded-[12px] px-3.5 font-semibold", !(editing && desktop) && "border-[#dfe3ea]")}
              >
                {editing && desktop ? <Check /> : <Pencil />}
                {editing && desktop ? "Listo" : "Editar descripción"}
              </Button>
            </WithReason>
            <AnimatePresence initial={false}>
              {summaryChanged && canShare && (
                <motion.span initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -6 }}>
                  <Button variant="ghost" onClick={() => setSummary(closure.summary)} title="Restaurar el texto del cierre validado" className="h-10 rounded-[12px] px-3 text-subtle">
                    <RotateCcw /> Restaurar
                  </Button>
                </motion.span>
              )}
            </AnimatePresence>
          </div>
          <Segmented<Zoom>
            id="report-zoom"
            value={zoom}
            onChange={setZoom}
            items={[
              { value: "fit", label: "Ajustar" },
              { value: "real", label: "100%" },
            ]}
          />
        </div>
        <AnimatePresence initial={false}>
          {inPaperEditor && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden text-[13.5px] text-subtle"
            >
              <p className="mb-3 flex items-center gap-2">
                <Pencil className="size-3.5 text-link" /> Edite la descripción directamente en la hoja. Al generar se crea la v{nextVersion}.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
        <PaperPreview model={model} blocks={blocks} zoom={zoom} sweepKey={sweep} rasterRootRef={previewRef} onPages={setPages} />
        <p className="mt-3 flex items-center justify-center gap-2 text-[12.5px] text-subtle">
          <Eye className="size-3.5" /> {model.draft ? "Vista previa del borrador" : `Vista previa de la versión v${model.version}`} · hoja A4
          {zoom === "fit" && !desktop && (
            <button type="button" onClick={() => setZoom("real")} className="ml-1 inline-flex items-center gap-1 font-semibold text-link">
              <Maximize2 className="size-3.5" /> Ampliar
            </button>
          )}
        </p>
      </div>

      <div className={cn("pt-6", tab !== "fotos" && "hidden")}>
        <PhotoSelector photos={reportPhotos} canEdit={canShare} pendingIds={pendingPhotoIds} onToggle={togglePhoto} onApply={applySelection} />
      </div>
    </div>
  );

  const history = (
    <>
      <section>
        <HistoryHeading icon={<Layers />} title="Versiones" count={reports.length} />
        <VersionsList
          reports={reports}
          users={lk.users}
          busyId={busyVersion}
          downloadReason={!canExport ? REASON.export : gate.kind !== "ok" ? REASON.sync : null}
          onDownload={(r) => void downloadVersion(r)}
        />
      </section>
      <section>
        <HistoryHeading icon={<Send />} title="Historial de envíos" count={reports.reduce((s, r) => s + r.shares.length, 0)} />
        <ShareHistory reports={reports} users={lk.users} className="mt-1" />
      </section>
    </>
  );

  const header = (
    <PageHeader
      breadcrumb={[
        { label: "Órdenes", href: "/ordenes" },
        { label: order.folio, href: `/ordenes/${order.folio}` },
        { label: "Reporte" },
      ]}
      title="Reporte final"
      titleAddon={<OrderStatusPill status={order.status} />}
      description={description}
      actions={
        desktop ? (
          <Button asChild variant="outline" className="h-10 rounded-[12px] border-[#dfe3ea] px-4 font-semibold">
            <Link href={`/ordenes/${order.folio}`}>
              <Images /> Ver orden
            </Link>
          </Button>
        ) : undefined
      }
    />
  );

  if (!desktop)
    return (
      <div>
        {header}
        <MobileReportCard
          latest={latest}
          dirty={dirty}
          nextVersion={nextVersion}
          stats={stats}
          canShare={canShare}
          canExport={canExport}
          busy={busy}
          contactName={order.siteContact.name}
          onGenerate={() => void onGenerate()}
          onShare={openShareFlow}
          onDownload={() => latest && void outputs.download(ctx, latest, { root: root() })}
        />
        <section className="mt-9">{workArea}</section>
        <div className="mt-10 space-y-9">{history}</div>

        <ReportFlow
          open={flowOpen}
          onOpenChange={setFlowOpen}
          folio={order.folio}
          title={order.title}
          client={{ name: client.name, hue: client.hue }}
          latest={latest}
          task={task}
          gate={gate}
          sent={sent}
          canShare={canShare}
          canExport={canExport}
          canPostventa={canPostventa}
          closedAt={closure.validatedAt}
          contact={contact}
          onWhatsApp={() => void flowShare("whatsapp")}
          onEmail={() => void flowShare("email")}
          onDownload={() => void flowShare("descarga")}
          onOpenSync={() => {
            setFlowOpen(false);
            openSync();
          }}
        />
        <DescriptionFlow open={descOpen} onOpenChange={setDescOpen} value={summary} onChange={setSummary} original={closure.summary} canEdit={canShare} />
      </div>
    );

  // Desktop: one column up to 1279 px (card first), preview | card from xl — the 272 px sidebar leaves too little room before that.
  return (
    <div>
      {header}
      <div className="grid gap-10 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] xl:gap-0">
        <aside className="min-w-0 xl:col-start-2 xl:row-start-1 xl:pl-10">
          <div className="scrollbar-none space-y-9 xl:sticky xl:top-6 xl:max-h-[calc(100dvh-48px)] xl:overflow-y-auto xl:overscroll-contain xl:pb-2">
            <ReportCard
              latest={latest}
              dirty={dirty}
              reopened={reopened}
              nextVersion={nextVersion}
              stats={stats}
              canShare={canShare}
              canExport={canExport}
              task={task}
              gate={gate}
              contact={contact}
              onGenerate={() => void onGenerate()}
              onWhatsApp={() => latest && void outputs.shareWhatsApp(ctx, latest, { root: root() })}
              onEmail={() => latest && void outputs.shareEmail(ctx, latest, { root: root() })}
              onDownload={() => latest && void outputs.download(ctx, latest, { root: root() })}
              onOpenSync={openSync}
            />
            <div className="hidden space-y-9 xl:block">{history}</div>
          </div>
        </aside>
        <section className="min-w-0 xl:col-start-1 xl:row-start-1 xl:border-r xl:border-hairline xl:pr-10">{workArea}</section>
        <div className="grid gap-9 md:grid-cols-2 md:gap-10 xl:hidden">{history}</div>
      </div>
    </div>
  );
}
