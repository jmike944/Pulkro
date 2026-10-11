"use client";

import { Fragment } from "react";
import { Building2, Check, ChevronDown, ChevronLeft, ChevronRight, Download, Printer } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Unit } from "@/lib/types";
import { Segmented } from "@/components/pk/page";
import { ReasonTip } from "@/components/pk/reason-tip";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { GRANULARITIES, periodLabel, periodRangeLabel, samePeriod, type Granularity, type Period } from "./period";

const menuTrigger =
  "inline-flex h-11 items-center gap-2 rounded-[12px] bg-tile px-3.5 text-[14px] font-medium text-ink outline-none transition hover:bg-press focus-visible:ring-2 focus-visible:ring-sky data-[state=open]:bg-press lg:h-10";
const stepBtn =
  "inline-flex size-11 shrink-0 items-center justify-center rounded-[12px] text-subtle transition hover:bg-tile hover:text-ink disabled:pointer-events-none disabled:opacity-35 lg:size-10";

export function Controls({
  granularity,
  period,
  options,
  onGranularity,
  onPeriod,
  scope,
  onExport,
  exporting,
  canExport,
  onPrint,
}: {
  granularity: Granularity;
  period: Period;
  /** newest first */
  options: Period[];
  onGranularity: (g: Granularity) => void;
  onPeriod: (p: Period) => void;
  scope: { label: string; canPick: boolean; units: Unit[]; selected: string | "all"; onPick: (id: string | "all") => void; hint: string };
  onExport: () => void;
  exporting: boolean;
  /** export.kpis: the Excel and the print-PDF of the dashboard are one permission. */
  canExport: boolean;
  onPrint: () => void;
}) {
  const idx = options.findIndex((p) => samePeriod(p, period));
  const newer = idx > 0 ? options[idx - 1] : undefined;
  const older = idx >= 0 && idx < options.length - 1 ? options[idx + 1] : undefined;
  const byYear = options.reduce<{ year: number; items: Period[] }[]>((acc, p) => {
    const last = acc.at(-1);
    if (last && last.year === p.year) last.items.push(p);
    else acc.push({ year: p.year, items: [p] });
    return acc;
  }, []);

  return (
    <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center print:hidden">
      <Segmented
        id="granularity"
        items={GRANULARITIES}
        value={granularity}
        onChange={onGranularity}
        className="w-full lg:w-auto [&>button]:h-10 [&>button]:flex-1 lg:[&>button]:h-8 lg:[&>button]:flex-none"
      />

      <div className="flex min-w-0 items-center gap-1.5">
        <button type="button" className={stepBtn} onClick={() => older && onPeriod(older)} disabled={!older} aria-label="Periodo anterior">
          <ChevronLeft className="size-[18px]" />
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger className={cn(menuTrigger, "min-w-0 flex-1 justify-between lg:flex-none")} aria-label="Elegir periodo">
            <span className="truncate">{periodLabel(period)}</span>
            <ChevronDown className="size-4 shrink-0" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-[360px] w-60">
            {byYear.map((grp, gi) => (
              <Fragment key={grp.year}>
                {gi > 0 && <DropdownMenuSeparator />}
                {granularity !== "anio" && <DropdownMenuLabel className="text-[12px] text-subtle">{grp.year}</DropdownMenuLabel>}
                {grp.items.map((p) => (
                  <DropdownMenuItem key={`${p.year}-${p.index}`} onClick={() => onPeriod(p)} className="min-h-10 gap-3">
                    <span className="flex-1">
                      {periodLabel(p)}
                      {granularity !== "mes" && <span className="ml-2 text-[12.5px] text-subtle">{periodRangeLabel(p)}</span>}
                    </span>
                    {samePeriod(p, period) && <Check className="size-4" />}
                  </DropdownMenuItem>
                ))}
              </Fragment>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <button type="button" className={stepBtn} onClick={() => newer && onPeriod(newer)} disabled={!newer} aria-label="Periodo siguiente">
          <ChevronRight className="size-[18px]" />
        </button>
      </div>

      <ScopePicker scope={scope} />

      <div className="grid grid-cols-2 gap-2.5 lg:ml-auto lg:flex">
        <GatedExport allowed={canExport}>
          <Button variant="outline" onClick={onExport} disabled={exporting || !canExport} className="h-11 w-full rounded-[12px] border-line px-4 text-[14px] font-semibold shadow-[0_1px_2px_rgb(16_24_40/0.05)] lg:h-10">
            {exporting ? <Spinner /> : <Download className="size-4" />}
            {exporting ? "Generando…" : "Exportar"}
          </Button>
        </GatedExport>
        <GatedExport allowed={canExport}>
          <Button
            variant="outline"
            onClick={onPrint}
            disabled={!canExport}
            className="h-11 w-full rounded-[12px] border-line px-4 text-[14px] font-semibold shadow-[0_1px_2px_rgb(16_24_40/0.05)] lg:h-10"
          >
            <Printer className="size-4" /> Imprimir / PDF
          </Button>
        </GatedExport>
      </div>
    </div>
  );
}

/** Disabled export controls explain who can use them (tooltip on hover, tap bubble on touch). */
function GatedExport({ allowed, children }: { allowed: boolean; children: React.ReactElement }) {
  if (allowed) return children;
  return (
    <ReasonTip side="bottom" reason="Los indicadores se exportan desde las cuentas de Dirección y Administración (doc §2)." contentClassName="max-w-[260px] text-[12.5px] leading-snug">
      <span tabIndex={0} className="inline-flex rounded-[12px] outline-none focus-visible:ring-2 focus-visible:ring-sky">
        {children}
      </span>
    </ReasonTip>
  );
}

function ScopePicker({ scope }: { scope: Parameters<typeof Controls>[0]["scope"] }) {
  const chip = (
    <>
      <Building2 className="size-4 shrink-0 text-subtle" />
      <span className="truncate">{scope.label}</span>
    </>
  );
  if (!scope.canPick) {
    return (
      <>
        <ReasonTip side="bottom" reason={scope.hint} contentClassName="max-w-[260px] text-[12.5px] leading-snug">
          <span tabIndex={0} className="hidden h-10 min-w-0 items-center gap-2 rounded-[12px] border border-hairline px-3 text-[13.5px] font-medium text-ink outline-none focus-visible:ring-2 focus-visible:ring-sky lg:inline-flex">
            {chip}
          </span>
        </ReasonTip>
        {/* below lg the chip is hidden: say the scope and its rule in plain text */}
        <p className="flex items-start gap-2 text-[13px] leading-snug text-subtle lg:hidden">
          <Building2 className="mt-0.5 size-4 shrink-0" />
          <span>
            <b className="font-semibold text-ink">{scope.label}.</b> {scope.hint}
          </span>
        </p>
      </>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={cn(menuTrigger, "w-full min-w-0 bg-transparent ring-1 ring-hairline hover:bg-soft lg:w-auto")} aria-label="Elegir unidad">
        {chip}
        <ChevronDown className="ml-auto size-4 shrink-0 lg:ml-0" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="text-[12px] text-subtle">Unidad</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => scope.onPick("all")} className="min-h-10">
          <span className="flex-1">Todas las unidades</span>
          {scope.selected === "all" && <Check className="size-4" />}
        </DropdownMenuItem>
        {scope.units.map((u) => (
          <DropdownMenuItem key={u.id} onClick={() => scope.onPick(u.id)} className="min-h-10">
            <span className="flex-1">
              {u.name} <span className="text-subtle">· {u.code}</span>
            </span>
            {scope.selected === u.id && <Check className="size-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
