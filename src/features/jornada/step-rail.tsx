"use client";

import { motion } from "motion/react";
import { Camera, Check, LogIn, LogOut, Sparkles, SprayCan, TriangleAlert, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FieldStep, StepId } from "./use-field-state";

const ICONS: Record<StepId, LucideIcon> = {
  entrada: LogIn,
  antes: Camera,
  ejecucion: SprayCan,
  salida: LogOut,
  despues: Sparkles,
};

/** Where each step lives on the page (tap a node to jump there). */
export const STEP_TARGET: Record<StepId, string> = {
  entrada: "jornada-hero",
  antes: "fotos-antes",
  ejecucion: "incidencias",
  salida: "jornada-hero",
  despues: "fotos-despues",
};

export function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

/**
 * Five-step field flow (doc §3, pasos 5–9): Entrada → ANTES → Ejecución → Salida → DESPUÉS.
 * The navy track fills with a spring up to the current step; done nodes pop a check.
 */
export function StepRail({ steps, current, className }: { steps: FieldStep[]; current: number; className?: string }) {
  const n = steps.length;
  const frac = Math.min(1, current / (n - 1));
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <nav aria-label="Avance de la jornada" className={cn("rounded-[22px] border border-hairline bg-surface px-2 pb-3.5 pt-4 shadow-soft sm:px-4", className)}>
      <div className="mb-3 flex items-center justify-between px-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-subtle">
        <span>Avance de la jornada</span>
        <span className="tabular text-ink">
          {doneCount}/{n}
        </span>
      </div>
      <div className="relative">
        {/* track */}
        <div className="absolute left-[10%] right-[10%] top-[19px] h-[3px] rounded-full bg-press" />
        <motion.div
          className="absolute left-[10%] top-[19px] h-[3px] rounded-full bg-gradient-to-r from-brand-deep via-azure to-sky"
          initial={{ width: 0 }}
          animate={{ width: `${frac * 80}%` }}
          transition={{ type: "spring", stiffness: 90, damping: 16, mass: 0.9, delay: 0.15 }}
        />
        <ol className="relative grid grid-cols-5">
          {steps.map((s, i) => {
            const Icon = s.alert && !s.done ? TriangleAlert : ICONS[s.id];
            const isCurrent = i === current;
            return (
              <li key={s.id} className="flex min-w-0 flex-col items-center">
                <button
                  type="button"
                  onClick={() => scrollToSection(STEP_TARGET[s.id])}
                  aria-label={`${s.label}: ${s.done ? "completado" : isCurrent ? "paso actual" : "pendiente"}`}
                  aria-current={isCurrent ? "step" : undefined}
                  className="group flex min-h-[44px] w-full flex-col items-center rounded-[14px] px-0.5 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <span className="relative inline-flex size-[40px] items-center justify-center">
                    {isCurrent && <span className={cn("absolute inset-0 rounded-full animate-ping-soft", s.alert ? "bg-st-red/30" : "bg-sky/50")} />}
                    <motion.span
                      key={s.done ? "done" : "todo"}
                      initial={s.done ? { scale: 0.4, rotate: -30 } : false}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{ type: "spring", stiffness: 520, damping: 18, delay: 0.1 + i * 0.06 }}
                      className={cn(
                        "relative inline-flex size-[40px] items-center justify-center rounded-full transition-colors [&_svg]:size-[18px]",
                        s.done && "bg-brand-deep text-white shadow-[0_6px_16px_-6px_rgb(7_36_63/0.6)]",
                        !s.done && isCurrent && !s.alert && "bg-surface text-azure-fg ring-2 ring-azure",
                        !s.done && isCurrent && s.alert && "bg-red-soft text-red-fg ring-2 ring-st-red",
                        !s.done && !isCurrent && (s.alert ? "bg-red-soft text-red-fg" : "border-2 border-dashed border-line-strong bg-surface text-faint"),
                        "group-hover:scale-105",
                      )}
                    >
                      {s.done ? <Check strokeWidth={3} /> : <Icon />}
                    </motion.span>
                  </span>
                  <span className={cn("mt-2 line-clamp-2 text-center text-[11.5px] font-semibold leading-tight sm:text-[12.5px]", s.done || isCurrent ? "text-ink" : "text-subtle")}>
                    {s.label}
                  </span>
                  <span className={cn("mt-0.5 hidden text-center text-[11px] leading-tight min-[400px]:block", s.alert && !s.done ? "font-medium text-red-fg" : "text-subtle")}>{s.sub}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </nav>
  );
}
