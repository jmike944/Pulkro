"use client";

import Link from "next/link";
import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { format } from "date-fns";
import { motion } from "motion/react";
import { toast } from "sonner";
import { CalendarDays, ClipboardCheck, ClipboardList, Download, Inbox, Loader2, Plus, Search, ShieldCheck, Sparkles } from "lucide-react";
import { useCan, useLookups, useNow } from "@/lib/hooks";
import { plural } from "@/lib/format";
import { OPEN_STATUSES } from "@/lib/status";
import { PageHeader, UnderlineTabs } from "@/components/pk/page";
import { AnimatedNumber } from "@/components/pk/bits";
import { EmptyState } from "@/components/pk/feedback";
import { Button } from "@/components/ui/button";
import {
  ORDER_TABS,
  STAGES,
  TAB_SORT,
  TAB_TEST,
  activeFilterCount,
  applyFilters,
  isOrderTab,
  isStage,
  useOrderRows,
  type OrderFilters,
  type OrderRow,
  type OrderTab,
  type Stage,
} from "./order-rows";
import { OrdersSummary, type StageStat } from "./orders-summary";
import { OrdersFilters, type FilterOption } from "./orders-filters";
import { OrdersList } from "./orders-list";
import { exportOrders } from "./export-orders";

/** Tabs where a stage quick-filter still makes sense (they contain every open order). */
const STAGE_TABS: OrderTab[] = ["abiertas", "hoy", "todas"];

const EMPTY_COPY: Record<OrderTab, { icon: React.ReactNode; title: string; body: string }> = {
  abiertas: { icon: <ClipboardList />, title: "Sin órdenes abiertas", body: "Todo el trabajo autorizado está cerrado. ¡Impecable!" },
  hoy: { icon: <CalendarDays />, title: "Sin trabajo hoy", body: "No hay jornadas programadas ni en curso para hoy en su alcance." },
  validar: { icon: <ClipboardCheck />, title: "Nada por validar", body: "Cuando una cuadrilla registre su última salida, la orden aparecerá aquí para validar el cierre." },
  incidencia: { icon: <ShieldCheck />, title: "Sin incidencias abiertas", body: "Ninguna orden tiene incidencias pendientes de resolver." },
  terminadas: { icon: <Sparkles />, title: "Aún sin órdenes terminadas", body: "Las órdenes con cierre validado por el supervisor aparecerán aquí." },
  todas: { icon: <Inbox />, title: "Sin órdenes", body: "Todavía no hay órdenes de servicio en su alcance." },
};

