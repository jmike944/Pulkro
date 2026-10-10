"use client";

import { useMemo, useState } from "react";
import { getYear, parseISO } from "date-fns";
import { ChevronDown, HandHeart } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtPct, plural } from "@/lib/format";
import { satisfaction } from "@/lib/metrics";
import type { PostSaleCase, Survey } from "@/lib/types";
import { AuroraPanel, GlassCard } from "@/components/pk/aurora";
import { PillBars } from "@/components/pk/pill-bars";
import { AnimatedNumber, IconTile, MiniStat } from "@/components/pk/bits";
import { Segmented } from "@/components/pk/page";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MONTHS_LONG, casesByMonth, csatByMonth, csatOf, inLastDays, isCaseOpen } from "./lib";
import { Stars } from "./rating";
import { menuItemCls } from "./ui";

type Period = "30" | "90" | "year";
const PERIOD_LABEL: Record<Period, string> = { "30": "Últimos 30 días", "90": "Últimos 90 días", year: "Este año" };

/** Aurora hero: CSAT, NPS, response rate and the monthly trend (doc §5 "Satisfacción del cliente"). */
export function SatisfactionHero({ surveys, cases, now }: { surveys: Survey[]; cases: PostSaleCase[]; now: Date }) {
  const [period, setPeriod] = useState<Period>("30");
  const [metric, setMetric] = useState<"csat" | "casos">("csat");
  const [month, setMonth] = useState(now.getMonth());

  const stats = useMemo(() => {
    const year = getYear(now);
    const inPeriod = surveys.filter((s) => (period === "year" ? getYear(parseISO(s.sentAt)) === year : inLastDays(s.sentAt, Number(period), now)));
    return satisfaction(inPeriod);
  }, [surveys, period, now]);

  const year = useMemo(() => {
    const y = getYear(now);
    const answered = surveys.filter((s) => s.answers && s.respondedAt && getYear(parseISO(s.respondedAt)) === y);
    const yearCases = cases.filter((c) => getYear(parseISO(c.createdAt)) === y);
    return {
      csat: csatOf(answered),
      answered: answered.length,
      promoters: answered.filter((s) => s.answers!.nps >= 9).length,
      cases: yearCases.length,
      closedCases: yearCases.filter((c) => c.status === "cerrado" || c.status === "resuelto").length,
      csatMonths: csatByMonth(surveys, now),
      caseMonths: casesByMonth(cases, now),
    };
  }, [surveys, cases, now]);

  const openCases = cases.filter(isCaseOpen).length;
  const bars = metric === "csat" ? year.csatMonths : year.caseMonths;
  const sel = bars[Math.min(month, bars.length - 1)];
  const selCount = metric === "csat" ? year.csatMonths[Math.min(month, bars.length - 1)]?.count ?? 0 : 0;

  return (
    <AuroraPanel className="p-3 sm:p-6 lg:p-8">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-10">
        <GlassCard className="p-5 sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-3">
            <div className="flex min-w-0 flex-1 basis-[8.5rem] items-center gap-3">
              <IconTile>
                <HandHeart />
              </IconTile>
              <span className="text-[15px] font-medium leading-snug text-ink sm:truncate sm:leading-normal">Satisfacción del cliente</span>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger className="ml-auto inline-flex h-9 shrink-0 items-center gap-2 rounded-[10px] bg-tile px-3 text-[14px] font-medium text-ink outline-none transition hover:bg-press">
                {PERIOD_LABEL[period]}
                <ChevronDown className="size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {(Object.keys(PERIOD_LABEL) as Period[]).map((p) => (
                  <DropdownMenuItem key={p} className={menuItemCls} onClick={() => setPeriod(p)}>
                    {PERIOD_LABEL[p]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="mt-5 flex flex-wrap items-end gap-x-4 gap-y-2">
            {stats.answered ? (
              <AnimatedNumber
                value={stats.overall}
                format={{ minimumFractionDigits: 1, maximumFractionDigits: 1 }}
                className="text-[64px] font-medium leading-none tracking-[-0.045em] text-ink sm:text-[76px]"
              />
            ) : (
              <span className="text-[64px] font-medium leading-none tracking-[-0.045em] text-ghost sm:text-[76px]">—</span>
            )}
            <div className="mb-2 flex flex-col gap-1.5">
              <Stars key={`${period}-${stats.answered}`} value={stats.overall} size={20} delay={0.25} />
              <span className="text-[14px] text-subtle">{stats.answered ? "de 5 · calificación general" : "Sin respuestas en el periodo"}</span>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2.5 text-[14px] text-subtle">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-[8px] px-2 py-1 text-[13px] font-semibold tabular",
                stats.nps >= 50 ? "bg-teal-soft text-teal-fg" : stats.nps >= 0 ? "bg-blue-tint text-azure-fg" : "bg-red-soft text-red-fg",
              )}
            >
              NPS {stats.nps > 0 ? "+" : ""}
              {stats.answered ? stats.nps : "—"}
            </span>
            <span>
              {fmtPct(stats.responseRate)} de respuesta · {plural(stats.promoters, "promotor", "promotores")}
            </span>
          </div>

          <div className="mt-6 grid grid-cols-3 divide-x divide-hairline border-t border-hairline pt-5">
            <MiniStat tone="blue" label="Enviadas" value={<AnimatedNumber value={stats.sent} />} sub="encuestas" className="pr-3" />
            <MiniStat tone="teal" label="Respondidas" value={<AnimatedNumber value={stats.answered} />} sub={stats.sent ? fmtPct(stats.responseRate) : undefined} className="px-3 sm:px-5" />
            <MiniStat tone="red" label="Casos" value={<AnimatedNumber value={openCases} />} sub="abiertos" className="pl-3 sm:pl-5" />
          </div>
        </GlassCard>

        <div className="flex min-w-0 flex-col px-1 pb-1 sm:px-0">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[14px] font-medium text-ink/70">{metric === "csat" ? `Satisfacción en ${now.getFullYear()}` : `Casos postventa en ${now.getFullYear()}`}</p>
              {metric === "csat" ? (
                <AnimatedNumber
                  value={year.csat}
                  format={{ minimumFractionDigits: 1, maximumFractionDigits: 1 }}
                  suffix=" / 5"
                  className="mt-1 block text-[38px] font-medium leading-none tracking-[-0.03em] text-ink"
                />
              ) : (
                <AnimatedNumber value={year.cases} className="mt-1 block text-[38px] font-medium leading-none tracking-[-0.03em] text-ink" />
              )}
              <p className="mt-2 text-[14px] text-ink/70">
                {metric === "csat"
                  ? `${plural(year.answered, "respuesta", "respuestas")} · ${plural(year.promoters, "promotor", "promotores")}`
                  : `${plural(year.closedCases, "resuelto o cerrado", "resueltos o cerrados")} · ${plural(openCases, "abierto", "abiertos")}`}
              </p>
            </div>
            <Segmented
              id="pv-metric"
              items={[
                { value: "csat", label: "Satisfacción" },
                { value: "casos", label: "Casos" },
              ]}
              value={metric}
              onChange={setMetric}
              className="bg-surface/55 backdrop-blur"
            />
          </div>
          <p className="mt-4 text-[13px] text-ink/60">
            {sel && (
              <>
                <span className="font-semibold text-ink">{MONTHS_LONG[Math.min(month, bars.length - 1)]}</span>
                {" · "}
                {metric === "csat"
                  ? selCount
                    ? `${sel.value.toFixed(1)} / 5 con ${plural(selCount, "respuesta", "respuestas")}`
                    : "sin respuestas"
                  : plural(sel.value, "caso abierto", "casos abiertos")}
              </>
            )}
          </p>
          <PillBars
            key={metric}
            data={bars}
            highlight={Math.min(month, bars.length - 1)}
            format={metric === "csat" ? (v) => (v ? v.toFixed(1) : "—") : (v) => String(v)}
            onSelect={setMonth}
            className="mt-3 flex-1"
            height={200}
          />
        </div>
      </div>
    </AuroraPanel>
  );
}
