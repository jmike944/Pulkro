"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Download, MessageSquareWarning, Plus } from "lucide-react";
import { toast } from "sonner";
import { useCan } from "@/lib/hooks";
import { fmtDate, fmtNum, fmtPct, plural } from "@/lib/format";
import { exportToExcel } from "@/lib/export";
import { PageHeader } from "@/components/pk/page";
import { BarList, CornerLink, Insight } from "@/components/pk/bits";
import { useUnitScope } from "@/components/shell/header-tools";
import { Button } from "@/components/ui/button";
import { casesByCategory } from "@/features/postventa/lib";
import { Gate, REASON_EXPORT, REASON_ORDER_CREATE, outlineBtnCls } from "@/features/postventa/ui";
import { ClientsTable } from "./clients-table";
import { TopClients } from "./top-clients";
import { useClientDirectory } from "./use-clients";

/** /clientes — client overview (doc §4.4 "historial de servicios por cliente"; clients have no accounts, doc §1). */
export function ClientsView() {
  const { rows, cases, now } = useClientDirectory();
  const canCreate = useCan("order.create");
  const canExport = useCan("export.excel");
  const { allUnits, selected } = useUnitScope();

  const summary = useMemo(() => {
    const services = rows.reduce((s, r) => s + r.services.length, 0);
    const top = [...rows].sort((a, b) => b.services.length - a.services.length)[0];
    const rated = rows.filter((r) => r.csatCount >= 3);
    const pool = rated.length ? rated : rows.filter((r) => r.csatCount > 0);
    const best = [...pool].sort((a, b) => b.csat - a.csat || b.csatCount - a.csatCount)[0];
    return { services, top: top?.services.length ? top : undefined, best };
  }, [rows]);

  const reasons = useMemo(() => casesByCategory(cases), [cases]);
  const insight = useMemo(() => {
    if (!cases.length) return null;
    const lead = reasons[0];
    const byClient = new Map<string, number>();
    cases.forEach((c) => byClient.set(c.clientId, (byClient.get(c.clientId) ?? 0) + 1));
    const [worstId, worstN] = [...byClient.entries()].sort((a, b) => b[1] - a[1])[0];
    const worst = rows.find((r) => r.client.id === worstId);
    const servicesWithCase = new Set(cases.map((c) => c.orderId)).size;
    return { lead, worst, worstN, rate: summary.services ? servicesWithCase / summary.services : 0 };
  }, [cases, reasons, rows, summary.services]);

  const exportClients = async () => {
    await exportToExcel(`clientes-${now.toISOString().slice(0, 10)}`, [
      {
        name: "Clientes",
        columns: [
          { header: "Cliente", key: "cliente", width: 32 },
          { header: "Segmento", key: "segmento" },
          { header: "Contacto", key: "contacto", width: 26 },
          { header: "Teléfono", key: "telefono", width: 18 },
          { header: "Correo", key: "correo", width: 28 },
          { header: "Sitios", key: "sitios" },
          { header: "Servicios 12 m", key: "servicios" },
          { header: "Programados 12 m", key: "programados" },
          { header: "Horas reales", key: "horas", numFmt: "0.0" },
          { header: "Satisfacción", key: "csat", numFmt: "0.0" },
          { header: "Quejas 12 m", key: "quejas" },
          { header: "Casos abiertos", key: "abiertos" },
          { header: "Último servicio", key: "ultimo", width: 14 },
        ],
        rows: rows.map((r) => ({
          cliente: r.client.name,
          segmento: r.client.segment,
          contacto: r.client.contactName,
          telefono: r.client.contactPhone,
          correo: r.client.contactEmail,
          sitios: r.sites.length,
          servicios: r.services.length,
          programados: r.programmed,
          horas: Math.round((r.minutes / 60) * 10) / 10,
          csat: r.csatCount ? Math.round(r.csat * 10) / 10 : null,
          quejas: r.cases.length,
          abiertos: r.openCases,
          ultimo: r.lastService ? fmtDate(r.lastService) : "",
        })),
      },
    ]);
    toast.success("Excel de clientes descargado");
  };

  const description = (
    <>
      {/* below lg the sidebar's unit switcher is gone: say which unit the directory is scoped to */}
      {allUnits && <span className="lg:hidden">{selected?.name ?? "Todas las unidades"}. </span>}
      Últimos 12 meses: <b>{plural(summary.services, "servicio", "servicios")}</b> para <b>{plural(rows.length, "cliente", "clientes")}</b>.
      {summary.top && (
        <>
          {" "}
          {summary.top.client.shortName} es el más frecuente
          {summary.best && summary.best.client.id !== summary.top.client.id ? (
            <>
              ; {summary.best.client.shortName} califica mejor (<b>{summary.best.csat.toFixed(1)}</b>).
            </>
          ) : summary.best ? (
            <> y también el mejor calificado.</>
          ) : (
            "."
          )}
        </>
      )}
    </>
  );

  return (
    <div>
      <PageHeader
        title="Clientes"
        description={description}
        actions={
          <>
            <Gate allowed={canExport} reason={REASON_EXPORT}>
              <Button variant="outline" disabled={!canExport} onClick={() => void exportClients().catch(() => toast.error("No se pudo generar el Excel"))} className={outlineBtnCls}>
                <Download /> Exportar
              </Button>
            </Gate>
            <Gate allowed={canCreate} reason={REASON_ORDER_CREATE}>
              {canCreate ? (
                <Button asChild className="h-10 rounded-[12px] px-4 text-[14px] font-semibold">
                  <Link href="/ordenes/nueva">
                    <Plus /> Nueva orden
                  </Link>
                </Button>
              ) : (
                <Button disabled className="h-10 rounded-[12px] px-4 text-[14px] font-semibold">
                  <Plus /> Nueva orden
                </Button>
              )}
            </Gate>
          </>
        }
      />

      <TopClients rows={rows} />

      <section className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:gap-0">
        <div className="min-w-0 lg:border-r lg:border-hairline lg:pr-10">
          <div className="mb-4">
            <h2 className="text-[19px] font-medium tracking-[-0.01em] text-ink">Todos los clientes</h2>
            <p className="mt-1 text-[13.5px] text-subtle">Sin cuentas ni accesos: reciben reportes y encuestas por WhatsApp o correo.</p>
          </div>
          <ClientsTable rows={rows} />
        </div>

        <div className="min-w-0 lg:pl-10">
          <div className="mb-1 flex items-start justify-between gap-4">
            <h2 className="text-[19px] font-medium tracking-[-0.01em] text-ink">Por qué se quejan</h2>
            <CornerLink href="/postventa" label="Ver postventa" />
          </div>
          <p className="mb-6 text-[13.5px] text-subtle">{plural(cases.length, "caso postventa", "casos postventa")} · últimos 12 meses</p>
          {reasons.length ? (
            <BarList showCount items={reasons.map((r) => ({ label: r.label, value: r.value, pct: r.pct }))} />
          ) : (
            <p className="rounded-[18px] bg-[#f6f8fa] px-4 py-6 text-center text-[14px] text-subtle">Sin quejas registradas. ¡Impecable!</p>
          )}
          {insight && (
            <Insight icon={<MessageSquareWarning />} href="/postventa" linkLabel="Atender casos" className="mt-8">
              <b className="font-semibold">{insight.lead.label}</b> concentra el {fmtPct(insight.lead.pct)} de las quejas.
              {insight.worst && insight.worstN > 1 && (
                <>
                  {" "}
                  {insight.worst.client.shortName} acumula <b className="font-semibold">{fmtNum(insight.worstN)}</b>
                  {insight.worstN === 1 ? " caso" : " casos"}.
                </>
              )}{" "}
              {insight.rate < 0.1 ? "Solo el" : "El"} {fmtPct(insight.rate, 1)} de los servicios terminó en queja.
            </Insight>
          )}
        </div>
      </section>
    </div>
  );
}
