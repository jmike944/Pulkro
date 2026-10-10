"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCan, useLookups, useMediaQuery, useNow, useScopedData, useSyncSummary } from "@/lib/hooks";
import { plural } from "@/lib/format";
import type { Report } from "@/lib/types";
import { PageHeader, UnderlineTabs } from "@/components/pk/page";
import { AnimatedNumber } from "@/components/pk/bits";
import { AuroraStat } from "@/components/pk/mobile";
import { HUB_TABS, buildHubRows, hubMetrics, sortRows, type HubRow, type HubTab } from "./hub-data";
import { HubHero } from "./hub-hero";
import { HubList } from "./hub-list";
import { HubInsights } from "./hub-insights";
import { useReportOutputs } from "./use-report-outputs";
import type { ReportContext } from "./report-model";

/** /reportes — every closed service and where its client report stands. */
export function ReportsHubView() {
  const data = useScopedData();
  const { orders, jornadas, photos, incidents, reports } = data;
  const lk = useLookups();
  const now = useNow(60_000);
  const desktop = useMediaQuery("(min-width: 1024px)");
  const canShare = useCan("report.share");
  const canExport = useCan("export.pdf");
  const { queue } = useSyncSummary();
  const outputs = useReportOutputs();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const rows = useMemo(() => buildHubRows(orders, reports), [orders, reports]);
  const m = useMemo(() => hubMetrics(orders, jornadas, reports, rows, now), [orders, jornadas, reports, rows, now]);

  const fromUrl = HUB_TABS.find((t) => t.slug === params.get("tab"))?.value;
  const fallback: HubTab = m.counts.por_generar ? "por_generar" : m.counts.por_compartir ? "por_compartir" : "todos";
  const [picked, setPicked] = useState<HubTab | null>(null);
  const tab = picked ?? fromUrl ?? fallback;
  const pick = (t: HubTab) => {
    setPicked(t);
    const slug = HUB_TABS.find((x) => x.value === t)?.slug;
    router.replace(`${pathname}?tab=${slug}`, { scroll: false });
  };

  const visible = useMemo(() => sortRows(tab === "todos" ? rows : rows.filter((r) => r.stage === tab), tab), [rows, tab]);
  const blockedOrderIds = useMemo(() => new Set(queue.filter((q) => q.orderId && q.state !== "sincronizado").map((q) => q.orderId!)), [queue]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const download = async (row: HubRow) => {
    const report: Report | undefined = row.latest;
    const client = lk.clients.get(row.order.clientId);
    const site = lk.sites.get(row.order.siteId);
    const serviceType = lk.serviceTypes.get(row.order.serviceTypeId);
    const supervisor = lk.users.get(row.order.supervisorId);
    const unit = lk.units.get(row.order.unitId);
    if (!report || !client || !site || !serviceType || !supervisor || !unit) return;
    const ctx: ReportContext = {
      order: row.order,
      client,
      site,
      serviceType,
      supervisor,
      unit,
      jornadas: jornadas.filter((j) => j.orderId === row.order.id),
      photos: photos.filter((p) => p.orderId === row.order.id),
      incidents: incidents.filter((i) => i.orderId === row.order.id),
      reports: reports.filter((r) => r.orderId === row.order.id),
      workers: lk.workers,
      users: lk.users,
    };
    setBusyId(row.order.id);
    await outputs.download(ctx, report);
    setBusyId(null);
  };

  const description = (
    <>
      <b>{plural(m.thisWeek, "reporte", "reportes")}</b> {m.thisWeek === 1 ? "generado" : "generados"} esta semana. <b>{m.counts.por_compartir}</b>{" "}
      {m.counts.por_compartir === 1 ? "listo" : "listos"} para compartir
      {m.counts.por_generar ? (
        <>
          {" "}
          y <b>{m.counts.por_generar}</b> por generar
        </>
      ) : null}
      .
    </>
  );

  const tabs = (
    <UnderlineTabs
      id="hub-tabs"
      value={tab}
      onChange={(v) => pick(v as HubTab)}
      items={HUB_TABS.map((t) => ({ value: t.value, label: t.label, count: m.counts[t.value] }))}
    />
  );

  const list = (
    <HubList
      rows={visible}
      tab={tab}
      clients={lk.clients}
      canShare={canShare}
      canExport={canExport}
      desktop={desktop}
      busyId={busyId}
      blockedOrderIds={blockedOrderIds}
      onDownload={(r) => void download(r)}
    />
  );

  if (!desktop)
    return (
      <div>
        <PageHeader title="Reportes" description={description} />
        <AuroraStat
          label="Reportes generados esta semana"
          value={
            <span className="flex items-baseline gap-2">
              <AnimatedNumber value={m.thisWeek} />
              <span className="text-[18px] font-normal tracking-normal text-subtle">{m.thisWeek === 1 ? "reporte" : "reportes"}</span>
            </span>
          }
          sub={`${m.counts.por_compartir} por compartir · ${m.counts.por_generar} por generar · ${m.lastWeek} la semana pasada`}
        />
        <section className="mt-8">
          {tabs}
          {list}
        </section>
        <section className="mt-10">
          <HubInsights m={m} clients={lk.clients} />
        </section>
      </div>
    );

  return (
    <div>
      <PageHeader title="Reportes" description={description} />
      <HubHero m={m} onPick={pick} />
      {/* The table needs ~650 px: insights sit beside it from 1440 px, below it on narrower desktops. */}
      <section className="mt-10 grid gap-12 min-[1440px]:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)] min-[1440px]:gap-0">
        <div className="min-w-0 min-[1440px]:border-r min-[1440px]:border-hairline min-[1440px]:pr-10">
          {tabs}
          {list}
        </div>
        <div className="min-w-0 min-[1440px]:pl-10">
          <HubInsights m={m} clients={lk.clients} wide />
        </div>
      </section>
    </div>
  );
}
