"use client";

import { useId, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { EASE } from "@/components/pk/motion";
import { RATING_LABELS, npsGroup } from "./lib";

const GOLD = "#f2a91e";

/* ───────────── read-only stars ───────────── */

/** Five stars with partial fill (4.6 → four and a half). Fills sweep in left → right on mount. */
export function Stars({
  value,
  size = 14,
  className,
  delay = 0,
  label,
}: {
  value: number;
  size?: number;
  className?: string;
  delay?: number;
  /** accessible label; defaults to "4.6 de 5 estrellas" */
  label?: string;
}) {
  const v = Math.max(0, Math.min(5, value));
  return (
    <span role="img" aria-label={label ?? `${v.toFixed(1)} de 5 estrellas`} className={cn("inline-flex items-center gap-[2px]", className)}>
      {Array.from({ length: 5 }).map((_, i) => {
        const fill = Math.max(0, Math.min(1, v - i));
        return (
          <span key={i} className="relative inline-flex" style={{ width: size, height: size }}>
            <Star className="absolute inset-0 fill-track text-track" style={{ width: size, height: size }} strokeWidth={1.5} />
            {fill > 0 && (
              <motion.span
                className="absolute inset-y-0 left-0 overflow-hidden"
                initial={{ width: 0 }}
                animate={{ width: `${fill * 100}%` }}
                transition={{ duration: 0.45, ease: EASE, delay: delay + i * 0.07 }}
              >
                <Star className="max-w-none" style={{ width: size, height: size, color: GOLD, fill: GOLD }} strokeWidth={1.5} />
              </motion.span>
            )}
          </span>
        );
      })}
    </span>
  );
}

/* ───────────── interactive stars ───────────── */

const SIZES = { lg: 44, md: 30, sm: 24 } as const;

/**
 * Tap/hover star input with a springy "pop" and a tiny sparkle burst on the chosen star.
 * Radio-group semantics so it works with the keyboard and screen readers.
 */
export function StarInput({
  value,
  onChange,
  size = "md",
  label,
  showLabel = false,
  className,
}: {
  value: number;
  onChange: (v: number) => void;
  size?: keyof typeof SIZES;
  label: string;
  showLabel?: boolean;
  className?: string;
}) {
  const [hover, setHover] = useState(0);
  const [burst, setBurst] = useState(0);
  const shown = hover || value;
  const px = SIZES[size];
  const pick = (v: number) => {
    onChange(v);
    setBurst((b) => b + 1);
  };
  return (
    <div className={cn("flex flex-col", size === "lg" ? "items-center" : "items-start", className)}>
      <div
        role="radiogroup"
        aria-label={label}
        className={cn("flex items-center", size === "lg" ? "gap-1.5 sm:gap-3" : "gap-1")}
        onMouseLeave={() => setHover(0)}
        onKeyDown={(e) => {
          const step = e.key === "ArrowRight" || e.key === "ArrowUp" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : 0;
          if (!step) return;
          e.preventDefault();
          const next = Math.max(1, Math.min(5, (value || (step > 0 ? 0 : 2)) + step));
          pick(next);
          e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next - 1]?.focus();
        }}
      >
        {Array.from({ length: 5 }).map((_, i) => {
          const n = i + 1;
          const on = n <= shown;
          const chosen = n === value;
          return (
            <motion.button
              key={n}
              type="button"
              role="radio"
              aria-checked={chosen}
              aria-label={`${n} de 5 · ${RATING_LABELS[i]}`}
              tabIndex={chosen || (!value && n === 1) ? 0 : -1}
              onMouseEnter={() => setHover(n)}
              onFocus={() => setHover(0)}
              onClick={() => pick(n)}
              whileHover={{ scale: 1.14, rotate: -4 }}
              whileTap={{ scale: 0.82 }}
              transition={{ type: "spring", stiffness: 520, damping: 18 }}
              className={cn(
                "relative inline-flex items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-sky",
                size === "lg" ? "size-[52px] sm:size-16" : size === "md" ? "size-11" : "size-10",
              )}
            >
              <motion.span
                key={chosen ? `pop-${burst}` : "idle"}
                initial={chosen ? { scale: 0.6, rotate: -18 } : false}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 420, damping: 12 }}
                className="inline-flex"
              >
                <Star
                  style={{ width: px, height: px, color: on ? GOLD : "#d5dbe3", fill: on ? GOLD : "transparent" }}
                  strokeWidth={size === "lg" ? 1.4 : 1.6}
                  className={cn("transition-[color,fill] duration-200", on && "drop-shadow-[0_6px_10px_rgb(242_169_30/0.35)]")}
                />
              </motion.span>
              {chosen && size !== "sm" && <SparkleBurst key={burst} big={size === "lg"} />}
            </motion.button>
          );
        })}
      </div>
      {showLabel && (
        <div className="relative mt-3 h-7 w-full overflow-hidden text-center">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.p
              key={shown}
              initial={{ y: 14, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -14, opacity: 0 }}
              transition={{ duration: 0.25, ease: EASE }}
              className={cn("font-serif text-[22px] italic leading-7", shown ? "text-ink" : "text-subtle")}
            >
              {shown ? RATING_LABELS[shown - 1] : "Toque una estrella"}
            </motion.p>
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

/** Little sparkle ring around a chosen star (one-shot). */
function SparkleBurst({ big }: { big: boolean }) {
  const n = big ? 8 : 6;
  const dist = big ? 38 : 24;
  return (
    <span aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center motion-reduce:hidden">
      {Array.from({ length: n }).map((_, i) => {
        const a = (i / n) * Math.PI * 2;
        return (
          <motion.span
            key={i}
            initial={{ x: 0, y: 0, scale: 0.4, opacity: 1 }}
            animate={{ x: Math.cos(a) * dist, y: Math.sin(a) * dist, scale: 1, opacity: 0 }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className={cn("absolute rounded-full", i % 2 ? "size-1.5 bg-sky" : "size-2 bg-[#ffd27a]")}
          />
        );
      })}
    </span>
  );
}

/* ───────────── NPS 0–10 ───────────── */

const NPS_ON = {
  detractor: "bg-red-soft text-red-fg ring-st-red/40",
  pasivo: "bg-amber-soft text-amber-fg ring-st-amber/50",
  promotor: "bg-teal-soft text-teal-fg ring-st-teal/40",
} as const;

/** "¿Qué tan probable es que nos recomiende?" chips 0–10. */
export function NpsPicker({ value, onChange, className }: { value: number | null; onChange: (v: number) => void; className?: string }) {
  const id = useId();
  return (
    <div className={className}>
      <div role="radiogroup" aria-labelledby={`${id}-l`} className="grid grid-cols-6 gap-2 sm:grid-cols-11 sm:gap-1.5">
        {Array.from({ length: 11 }).map((_, n) => {
          const on = value === n;
          return (
            <motion.button
              key={n}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={`${n} de 10`}
              onClick={() => onChange(n)}
              whileTap={{ scale: 0.88 }}
              animate={on ? { y: -3 } : { y: 0 }}
              transition={{ type: "spring", stiffness: 500, damping: 22 }}
              className={cn(
                "flex h-11 items-center justify-center rounded-[12px] text-[15px] font-semibold tabular ring-1 transition-colors",
                on ? cn(NPS_ON[npsGroup(n)], "ring-2 shadow-[0_8px_18px_-10px_rgb(2_58_99/0.45)]") : "bg-surface text-ink ring-input hover:bg-blue-wash",
              )}
            >
              {n}
            </motion.button>
          );
        })}
      </div>
      <div id={`${id}-l`} className="mt-2 flex justify-between text-[12px] text-subtle">
        <span>0 · Nada probable</span>
        <span>10 · Muy probable</span>
      </div>
    </div>
  );
}

const NPS_LABEL = { promotor: "Promotor", pasivo: "Pasivo", detractor: "Detractor" } as const;

/**
 * Compact NPS number with its color group. The group name is always in the accessible name and the
 * hover title; `showLabel` also prints it ("9 · Promotor") where touch users have no hover.
 */
export function NpsValue({ value, className, showLabel }: { value: number; className?: string; showLabel?: boolean }) {
  const g = npsGroup(value);
  const label = NPS_LABEL[g];
  return (
    <span
      role="img"
      aria-label={`${value} de 10, ${label.toLowerCase()}`}
      className={cn(
        "inline-flex h-6 min-w-7 items-center justify-center gap-1 rounded-md px-1.5 text-[12.5px] font-semibold tabular",
        g === "promotor" ? "bg-teal-soft text-teal-fg" : g === "pasivo" ? "bg-amber-soft text-amber-fg" : "bg-red-soft text-red-fg",
        className,
      )}
      title={label}
    >
      {value}
      {showLabel && <span className="font-medium">· {label}</span>}
    </span>
  );
}
