"use client";

import { motion } from "motion/react";
import { cn } from "@/lib/utils";

/** Squeegee glyph (rubber blade + handle) used to "wipe" progress bars clean. */
export function SqueegeeGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn("size-6", className)}>
      {/* brand-ink is the navy in light and a pale navy tint in dark, so the blade stays visible on the dark track */}
      <path d="M13 12 L3.5 5.5" className="stroke-brand-ink" strokeWidth="2.6" strokeLinecap="round" />
      <rect x="12" y="2.5" width="5" height="19" rx="2.2" className="fill-brand-ink" />
      <rect x="16" y="3.5" width="2.2" height="17" rx="1.1" className="fill-sky" />
    </svg>
  );
}

/**
 * Progress track that a squeegee wipes clean as it advances; soap bubbles trail behind the blade.
 * `value` 0..1. `indeterminate` adds a soft shimmer while the PDF is being composed.
 */
export function SqueegeeProgress({ value, indeterminate, className }: { value: number; indeterminate?: boolean; className?: string }) {
  const pct = Math.max(0.04, Math.min(1, value)) * 100;
  return (
    <div className={cn("relative h-3 rounded-full bg-well shadow-[inset_0_1px_2px_rgb(16_24_40/0.06)]", className)} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
      <motion.div
        className="absolute inset-y-0 left-0 rounded-full bg-[linear-gradient(90deg,#bfe7fb,var(--sky)_45%,var(--azure))]"
        initial={{ width: "4%" }}
        animate={{ width: `${pct}%` }}
        transition={{ type: "spring", stiffness: 70, damping: 18 }}
      >
        {indeterminate && <span className="absolute inset-0 overflow-hidden rounded-full"><span className="shimmer absolute inset-0 opacity-40 mix-blend-overlay" /></span>}
        <span className="absolute -right-3 top-1/2 -translate-y-1/2">
          <SqueegeeGlyph className="size-7 drop-shadow-[0_2px_4px_rgb(2_58_99/0.35)]" />
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              aria-hidden
              className="absolute rounded-full border border-sky/70 bg-white/70 motion-reduce:hidden"
              style={{ width: 6 + i * 2, height: 6 + i * 2, right: 22 + i * 9, top: 4 }}
              animate={{ y: [0, -14 - i * 4], opacity: [0, 0.9, 0], scale: [0.6, 1, 0.8] }}
              transition={{ duration: 1.4 + i * 0.3, repeat: Infinity, delay: i * 0.35, ease: "easeOut" }}
            />
          ))}
        </span>
      </motion.div>
    </div>
  );
}

const SPOTS = [
  { left: "12%", top: "22%", size: 14, d: 0 },
  { left: "36%", top: "64%", size: 10, d: 0.1 },
  { left: "58%", top: "18%", size: 16, d: 0.18 },
  { left: "80%", top: "52%", size: 11, d: 0.28 },
  { left: "92%", top: "16%", size: 8, d: 0.36 },
];

/** Four-point sparkles that pop and fade once. Remount (key) to replay. */
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
          animate={{ scale: [0, 1.15, 0], opacity: [0, 1, 0], rotate: 25 }}
          transition={{ duration: 1.1, delay: delay + s.d, ease: "easeOut" }}
        >
          <path d="M12 0 Q12 12 24 12 Q12 12 12 24 Q12 12 0 12 Q12 12 12 0Z" fill="currentColor" />
        </motion.svg>
      ))}
    </span>
  );
}

/** One squeegee pass across a surface (parent must be `relative overflow-hidden`). */
export function SqueegeeSweep({ delay = 0, className }: { delay?: number; className?: string }) {
  return (
    <span aria-hidden className={cn("pointer-events-none absolute inset-0 z-[5] overflow-hidden rounded-[inherit] motion-reduce:hidden", className)}>
      <motion.span
        initial={{ x: "-105%" }}
        animate={{ x: "105%" }}
        transition={{ duration: 1.15, delay, ease: [0.65, 0, 0.35, 1] }}
        className="absolute inset-y-0 left-0 w-full"
      >
        <span className="absolute inset-y-0 right-[8px] w-2/3 bg-gradient-to-r from-transparent via-sky/15 to-white/85" />
        <span className="absolute inset-y-[-6%] right-0 w-[7px] rounded-full bg-brand/85 shadow-[0_0_22px_rgb(122_209_244/0.95)]" />
      </motion.span>
      <SparkleBurst delay={delay + 0.75} />
    </span>
  );
}
