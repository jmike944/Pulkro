"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { ArrowRight, CircleCheck, Ellipsis } from "lucide-react";
import { cn } from "@/lib/utils";
import { daysUntil, firstName, fmtDay, fmtDaysLeft } from "@/lib/format";
import { CASE_CATEGORY, CASE_CHANNEL, CASE_STATUS, SEVERITY } from "@/lib/status";
import type { CaseCategory, CaseStatus, PostSaleCase } from "@/lib/types";
import { IconTile, PersonAvatar } from "@/components/pk/bits";
import { SoftBadge, StatusDot, TonePill } from "@/components/pk/status";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CASE_CATEGORY_ICON, CASE_FLOW, isCaseOpen } from "./lib";
import type { CaseRow } from "./use-postventa";
import { REASON_POSTVENTA, menuItemCls } from "./ui";

export const CATEGORY_TONE: Record<CaseCategory, "sky" | "amber" | "violet" | "red" | "navy" | "teal"> = {
  calidad: "sky",
  puntualidad: "amber",
  personal: "violet",
  danos: "red",
  faltante: "amber",
  facturacion: "navy",
  otro: "teal",
};

/** "Vence en 3 días" / "Vence hoy" / "Vencido 2 días" with a colored dot (never color alone). */
export function DueLabel({ c, className }: { c: Pick<PostSaleCase, "status" | "dueDate" | "updatedAt">; className?: string }) {
  if (!isCaseOpen(c)) {
    return (
      <span className={cn("inline-flex items-center gap-1.5 text-[12.5px] text-subtle", className)}>
        <CircleCheck className="size-3.5 text-teal-fg" />
        {c.status === "resuelto" ? "Resuelto" : "Cerrado"} {fmtDay(c.updatedAt)}
      </span>
    );
  }
  const n = daysUntil(c.dueDate);
  const txt = n < 0 ? `Vencido ${fmtDaysLeft(c.dueDate).replace("vencido ", "")}` : n === 0 ? "Vence hoy" : `Vence en ${fmtDaysLeft(c.dueDate)}`;
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap text-[12.5px] font-medium", n < 0 ? "text-red-fg" : n === 0 ? "text-amber-fg" : "text-ink/80", className)}>
      <span className={cn("size-[6px] shrink-0 rounded-full", n < 0 ? "bg-st-red" : n === 0 ? "bg-st-amber" : "bg-st-slate")} />
      {txt}
    </span>
  );
}

