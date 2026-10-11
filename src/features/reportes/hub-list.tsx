"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { Download, FileText, LoaderCircle, Send, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtRelativeDay, fmtTime } from "@/lib/format";
import type { Client } from "@/lib/types";
import type { Tone } from "@/lib/status";
import { DateBadge } from "@/components/pk/bits";
import { EmptyState } from "@/components/pk/feedback";
import { MobileRow } from "@/components/pk/mobile";
import { rowVariants, staggerContainer } from "@/components/pk/motion";
import { Button } from "@/components/ui/button";
import type { HubRow, HubTab } from "./hub-data";
import { CHANNEL_ICON } from "./report-history";
import { CHANNEL_TO_LABEL } from "./share";
import { REASON, WithReason } from "./guard";

const COLS = "grid grid-cols-[52px_minmax(0,1fr)_52px_minmax(0,168px)_142px] gap-3.5";

const STAGE: Record<HubRow["stage"], { label: string; tone: Tone }> = {
  por_generar: { label: "Por generar", tone: "amber" },
  por_compartir: { label: "Por compartir", tone: "blue" },
  enviados: { label: "Envío iniciado", tone: "teal" },
};

function cta(row: HubRow, canShare: boolean) {
  const href = `/ordenes/${row.order.folio}/reporte`;
  // A reopened order cannot generate yet: the report page explains it and links to the closure validation.
  if (row.revalidate) return { label: "Validar cierre", href, primary: false };
  if (canShare && row.stage === "por_generar") return { label: row.latest ? `Generar v${row.latest.version + 1}` : "Generar", href, primary: true };
  if (canShare && row.stage === "por_compartir") return { label: "Compartir", href, primary: true };
  return { label: "Ver", href, primary: false };
}

const EMPTY: Record<HubTab, { title: string; body: string }> = {
  por_generar: { title: "Nada por generar", body: "Todos los cierres validados ya tienen su reporte. ¡Impecable!" },
  por_compartir: { title: "Nada por compartir", body: "Cada reporte generado ya tiene al menos un envío iniciado." },
  enviados: { title: "Aún sin envíos", body: "Cuando comparta un reporte por WhatsApp o correo aparecerá aquí." },
  todos: { title: "Sin reportes", body: "Los reportes aparecen cuando una orden tiene su cierre validado." },
};

