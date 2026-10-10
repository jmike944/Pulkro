"use client";

import { LayoutGroup, motion } from "motion/react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { EASE } from "@/components/pk/motion";
import { STEPS } from "./draft";

const spring = { type: "spring", stiffness: 460, damping: 36 } as const;

/**
 * Animated stepper. Desktop: numbered chips joined by filling rails, a shared white pill
 * slides under the active step. Phone: compact "Paso 2 de 4" with segmented progress.
 */
export function Stepper({
  current,
  done,
  reachable,
  onSelect,
}: {
  current: number;
  /** steps already valid */
  done: boolean[];
  /** can jump to step i */
  reachable: (i: number) => boolean;
  onSelect: (i: number) => void;
}) {
  return (
    <LayoutGroup id="new-order-stepper">
      {/* phone */}
      <div className="sm:hidden">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-subtle">
            Paso {current + 1} de {STEPS.length}
          </p>
          <motion.p key={current} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="truncate text-[14.5px] font-semibold text-ink">
            {STEPS[current].label}
          </motion.p>
        </div>
        <div className="mt-2.5 grid grid-cols-4 gap-1.5" role="tablist" aria-label="Pasos">
          {STEPS.map((s, i) => (
            <button
              key={s.key}
              type="button"
              role="tab"
              aria-selected={i === current}
              aria-label={`${s.label}${done[i] ? " (completo)" : ""}`}
              disabled={!reachable(i)}
              onClick={() => onSelect(i)}
              className="relative h-10 disabled:cursor-not-allowed"
            >
              <span className="absolute inset-x-0 top-1/2 h-[6px] -translate-y-1/2 overflow-hidden rounded-full bg-[#e9edf2]">
                <motion.span
                  className="absolute inset-y-0 left-0 rounded-full bg-[#1667e0]"
                  initial={false}
                  animate={{ width: i < current || done[i] ? "100%" : i === current ? "45%" : "0%" }}
                  transition={{ duration: 0.5, ease: EASE }}
                />
              </span>
              {i === current && (
                <motion.span layoutId="step-glow-m" className="absolute inset-x-0 top-1/2 h-[14px] -translate-y-1/2 rounded-full bg-sky/25 blur-[6px]" transition={spring} />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* tablet / desktop */}
      <ol className="hidden items-center gap-2 rounded-[20px] border border-hairline bg-[#fbfcfd] p-1.5 sm:flex" aria-label="Pasos">
        {STEPS.map((s, i) => {
          const active = i === current;
          const complete = done[i] && !active;
          const can = reachable(i);
          return (
            <li key={s.key} className="flex min-w-0 flex-1 items-center gap-2">
              <button
                type="button"
                onClick={() => onSelect(i)}
                disabled={!can}
                aria-current={active ? "step" : undefined}
                className={cn(
                  "relative flex h-12 min-w-0 flex-1 items-center gap-2.5 rounded-[15px] px-2.5 text-left outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed",
                  !active && can && "hover:bg-white/80",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="step-pill"
                    className="absolute inset-0 rounded-[15px] bg-white shadow-[0_1px_2px_rgb(16_24_40/0.06),0_10px_24px_-14px_rgb(2_58_99/0.35)] ring-1 ring-[#e3eaf3]"
                    transition={spring}
                  />
                )}
                <span
                  className={cn(
                    "relative inline-flex size-7 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold tabular transition-colors duration-300",
                    active ? "bg-brand-deep text-white" : complete ? "bg-[#1667e0] text-white" : "bg-[#eef1f5] text-subtle",
                  )}
                >
                  {complete ? (
                    <motion.span initial={{ scale: 0, rotate: -40 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 520, damping: 22 }}>
                      <Check className="size-4" strokeWidth={3} />
                    </motion.span>
                  ) : (
                    i + 1
                  )}
                </span>
                <span className="relative min-w-0">
                  <span className={cn("block truncate text-[14px]", active ? "font-semibold text-ink" : complete ? "font-medium text-ink" : "text-subtle")}>
                    <span className="min-[1400px]:hidden">{s.short}</span>
                    <span className="hidden min-[1400px]:inline">{s.label}</span>
                  </span>
                </span>
              </button>
              {i < STEPS.length - 1 && (
                <span aria-hidden className="relative hidden h-[3px] w-8 shrink-0 overflow-hidden rounded-full bg-[#e5e9ef] xl:block 2xl:w-10">
                  <motion.span
                    className="absolute inset-y-0 left-0 rounded-full bg-[#1667e0]"
                    initial={false}
                    animate={{ width: i < current ? "100%" : "0%" }}
                    transition={{ duration: 0.5, ease: EASE }}
                  />
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </LayoutGroup>
  );
}
