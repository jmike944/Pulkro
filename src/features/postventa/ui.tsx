"use client";

import { cn } from "@/lib/utils";
import { ReasonTip } from "@/components/pk/reason-tip";
import { DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** Copy for actions a role can't perform (doc §2 "Gestionar quejas/encuestas"). */
export const REASON_POSTVENTA = "Solo Administración y Supervisores gestionan quejas y encuestas.";
export const REASON_ORDER_CREATE = "Solo Administración y Supervisores dan de alta órdenes.";
export const REASON_EXPORT = "Exportar a Excel está disponible para Dirección y Administración.";

/** Shared field styles (taller than shadcn defaults: ≥ 44px tap targets on phones). */
export const inputCls = "h-11 rounded-[12px] border-input bg-surface px-3.5 text-[15px] shadow-[0_1px_2px_rgb(16_24_40/0.03)]";
export const textareaCls = "min-h-[104px] rounded-[14px] border-input bg-surface px-3.5 py-3 text-[15px]";
export const menuItemCls = "min-h-10 gap-2.5 rounded-[10px] px-2.5 text-[14px]";
export const outlineBtnCls = "h-10 rounded-[12px] border-line px-4 text-[14px] font-semibold shadow-[0_1px_2px_rgb(16_24_40/0.05)]";

/**
 * Wraps a (disabled) control in a tooltip (tap bubble on touch) that explains who can use it.
 * When `allowed` the child renders untouched.
 */
export function Gate({ allowed, reason, children, className }: { allowed: boolean; reason: string; children: React.ReactNode; className?: string }) {
  if (allowed) return <>{children}</>;
  return (
    <ReasonTip reason={reason} contentClassName="max-w-[260px] text-[12.5px]">
      <span tabIndex={0} className={cn("inline-flex cursor-not-allowed rounded-[12px] outline-none focus-visible:ring-2 focus-visible:ring-sky", className)}>
        {children}
      </span>
    </ReasonTip>
  );
}

/** Field label in the house style. */
export function FieldLabel({ children, htmlFor, hint, className }: { children: React.ReactNode; htmlFor?: string; hint?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("mb-2 flex items-baseline justify-between gap-3", className)}>
      <label htmlFor={htmlFor} className="text-[13px] font-medium text-subtle">
        {children}
      </label>
      {hint && <span className="text-[12px] text-faint">{hint}</span>}
    </div>
  );
}

/** Dialog chrome: serif title, scrolling body, sticky footer. Children = body. */
export function DialogPanel({
  title,
  description,
  footer,
  children,
  className,
  wide,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  wide?: boolean;
}) {
  return (
    <DialogContent
      className={cn(
        "flex max-h-[92dvh] flex-col gap-0 overflow-hidden rounded-[24px] p-0",
        wide ? "sm:max-w-[600px]" : "sm:max-w-[500px]",
        className,
      )}
    >
      <DialogHeader className="gap-1.5 border-b border-hairline px-6 pb-5 pt-6 pr-12 text-left">
        <DialogTitle className="font-serif text-[26px] font-medium leading-tight tracking-[-0.01em] text-ink">{title}</DialogTitle>
        {description && <DialogDescription className="text-[14px] text-subtle">{description}</DialogDescription>}
      </DialogHeader>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
      {footer && <div className="flex flex-col-reverse gap-2 border-t border-hairline bg-wash px-6 py-4 sm:flex-row sm:items-center sm:justify-end">{footer}</div>}
    </DialogContent>
  );
}

/** Pill-style filter chip with an optional count. */
export function FilterChip({
  active,
  onClick,
  children,
  count,
}: {
  active: boolean;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  children: React.ReactNode;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-[14px] transition-colors max-md:h-11",
        active ? "border-ink bg-ink font-semibold text-on-ink" : "border-hairline bg-surface text-ink hover:bg-soft",
      )}
    >
      {children}
      {count !== undefined && <span className={cn("text-[12.5px] tabular", active ? "text-on-ink/70" : "text-subtle")}>{count}</span>}
    </button>
  );
}
