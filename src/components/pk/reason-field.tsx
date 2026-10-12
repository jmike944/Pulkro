"use client";

/**
 * The one "motivo" field (doc §3: every change records user, date and reason). Replaces the orden `ReasonField`
 * (min 5) and the agenda `MotivoField` (min 4): one rule — at least `REASON_MIN` characters — and one copy.
 */
import { useId } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

/** Minimum length of every audited reason. */
export const REASON_MIN = 5;

/** True when `value` is long enough to be recorded as a reason. Use it for the submit gate so field and button agree. */
export const reasonOk = (value: string, min: number = REASON_MIN) => value.trim().length >= min;

export function ReasonField({
  value,
  onChange,
  suggestions = [],
  label = "Motivo",
  placeholder = "Explique brevemente el motivo del cambio",
  hint = "Queda registrado en la bitácora con su usuario.",
  id,
  min = REASON_MIN,
  max = 2000,
  rows = 3,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  /** quick picks; tapping one fills the field (it can still be edited) */
  suggestions?: string[];
  label?: React.ReactNode;
  placeholder?: string;
  /** line under the field while the reason is valid or empty */
  hint?: React.ReactNode;
  id?: string;
  min?: number;
  /** Longest text the server stores for it (audit reasons: 2000; lib/domain TEXT_LIMITS). */
  max?: number;
  rows?: number;
  className?: string;
}) {
  const autoId = useId();
  const fieldId = id ?? `motivo-${autoId}`;
  const noteId = `${fieldId}-nota`;
  const length = value.trim().length;
  const short = length > 0 && length < min;
  const missing = min - length;

  return (
    <div className={className}>
      <label htmlFor={fieldId} className="mb-2 block text-[13px] font-semibold text-ink">
        {label} <span className="text-red-fg" aria-hidden>*</span>
      </label>
      {suggestions.length > 0 && (
        <div role="group" aria-label="Motivos sugeridos" className="mb-2.5 flex flex-wrap gap-1.5">
          {suggestions.map((s) => {
            const on = value === s;
            return (
              <motion.button
                key={s}
                type="button"
                whileTap={{ scale: 0.96 }}
                onClick={() => onChange(s)}
                aria-pressed={on}
                className={cn(
                  "min-h-11 rounded-full border px-3.5 text-left text-[13.5px] leading-snug outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 lg:min-h-9 lg:text-[13px]",
                  on ? "border-ink bg-ink text-on-ink" : "border-hairline bg-surface text-ink hover:bg-soft",
                )}
              >
                {s}
              </motion.button>
            );
          })}
        </div>
      )}
      <textarea
        id={fieldId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        maxLength={max}
        aria-required
        aria-invalid={short || undefined}
        aria-describedby={noteId}
        className="block w-full resize-none rounded-[14px] border border-input bg-surface px-3.5 py-3 text-[16px] leading-relaxed text-ink outline-none transition placeholder:text-faint focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-amber-line-strong lg:text-[15px]"
      />
      <p id={noteId} aria-live="polite" className={cn("mt-1.5 text-[12.5px] leading-snug", short ? "font-medium text-amber-fg" : "text-subtle")}>
        {short ? `Escriba al menos ${min} caracteres (le ${missing === 1 ? "falta 1" : `faltan ${missing}`}).` : hint}
      </p>
    </div>
  );
}
