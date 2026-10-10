"use client";

import { useState } from "react";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMediaQuery } from "@/lib/hooks";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type Side = "top" | "right" | "bottom" | "left";

/**
 * "Why is this blocked / who can do it" bubble that works on every input.
 * `children` is the trigger element itself (usually the focusable wrapper span around a disabled
 * control): hover devices keep the Radix tooltip; touch devices (`hover: none`) open a small
 * popover when the trigger is tapped, dismissed by tapping elsewhere.
 * Disabled buttons swallow pointer events, so give the wrapper the tap — on touch its children
 * are made pass-through (`pointer-events-none`) so the tap always lands on it.
 * Renders `children` untouched when `reason` is empty. `icon` is the glyph of the touch bubble
 * (a lock by default; `null` for none).
 */
export function ReasonTip({
  reason,
  side = "top",
  children,
  contentClassName,
  icon,
}: {
  reason?: React.ReactNode;
  side?: Side;
  children: React.ReactElement;
  contentClassName?: string;
  icon?: React.ReactNode;
}) {
  const touch = useMediaQuery("(hover: none)");
  if (!reason) return children;
  if (touch)
    return (
      <TapReason reason={reason} side={side} contentClassName={contentClassName} icon={icon}>
        {children}
      </TapReason>
    );
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side} className={contentClassName}>
        {reason}
      </TooltipContent>
    </Tooltip>
  );
}

function TapReason({
  reason,
  side,
  children,
  contentClassName,
  icon,
}: {
  reason: React.ReactNode;
  side: Side;
  children: React.ReactElement;
  contentClassName?: string;
  icon?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        asChild
        role="button"
        tabIndex={0}
        // the child's own aria-label wins; otherwise the reason is the accessible name
        aria-label={typeof reason === "string" ? reason : undefined}
        // iOS only dispatches click on elements that look clickable
        style={{ cursor: "pointer" }}
        className="[&>*]:pointer-events-none"
        onKeyDown={(e) => {
          if (e.key !== "Enter" && e.key !== " ") return;
          e.preventDefault();
          setOpen((o) => !o);
        }}
      >
        {children}
      </PopoverTrigger>
      {/* side bubbles don't fit on a phone: fall back to above the control */}
      <PopoverContent
        side={side === "left" || side === "right" ? "top" : side}
        sideOffset={8}
        collisionPadding={12}
        className={cn(
          "w-fit max-w-[min(280px,calc(100vw-24px))] flex-row items-start gap-2 rounded-[12px] border-0 bg-foreground px-3 py-2.5 leading-snug text-background shadow-lift ring-0 dark:bg-well dark:text-ink dark:ring-1 dark:ring-edge-strong",
          contentClassName,
          "text-[13.5px]",
        )}
      >
        {icon === undefined ? <Lock className="mt-0.5 size-3.5 shrink-0 opacity-70" /> : icon}
        <span className="min-w-0">{reason}</span>
      </PopoverContent>
    </Popover>
  );
}
