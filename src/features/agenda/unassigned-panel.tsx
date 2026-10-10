"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { CalendarClock, ChevronDown, Lock, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLookups, useMediaQuery } from "@/lib/hooks";
import { fmtRelativeDay, fmtTime, plural } from "@/lib/format";
import type { Order } from "@/lib/types";
import { AuroraFrame } from "@/components/pk/aurora";
import { IconTile } from "@/components/pk/bits";
import { ClientMark } from "@/components/pk/client-mark";
import { OrderStatusPill } from "@/components/pk/status";
import { EASE, rowVariants, staggerContainer } from "@/components/pk/motion";
import { Button } from "@/components/ui/button";
import { Gate } from "./gate";
import { REASON_CREW } from "./agenda-model";

type Props = {
  orders: Order[];
  reasons: Map<string, string>;
  canPlan: boolean;
  onSchedule: (orderId: string) => void;
};

function UnassignedList({ orders, reasons, canPlan, onSchedule }: Props) {
  const lk = useLookups();
  if (!orders.length) {
    return (
      <div className="flex flex-col items-center px-4 py-8 text-center">
        <span className="relative mb-3 inline-flex size-12 items-center justify-center rounded-[16px] bg-sky-soft text-azure-fg">
          <Sparkles className="size-5" />
          <span className="absolute -right-2 -top-1 size-3 rounded-full border border-sky/60 bg-surface animate-float" />
        </span>
        <p className="font-serif text-[19px] text-ink">Todo programado</p>
        <p className="mt-1 text-[13px] text-subtle">No hay órdenes sin cuadrilla ni fechas por confirmar.</p>
      </div>
    );
  }
  return (
    <motion.ul variants={staggerContainer(0.06, 0.15)} initial="hidden" animate="show">
      <AnimatePresence initial={false}>
        {orders.map((o) => {
          const client = lk.clients.get(o.clientId);
          const reason = reasons.get(o.id);
          return (
            <motion.li
              key={o.id}
              layout
              variants={rowVariants}
              exit={{ opacity: 0, x: 24, transition: { duration: 0.25 } }}
              className="border-b border-hairline py-4 last:border-0"
            >
              <Link href={`/ordenes/${o.folio}`} className="group flex items-start gap-3 rounded-[14px] outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                {client && <ClientMark name={client.name} hue={client.hue} size={38} />}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14.5px] font-semibold text-ink transition-colors group-hover:text-link">{o.title}</p>
                  <p className="truncate text-[12.5px] text-subtle">
                    {o.folio} · {client?.shortName}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5">
                    <OrderStatusPill status={o.status} />
                    <span className="text-[12.5px] text-subtle tabular">
                      {fmtRelativeDay(o.scheduledStart)} {fmtTime(o.scheduledStart)} · {plural(o.plannedDays, "jornada", "jornadas")}
                    </span>
                  </div>
                  {reason && o.status === "reprogramada" && (
                    <p className="mt-2 line-clamp-2 rounded-[10px] bg-amber-soft px-2.5 py-1.5 text-[12.5px] leading-snug text-amber-ink">{reason}</p>
                  )}
                </div>
              </Link>
              <Gate allowed={canPlan} reason={REASON_CREW} className="mt-3 w-full">
                <Button
                  disabled={!canPlan}
                  onClick={() => onSchedule(o.id)}
                  className={cn("mt-3 h-10 w-full rounded-[12px] text-[14px] font-semibold", !canPlan && "mt-0")}
                >
                  <CalendarClock className="size-4" />
                  {o.status === "reprogramada" ? "Confirmar fechas" : "Programar"}
                </Button>
              </Gate>
            </motion.li>
          );
        })}
      </AnimatePresence>
    </motion.ul>
  );
}

/** Desktop right rail: featured card in a soft aurora frame. */
export function UnassignedRail(props: Props) {
  return (
    <AuroraFrame innerClassName="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[19px] font-medium tracking-[-0.01em] text-ink">Por asignar</h2>
          <p className="mt-1 text-[13px] leading-snug text-subtle">Sin cuadrilla o con fechas por confirmar.</p>
        </div>
        <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-full bg-brand-deep px-2.5 text-[14px] font-semibold text-white tabular">
          {props.orders.length}
        </span>
      </div>
      <div className="mt-2 max-h-[calc(100dvh-220px)] overflow-y-auto pr-1">
        <UnassignedList {...props} />
      </div>
    </AuroraFrame>
  );
}

/** Phones / tablets: collapsible section above the calendar. */
export function UnassignedSection(props: Props) {
  // Each pending order is ~180px tall: starting open would push the calendar below the first screen on phones/tablets.
  const stacked = !useMediaQuery("(min-width: 1024px)");
  const [open, setOpen] = useState(() => props.orders.length > 0 && !stacked);
  return (
    <div className="rounded-[20px] border border-hairline bg-surface shadow-soft">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <IconTile tone={props.orders.length ? "amber" : "teal"}>
          <CalendarClock />
        </IconTile>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-ink">Por asignar</span>
          <span className="block truncate text-[12.5px] text-subtle">
            {props.orders.length ? `${plural(props.orders.length, "orden", "órdenes")} sin cuadrilla o por confirmar` : "Todo programado"}
          </span>
        </span>
        {props.orders.length > 0 && (
          <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-brand-deep px-2 text-[13px] font-semibold text-white tabular">{props.orders.length}</span>
        )}
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.25 }}>
          <ChevronDown className="size-4 text-subtle" />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: EASE }}
            className="overflow-hidden"
          >
            <div className="border-t border-hairline px-4">
              {!props.canPlan && props.orders.length > 0 && (
                <p className="flex items-start gap-2 pt-3 text-[12.5px] leading-snug text-subtle lg:hidden">
                  <Lock className="mt-0.5 size-3.5 shrink-0" /> Solo consulta. {REASON_CREW}
                </p>
              )}
              <UnassignedList {...props} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
