"use client";

import Link from "next/link";
import { useMemo } from "react";
import { motion } from "motion/react";
import { ArrowRight, CircleAlert, FileText, Lock, ShieldCheck, Sparkles, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { closureBlockers } from "@/lib/domain";
import { plural } from "@/lib/format";
import type { OrderBundle } from "@/lib/hooks";
import { AuroraFrame } from "@/components/pk/aurora";
import { IconTile, Insight, SectionHeader } from "@/components/pk/bits";
import { EmptyState } from "@/components/pk/feedback";
import { OrderStatusPill } from "@/components/pk/status";
import { rowVariants, staggerContainer } from "@/components/pk/motion";
import { Button } from "@/components/ui/button";
import { REASON, WithReason } from "./guard";

/** No validated closure yet: explain what blocks it and link to the closure dialog. Generating is not allowed. */
export function ClosureGate({ bundle, canClose }: { bundle: OrderBundle; canClose: boolean }) {
  const { order, jornadas, photos, incidents, pendingSync } = bundle;
  const blockers = useMemo(() => closureBlockers(order, jornadas, photos, incidents, pendingSync.length), [order, jornadas, photos, incidents, pendingSync.length]);
  const hard = blockers.filter((b) => b.severity === "block");
  const cancelled = order.status === "cancelada";
  const closeHref = `/ordenes/${order.folio}?cerrar=1`;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:gap-0">
      <section className="min-w-0 lg:border-r lg:border-hairline lg:pr-10">
        <SectionHeader
          title="Antes de generar el reporte"
          subtitle="El reporte final se emite una sola vez por servicio, después de validar el cierre definitivo."
        />
        {cancelled ? (
          <EmptyState icon={<FileText />} title="Orden cancelada">
            Una orden cancelada no genera reporte para el cliente.
          </EmptyState>
        ) : blockers.length === 0 ? (
          <Insight icon={<Sparkles />} href={closeHref} linkLabel="Validar cierre">
            Jornadas cerradas y evidencia completa. Solo falta <b className="font-semibold">validar el cierre</b> con la conformidad del cliente para habilitar el reporte.
          </Insight>
        ) : (
          <motion.ul variants={staggerContainer(0.05, 0.15)} initial="hidden" animate="show" className="rounded-[22px] border border-hairline px-4 sm:px-5">
            {blockers.map((b) => (
              <motion.li key={b.id} variants={rowVariants} className="flex items-center gap-3.5 border-b border-hairline py-4 last:border-0">
                <IconTile tone={b.severity === "block" ? "red" : "amber"} className="size-10 rounded-[12px]">
                  {b.severity === "block" ? <CircleAlert /> : <TriangleAlert />}
                </IconTile>
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold text-ink">{b.label}</p>
                  {b.detail && <p className="mt-0.5 line-clamp-2 text-[13.5px] text-subtle">{b.detail}</p>}
                </div>
                {b.href && (
                  <Button asChild variant="outline" className="h-10 shrink-0 rounded-[12px] border-line px-4 font-semibold">
                    <Link href={b.href}>Resolver</Link>
                  </Button>
                )}
              </motion.li>
            ))}
          </motion.ul>
        )}
        <GhostPaper className="mt-8" />
      </section>

      <aside className="min-w-0 lg:pl-10">
        <AuroraFrame>
          <div className="flex items-center gap-3">
            <IconTile tone="navy">
              <FileText />
            </IconTile>
            <div className="min-w-0">
              <p className="text-[17px] font-semibold text-ink">Reporte final</p>
              <p className="text-[13px] text-subtle">Un solo reporte por servicio</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <OrderStatusPill status={order.status} />
            <span className="text-[13px] text-subtle">sin cierre validado</span>
          </div>
          <p className="mt-4 text-[14.5px] leading-relaxed text-ink">
            {cancelled
              ? "Esta orden fue cancelada."
              : hard.length
                ? `Resuelva ${plural(hard.length, "pendiente", "pendientes")} y valide el cierre para seleccionar fotos y generar el PDF.`
                : "Valide el cierre definitivo para seleccionar fotos y generar el PDF."}
          </p>
          <div className="mt-5 grid gap-2.5">
            <WithReason reason={canClose ? null : REASON.close} className="w-full">
              <Button asChild={canClose && !cancelled} disabled={!canClose || cancelled} className="h-12 w-full rounded-[14px] text-[15px] font-semibold">
                {canClose && !cancelled ? (
                  <Link href={closeHref}>
                    <ShieldCheck /> Validar cierre <ArrowRight />
                  </Link>
                ) : (
                  <span>
                    <ShieldCheck /> Validar cierre
                  </span>
                )}
              </Button>
            </WithReason>
            <Button asChild variant="outline" className="h-11 rounded-[14px] border-line font-semibold">
              <Link href={`/ordenes/${order.folio}`}>Ver orden</Link>
            </Button>
          </div>
          <p className="mt-4 flex items-start gap-2 text-[12.5px] leading-snug text-subtle">
            <Lock className="mt-0.5 size-3.5 shrink-0" />
            Sin cierre no se puede generar el reporte: las fotos ANTES y DESPUÉS son obligatorias salvo excepción autorizada.
          </p>
        </AuroraFrame>
      </aside>
    </div>
  );
}

/** Faux A4 sheet, blurred and locked — what the report will look like once closure is validated. */
function GhostPaper({ className }: { className?: string }) {
  return (
    <div className={cn("relative mx-auto max-w-[460px] rounded-[24px] bg-press p-5", className)} aria-hidden>
      <div className="theme-light relative aspect-[210/297] overflow-hidden rounded-[3px] bg-white p-7 shadow-[0_22px_44px_-22px_rgb(2_58_99/0.38)]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="size-7 rounded-[8px] bg-brand-deep" />
            <span className="h-3 w-16 rounded-full bg-track" />
          </div>
          <span className="h-3 w-20 rounded-full bg-track" />
        </div>
        <div className="mt-4 h-[3px] rounded-full bg-gradient-to-r from-brand via-sky to-[#b9c7ff]" />
        <div className="mt-5 h-5 w-3/4 rounded-full bg-press" />
        <div className="mt-4 h-16 rounded-[8px] bg-soft" />
        <div className="mt-5 space-y-2">
          {[92, 84, 88, 60].map((w, i) => (
            <div key={i} className="h-2.5 rounded-full bg-well" style={{ width: `${w}%` }} />
          ))}
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2.5">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="aspect-[4/3] rounded-[6px] shimmer" />
          ))}
        </div>
        <div className="absolute inset-0 flex items-center justify-center bg-surface/40 backdrop-blur-[2px]">
          <span className="inline-flex items-center gap-2 rounded-full bg-surface px-4 py-2 text-[13px] font-semibold text-ink shadow-soft">
            <Lock className="size-4" /> Disponible tras el cierre
          </span>
        </div>
      </div>
    </div>
  );
}
