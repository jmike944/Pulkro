"use client";

import { motion } from "motion/react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { EASE } from "./motion";

export type TimelineStep = {
  id: string;
  title: React.ReactNode;
  detail?: React.ReactNode;
  when?: React.ReactNode;
  state: "done" | "current" | "upcoming" | "alert";
  icon?: React.ReactNode;
};

/** Vertical lifecycle timeline (claim-timeline style). */
export function Timeline({ steps, className }: { steps: TimelineStep[]; className?: string }) {
  return (
    <ol className={cn("relative", className)}>
      {steps.map((s, i) => {
        const last = i === steps.length - 1;
        return (
          <motion.li
            key={s.id}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.45, ease: EASE, delay: 0.08 * i }}
            className="relative flex gap-4 pb-7 last:pb-0"
          >
            {!last && (
              <span
                className={cn(
                  "absolute left-[17px] top-10 bottom-1 w-px",
                  s.state === "done" ? "bg-blue-mid" : "border-l border-dashed border-line-strong bg-transparent",
                )}
              />
            )}
            <span
              className={cn(
                "relative z-[1] inline-flex size-9 shrink-0 items-center justify-center rounded-[11px] [&_svg]:size-[17px]",
                s.state === "done" && "bg-blue-soft text-azure-fg",
                s.state === "current" && "bg-blue-mid text-azure-fg shadow-[0_0_0_4px_rgb(207_227_251/0.45)]",
                s.state === "upcoming" && "border border-dashed border-line-heavy bg-surface text-faint",
                s.state === "alert" && "bg-red-tint text-red-fg",
              )}
            >
              {s.icon ?? (s.state === "done" ? <Check strokeWidth={2.5} /> : <span className="size-2 rounded-full bg-current" />)}
            </span>
            <div className="min-w-0 flex-1 pt-1">
              <div className="flex items-baseline justify-between gap-4">
                <p className={cn("text-[15px] font-semibold", s.state === "upcoming" ? "text-subtle" : "text-ink")}>{s.title}</p>
                {s.when && (
                  <span className={cn("shrink-0 text-[13.5px] tabular", s.state === "current" ? "font-semibold text-link" : "text-subtle")}>{s.when}</span>
                )}
              </div>
              {s.detail && <div className="mt-1 text-[14px] leading-relaxed text-subtle">{s.detail}</div>}
            </div>
          </motion.li>
        );
      })}
    </ol>
  );
}
