"use client";

import { X } from "lucide-react";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

/**
 * Phone bottom sheet for the shell tools (unit picker, recent activity): serif title, 44px close button
 * and a body that scrolls inside max 80dvh.
 */
export function BottomSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" showCloseButton={false} className="max-h-[80dvh] gap-0 rounded-t-[26px] p-0">
        <SheetHeader className="relative shrink-0 pb-3 pl-5 pr-[72px] pt-5">
          <SheetTitle className="font-serif text-[26px] font-medium">{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
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
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-[calc(1rem+env(safe-area-inset-bottom))]">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
