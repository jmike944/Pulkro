"use client";

import { motion } from "motion/react";
import { ChevronDown, Lock, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ReasonTip } from "@/components/pk/reason-tip";
import type { Gate } from "./order-context";

/**
 * Wraps a control that may be disabled by role/state. When blocked, the child must already be
 * `disabled`; the wrapper keeps it hoverable/focusable (tappable on touch) and explains who can do it.
 */
export function Gated({ gate, children, className }: { gate: Gate; children: React.ReactNode; className?: string }) {
  if (gate.ok) return <>{children}</>;
  return (
    <ReasonTip reason={gate.reason} contentClassName="max-w-[260px] text-center leading-snug">
      <span tabIndex={0} className={cn("inline-flex cursor-not-allowed rounded-[12px] outline-none focus-visible:ring-3 focus-visible:ring-ring/50", className)} aria-label={gate.reason}>
        {children}
      </span>
    </ReasonTip>
  );
}

/** Small inline line under a blocked CTA (a persistent alternative to the tip bubble). */
export function GateHint({ gate, className }: { gate: Gate; className?: string }) {
  if (gate.ok || !gate.reason) return null;
  return (
    <p className={cn("flex items-center justify-center gap-1.5 text-center text-[12.5px] text-subtle", className)}>
      <Lock className="size-3.5 shrink-0" />
      {gate.reason}
    </p>
  );
}

/**
 * Pulkro dialog shell: serif title, scrollable body, sticky footer.
 * Centered card on desktop, bottom sheet on phones.
 */