export function OrdersView() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const now = useNow(60_000);
  const lk = useLookups();
  const { rows, user, unitFilter } = useOrderRows(now);
  const canExport = useCan("export.excel");
  const canCreate = useCan("order.create");
  const canAllUnits = useCan("view.allUnits");
  const isSupervisor = user.role === "supervisor";

  /* ── URL state ── */
  const rawTab = params.get("tab");
  const tab: OrderTab = isOrderTab(rawTab) ? rawTab : "abiertas";
  const rawStage = params.get("etapa");
  const stage: Stage | null = isStage(rawStage) && STAGE_TABS.includes(tab) ? rawStage : null;
  const filters: OrderFilters = useMemo(
    () => ({
      sup: isSupervisor ? "" : (params.get("sup") ?? ""),
      srv: params.get("srv") ?? "",
      cli: params.get("cli") ?? "",
      uni: canAllUnits ? (params.get("uni") ?? "") : "",
      alta: params.get("alta") === "1",
    }),
    [params, isSupervisor, canAllUnits],
  );
  const urlQ = params.get("q") ?? "";
  const [search, setSearch] = useState(urlQ);
  const deferredSearch = useDeferredValue(search);

  const setParams = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  // Persist the search box to the URL once typing settles.
  useEffect(() => {
    const q = search.trim();
    if (q === urlQ) return;
    const t = setTimeout(() => setParams({ q: q || null }), 350);
    return () => clearTimeout(t);
  }, [search, urlQ, setParams]);

  const changeFilters = (patch: Partial<OrderFilters>) => {
    const out: Record<string, string | null> = {};
    for (const [k, v] of Object.entries(patch)) out[k] = typeof v === "boolean" ? (v ? "1" : null) : v || null;
    setParams(out);
  };
  const changeTab = (t: string) => setParams({ tab: t === "abiertas" ? null : t, ...(STAGE_TABS.includes(t as OrderTab) ? {} : { etapa: null }) });
  const changeStage = (s: Stage | null) => setParams({ etapa: s, ...(s && !STAGE_TABS.includes(tab) ? { tab: null } : {}) });
  const clearAll = () => {
    setSearch("");
    setParams({ q: null, sup: null, srv: null, cli: null, uni: null, alta: null, etapa: null });
  };

  /* ── derived lists ── */
  const filtered = useMemo(() => applyFilters(rows, filters, deferredSearch), [rows, filters, deferredSearch]);

  const tabCounts = useMemo(() => {
    const out = {} as Record<OrderTab, number>;
    for (const t of ORDER_TABS) out[t.value] = filtered.filter(TAB_TEST[t.value]).length;
    return out;
  }, [filtered]);

  const stageStats = useMemo(() => {
    const of = (s: Stage) => filtered.filter(STAGES.find((x) => x.value === s)!.test);
    const prog = of("programadas");
    const exec = of("ejecucion");
    const val = of("validar");
    const inc = of("incidencia");
    const out: Record<Stage, StageStat> = {
      programadas: { count: prog.length, sub: subline(prog.filter((r) => r.today).length, "inicia hoy", "inician hoy", "por iniciar") },
      ejecucion: { count: exec.length, sub: subline(exec.filter((r) => r.live).length, "en campo ahora", "en campo ahora", "sin jornada en curso") },
      validar: { count: val.length, sub: subline(val.filter((r) => r.action.status === "Lista para cierre").length, "lista para cierre", "listas para cierre", "sin evidencia completa") },
      incidencia: { count: inc.length, sub: subline(inc.filter((r) => r.order.status === "con_incidencia").length, "bloquea el cierre", "bloquean el cierre", "sin bloqueos") },
    };
    return out;
  }, [filtered]);

  const list = useMemo(() => {
    const stageTest = stage ? STAGES.find((s) => s.value === stage)!.test : null;
    return filtered.filter((r) => TAB_TEST[tab](r) && (!stageTest || stageTest(r))).sort(TAB_SORT[tab]);
  }, [filtered, tab, stage]);

  const options = useMemo(() => buildOptions(rows), [rows]);

  /* ── header narrative (whole scope, not filters) ── */
  const headline = useMemo(() => {
    const open = rows.filter((r) => OPEN_STATUSES.includes(r.order.status)).length;
    const live = rows.filter((r) => r.live).length;
    const ready = rows.filter((r) => r.action.status === "Lista para cierre").length;
    return { open, live, ready };
  }, [rows]);

  const scopeLabel =
    user.role === "administracion"
      ? `${lk.units.get(user.unitId)?.name ?? "Su unidad"}: `
      : user.role === "direccion"
        ? unitFilter === "all"
          ? "Todas las unidades: "
          : `${lk.units.get(unitFilter)?.name ?? "Unidad"}: `
        : "";

  const description = (
    <>
      {scopeLabel}
      <b>{plural(headline.open, "abierta", "abiertas")}</b>
      {headline.ready > 0 ? ", " : " y "}
      {plural(headline.live, "en ejecución", "en ejecución")} hoy
      {headline.ready > 0 && (
        <>
          {" "}
          y <b>{plural(headline.ready, "lista para cierre", "listas para cierre")}</b>
        </>
      )}
      .
    </>
  );

  /* ── export ── */
  const [exporting, setExporting] = useState(false);
  const runExport = async () => {
    if (!list.length) {
      toast.info("No hay órdenes para exportar con estos filtros.");
      return;
    }
    setExporting(true);
    try {
      await exportOrders(list, `ordenes-${tab}-${format(new Date(), "yyyy-MM-dd")}`);
      toast.success("Excel generado", { description: `${plural(list.length, "orden exportada", "órdenes exportadas")} con los filtros actuales.` });
    } catch {
      toast.error("No se pudo generar el Excel", { description: "Intente de nuevo en unos segundos." });
    } finally {
      setExporting(false);
    }
  };

  const actions =
    canExport || canCreate ? (
      <>
        {canExport && (
          <Button
            type="button"
            variant="outline"
            onClick={runExport}
            disabled={exporting}
            className="h-11 flex-1 rounded-[14px] border-[#dfe3ea] px-4 text-[14.5px] font-semibold shadow-[0_1px_2px_rgb(16_24_40/0.05)] sm:flex-none"
          >
            {exporting ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
            Exportar
          </Button>
        )}
        {canCreate && (
          <Button asChild className="group h-11 flex-1 rounded-[14px] px-4 text-[14.5px] font-semibold sm:flex-none">
            <Link href="/ordenes/nueva">
              <Plus className="size-[18px] transition-transform duration-300 group-hover:rotate-90" />
              Nueva orden
            </Link>
          </Button>
        )}
      </>
    ) : undefined;

  const dirty = activeFilterCount(filters) > 0 || deferredSearch.trim().length > 0 || !!stage;
  const copy = EMPTY_COPY[tab];
  const empty = dirty ? (
    <EmptyState
      icon={<Search />}
      title="Sin resultados"
      className="mt-4"
      action={
        <Button type="button" variant="outline" onClick={clearAll} className="h-10 rounded-[12px] px-4 font-semibold">
          Limpiar filtros
        </Button>
      }
    >
      Ninguna orden de «{ORDER_TABS.find((t) => t.value === tab)?.label}» coincide con la búsqueda y los filtros.
    </EmptyState>
  ) : (
    <EmptyState
      icon={copy.icon}
      title={copy.title}
      className="mt-4"
      action={
        tab === "hoy" ? (
          <Button asChild variant="outline" className="h-10 rounded-[12px] px-4 font-semibold">
            <Link href="/agenda">Abrir agenda</Link>
          </Button>
        ) : (tab === "abiertas" || tab === "todas") && canCreate ? (
          <Button asChild className="h-10 rounded-[12px] px-4 font-semibold">
            <Link href="/ordenes/nueva">
              <Plus className="size-4" /> Nueva orden
            </Link>
          </Button>
        ) : undefined
      }
    >
      {copy.body}
    </EmptyState>
  );

  return (
    <div>
      <PageHeader title="Órdenes" description={description} actions={actions} />

      <OrdersSummary stats={stageStats} active={stage} onSelect={changeStage} />

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.18, duration: 0.4 }} className="mt-8">
        <UnderlineTabs
          id="orders-tabs"
          items={ORDER_TABS.map((t) => ({ value: t.value, label: t.label, count: <AnimatedNumber value={tabCounts[t.value]} /> }))}
          value={tab}
          onChange={changeTab}
        />
        <OrdersFilters
          filters={filters}
          onChange={changeFilters}
          search={search}
          onSearch={setSearch}
          options={options}
          showSupervisor={!isSupervisor}
          showUnit={canAllUnits && options.units.length > 1}
          resultCount={list.length}
          onClear={clearAll}
        />
      </motion.div>

      <OrdersList key={`${tab}|${stage ?? ""}`} rows={list} role={user.role} filterSig={`${JSON.stringify(filters)}|${deferredSearch}`} empty={empty} />
    </div>
  );
}

function subline(n: number, one: string, many: string, none: string) {
  return n === 0 ? none : `${n} ${n === 1 ? one : many}`;
}

function buildOptions(rows: OrderRow[]) {
  const uniq = (pairs: (FilterOption | null)[]) => {
    const m = new Map<string, FilterOption>();
    for (const p of pairs) if (p && !m.has(p.value)) m.set(p.value, p);
    return [...m.values()].sort((a, b) => a.label.localeCompare(b.label, "es"));
  };
  return {
    supervisors: uniq(rows.map((r) => (r.supervisor ? { value: r.supervisor.id, label: r.supervisor.name } : null))),
    services: uniq(rows.map((r) => (r.service ? { value: r.service.id, label: r.service.name } : null))),
    clients: uniq(rows.map((r) => (r.client ? { value: r.client.id, label: r.client.shortName } : null))),
    units: uniq(rows.map((r) => (r.unit ? { value: r.unit.id, label: r.unit.name } : null))),
  };
}
