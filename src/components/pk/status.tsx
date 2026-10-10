import { cn } from "@/lib/utils";
import { ORDER_STATUS, toneDot, toneSoftBg, toneText, type Tone } from "@/lib/status";
import type { OrderStatus } from "@/lib/types";

/** Small colored dot; `live` adds a soft ping for in-progress states. */
export function StatusDot({ tone, live, className }: { tone: Tone; live?: boolean; className?: string }) {
  return (
    <span className={cn("relative inline-flex size-[7px] shrink-0", className)}>
      {live && <span className={cn("absolute inset-0 rounded-full animate-ping-soft", toneDot[tone])} />}
      <span className={cn("relative inline-flex size-[7px] rounded-full", toneDot[tone])} />
    </span>
  );
}

/** Pill with dot — "• Ready to submit" style. */
export function TonePill({
  tone,
  children,
  live,
  className,
  solid = true,
}: {
  tone: Tone;
  children: React.ReactNode;
  live?: boolean;
  className?: string;
  solid?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-md px-2 text-[12.5px] font-medium text-ink",
        solid ? "bg-tile" : "bg-transparent px-0",
        className,
      )}
    >
      <StatusDot tone={tone} live={live} />
      {children}
    </span>
  );
}

export function OrderStatusPill({ status, className, solid }: { status: OrderStatus; className?: string; solid?: boolean }) {
  const m = ORDER_STATUS[status];
  return (
    <TonePill tone={m.tone} live={m.live} className={className} solid={solid}>
      {m.label}
    </TonePill>
  );
}

/** Colored text status (the blue "Ready to submit" text in tables). */
export function ToneText({ tone, children, className }: { tone: Tone; children: React.ReactNode; className?: string }) {
  return <span className={cn("text-[14px]", tone === "blue" ? "font-medium text-link" : tone === "slate" ? "text-subtle" : toneText[tone], className)}>{children}</span>;
}

/** Soft tinted badge for categories (incident type, photo kind). */
export function SoftBadge({ tone, children, className }: { tone: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex h-[22px] items-center gap-1 rounded-md px-2 text-[11.5px] font-semibold tracking-wide", toneSoftBg[tone], toneText[tone], className)}>
      {children}
    </span>
  );
}
