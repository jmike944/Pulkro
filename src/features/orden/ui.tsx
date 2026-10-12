"use client";

import { motion } from "motion/react";
import { ChevronDown, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { ModalFooter, ModalShell } from "@/components/pk/modal-shell";
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
      <span tabIndex={0} role="button" aria-disabled="true" className={cn("inline-flex cursor-not-allowed rounded-[12px] outline-none focus-visible:ring-3 focus-visible:ring-ring/50", className)} aria-label={gate.reason}>
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
 * Order dialog: a thin wrapper over the shared `ModalShell` (centered dialog at lg+, bottom sheet on phones, or a
 * FlowScreen with `phone="flow"`). Kept for its callers; new code can use `ModalShell` directly.
 */
export function OrderDialog({
  open,
  onOpenChange,
  title,
  description,
  eyebrow,
  icon,
  footer,
  footerHint,
  children,
  size = "md",
  dirty,
  phone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  eyebrow?: React.ReactNode;
  icon?: React.ReactNode;
  footer?: React.ReactNode;
  footerHint?: React.ReactNode;
  children: React.ReactNode;
  size?: "md" | "lg";
  /** unsaved work: Esc / outside tap / X ask "¿Descartar cambios?" first */
  dirty?: boolean;
  /** phone presentation: bottom sheet (default) or full-screen flow */
  phone?: "flow" | "sheet";
}) {
  return (
    <ModalShell
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      eyebrow={eyebrow}
      icon={icon}
      footer={footer}
      footerHint={footerHint}
      size={size}
      dirty={dirty}
      phone={phone}
    >
      {children}
    </ModalShell>
  );
}

/**
 * Action bar for forms whose state lives inside the dialog body: it renders in the modal's sticky footer
 * (`ModalFooter`), with `hint` saying what is still missing while the primary action is disabled.
 */
export function DialogActions({ children, hint }: { children: React.ReactNode; hint?: React.ReactNode }) {
  return <ModalFooter hint={hint}>{children}</ModalFooter>;
}

/** Required "motivo" (doc §3). Shared field: `@/components/pk/reason-field`. */
export { ReasonField, reasonOk, REASON_MIN } from "@/components/pk/reason-field";

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

/** Text input / native select. 16px below lg so iOS does not zoom on focus. */
export const inputClass = "h-11 w-full rounded-[12px] border border-input bg-surface px-3.5 text-[16px] outline-none lg:text-[15px] transition placeholder:text-faint focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:bg-muted disabled:text-subtle";

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