export function HubList({
  rows,
  tab,
  clients,
  canShare,
  canExport,
  desktop,
  busyId,
  blockedOrderIds,
  onDownload,
}: {
  rows: HubRow[];
  tab: HubTab;
  clients: Map<string, Client>;
  canShare: boolean;
  canExport: boolean;
  desktop: boolean;
  busyId: string | null;
  blockedOrderIds: Set<string>;
  onDownload: (row: HubRow) => void;
}) {
  if (rows.length === 0)
    return (
      <EmptyState icon={tab === "enviados" ? <Send /> : <Sparkles />} title={EMPTY[tab].title} className="mt-5">
        {EMPTY[tab].body}
      </EmptyState>
    );

  if (!desktop)
    return (
      <motion.div key={tab} variants={staggerContainer(0.04, 0.05)} initial="hidden" animate="show" className="mt-2">
        {rows.map((r) => {
          const client = clients.get(r.order.clientId);
          const st = STAGE[r.stage];
          const reopened = r.revalidate;
          const reason = !canExport ? REASON.export : blockedOrderIds.has(r.order.id) ? REASON.sync : null;
          const busy = busyId === r.order.id;
          // The row link and the download button are siblings: a button inside an anchor is invalid and its tap would navigate.
          return (
            <motion.div key={r.order.id} variants={rowVariants} className="flex items-center border-b border-hairline last:border-0">
              <MobileRow
                className="min-w-0 flex-1 border-b-0"
                href={`/ordenes/${r.order.folio}/reporte`}
                leading={<DateBadge date={r.date} className="size-[54px]" />}
                title={r.order.title}
                meta={
                  <>
                    <span className="truncate">
                      {r.order.folio} · {client?.shortName}
                      {r.latest && ` · v${r.latest.version}`}
                    </span>
                    {reopened && <span className="shrink-0 font-medium text-violet-fg">· reabierta</span>}
                  </>
                }
                status={{
                  tone: reopened ? "violet" : st.tone,
                  label:
                    r.lastShare && r.stage === "enviados"
                      ? `${CHANNEL_TO_LABEL[r.lastShare.channel]} · ${fmtRelativeDay(r.lastShare.at)} ${fmtTime(r.lastShare.at)} · sin confirmación${r.shareCount > 1 ? ` · ${r.shareCount} intentos` : ""}`
                      : reopened
                        ? "Validar cierre otra vez"
                        : st.label,
                }}
                trailing={r.latest ? <></> : undefined /* the download button takes the chevron's place */}
              />
              {r.latest && (
                <div className="-mr-3 shrink-0">
                  <WithReason reason={reason}>
                    <Button
                      variant="ghost"
                      size="icon-lg"
                      disabled={!!reason || busy}
                      onClick={() => onDownload(r)}
                      aria-label={`Descargar PDF v${r.latest.version} de ${r.order.folio}`}
                      className="size-11 rounded-[12px] text-subtle"
                    >
                      {busy ? <LoaderCircle className="size-5 animate-spin" /> : <Download className="size-5" />}
                    </Button>
                  </WithReason>
                </div>
              )}
            </motion.div>
          );
        })}
      </motion.div>
    );

  return (
    <div className="mt-2">
      <div className={cn(COLS, "border-b border-hairline pb-3 pt-3 text-[12px] font-semibold uppercase tracking-[0.1em] text-subtle")}>
        <span>Cierre</span>
        <span>Orden</span>
        <span>Versión</span>
        <span>Último envío</span>
        <span />
      </div>
      <motion.ul key={tab} variants={staggerContainer(0.04, 0.08)} initial="hidden" animate="show">
        {rows.map((r) => {
          const client = clients.get(r.order.clientId);
          const action = cta(r, canShare);
          const Icon = r.lastShare ? CHANNEL_ICON[r.lastShare.channel] : null;
          const reason = !canExport ? REASON.export : blockedOrderIds.has(r.order.id) ? REASON.sync : null;
          return (
            <motion.li
              key={r.order.id}
              variants={rowVariants}
              layout
              className={cn(COLS, "items-center border-b border-hairline py-4")}
            >
              <DateBadge date={r.date} />
              <Link href={action.href} className="group min-w-0">
                <p className="truncate text-[15px] font-semibold text-ink group-hover:text-link">{r.order.title}</p>
                <p className="mt-0.5 truncate text-[13px] text-subtle">
                  {r.order.folio} · {client?.shortName}
                  {r.revalidate && <span className="ml-1.5 font-medium text-violet-fg">· reabierta</span>}
                </p>
              </Link>
              <span>
                {r.latest ? (
                  <span className={cn("inline-flex h-7 items-center rounded-[8px] px-2 text-[13px] font-bold tabular", r.stage === "enviados" ? "bg-teal-soft text-teal-fg" : "bg-blue-soft text-link")}>
                    v{r.latest.version}
                  </span>
                ) : (
                  <span className="text-[14px] text-faint">—</span>
                )}
              </span>
              <span className="min-w-0">
                {r.lastShare && Icon ? (
                  <>
                    <span className="flex items-center gap-1.5 truncate text-[14px] font-medium text-ink">
                      <Icon className="size-4 shrink-0 text-subtle" />
                      {CHANNEL_TO_LABEL[r.lastShare.channel]} · {fmtRelativeDay(r.lastShare.at)}, {fmtTime(r.lastShare.at)}
                    </span>
                    <span className="block truncate text-[12.5px] text-subtle">
                      sin confirmación{r.shareCount > 1 ? ` · ${r.shareCount} intentos` : ""}
                    </span>
                  </>
                ) : (
                  <span className={cn("text-[14px]", r.revalidate ? "font-medium text-violet-fg" : r.stage === "por_compartir" ? "font-medium text-link" : "text-subtle")}>
                    {r.revalidate ? "Validar cierre otra vez" : STAGE[r.stage].label}
                  </span>
                )}
              </span>
              <span className="flex items-center justify-end gap-2">
                {r.latest && (
                  <WithReason reason={reason}>
                    <Button
                      variant="ghost"
                      size="icon-lg"
                      disabled={!!reason || busyId === r.order.id}
                      onClick={() => onDownload(r)}
                      aria-label={`Descargar PDF v${r.latest.version} de ${r.order.folio}`}
                      className="size-9 rounded-[11px] text-subtle hover:text-ink"
                    >
                      {busyId === r.order.id ? <LoaderCircle className="animate-spin" /> : <Download />}
                    </Button>
                  </WithReason>
                )}
                <Button
                  asChild
                  variant={action.primary ? "default" : "outline"}
                  className={cn("h-10 min-w-[92px] rounded-[12px] px-3.5 text-[14px] font-semibold", !action.primary && "border-line shadow-[0_1px_2px_rgb(16_24_40/0.05)]")}
                >
                  <Link href={action.href}>
                    {action.primary ? null : <FileText />}
                    {action.label}
                  </Link>
                </Button>
              </span>
            </motion.li>
          );
        })}
      </motion.ul>
    </div>
  );
}