export function OrderDialog({
  open,
  onOpenChange,
  title,
  description,
  eyebrow,
  icon,
  footer,
  children,
  size = "md",
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  eyebrow?: React.ReactNode;
  icon?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  size?: "md" | "lg";
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className={cn(
          "flex max-h-[92dvh] flex-col gap-0 overflow-hidden rounded-[26px] bg-surface p-0 text-ink shadow-lift ring-1 ring-edge",
          size === "lg" ? "sm:max-w-[620px]" : "sm:max-w-[540px]",
          "max-sm:inset-x-0 max-sm:top-auto max-sm:bottom-0 max-sm:left-0 max-sm:max-h-[94dvh] max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-b-none",
        )}
      >
        <div className="relative shrink-0 px-5 pb-4 pt-6 sm:px-7 sm:pt-7">
          <span className="mx-auto mb-4 block h-1 w-10 rounded-full bg-track sm:hidden" aria-hidden />
          <DialogClose
            aria-label="Cerrar"
            className="absolute right-4 top-4 inline-flex size-10 items-center justify-center rounded-full text-subtle transition hover:bg-muted hover:text-ink sm:right-5 sm:top-5"
          >
            <X className="size-[18px]" />
          </DialogClose>
          {icon && <div className="mb-4">{icon}</div>}
          {eyebrow && <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.1em] text-subtle">{eyebrow}</p>}
          <DialogTitle className="pr-10 font-serif text-[26px] font-medium leading-[1.12] tracking-[-0.01em] text-ink sm:text-[28px]">{title}</DialogTitle>
          {description ? (
            <DialogDescription className="mt-2 text-[14.5px] leading-relaxed text-subtle [&_b]:font-semibold [&_b]:text-ink">{description}</DialogDescription>
          ) : (
            <DialogDescription className="sr-only">Formulario de la orden</DialogDescription>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-6 sm:px-7">{children}</div>
        {footer && (
          <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-hairline bg-wash px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:flex-row sm:items-center sm:justify-end sm:px-7">
            {footer}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Sticky action bar rendered at the end of a dialog body (for forms whose state lives inside the body).
 * Pins to the bottom of the scroll area so the primary action is always reachable on phones.
 */
export function DialogActions({ children, hint }: { children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="sticky bottom-[-24px] z-10 -mx-5 -mb-6 mt-6 flex flex-col-reverse gap-2 border-t border-hairline bg-wash/95 px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur sm:-mx-7 sm:flex-row sm:items-center sm:justify-end sm:px-7">
      {hint && <p className="text-center text-[12.5px] text-subtle sm:mr-auto sm:text-left">{hint}</p>}
      {children}
    </div>
  );
}

/** Required "motivo" textarea with quick-pick chips (doc §3: every change records a reason). */
export function ReasonField({
  value,
  onChange,
  suggestions = [],
  label = "Motivo",
  placeholder = "Explique brevemente el motivo del cambio",
  id = "motivo",
  min = 5,
}: {
  value: string;
  onChange: (v: string) => void;
  suggestions?: string[];
  label?: string;
  placeholder?: string;
  id?: string;
  min?: number;
}) {
  const short = value.trim().length > 0 && value.trim().length < min;
  return (
    <div>
      <label htmlFor={id} className="mb-2 flex items-baseline justify-between gap-3 text-[13px] font-medium text-ink">
        <span>
          {label} <span className="text-red-fg">*</span>
        </span>
        <span className="text-[12px] font-normal text-subtle">Queda en la actividad de la orden</span>
      </label>
      {suggestions.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {suggestions.map((s) => (
            <motion.button
              key={s}
              type="button"
              whileTap={{ scale: 0.96 }}
              onClick={() => onChange(s)}
              className={cn(
                "min-h-8 rounded-full border px-3 text-[12.5px] transition",
                value === s ? "border-ink bg-ink text-on-ink" : "border-hairline bg-surface text-ink hover:bg-muted",
              )}
            >
              {s}
            </motion.button>
          ))}
        </div>
      )}
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        aria-invalid={short || undefined}
        className="w-full resize-none rounded-[14px] border border-input bg-surface px-3.5 py-3 text-[15px] leading-relaxed outline-none transition placeholder:text-faint focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-st-amber"
      />
      {short && <p className="mt-1 text-[12px] text-amber-fg">Escriba al menos {min} caracteres.</p>}
    </div>
  );
}

/** Confirm checkbox row used at the bottom of every confirmation dialog. */
export function ConfirmCheck({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-3 rounded-[16px] border p-4 transition", checked ? "border-blue-line bg-blue-wash" : "border-hairline bg-surface hover:bg-wash")}>
      <span
        className={cn(
          "mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-[6px] border transition",
          checked ? "border-brand-deep bg-brand-deep text-white" : "border-line-heavy bg-surface",
        )}
      >
        <motion.svg viewBox="0 0 16 16" className="size-3.5" initial={false} animate={{ opacity: checked ? 1 : 0 }}>
          <motion.path
            d="M3.5 8.5l3 3 6-7"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={false}
            animate={{ pathLength: checked ? 1 : 0 }}
            transition={{ duration: 0.25 }}
          />
        </motion.svg>
      </span>
      <input type="checkbox" className="sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="text-[14px] leading-relaxed text-ink">{children}</span>
    </label>
  );
}

/** Key-value summary block inside dialogs ("Submit claim" reference). */
export function SummaryRows({ rows, className }: { rows: { k: React.ReactNode; v: React.ReactNode; tone?: "ok" | "warn" | "bad" }[]; className?: string }) {
  return (
    <dl className={cn("divide-y divide-hairline rounded-[18px] border border-hairline bg-surface px-4", className)}>
      {rows.map((r, i) => (
        <div key={i} className="flex items-baseline justify-between gap-4 py-3 text-[14px]">
          <dt className="text-subtle">{r.k}</dt>
          <dd className={cn("text-right font-semibold tabular", r.tone === "bad" ? "text-red-fg" : r.tone === "warn" ? "text-amber-fg" : "text-ink")}>{r.v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Field label + control wrapper. */
export function Field({ label, htmlFor, children, hint, className }: { label: React.ReactNode; htmlFor?: string; children: React.ReactNode; hint?: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1.5 block text-[13px] font-medium text-ink">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-[12px] text-subtle">{hint}</p>}
    </div>
  );
}

export const inputClass = "h-11 w-full rounded-[12px] border border-input bg-surface px-3.5 text-[15px] outline-none transition placeholder:text-faint focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:bg-muted disabled:text-subtle";

/** Section label inside long forms. */
export function FormSection({ title, children, className, aside }: { title: string; children: React.ReactNode; className?: string; aside?: React.ReactNode }) {
  return (
    <section className={cn("mt-6 first:mt-0", className)}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-subtle">{title}</p>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** Native select styled like the inputs (best picker UX on phones). */
export function NativeSelect({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <div className={cn("relative", className)}>
      <select {...props} className={cn(inputClass, "appearance-none pr-10")}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-subtle" />
    </div>
  );
}
