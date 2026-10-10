"use client";

import { FileText, TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtPct, plural } from "@/lib/format";
import { AuroraPanel, GlassCard } from "@/components/pk/aurora";
import { PillBars } from "@/components/pk/pill-bars";
import { AnimatedNumber, IconTile, MiniStat } from "@/components/pk/bits";
import type { HubMetrics, HubTab } from "./hub-data";

/** The one hero block: reports generated this week + the pipeline split, weekly pill bars. */
export function HubHero({ m, onPick }: { m: HubMetrics; onPick: (tab: HubTab) => void }) {
  const total6 = m.weekly.reduce((s, w) => s + w.value, 0);
  return (
    <AuroraPanel className="p-3 sm:p-6 lg:p-8">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-10">
        <GlassCard className="p-5 sm:p-7">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <IconTile>
                <FileText />
              </IconTile>
              <span className="text-[15px] font-medium text-ink">Reportes generados</span>
            </div>
            <span className="inline-flex h-9 items-center rounded-[10px] bg-[#f2f4f7] px-3 text-[14px] font-medium text-ink">Esta semana</span>
          </div>
          <div className="mt-5 flex items-end gap-3">
            <AnimatedNumber value={m.thisWeek} className="text-[64px] font-medium leading-none tracking-[-0.045em] text-ink sm:text-[76px]" />
            <span className="mb-2 text-[15px] text-subtle">{m.thisWeek === 1 ? "reporte" : "reportes"}</span>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2.5 text-[14px] text-subtle">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-[8px] px-2 py-1 text-[13px] font-semibold",
                m.delta >= 0 ? "bg-[#e6f0fd] text-[#1667e0]" : "bg-[#fdeeee] text-st-red",
              )}
            >
              {m.delta >= 0 ? <TrendingUp className="size-4" /> : <TrendingDown className="size-4" />}
              {fmtPct(Math.abs(m.delta), 0)}
            </span>
            vs {m.lastWeek} la semana pasada
          </div>
          <div className="mt-6 grid grid-cols-3 divide-x divide-hairline border-t border-hairline pt-5">
            {(
              [
                { tab: "por_generar", tone: "amber", label: "Por generar", sub: "cierres", cls: "pr-3" },
                { tab: "por_compartir", tone: "blue", label: "Por compartir", sub: "listos", cls: "px-3 sm:px-5" },
                { tab: "enviados", tone: "teal", label: "Enviados", sub: "servicios", cls: "pl-3 sm:pl-5" },
              ] as const
            ).map((x) => (
              <button key={x.tab} type="button" onClick={() => onPick(x.tab)} className={cn("min-w-0 rounded-[10px] text-left transition hover:opacity-80", x.cls)}>
                <MiniStat tone={x.tone} label={x.label} value={<AnimatedNumber value={m.counts[x.tab]} />} sub={x.sub} />
              </button>
            ))}
          </div>
        </GlassCard>

        <div className="flex min-w-0 flex-col px-1 pb-1 sm:px-0">
          <div>
            <p className="text-[14px] font-medium text-ink/70">Últimas 6 semanas</p>
            <AnimatedNumber value={total6} className="mt-1 block text-[38px] font-medium leading-none tracking-[-0.03em] text-ink" />
            <p className="mt-2 text-[14px] text-ink/70">
              {plural(total6, "versión generada", "versiones generadas")} · {plural(m.sharesTotal, "envío iniciado", "envíos iniciados")} en total
            </p>
          </div>
          <PillBars data={m.weekly} highlight={m.weekly.length - 1} className="mt-6 flex-1" height={190} format={(v) => plural(v, "reporte", "reportes")} />
        </div>
      </div>
    </AuroraPanel>
  );
}
