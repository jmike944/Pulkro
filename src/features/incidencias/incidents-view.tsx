"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, FileSpreadsheet, Loader2, Search, SearchX, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useCan, useLookups, useNow, useScopedData } from "@/lib/hooks";
import { incidentsByType } from "@/lib/metrics";
import { businessDateStamp, exportToExcel, fmtBusinessDateTime } from "@/lib/export";
import { fmtNum, plural } from "@/lib/format";
import { INCIDENT_TYPE, SEVERITY, toneSoftBg, toneText } from "@/lib/status";
import type { IncidentType, Photo, Severity } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { PageHeader, UnderlineTabs } from "@/components/pk/page";
import { PersonAvatar } from "@/components/pk/bits";
import { ClientMark } from "@/components/pk/client-mark";
import { EmptyState } from "@/components/pk/feedback";
import { INCIDENT_ICONS } from "@/components/pk/incident-sheet";
import { EASE } from "@/components/pk/motion";
import { ALL, ClearFilters, FilterPill } from "@/features/evidencias/filter-pill";
import { Guarded } from "@/features/evidencias/guarded";
import { incidentStats, sortRows, type IncidentRow } from "./incident-data";
import { IncidentStats } from "./incident-stats";
import { IncidentList } from "./incident-list";
import { IncidentDetail } from "./incident-detail";
import { RegisterIncident } from "./register-incident";

type Tab = "abiertas" | "resueltas" | "todas";
type Filters = { type: string; sev: string; sup: string; client: string; q: string };
const EMPTY: Filters = { type: ALL, sev: ALL, sup: ALL, client: ALL, q: "" };
const PAGE = 20;

