"use client";

import { ShieldCheck, TriangleAlert } from "lucide-react";
import { plural } from "@/lib/format";
import { AnimatedNumber, BarList, Insight, Panel } from "@/components/pk/bits";
import { EmptyState } from "@/components/pk/feedback";
import { useCanSeeRoute } from "@/components/shell/use-can-see-route";
import type { Indicators } from "./compute";
import { CardHead } from "./bits";

/** §5 "Número y tipo de incidencias" for incidents registered in the period. */
export function IncidentsCard({ ind }: { ind: Indicators }) {
  // /incidencias is the supervisor's screen: no dead link for the roles that read this card.
  const incidentsHref = useCanSeeRoute()("/incidencias") ? "/incidencias" : undefined;
  const total = ind.periodIncidents.length;
  const top = ind.incidentTypes[0];
  const rate = ind.closedWithIncidentRate;

  return (
    <Panel className="flex flex-col print:break-inside-avoid">
      <CardHead title="Incidencias por tipo" subtitle="Registradas en campo durante el periodo" href={incidentsHref} linkLabel="Ver incidencias" />
      {total === 0 ? (
        <EmptyState icon={<ShieldCheck />} title="Sin incidencias" className="flex-1">
          Ninguna cuadrilla registró incidencias en este periodo.
        </EmptyState>
      ) : (
        <>
          <div className="mb-6 flex items-baseline gap-2">
            <AnimatedNumber value={total} className="text-[40px] font-medium leading-none tracking-[-0.04em] text-ink" />
            <span className="text-[15px] text-subtle">
              en {plural(ind.ordersWithIncident, "orden", "órdenes")}
              {ind.incidentsOpen > 0 && (
                <>
                  {" "}
                  · <b className="font-semibold text-red-fg">{plural(ind.incidentsOpen, "abierta", "abiertas")}</b>
                </>
              )}
            </span>
          </div>
          <BarList showCount items={ind.incidentTypes.map((t) => ({ label: t.label, value: t.count, pct: t.pct }))} />
          {top && (
            <Insight icon={<TriangleAlert />} href={incidentsHref} linkLabel="Revisar incidencias" className="mt-7">
              <b className="font-semibold">{top.label}</b> concentra el {Math.round(top.pct * 100)}% de los casos.
              {rate > 0 && <> Hubo incidencias en {Math.round(rate * 100)}% de los servicios terminados.</>}
            </Insight>
          )}
        </>
      )}
    </Panel>
  );
}
