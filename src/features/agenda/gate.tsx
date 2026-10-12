"use client";

import { cn } from "@/lib/utils";
import { ReasonTip } from "@/components/pk/reason-tip";

/**
 * Permission gate for actions: when `allowed` is false the (already disabled) child is wrapped
 * in a focusable span with a tooltip (tap bubble on touch) that says who can perform the action.
 */
export function Gate({
  allowed,
  reason,
  children,
  className,
}: {
  allowed: boolean;
  reason: string;
  children: React.ReactElement;
  className?: string;
}) {
  if (allowed) return children;
  return (
    <ReasonTip reason={reason} contentClassName="max-w-[260px] text-center leading-snug">
      <span tabIndex={0} role="button" aria-disabled="true" aria-label={reason} className={cn("inline-flex cursor-not-allowed rounded-[12px] outline-none focus-visible:ring-3 focus-visible:ring-ring/50", className)}>
        {children}
      </span>
    </ReasonTip>
  );
}
