"use client";

import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { Lock } from "lucide-react";
import { useAppStore, useCan, useLookups, useNow } from "@/lib/hooks";
import { fmtDateTime, fmtNum } from "@/lib/format";
import { ROLE_LABEL } from "@/lib/status";
import { PageHeader, UnderlineTabs } from "@/components/pk/page";
import { EASE } from "@/components/pk/motion";
import { EmptyState } from "@/components/pk/feedback";
import {
  convertPeriod,
  isGranularity,
  parsePeriodKey,
  periodKey,
  periodOf,
  periodOptions,
  periodStart,
  periodWindow,
  type Granularity,
  type Period,
} from "./period";
import { useIndicadores } from "./use-indicadores";
import { exportIndicadores } from "./export-indicadores";
import { Controls } from "./controls";
import { CalidadTab, OperacionTab } from "./tabs";
import { PersonalTab } from "./personal-tab";
import { Fase2Section } from "./fase2";
import { DrillSheet, type Drill } from "./drill-sheet";

type TabKey = "operacion" | "calidad" | "personal";
const TAB_LABEL: Record<TabKey, string> = { operacion: "Operación", calidad: "Calidad", personal: "Personal" };
const isTab = (v: string | null): v is TabKey => v === "operacion" || v === "calidad" || v === "personal";

/**
 * /indicadores — doc §5 indicators + §6 exports, scoped by role (§2).
 * URL state: ?tab=operacion|calidad|personal&p=mes|trimestre|anio&d=2026-10|2026-T4|2026
 */
