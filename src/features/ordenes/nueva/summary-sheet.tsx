"use client";

import { LayoutGroup } from "motion/react";
import { ChevronRight, ClipboardList, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMediaQuery } from "@/lib/hooks";
import { ORDER_STATUS } from "@/lib/status";
import { OrderStatusPill } from "@/components/pk/status";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { LiveSummary } from "./live-summary";

/**
 * Below xl the sticky aside with the live summary is hidden, so phones and tablets open the same
 * LiveSummary on demand: a bottom sheet on phones, a right sheet from 768px.
 */
export function SummarySheet({
  open,
  onOpenChange,
  note,
  ...summary
}: React.ComponentProps<typeof LiveSummary> & { open: boolean; onOpenChange: (v: boolean) => void; note?: React.ReactNode }) {
  const wide = useMediaQuery("(min-width: 768px)");
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side={wide ? "right" : "bottom"} showCloseButton={false} className={cn("gap-0 p-0", !wide && "max-h-[88dvh] rounded-t-[26px]")}>
        <SheetHeader className="relative shrink-0 pb-3 pl-5 pr-[72px] pt-5">
          <SheetTitle className="font-serif text-[26px] font-medium">Resumen de la orden</SheetTitle>
          <SheetDescription>Así va quedando. Nada se guarda hasta que cree la orden.</SheetDescription>
          <SheetClose asChild>
            <button
              type="button"
              aria-label="Cerrar"
              className="absolute right-3 top-3 inline-flex size-11 items-center justify-center rounded-full bg-sand text-ink transition active:scale-95"
            >
              <X className="size-[18px]" />
            </button>
          </SheetClose>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          {/* own layout group: the hidden desktop aside stays mounted below xl and shares the layoutId */}
          <LayoutGroup id="summary-sheet">
            <LiveSummary {...summary} />
          </LayoutGroup>
          {note}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** Phone row under the stepper: opens the summary and shows the status the order will get. */
export function SummaryButton({ scheduled, onClick, className }: { scheduled: boolean; onClick: () => void; className?: string }) {
  const status = scheduled ? "programada" : "borrador";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Resumen de la orden. Se guardará como ${ORDER_STATUS[status].label}`}
      className={cn("flex h-12 w-full items-center gap-2.5 rounded-[16px] bg-sand px-4 text-left text-[15px] font-semibold text-ink transition active:scale-[0.985]", className)}
    >
      <ClipboardList className="size-[18px] shrink-0 text-subtle" />
      <span className="min-w-0 flex-1 truncate">Resumen</span>
      <OrderStatusPill status={status} className="bg-white" />
      <ChevronRight className="size-4 shrink-0 text-subtle" />
    </button>
  );
}
