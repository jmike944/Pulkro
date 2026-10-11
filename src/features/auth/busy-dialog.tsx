"use client";

import { Dialog as DialogPrimitive } from "radix-ui";
import { Loader2 } from "lucide-react";
import { DialogContent } from "@/components/ui/dialog";
import { MODAL_SCRIM } from "@/components/pk/modal-shell";

/**
 * Blocking "working on it" dialog for steps that must not be interrupted (signing out and wiping the device): no close
 * button, Esc and outside taps do nothing, the page behind is inert and the focus stays inside until it closes.
 */
export function BusyDialog({ open, title, description }: { open: boolean; title: string; description: string }) {
  return (
    <DialogPrimitive.Root open={open}>
      <DialogContent
        showCloseButton={false}
        overlayClassName={MODAL_SCRIM}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        aria-busy="true"
        className="flex flex-col items-center gap-3 rounded-[28px] bg-surface px-7 py-8 text-center text-ink shadow-lift ring-1 ring-edge sm:max-w-[400px]"
      >
        <Loader2 className="size-8 animate-spin text-subtle" aria-hidden />
        <DialogPrimitive.Title className="font-serif text-[24px] font-medium leading-tight text-ink">{title}</DialogPrimitive.Title>
        <DialogPrimitive.Description className="text-[14.5px] leading-relaxed text-subtle">{description}</DialogPrimitive.Description>
      </DialogContent>
    </DialogPrimitive.Root>
  );
}