export function IndicadoresView() {
  const sp = useSearchParams();
  const now = useNow(5 * 60_000);
  const lk = useLookups();
  const canExcel = useCan("export.excel");
  const canPdf = useCan("export.pdf");
  const canPickUnit = useCan("view.allUnits");
  const canView = useCan("view.kpis");
  const setUnitFilter = useAppStore((s) => s.setUnitFilter);

  /* ── url state ── */
  const tab: TabKey = isTab(sp.get("tab")) ? (sp.get("tab") as TabKey) : "operacion";
  const pParam = sp.get("p");
  const g: Granularity = isGranularity(pParam) ? pParam : "mes";
  const parsed = parsePeriodKey(g, sp.get("d"));
  const period: Period = parsed && periodStart(parsed) <= now ? parsed : periodOf(now, g);
  const pKey = periodKey(period);

  const setParams = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(window.location.search);
      Object.entries(patch).forEach(([k, v]) => (v === null ? next.delete(k) : next.set(k, v)));
      const qs = next.toString();
      // Native history integrates with the App Router (useSearchParams stays in sync) without a server round trip.
      window.history.replaceState(null, "", qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
    },
    [],
  );

  // Stable window per (granularity, period, now) so the heavy memo below only reruns when they change.
  const win = useMemo(() => periodWindow(parsePeriodKey(g, pKey) ?? periodOf(now, g), now), [g, pKey, now]);
  const { data: ind, scope, scoped, user, unitFilter, units, earliest } = useIndicadores(win, now);
  const options = useMemo(() => periodOptions(g, earliest, now), [g, earliest, now]);

  const [drill, setDrill] = useState<Drill | null>(null);
  const [exporting, setExporting] = useState(false);

  const orderById = useMemo(() => new Map(scoped.orders.map((o) => [o.id, o] as const)), [scoped.orders]);
  const clientName = useCallback((id: string) => lk.clients.get(id)?.shortName ?? "—", [lk.clients]);

  const onExport = async () => {
    if (!canExcel || exporting) return;
    setExporting(true);
    try {
      const rows = await exportIndicadores({
        ind,
        win,
        lk,
        related: scoped,
        scopeLabel: scope.label,
        generatedBy: user.name,
      });
      toast.success("Excel generado", { description: `${win.label} · ${scope.label} · 6 hojas, ${fmtNum(rows)} filas` });
    } catch {
      toast.error("No se pudo generar el Excel", { description: "Intente de nuevo en unos segundos." });
    } finally {
      setExporting(false);
    }
  };

  /* ── narrative ── */
  const programmed = ind.funnel[0]?.count ?? 0;
  const sent = ind.funnel[3]?.count ?? 0;
  const where =
    user.role === "supervisor"
      ? ""
      : scope.visibleUnits.length > 1
        ? ind.unitsInPeriod > 1
          ? ` en ${ind.unitsInPeriod} unidades`
          : ""
        : scope.visibleUnits[0]
          ? ` en ${scope.visibleUnits[0].name}`
          : "";
  const description = (
    <>
      {user.role === "supervisor" ? "Sus servicios" : "Servicios"} programados en {win.phrase}: <b>{fmtNum(programmed)}</b>
      {where}. <b>{fmtNum(sent)}</b> {win.isCurrent ? "ya " : ""}
      {sent === 1 ? "tiene" : "tienen"} reporte enviado.
    </>
  );

  if (!canView) {
    return (
      <div>
        <PageHeader title="Indicadores" />
        <EmptyState icon={<Lock />} title="Sin acceso a indicadores">
          Su rol no tiene permiso para consultar indicadores. Solicítelo a Dirección.
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="print:[-webkit-print-color-adjust:exact] print:[print-color-adjust:exact]">
      {/* print-only letterhead (the shell hides itself on print) */}
      <div className="hidden print:mb-6 print:block">
        <p className="font-brand text-[12px] font-extrabold tracking-[0.18em] text-brand-ink">PULKRO</p>
        <h1 className="mt-1 font-serif text-[28px] font-medium text-ink">
          Indicadores · {win.label} · {TAB_LABEL[tab]}
        </h1>
        <p className="mt-1 text-[12px] text-subtle">
          {scope.label} · {win.cutoffLabel} · generado {fmtDateTime(now)} por {user.name} ({ROLE_LABEL[user.role]})
        </p>
      </div>

      <div className="print:hidden">
        <PageHeader title="Indicadores" description={description} />
        <UnderlineTabs
          id="ind-tabs"
          value={tab}
          onChange={(v) => setParams({ tab: v === "operacion" ? null : v })}
          items={[
            { value: "operacion", label: "Operación", count: fmtNum(ind.periodOrders.length) },
            { value: "calidad", label: "Calidad", count: fmtNum(ind.sat.answered) },
            { value: "personal", label: "Personal", count: fmtNum(ind.productivity.length) },
          ]}
        />
      </div>

      <Controls
        granularity={g}
        period={period}
        options={options}
        onGranularity={(next) => {
          const p = convertPeriod(period, next, now);
          setParams({ p: next === "mes" ? null : next, d: periodKey(p) });
        }}
        onPeriod={(p) => setParams({ d: periodKey(p) })}
        scope={{
          label: scope.label,
          canPick: canPickUnit,
          units,
          selected: unitFilter,
          onPick: (id) => {
            setUnitFilter(id);
            // The unit filter is global (Equipo, Clientes, Hoy, Catálogos), not just this screen.
            toast(id === "all" ? "Viendo todas las unidades" : `Viendo ${units.find((u) => u.id === id)?.name ?? "la unidad"}`, {
              description: "El filtro de unidad aplica a toda la aplicación, no solo a Indicadores.",
            });
          },
          hint:
            user.role === "supervisor"
              ? "Como supervisor ve solo las órdenes asignadas a usted (doc §2)."
              : "Administración consulta los indicadores de su unidad (doc §2).",
        }}
        onExport={onExport}
        exporting={exporting}
        canExcel={canExcel}
        canPdf={canPdf}
        onPrint={() => window.print()}
      />

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.32, ease: EASE }}
          className="mt-8"
        >
          {tab === "operacion" && <OperacionTab ind={ind} win={win} onDrill={setDrill} />}
          {tab === "calidad" && <CalidadTab ind={ind} win={win} orderById={orderById} clientName={clientName} />}
          {tab === "personal" && <PersonalTab ind={ind} win={win} role={user.role} units={lk.units} onDrill={setDrill} />}
        </motion.div>
      </AnimatePresence>

      <Fase2Section />

      <DrillSheet drill={drill} onClose={() => setDrill(null)} />
    </div>
  );
}
