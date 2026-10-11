"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";

/** Friendly empty state with a soft bubble illustration. */
export function EmptyState({
  icon,
  title,
  children,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn("flex flex-col items-center justify-center rounded-[22px] border border-dashed border-line-strong px-6 py-12 text-center", className)}
    >
      <div className="relative mb-4">
        <span className="absolute -left-4 -top-2 size-4 rounded-full border border-sky/60 bg-sky-soft animate-float" />
        <span className="absolute -right-3 top-6 size-2.5 rounded-full border border-sky/60 bg-sky-soft animate-float [animation-delay:1.2s]" />
        <span className="inline-flex size-14 items-center justify-center rounded-[18px] bg-sky-soft text-azure-fg [&_svg]:size-6">{icon}</span>
      </div>
      <p className="font-serif text-[22px] text-ink">{title}</p>
      {children && <div className="mt-1.5 max-w-sm text-[14px] text-subtle">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </motion.div>
  );
}

/** Loading skeleton block. */
export function Shimmer({ className }: { className?: string }) {
  return <div className={cn("shimmer rounded-[14px]", className)} />;
}

// brand/teal as CSS variables so the navy spark stays visible on the dark theme (same values in light)
const SPARK_COLORS = ["#7ad1f4", "var(--brand)", "#b9c7ff", "#ffffff", "var(--st-teal)", "#cfe8fb"];

/**
 * One-shot celebration burst (soap bubbles + sparkles). Render <Celebrate trigger={n} /> and
 * increment `trigger` to fire — used when an order is closed or a report is sent.
 */
export function Celebrate({ trigger, className }: { trigger: number; className?: string }) {
  const [bursts, setBursts] = useState<number[]>([]);
  // A new trigger value adds a burst while rendering (adjusting state to a prop, not in an effect); the effect only removes it.
  const [seen, setSeen] = useState(trigger);
  if (trigger !== seen) {
    setSeen(trigger);
    if (trigger) setBursts((b) => [...b, trigger]);
  }
  useEffect(() => {
    if (!trigger) return;
    const t = setTimeout(() => setBursts((b) => b.filter((x) => x !== trigger)), 1800);
    return () => clearTimeout(t);
  }, [trigger]);
  return (
    <div aria-hidden className={cn("pointer-events-none fixed inset-0 z-[100] flex items-center justify-center motion-reduce:hidden", className)}>
      <AnimatePresence>
        {bursts.map((b) => (
          <div key={b} className="absolute">
            {Array.from({ length: 28 }).map((_, i) => {
              const angle = (i / 28) * Math.PI * 2;
              const dist = 120 + ((i * 37) % 140);
              const size = 6 + ((i * 13) % 16);
              const bubble = i % 3 === 0;
              return (
                <motion.span
                  key={i}
                  initial={{ x: 0, y: 0, scale: 0.2, opacity: 1 }}
                  animate={{ x: Math.cos(angle) * dist, y: Math.sin(angle) * dist - 40, scale: 1, opacity: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1] }}
                  className={cn("absolute rounded-full", bubble && "border border-white/90 bg-white/30 backdrop-blur-sm")}
                  style={{ width: size, height: size, background: bubble ? undefined : SPARK_COLORS[i % SPARK_COLORS.length] }}
                />
              );
            })}
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
}
