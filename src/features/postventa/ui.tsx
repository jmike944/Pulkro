"use client";

import { cn } from "@/lib/utils";
import { ReasonTip } from "@/components/pk/reason-tip";
import { ModalShellContent } from "@/components/pk/modal-shell";

/** Copy for actions a role can't perform (doc §2 "Gestionar quejas/encuestas"). */
export const REASON_POSTVENTA = "Solo Administración y Supervisores gestionan quejas y encuestas.";
export const REASON_ORDER_CREATE = "Solo Administración da de alta órdenes.";
export const REASON_EXPORT = "Exportar a Excel está disponible para Dirección y Administración.";

/** Shared field styles (taller than shadcn defaults: ≥ 44px tap targets; 16px text below lg so iOS does not zoom). */
export const inputCls = "h-11 rounded-[12px] border-input bg-surface px-3.5 text-[16px] shadow-[0_1px_2px_rgb(16_24_40/0.03)] md:text-[16px] lg:text-[15px]";
export const textareaCls = "min-h-[104px] rounded-[14px] border-input bg-surface px-3.5 py-3 text-[16px] md:text-[16px] lg:text-[15px]";
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

/**
 * Dialog chrome rendered inside the caller's `<Dialog open onOpenChange>`: a thin wrapper over the shared
 * `ModalShellContent` (centered dialog at lg+, bottom sheet on phones, 44px "Cerrar", sticky footer).
 * Children = body. For a discard guard or a phone flow, use `ModalShell` (it owns the root) instead.
 */
export function DialogPanel({
  title,
  description,
  footer,
  footerHint,
  children,
  className,
  wide,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  footer?: React.ReactNode;
  /** what is still missing before the primary action is enabled */
  footerHint?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  wide?: boolean;
}) {
  return (
    <ModalShellContent title={title} description={description} footer={footer} footerHint={footerHint} size={wide ? "lg" : "md"} className={className}>
      {children}
    </ModalShellContent>
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
