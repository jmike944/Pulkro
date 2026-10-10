"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";

export type PillDatum = { label: string; value: number; key?: string };

/**
 * Rounded "pill" column chart from the reference hero (white highlighted bar + translucent frosted rest).
 * Designed to sit on an AuroraPanel. Bars grow from the baseline with a staggered spring.
 */
export function PillBars({
  data,
  highlight = data.length - 1,
  format = (v) => String(v),
  className,
  height = 220,
  onSelect,
}: {
  data: PillDatum[];
  highlight?: number;
  format?: (v: number) => string;
  className?: string;
  height?: number;
  onSelect?: (index: number) => void;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const active = hover ?? highlight;
  return (
    <div className={cn("flex w-full flex-col", className)}>
      <div className="flex items-end justify-between gap-[clamp(6px,1.4vw,16px)]" style={{ height }}>
        {data.map((d, i) => {
          const h = Math.max(0.16, d.value / max);
          const isActive = i === active;
          const isHighlight = i === highlight;
          return (
            <button
              key={d.key ?? d.label}
              type="button"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              onClick={() => onSelect?.(i)}
              className="group relative flex h-full flex-1 flex-col items-center justify-end outline-none"
              aria-label={`${d.label}: ${format(d.value)}`}
            >
              <AnimatePresence>
                {isActive && (
                  <motion.span
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 4 }}
                    transition={{ duration: 0.2 }}
                    className="pointer-events-none absolute z-10 whitespace-nowrap text-[13px] font-semibold text-ink tabular"
                    style={{ bottom: `calc(${h * 100}% + 8px)` }}
                  >
                    {format(d.value)}
                  </motion.span>
                )}
              </AnimatePresence>
              <motion.span
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: `${h * 100}%`, opacity: 1 }}
                transition={{ type: "spring", stiffness: 120, damping: 18, delay: 0.15 + i * 0.05 }}
                className={cn(
                  "relative block w-full max-w-[46px] rounded-full backdrop-blur-[14px] transition-[background,box-shadow] duration-300",
                  isHighlight
                    ? "bg-white shadow-[0_10px_30px_-8px_rgb(2_58_99/0.45),inset_0_-6px_12px_rgb(122_209_244/0.25)]"
                    : isActive
                      ? "bg-white/80 shadow-[0_8px_20px_-10px_rgb(2_58_99/0.35)]"
                      : "bg-white/40 shadow-[inset_0_1px_0_rgb(255_255_255/0.7)] group-hover:bg-white/60",
                )}
              />
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex justify-between gap-[clamp(6px,1.4vw,16px)]">
        {data.map((d, i) => (
          <span
            key={d.key ?? d.label}
            className={cn("flex-1 text-center text-[12px] transition-colors", i === active ? "font-medium text-ink" : "text-ink/55")}
          >
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Vertical "capsule" meters used in the pipeline funnel (Recovery page): a tall translucent
 * capsule with a solid white fill rising to the value.
 */
export function CapsuleMeter({ value, max, delay = 0, className }: { value: number; max: number; delay?: number; className?: string }) {
  const pct = Math.max(0.12, Math.min(1, max ? value / max : 0));
  return (
    <div className={cn("relative h-[200px] w-[64px] overflow-hidden rounded-full bg-white/35 backdrop-blur-[14px] shadow-[inset_0_1px_0_rgb(255_255_255/0.8)]", className)}>
      <motion.div
        initial={{ height: 0 }}
        animate={{ height: `${pct * 100}%` }}
        transition={{ type: "spring", stiffness: 90, damping: 18, delay }}
        className="absolute inset-x-0 bottom-0 rounded-full bg-white shadow-[0_-8px_24px_-6px_rgb(255_255_255/0.9),0_10px_24px_-10px_rgb(2_58_99/0.35)]"
      />
    </div>
  );
}
