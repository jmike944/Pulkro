"use client";

import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { EASE } from "./motion";

/**
 * The signature aurora panel (lavender → sky → Pulkro blue) with paper grain and drifting soap bubbles.
 * Use for the ONE hero KPI block per page.
 */
export function AuroraPanel({
  className,
  children,
  bubbles = true,
}: {
  className?: string;
  children: React.ReactNode;
  bubbles?: boolean;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 16, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.7, ease: EASE }}
      className={cn("bg-aurora grain relative overflow-hidden rounded-[28px] animate-aurora", className)}
    >
      {bubbles && <Bubbles />}
      <div className="relative z-[2]">{children}</div>
    </motion.section>
  );
}

/** Frosted card that sits inside an AuroraPanel. */
export function GlassCard({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("glass-card rounded-[22px]", className)}>{children}</div>;
}

/** Card wrapped in a soft aurora frame (the claim-detail "Ready to submit" card). */
export function AuroraFrame({ className, innerClassName, children }: { className?: string; innerClassName?: string; children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: EASE, delay: 0.1 }}
      className={cn("bg-aurora-frame grain rounded-[28px] p-2.5 shadow-lift", className)}
    >
      <div className={cn("relative z-[2] rounded-[22px] bg-white p-6 shadow-[0_1px_0_rgb(255_255_255)_inset]", innerClassName)}>{children}</div>
    </motion.div>
  );
}

const BUBBLES = [
  { left: "62%", size: 46, delay: 0, dur: 13 },
  { left: "74%", size: 18, delay: 2.5, dur: 10 },
  { left: "86%", size: 30, delay: 5, dur: 15 },
  { left: "54%", size: 12, delay: 7, dur: 9 },
  { left: "93%", size: 14, delay: 1.2, dur: 11 },
  { left: "45%", size: 22, delay: 9, dur: 14 },
];

/** Soap bubbles rising slowly — a quiet nod to the cleaning trade. */
export function Bubbles({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-0 z-[1] overflow-hidden motion-reduce:hidden", className)}>
      {BUBBLES.map((b, i) => (
        <motion.span
          key={i}
          className="absolute bottom-[-60px] rounded-full border border-white/70 bg-[radial-gradient(circle_at_30%_30%,rgb(255_255_255/0.95),rgb(255_255_255/0.15)_35%,rgb(122_209_244/0.12)_70%,rgb(255_255_255/0.4))] shadow-[inset_-2px_-3px_6px_rgb(124_92_252/0.15)]"
          style={{ left: b.left, width: b.size, height: b.size }}
          animate={{ y: [0, -520], x: [0, i % 2 ? 18 : -14, 0], opacity: [0, 0.9, 0.9, 0] }}
          transition={{ duration: b.dur, delay: b.delay, repeat: Infinity, ease: "easeInOut", times: [0, 0.15, 0.85, 1] }}
        />
      ))}
    </div>
  );
}
