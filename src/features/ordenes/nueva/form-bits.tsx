"use client";

import { AnimatePresence, motion } from "motion/react";
import {
  Brush,
  CircleAlert,
  CookingPot,
  Factory,
  HardHat,
  Info,
  Minus,
  Plus,
  Sofa,
  Sparkles,
  SprayCan,
  TriangleAlert,
  AppWindow,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { EASE } from "@/components/pk/motion";

/* ───────────── service identity ───────────── */

const SERVICE_ICONS: Record<string, LucideIcon> = {
  st_prof: Sparkles,
  st_ind: Factory,
  st_pis: Brush,
  st_vid: AppWindow,
  st_obr: HardHat,
  st_san: SprayCan,
  st_alf: Sofa,
  st_coc: CookingPot,
};

export function ServiceIcon({ id, hue, size = 40, className }: { id: string; hue: number; size?: number; className?: string }) {
  const Icon = SERVICE_ICONS[id] ?? Sparkles;
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center rounded-[12px] ring-1 ring-black/5", className)}
      style={{
        width: size,
        height: size,
        background: `linear-gradient(140deg, oklch(0.97 0.025 ${hue}), oklch(0.91 0.06 ${hue}))`,
        color: `oklch(0.42 0.12 ${hue})`,
      }}
    >
      <Icon style={{ width: size * 0.46, height: size * 0.46 }} strokeWidth={1.8} />
    </span>
  );
}

/* ───────────── section + field chrome ───────────── */

export function FormSection({
  title,
  description,
  aside,
  children,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("border-b border-hairline py-7 first:pt-1 last:border-b-0", className)}>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-[19px] font-medium tracking-[-0.01em] text-ink">{title}</h2>
          {description && <p className="mt-1 text-[13.5px] leading-relaxed text-subtle">{description}</p>}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function FieldLabel({ htmlFor, children, optional }: { htmlFor?: string; children: React.ReactNode; optional?: boolean }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 flex items-center gap-2 text-[13.5px] font-medium text-ink">
      {children}
      {optional && <span className="text-[12px] font-normal text-subtle">Opcional</span>}
    </label>
  );
}

/** Inline message under a field. Errors are red, warnings amber, hints gray. */
export function FieldMessage({ error, warning, hint, id }: { error?: string; warning?: string; hint?: React.ReactNode; id?: string }) {
  const kind = error ? "error" : warning ? "warning" : hint ? "hint" : null;
  return (
    <AnimatePresence initial={false} mode="wait">
      {kind && (
        <motion.p
          key={`${kind}-${error ?? warning ?? ""}`}
          id={id}
          role={kind === "error" ? "alert" : undefined}
          initial={{ opacity: 0, y: -4, height: 0 }}
          animate={{ opacity: 1, y: 0, height: "auto" }}
          exit={{ opacity: 0, y: -4, height: 0 }}
          transition={{ duration: 0.22, ease: EASE }}
          className={cn(
            "flex items-start gap-1.5 overflow-hidden pt-1.5 text-[12.5px] leading-snug",
            kind === "error" && "text-st-red",
            kind === "warning" && "text-[#b86e00]",
            kind === "hint" && "text-subtle",
          )}
        >
          {kind === "error" && <CircleAlert className="mt-px size-3.5 shrink-0" />}
          {kind === "warning" && <TriangleAlert className="mt-px size-3.5 shrink-0" />}
          {kind === "hint" && <Info className="mt-px size-3.5 shrink-0 opacity-70" />}
          <span>{error ?? warning ?? hint}</span>
        </motion.p>
      )}
    </AnimatePresence>
  );
}

export const inputClass =
  "h-11 rounded-[13px] border-hairline bg-white px-3.5 text-[15px] shadow-[0_1px_2px_rgb(16_24_40/0.03)] transition hover:border-[#d5dbe3] md:text-[14.5px]";

/* ───────────── quantity stepper ───────────── */

export function QtyStepper({ value, onChange, unit, label, max = 999 }: { value: number; onChange: (n: number) => void; unit: string; label: string; max?: number }) {
  const set = (n: number) => onChange(Math.max(0, Math.min(max, Math.round(n))));
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <motion.button
        type="button"
        whileTap={{ scale: 0.9 }}
        onClick={() => set(value - 1)}
        disabled={value <= 0}
        aria-label={`Quitar 1 ${unit} de ${label}`}
        className="inline-flex size-11 items-center justify-center rounded-[12px] border border-hairline bg-white text-ink transition hover:bg-muted disabled:opacity-40 md:size-10"
      >
        <Minus className="size-4" />
      </motion.button>
      <div className="relative w-[64px]">
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={max}
          value={value}
          onChange={(e) => set(Number(e.target.value) || 0)}
          aria-label={`Cantidad de ${label} (${unit})`}
          className={cn(
            "h-11 w-full rounded-[12px] border bg-white pr-6 text-center md:h-10 text-[15px] font-semibold tabular outline-none transition [appearance:textfield] focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
            value > 0 ? "border-[#bcd8fb] bg-[#f6faff] text-ink" : "border-hairline text-subtle",
          )}
        />
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-subtle">{unit}</span>
      </div>
      <motion.button
        type="button"
        whileTap={{ scale: 0.9 }}
        onClick={() => set(value + 1)}
        disabled={value >= max}
        aria-label={`Agregar 1 ${unit} de ${label}`}
        className="inline-flex size-11 items-center justify-center rounded-[12px] border border-hairline bg-white text-ink transition hover:bg-muted disabled:opacity-40 md:size-10"
      >
        <Plus className="size-4" />
      </motion.button>
    </div>
  );
}

/* ───────────── animated check box ───────────── */

export function CheckMark({ on, className }: { on: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex size-[22px] shrink-0 items-center justify-center rounded-[7px] border transition-colors duration-200",
        on ? "border-[#1667e0] bg-[#1667e0] text-white" : "border-[#d0d6de] bg-white",
        className,
      )}
    >
      <svg viewBox="0 0 16 16" className="size-3.5">
        <motion.path
          d="M3.5 8.5l3 3 6-7"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={false}
          animate={{ pathLength: on ? 1 : 0, opacity: on ? 1 : 0 }}
          transition={{ duration: 0.28, ease: EASE }}
        />
      </svg>
    </span>
  );
}
