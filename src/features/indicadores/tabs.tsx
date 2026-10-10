"use client";

import type { Order } from "@/lib/types";
import type { Indicators } from "./compute";
import type { PeriodWindow } from "./period";
import type { Drill } from "./drill-sheet";
import { FunnelHero } from "./funnel-hero";
import { WorkSplit } from "./work-split";
import { StageFlow } from "./stage-flow";
import { ServicesChart } from "./services-chart";
import { HoursCard } from "./hours-card";
import { IncidentsCard } from "./incidents-card";
import { SatisfactionCard } from "./satisfaction-card";
import { ComplaintsBlock, ComplianceBlock } from "./quality-blocks";

/** Operación: funnel hero → where the work is / how it flows → services, hours, incidents. */
export function OperacionTab({ ind, win, onDrill }: { ind: Indicators; win: PeriodWindow; onDrill: (d: Drill) => void }) {
  return (
    <div>
      <FunnelHero ind={ind} win={win} onDrill={onDrill} />

      <section className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:gap-0 print:break-inside-avoid">
        <div className="min-w-0 lg:border-r lg:border-hairline lg:pr-10">
          <WorkSplit ind={ind} win={win} onDrill={onDrill} />
        </div>
        <div className="min-w-0 lg:pl-10">
          <StageFlow ind={ind} />
        </div>
      </section>

      <div className="mt-10">
        <ServicesChart ind={ind} win={win} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <HoursCard ind={ind} />
        <IncidentsCard ind={ind} />
      </div>
    </div>
  );
}

/** Calidad: satisfaction (featured) → photo compliance · complaints. */
export function CalidadTab({
  ind,
  win,
  orderById,
  clientName,
}: {
  ind: Indicators;
  win: PeriodWindow;
  orderById: Map<string, Order>;
  clientName: (id: string) => string;
}) {
  return (
    <div>
      <SatisfactionCard ind={ind} win={win} orderById={orderById} clientName={clientName} />
      <section className="mt-10 grid gap-10 lg:grid-cols-2 lg:gap-0 print:break-inside-avoid">
        <div className="min-w-0 lg:border-r lg:border-hairline lg:pr-10">
          <ComplianceBlock ind={ind} clientName={clientName} />
        </div>
        <div className="min-w-0 lg:pl-10">
          <ComplaintsBlock ind={ind} win={win} />
        </div>
      </section>
    </div>
  );
}
