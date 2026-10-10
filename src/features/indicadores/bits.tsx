"use client";

import { motion } from "motion/react";
import { Minus, Star, TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtPct } from "@/lib/format";
import { CornerLink } from "@/components/pk/bits";

/** Title row for a white card: title + one-line subtitle + optional corner link. */
export function CardHead({
  title,
  subtitle,
  href,
  linkLabel,
  className,
  children,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  href?: string;
  linkLabel?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("mb-5 flex items-start justify-between gap-4", className)}>
      <div className="min-w-0">
        <h2 className="text-[19px] font-medium tracking-[-0.01em] text-ink">{title}</h2>
        {subtitle && <p className="mt-1 text-[13.5px] text-subtle">{subtitle}</p>}
      </div>
      {children}
      {href && <CornerLink href={href} label={linkLabel ?? "Ver detalle"} />}
    </div>
  );
}

/**
 * Change vs previous period. `inverse` = lower is better (hours over plan, complaints).
 * `null` delta → no comparable data.
 */
export function DeltaChip({
  delta,
  inverse,
  tolerance = 0.005,
  className,
  label,
}: {
  delta: number | null;
  inverse?: boolean;
  /** |delta| below this reads as neutral (gray) */
  tolerance?: number;
  className?: string;
  label?: string;
}) {
  if (delta === null || !Number.isFinite(delta)) {
    return <span className={cn("inline-flex h-7 items-center rounded-[8px] bg-[#f2f4f7] px-2 text-[12.5px] font-medium text-subtle", className)}>{label ?? "Sin comparativo"}</span>;
  }
  const zero = Math.abs(delta) < 0.005;
  const neutral = Math.abs(delta) < tolerance;
  const good = neutral ? null : inverse ? delta < 0 : delta > 0;
  const Icon = zero ? Minus : delta > 0 ? TrendingUp : TrendingDown;
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-[8px] px-2 text-[13px] font-semibold tabular",
        good === null ? "bg-[#f2f4f7] text-subtle" : good ? "bg-[#e6f0fd] text-[#1667e0]" : "bg-[#fdeeee] text-st-red",
        className,
      )}
    >
      <Icon className="size-4" />
      {zero ? "0%" : `${delta > 0 ? "+" : "−"}${fmtPct(Math.abs(delta), Math.abs(delta) < 0.1 ? 1 : 0)}`}
      {label && <span className="font-medium opacity-80">{label}</span>}
    </span>
  );
}

/** Five stars filled to a 1–5 average (partial last star). */
export function Stars({ value, size = 16, className }: { value: number; size?: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)} role="img" aria-label={`${value.toFixed(1)} de 5 estrellas`}>
      {[0, 1, 2, 3, 4].map((i) => {
        const fill = Math.max(0, Math.min(1, value - i));
        return (
          <span key={i} className="relative inline-flex" style={{ width: size, height: size }}>
            <Star className="absolute inset-0 text-[#dfe5ee]" style={{ width: size, height: size }} fill="currentColor" strokeWidth={0} />
            <motion.span
              initial={{ width: 0 }}
              animate={{ width: `${fill * 100}%` }}
              transition={{ duration: 0.5, delay: 0.3 + i * 0.08 }}
              className="absolute inset-y-0 left-0 overflow-hidden"
            >
              <Star className="text-[#f0a020]" style={{ width: size, height: size }} fill="currentColor" strokeWidth={0} />
            </motion.span>
          </span>
        );
      })}
    </span>
  );
}

/** Thin labelled meter used for sub-scores. */
export function ScoreLine({ label, value, max = 5, delay = 0 }: { label: string; value: number; max?: number; delay?: number }) {
  return (
    <div className="grid grid-cols-[96px_minmax(0,1fr)_36px] items-center gap-3">
      <span className="truncate text-[13.5px] text-subtle">{label}</span>
      <span className="h-[6px] overflow-hidden rounded-full bg-[#eef1f5]">
        <motion.span
          initial={{ width: 0 }}
          animate={{ width: `${Math.max(0, Math.min(1, value / max)) * 100}%` }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.2 + delay }}
          className="block h-full rounded-full bg-[#1667e0]"
        />
      </span>
      <span className="text-right text-[13.5px] font-semibold text-ink tabular">{value ? value.toFixed(1) : "—"}</span>
    </div>
  );
}
