"use client";

import { X } from "lucide-react";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { MODAL_SCRIM } from "@/components/pk/mobile";

/**
 * Phone bottom sheet for the shell tools (unit picker, recent activity): serif title, 44px close button
 * and a body that scrolls inside max 80dvh. Same chrome as the phone variant of `ModalShell` (28px corners,
 * token scrim, safe-area bottom); use `ModalShell` for anything with a form or a footer.
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
      <SheetContent
        side="bottom"
        showCloseButton={false}
        overlayClassName={MODAL_SCRIM}
        className="max-h-[80dvh] gap-0 rounded-t-[28px] bg-surface p-0 text-ink data-[side=bottom]:border-t-0"
      >
        <SheetHeader className="relative shrink-0 pb-3 pl-5 pr-[68px] pt-6">
          <SheetTitle className="font-serif text-[26px] font-medium leading-[1.15] tracking-[-0.01em] text-ink">{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
          <SheetClose asChild>
            <button
              type="button"
              aria-label="Cerrar"
              className="absolute right-3 top-3 inline-flex size-11 items-center justify-center rounded-full bg-sand text-ink outline-none transition hover:bg-sand-deep focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-95"
            >
              <X className="size-[18px]" aria-hidden />
            </button>
          </SheetClose>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-[calc(1rem+env(safe-area-inset-bottom))]">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