/** /incidencias — incident register (doc §4.2): daños, faltantes, trabajos adicionales, retrasos, quejas… with photos. */
export function IncidentsView() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const selectedId = params.get("i");
  const data = useScopedData();
  const lk = useLookups();
  const now = useNow(60_000);
  const canExport = useCan("export.excel");

  const [tab, setTab] = useState<Tab>(() => (data.incidents.some((i) => i.status === "abierta") ? "abiertas" : "todas"));
  const [f, setF] = useState<Filters>(EMPTY);
  const [limit, setLimit] = useState(PAGE);
  const [exporting, setExporting] = useState(false);

  // Keep the last opened incident mounted while the sheet animates out.
  const [shownId, setShownId] = useState(selectedId);
  if (selectedId && selectedId !== shownId) setShownId(selectedId);
  const inScope = !!selectedId && data.incidents.some((i) => i.id === selectedId);

  const openIncident = (id: string) => router.replace(`${pathname}?i=${encodeURIComponent(id)}`, { scroll: false });
  const closeIncident = () => router.replace(pathname, { scroll: false });

  const update = (patch: Partial<Filters>) => {
    setF((cur) => ({ ...cur, ...patch }));
    setLimit(PAGE);
  };

  /* ── joins ── */
  const rowsAll = useMemo<IncidentRow[]>(() => {
    const orderById = new Map(data.orders.map((o) => [o.id, o] as const));
    const photoById = new Map(data.photos.map((p) => [p.id, p] as const));
    const byIncident = new Map<string, Photo[]>();
    data.photos.forEach((p) => {
      if (p.incidentId) byIncident.set(p.incidentId, [...(byIncident.get(p.incidentId) ?? []), p]);
    });
    return data.incidents.map((inc) => {
      const order = orderById.get(inc.orderId);
      const linked = byIncident.get(inc.id) ?? [];
      const extra = inc.photoIds.map((id) => photoById.get(id)).filter((p): p is Photo => !!p && !linked.includes(p));
      return { inc, order, client: order ? lk.clients.get(order.clientId) : undefined, photos: [...linked, ...extra] };
    });
  }, [data.orders, data.photos, data.incidents, lk.clients]);

  const stats = useMemo(() => incidentStats(data.incidents, now), [data.incidents, now]);
  const year = now.getFullYear();
  const yearIncidents = useMemo(() => data.incidents.filter((i) => new Date(i.createdAt).getFullYear() === year), [data.incidents, year]);
  const byType = useMemo(() => incidentsByType(yearIncidents).filter((b) => b.count > 0), [yearIncidents]);

  const counts = useMemo(
    () => ({
      abiertas: rowsAll.filter((r) => r.inc.status === "abierta").length,
      resueltas: rowsAll.filter((r) => r.inc.status === "resuelta").length,
      todas: rowsAll.length,
    }),
    [rowsAll],
  );

  /* ── filter options (from what exists in scope) ── */
  const options = useMemo(() => {
    const count = <K extends string>(key: (r: IncidentRow) => K | undefined) => {
      const m = new Map<K, number>();
      rowsAll.forEach((r) => {
        const k = key(r);
        if (k) m.set(k, (m.get(k) ?? 0) + 1);
      });
      return m;
    };
    const types = count((r) => r.inc.type);
    const sevs = count((r) => r.inc.severity);
    const sups = count((r) => r.order?.supervisorId);
    const clients = count((r) => r.order?.clientId);
    return {
      types: (Object.keys(INCIDENT_TYPE) as IncidentType[])
        .filter((t) => types.has(t))
        .map((t) => {
          const Icon = INCIDENT_ICONS[t];
          return {
            value: t,
            label: INCIDENT_TYPE[t].label,
            hint: types.get(t),
            icon: (
              <span className={cn("inline-flex size-6 items-center justify-center rounded-[7px]", toneSoftBg[INCIDENT_TYPE[t].tone], toneText[INCIDENT_TYPE[t].tone])}>
                <Icon className="size-3.5" />
              </span>
            ),
          };
        }),
      sevs: (["alta", "media", "baja"] as Severity[]).filter((s) => sevs.has(s)).map((s) => ({ value: s, label: SEVERITY[s].label, hint: sevs.get(s) })),
      sups: Array.from(sups.entries())
        .map(([id, n]) => ({ u: lk.users.get(id), id, n }))
        .sort((a, b) => (a.u?.name ?? "").localeCompare(b.u?.name ?? ""))
        .map(({ u, id, n }) => ({ value: id, label: u?.name ?? "Supervisor", hint: n, icon: u ? <PersonAvatar initials={u.initials} hue={u.hue} size={22} /> : undefined })),
      clients: Array.from(clients.entries())
        .map(([id, n]) => ({ c: lk.clients.get(id), id, n }))
        .sort((a, b) => (a.c?.shortName ?? "").localeCompare(b.c?.shortName ?? ""))
        .map(({ c, id, n }) => ({
          value: id,
          label: c?.shortName ?? "Cliente",
          hint: n,
          icon: c ? <ClientMark name={c.name} hue={c.hue} size={22} className="rounded-[7px]" /> : undefined,
        })),
    };
  }, [rowsAll, lk.users, lk.clients]);

  const filtered = useMemo(() => {
    const needle = f.q.trim().toLowerCase();
    const rows = rowsAll.filter((r) => {
      if (tab === "abiertas" && r.inc.status !== "abierta") return false;
      if (tab === "resueltas" && r.inc.status !== "resuelta") return false;
      if (f.type !== ALL && r.inc.type !== f.type) return false;
      if (f.sev !== ALL && r.inc.severity !== f.sev) return false;
      if (f.sup !== ALL && r.order?.supervisorId !== f.sup) return false;
      if (f.client !== ALL && r.order?.clientId !== f.client) return false;
      if (needle) {
        const hay = [r.inc.folio, r.inc.description, r.order?.folio, r.order?.title, r.client?.name, r.client?.shortName].join(" ").toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
    return sortRows(rows, tab);
  }, [rowsAll, tab, f]);

  const active = f.type !== ALL || f.sev !== ALL || f.sup !== ALL || f.client !== ALL || !!f.q.trim();
  const visible = useMemo(() => filtered.slice(0, limit), [filtered, limit]);

  const doExport = async () => {
    setExporting(true);
    try {
      await exportToExcel(`incidencias-${businessDateStamp(now)}`, [
        {
          name: "Incidencias",
          columns: [
            { header: "Folio", key: "folio", width: 12 },
            { header: "Tipo", key: "tipo", width: 26 },
            { header: "Severidad", key: "severidad", width: 12 },
            { header: "Estado", key: "estado", width: 12 },
            { header: "Impide cierre", key: "bloquea", width: 14 },
            { header: "Orden", key: "orden", width: 12 },
            { header: "Cliente", key: "cliente", width: 28 },
            { header: "Supervisor", key: "supervisor", width: 26 },
            { header: "Descripción", key: "descripcion", width: 60 },
            { header: "Fotos", key: "fotos", width: 8 },
            { header: "Registrada", key: "creada", width: 18 },
            { header: "Resuelta", key: "resuelta", width: 18 },
            { header: "Resolución", key: "resolucion", width: 50 },
          ],
          rows: filtered.map((r) => ({
            folio: r.inc.folio,
            tipo: INCIDENT_TYPE[r.inc.type].label,
            severidad: SEVERITY[r.inc.severity].label,
            estado: r.inc.status === "abierta" ? "Abierta" : "Resuelta",
            bloquea: r.inc.blocksClosure ? "Sí" : "No",
            orden: r.order?.folio,
            cliente: r.client?.name,
            supervisor: r.order ? lk.users.get(r.order.supervisorId)?.name : undefined,
            descripcion: r.inc.description,
            fotos: r.photos.length,
            creada: fmtBusinessDateTime(r.inc.createdAt),
            resuelta: r.inc.resolvedAt ? fmtBusinessDateTime(r.inc.resolvedAt) : "",
            resolucion: r.inc.resolution ?? "",
          })),
        },
      ]);
      toast.success(`Excel con ${plural(filtered.length, "incidencia", "incidencias")} descargado`);
    } catch {
      toast.error("No se pudo generar el Excel");
    } finally {
      setExporting(false);
    }
  };

  const description =
    stats.open > 0 ? (
      <>
        <b>{plural(stats.open, "abierta", "abiertas")}</b>,{" "}
        {stats.blocking ? (
          <>
            <b>{fmtNum(stats.blocking)}</b> {stats.blocking === 1 ? "impide" : "impiden"} el cierre.
          </>
        ) : (
          "ninguna impide el cierre."
        )}
      </>
    ) : (
      <>
        Sin incidencias abiertas. <b>{plural(stats.resolved30, "resuelta", "resueltas")}</b> en los últimos 30 días.
      </>
    );

  return (
    <div>
      <PageHeader
        title="Incidencias"
        description={description}
        actions={
          <>
            <Guarded reason={canExport ? null : "La exportación a Excel es para Dirección y Administración."}>
              <Button
                variant="outline"
                disabled={!canExport || exporting || filtered.length === 0}
                onClick={() => void doExport()}
                className="h-11 rounded-[12px] border-line px-4 text-[15px] font-semibold lg:h-10 lg:text-[14px]"
              >
                {exporting ? <Loader2 className="animate-spin" /> : <FileSpreadsheet />} Exportar
              </Button>
            </Guarded>
            <RegisterIncident orders={data.orders} now={now} onCreated={(id) => setTimeout(() => openIncident(id), 320)} />
          </>
        }
      />

      <AnimatePresence>
        {selectedId && !inScope && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="mb-6 flex items-center gap-3 rounded-[16px] bg-amber-soft py-2 pl-4 pr-1.5 text-[14px] text-amber-ink"
          >
            <span className="min-w-0 flex-1">La incidencia solicitada no existe o no está en tu alcance.</span>
            <button type="button" onClick={closeIncident} aria-label="Cerrar aviso" className="inline-flex size-10 shrink-0 items-center justify-center rounded-full hover:bg-surface/70">
              <X className="size-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <IncidentStats stats={stats} byType={byType} year={year} yearCount={yearIncidents.length} />

      <section className="mt-12">
        <UnderlineTabs
          id="incidencias-tabs"
          value={tab}
          onChange={(v) => {
            setTab(v as Tab);
            setLimit(PAGE);
          }}
          items={[
            { value: "abiertas", label: "Abiertas", count: counts.abiertas },
            { value: "resueltas", label: "Resueltas", count: fmtNum(counts.resueltas) },
            { value: "todas", label: "Todas", count: fmtNum(counts.todas) },
          ]}
        />

        <div className="mt-5 flex flex-wrap items-center gap-2.5">
          <label className="relative order-first flex h-11 w-full items-center sm:order-last sm:ml-auto sm:w-[260px] lg:h-10">
            <Search className="pointer-events-none absolute left-3.5 size-4 text-subtle" />
            <input
              type="search"
              value={f.q}
              onChange={(e) => update({ q: e.target.value })}
              placeholder="Buscar folio, orden o texto"
              aria-label="Buscar incidencias"
              className="h-full w-full rounded-full border border-hairline bg-surface pl-10 pr-4 text-[15px] text-ink outline-none transition placeholder:text-faint focus:border-sky focus:ring-3 focus:ring-sky/30 lg:text-[14px]"
            />
          </label>
          <FilterPill label="Tipo" value={f.type} onChange={(v) => update({ type: v })} options={options.types} allLabel="Todos los tipos" />
          <FilterPill label="Severidad" value={f.sev} onChange={(v) => update({ sev: v })} options={options.sevs} allLabel="Todas" />
          {(options.sups.length > 1 || f.sup !== ALL) && (
            <FilterPill label="Supervisor" value={f.sup} onChange={(v) => update({ sup: v })} options={options.sups} allLabel="Todos los supervisores" />
          )}
          <FilterPill label="Cliente" value={f.client} onChange={(v) => update({ client: v })} options={options.clients} allLabel="Todos los clientes" />
          {active && <ClearFilters onClick={() => update(EMPTY)} />}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.25, ease: EASE }}
            className="mt-6"
          >
            {filtered.length === 0 ? (
              active ? (
                <EmptyState icon={<SearchX />} title="Nada con estos filtros" action={<ClearFilters onClick={() => update(EMPTY)} />}>
                  Prueba con otro tipo, severidad, supervisor o cliente.
                </EmptyState>
              ) : (
                <EmptyState icon={<Sparkles />} title={tab === "abiertas" ? "Sin incidencias abiertas" : "Sin incidencias"}>
                  {tab === "abiertas" ? "Todo lo registrado en campo ya está resuelto. ¡Impecable!" : "Aún no hay incidencias registradas en tu alcance."}
                </EmptyState>
              )
            ) : (
              <>
                <IncidentList rows={visible} selectedId={inScope ? selectedId : null} onOpen={openIncident} />
                {limit < filtered.length ? (
                  <div className="mt-8 flex flex-col items-center gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setLimit((n) => n + PAGE)}
                      className="h-11 rounded-full border-line px-6 font-semibold shadow-[0_1px_2px_rgb(16_24_40/0.05)]"
                    >
                      Mostrar más <ChevronDown />
                    </Button>
                    <span className="text-[12.5px] text-subtle tabular">
                      {fmtNum(visible.length)} de {fmtNum(filtered.length)}
                    </span>
                  </div>
                ) : (
                  <p className="mt-4 text-[12.5px] text-subtle">{plural(filtered.length, "incidencia", "incidencias")}</p>
                )}
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </section>

      <IncidentDetail incidentId={shownId} open={inScope} onOpenChange={(v) => !v && closeIncident()} openCount={stats.open} />
    </div>
  );
}
