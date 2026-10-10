"use client";

import { motion } from "motion/react";
import { cn } from "@/lib/utils";

/**
 * One squeegee pass across the parent (needs `relative overflow-hidden`): a glossy band with a
 * rubber-blade edge wipes left → right, leaving a few sparkles behind. Remount (key) to replay.
 */
export function SqueegeeWipe({ className, sparkles = true }: { className?: string; sparkles?: boolean }) {
  return (
    <span aria-hidden className={cn("pointer-events-none absolute inset-0 z-[3] overflow-hidden rounded-[inherit] motion-reduce:hidden", className)}>
      <motion.span
        initial={{ x: "-105%" }}
        animate={{ x: "105%" }}
        transition={{ duration: 1.05, ease: [0.65, 0, 0.35, 1] }}
        className="absolute inset-y-0 left-0 w-full"
      >
        <span className="absolute inset-y-0 right-[6px] w-2/3 bg-gradient-to-r from-transparent via-sky/15 to-white/80" />
        <span className="absolute inset-y-[-10%] right-0 w-[6px] rounded-full bg-brand/80 shadow-[0_0_18px_rgb(122_209_244/0.9)]" />
      </motion.span>
      {sparkles && <SparkleBurst delay={0.7} />}
    </span>
  );
}

const SPOTS = [
  { left: "14%", top: "28%", size: 12, d: 0 },
  { left: "38%", top: "68%", size: 9, d: 0.12 },
  { left: "62%", top: "22%", size: 14, d: 0.22 },
  { left: "84%", top: "58%", size: 10, d: 0.32 },
];

/** Four-point sparkles that pop in and fade. */
export function SparkleBurst({ delay = 0, className }: { delay?: number; className?: string }) {
  return (
    <span aria-hidden className={cn("pointer-events-none absolute inset-0 motion-reduce:hidden", className)}>
      {SPOTS.map((s, i) => (
        <motion.svg
          key={i}
          viewBox="0 0 24 24"
          className="absolute text-sky drop-shadow-[0_0_6px_rgb(122_209_244/0.8)]"
          style={{ left: s.left, top: s.top, width: s.size, height: s.size }}
          initial={{ scale: 0, opacity: 0, rotate: -30 }}
          animate={{ scale: [0, 1.15, 0], opacity: [0, 1, 0], rotate: 20 }}
          transition={{ duration: 1.1, delay: delay + s.d, ease: "easeOut" }}
        >
          <path d="M12 0 Q12 12 24 12 Q12 12 12 24 Q12 12 0 12 Q12 12 12 0Z" fill="currentColor" />
        </motion.svg>
      ))}
    </span>
  );
}

/** Static four-point sparkle glyph. */
export function SparkleGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn("size-3", className)}>
      <path d="M12 0 Q12 12 24 12 Q12 12 12 24 Q12 12 0 12 Q12 12 12 0Z" fill="currentColor" />
    </svg>
  );
}