/** Kanban/list card for a post-sale case. The whole card links to the detail; the menu moves status. */
export function CaseCard({
  row,
  canManage,
  onMove,
  highlight,
  layoutId,
  className,
}: {
  row: CaseRow;
  canManage: boolean;
  onMove: (row: CaseRow, to: CaseStatus) => void;
  highlight?: boolean;
  layoutId?: string;
  className?: string;
}) {
  const { c, client, order, owner } = row;
  const Icon = CASE_CATEGORY_ICON[c.category];
  const status = CASE_STATUS[c.status];
  return (
    <motion.article
      layout
      layoutId={layoutId}
      data-focus={highlight ? "true" : undefined}
      transition={{ layout: { type: "spring", stiffness: 380, damping: 34 } }}
      whileHover={{ y: -2 }}
      className={cn(
        "group relative rounded-[18px] border border-hairline bg-surface p-4 shadow-[0_1px_2px_rgb(16_24_40/0.04)] transition-shadow duration-300 hover:shadow-lift",
        highlight && "ring-2 ring-sky ring-offset-2",
        className,
      )}
    >
      <Link href={`/postventa/${c.folio}`} aria-label={`Abrir caso ${c.folio}`} className="absolute inset-0 z-0 rounded-[18px] outline-none focus-visible:ring-2 focus-visible:ring-sky" />
      <div className="pointer-events-none relative flex items-start justify-between gap-2">
        <span className="inline-flex items-center gap-2 pt-1 text-[12px] font-semibold tracking-[0.04em] text-subtle tabular max-md:pt-0.5">
          {/* md+: the column header names the status; phones have no columns, so the pill spells it out */}
          <StatusDot tone={status.tone} live={status.live} className="max-md:hidden" />
          {c.folio}
          <TonePill tone={status.tone} live={status.live} className="tracking-normal md:hidden">
            {status.label}
          </TonePill>
          <span className="sr-only max-md:hidden">{status.label}</span>
        </span>
        <CaseMenu row={row} canManage={canManage} onMove={onMove} />
      </div>
      <div className="pointer-events-none relative mt-2.5 flex items-start gap-3">
        <IconTile tone={CATEGORY_TONE[c.category]}>
          <Icon />
        </IconTile>
        <div className="min-w-0">
          <p className="text-[15px] font-semibold leading-snug text-ink group-hover:text-link">{CASE_CATEGORY[c.category]}</p>
          <p className="truncate text-[13px] text-subtle">
            {client?.shortName ?? "Cliente"} · <span className="tabular">{order?.folio ?? "—"}</span>
          </p>
        </div>
      </div>
      <p className="pointer-events-none relative mt-3 line-clamp-2 text-[13.5px] leading-relaxed text-ink/75">{c.description}</p>
      <div className="pointer-events-none relative mt-3 flex flex-wrap items-center gap-1.5">
        <SoftBadge tone={SEVERITY[c.severity].tone}>Severidad {SEVERITY[c.severity].label.toLowerCase()}</SoftBadge>
        <SoftBadge tone="slate">{CASE_CHANNEL[c.channel]}</SoftBadge>
      </div>
      <div className="pointer-events-none relative mt-4 flex items-center justify-between gap-3 border-t border-hairline pt-3">
        <span className="flex min-w-0 items-center gap-2">
          {owner && <PersonAvatar name={owner.name} initials={owner.initials} hue={owner.hue} size={26} />}
          <span className="truncate text-[13px] text-ink/80">{owner ? firstName(owner.name) : "Sin responsable"}</span>
        </span>
        <DueLabel c={c} />
      </div>
    </motion.article>
  );
}

function CaseMenu({ row, canManage, onMove }: { row: CaseRow; canManage: boolean; onMove: (row: CaseRow, to: CaseStatus) => void }) {
  const { c, order } = row;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Acciones del caso ${c.folio}`}
        className="pointer-events-auto relative z-[1] -mr-1.5 -mt-1.5 inline-flex size-10 items-center justify-center rounded-[12px] text-subtle outline-none transition hover:bg-tile hover:text-ink focus-visible:ring-2 focus-visible:ring-sky data-[state=open]:bg-tile data-[state=open]:text-ink"
      >
        <Ellipsis className="size-[18px]" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60 rounded-[14px] p-1.5">
        <DropdownMenuLabel className="px-2.5 pb-1 pt-1.5 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-subtle">Mover a</DropdownMenuLabel>
        {!canManage && <p className="px-2.5 pb-2 text-[12.5px] leading-snug text-subtle">{REASON_POSTVENTA}</p>}
        {CASE_FLOW.filter((st) => st !== c.status).map((st) => (
          <DropdownMenuItem key={st} disabled={!canManage} className={menuItemCls} onClick={() => onMove(row, st)}>
            <StatusDot tone={CASE_STATUS[st].tone} />
            {CASE_STATUS[st].label}
            {(st === "resuelto" || st === "cerrado") && <span className="ml-auto text-[12px] text-subtle">{st === "resuelto" ? "Requiere resolución" : "Requiere conformidad"}</span>}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className={menuItemCls}>
          <Link href={`/postventa/${c.folio}`}>
            Ver detalle del caso <ArrowRight className="ml-auto" />
          </Link>
        </DropdownMenuItem>
        {order && (
          <DropdownMenuItem asChild className={menuItemCls}>
            <Link href={`/ordenes/${order.folio}`}>
              Ver orden {order.folio} <ArrowRight className="ml-auto" />
            </Link>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
