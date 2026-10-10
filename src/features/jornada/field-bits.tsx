"use client";

import { memo } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { d } from "@/lib/format";
import { GeoMap } from "@/components/pk/geo-map";
import { ReasonTip } from "@/components/pk/reason-tip";

/* ───────────── formatting helpers local to the field screen ───────────── */

/** "vie 10 oct" */
export const fmtShortDay = (iso: string | Date) => format(d(iso), "EEE d MMM", { locale: es }).replace(/\./g, "");
/** "07:06:12" */
export const fmtClock = (iso: string | Date) => format(d(iso), "HH:mm:ss");
/** 42 → "42 m", 1240 → "1.2 km" */
export const fmtDistance = (m: number) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`);

/** Max distance (m) from the site before a GPS stamp needs a justification. */
export const MAX_SITE_DISTANCE = 300;

/**
 * GeoMap that only re-renders when its (memoized) props change, so unrelated store updates
 * (sync queue ticks, typing in a form) don't refit the map the user may have panned.
 */
export const StableMap = memo(GeoMap);

/* ───────────── permission gate ───────────── */

/**
 * Wraps a (disabled) control with a tooltip (tap bubble on touch) that explains why it is unavailable and who can do it.
 * Renders the child untouched when `reason` is empty.
 */
export function Gate({
  reason,
  children,
  className,
  side = "top",
}: {
  reason?: string | null;
  children: React.ReactNode;
  className?: string;
  side?: "top" | "bottom" | "left" | "right";
}) {
  if (!reason) return <>{children}</>;
  return (
    <ReasonTip reason={reason} side={side} contentClassName="max-w-[260px] text-[12.5px] leading-snug">
      <span tabIndex={0} aria-label={reason} className={cn("inline-flex cursor-not-allowed rounded-[12px] outline-none focus-visible:ring-3 focus-visible:ring-ring/50", className)}>
        {children}
      </span>
    </ReasonTip>
  );
}

/* ───────────── section title (matches SectionHeader typography, with an inline addon) ───────────── */

export function FieldSectionTitle({
  title,
  addon,
  subtitle,
  action,
  className,
}: {
  title: React.ReactNode;
  addon?: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-4 flex items-start justify-between gap-4", className)}>
      <div className="min-w-0">
        <h2 className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[19px] font-medium tracking-[-0.01em] text-ink">
          {title}
          {addon}
        </h2>
        {subtitle && <p className="mt-1 text-[13.5px] leading-relaxed text-subtle">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/** Quick-pick chip used for areas, reasons and note templates. */
export function Chip({
  active,
  onClick,
  children,
  hint,
  className,
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  hint?: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-[13.5px] transition active:scale-[0.97]",
        active ? "border-brand-deep bg-brand-deep font-medium text-white" : "border-hairline bg-white text-ink hover:border-[#d5dbe3] hover:bg-[#f7f9fb]",
        className,
      )}
    >
      {children}
      {hint && <span className={cn("text-[11.5px] font-semibold", active ? "text-sky" : "text-[#b86e00]")}>{hint}</span>}
    </button>
  );
}
