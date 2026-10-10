"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { ArrowUpRight, ClipboardList } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLookups, useMediaQuery } from "@/lib/hooks";
import { fmtDay, plural } from "@/lib/format";
import type { Order } from "@/lib/types";
import { DateBadge } from "@/components/pk/bits";
import { OrderStatusPill } from "@/components/pk/status";
import { EmptyState } from "@/components/pk/feedback";
import { rowVariants, staggerContainer } from "@/components/pk/motion";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export type Drill = { title: string; description: string; orders: Order[] };

const LIMIT = 60;

/** Side sheet listing the orders behind a number (funnel stage, work bucket…). */
export function DrillSheet({ drill, onClose }: { drill: Drill | null; onClose: () => void }) {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const lk = useLookups();
  const orders = drill ? [...drill.orders].sort((a, b) => b.scheduledStart.localeCompare(a.scheduledStart)) : [];
  const shown = orders.slice(0, LIMIT);
  return (
    <Sheet open={!!drill} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side={isDesktop ? "right" : "bottom"}
        className={cn("gap-0 p-0", isDesktop ? "w-full sm:max-w-[480px]" : "max-h-[88dvh] rounded-t-[24px]")}
      >
        <SheetHeader className="border-b border-hairline p-6 pr-12">
          <SheetTitle className="font-serif text-[26px] font-medium leading-tight text-ink">{drill?.title}</SheetTitle>
          <SheetDescription className="text-[14px] text-subtle">
            {drill?.description} · {plural(orders.length, "orden", "órdenes")}
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-8">
          {orders.length === 0 ? (
            <EmptyState icon={<ClipboardList />} title="Sin órdenes" className="mt-6">
              No hay órdenes en este grupo para el periodo seleccionado.
            </EmptyState>
          ) : (
            <motion.ul variants={staggerContainer(0.03, 0.05)} initial="hidden" animate="show">
              {shown.map((o) => {
                const client = lk.clients.get(o.clientId);
                return (
                  <motion.li key={o.id} variants={rowVariants} className="border-b border-hairline">
                    <Link href={`/ordenes/${o.folio}`} className="group flex min-h-[72px] items-center gap-4 py-3.5" onClick={onClose}>
                      <DateBadge date={o.scheduledStart} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[16px] font-semibold text-ink group-hover:text-link lg:text-[15px]">{o.title}</p>
                        <p className="mt-0.5 truncate text-[13.5px] text-subtle lg:text-[13px]">
                          {o.folio} · {client?.shortName ?? "—"}
                          {o.closure ? ` · cierre ${fmtDay(o.closure.validatedAt)}` : ""}
                        </p>
                        <OrderStatusPill status={o.status} className="mt-1.5" />
                      </div>
                      <ArrowUpRight className="size-4 shrink-0 text-subtle transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-link" />
                    </Link>
                  </motion.li>
                );
              })}
            </motion.ul>
          )}
          {orders.length > LIMIT && (
            <p className="mt-4 text-center text-[13px] text-subtle">
              Se muestran las {LIMIT} más recientes.{" "}
              <Link href="/ordenes" className="font-semibold text-link" onClick={onClose}>
                Ver todas en Órdenes
              </Link>
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
