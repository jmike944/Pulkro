"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { Lock, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ROLE_LABEL, type Tone } from "@/lib/status";
import type { Role } from "@/lib/types";
import { IconTile } from "@/components/pk/bits";
import { ReasonTip } from "@/components/pk/reason-tip";
import { SoftBadge } from "@/components/pk/status";
import { EASE } from "@/components/pk/motion";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

/* ───────────── doc scope tags (CONFIRMADO / PROPUESTO / PENDIENTE) ───────────── */

export type DocStatus = "confirmado" | "propuesto" | "pendiente";

export const DOC_STATUS: Record<DocStatus, { label: string; tone: Tone; hint: string }> = {
  confirmado: { label: "CONFIRMADO", tone: "teal", hint: "Decisión expresamente seleccionada por Pulkro" },
  propuesto: { label: "PROPUESTO", tone: "blue", hint: "Recomendación funcional sujeta a aprobación" },
  pendiente: { label: "PENDIENTE", tone: "amber", hint: "Definición necesaria para cotizar o implementar" },
};

export function DocTag({ status, className }: { status: DocStatus; className?: string }) {
  const m = DOC_STATUS[status];
  return (
    <SoftBadge tone={m.tone} className={cn("h-[21px] px-1.5 text-[10.5px] tracking-[0.08em]", className)}>
      {m.label}
    </SoftBadge>
  );
}

/* ───────────── roles ───────────── */

export const ROLE_TONE: Record<Role, Tone> = { direccion: "navy", administracion: "violet", supervisor: "blue" };
export const ROLE_SHORT: Record<Role, string> = { direccion: "Dir.", administracion: "Adm.", supervisor: "Sup." };
export const ROLES: Role[] = ["direccion", "administracion", "supervisor"];

export function RoleBadge({ role, className }: { role: Role; className?: string }) {
  return (
    <SoftBadge tone={ROLE_TONE[role]} className={className}>
      {ROLE_LABEL[role]}
    </SoftBadge>
  );
}

/* ───────────── permission gate ───────────── */

/**
 * Renders the action disabled with a tooltip (tap bubble on touch) explaining who can do it.
 * Disabled buttons swallow pointer events, so the tip hangs off a focusable wrapper.
 */
export function GatedButton({
  allowed,
  reason,
  className,
  children,
  ...props
}: React.ComponentProps<typeof Button> & { allowed: boolean; reason: string }) {
  const button = (
    <Button {...props} disabled={!allowed || props.disabled} className={cn("h-11 rounded-[12px] px-4 text-[14px] font-semibold lg:h-10", className)}>
      {!allowed && <Lock className="size-3.5" />}
      {children}
    </Button>
  );
  if (allowed) return button;
  return (
    <ReasonTip reason={reason} contentClassName="max-w-[260px] text-[12.5px] leading-snug">
      <span tabIndex={0} className="inline-flex cursor-not-allowed rounded-[12px] outline-none focus-visible:ring-3 focus-visible:ring-ring/50" aria-label={reason}>
        {button}
      </span>
    </ReasonTip>
  );
}

export const NO_CATALOGS = "Solo Dirección y Administración administran catálogos (doc §2 · PENDIENTE de confirmar).";
export const NO_USERS = "Solo Dirección administra usuarios y permisos en el prototipo (doc §2 · PENDIENTE de confirmar).";
export const NO_EXCEL = "Exportar Excel está habilitado para Dirección y Administración (doc §2).";

/** Soft banner that tells mobile users (no hover tooltips) why controls are read-only. */
export function ReadOnlyNote({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-start gap-3 rounded-[16px] bg-soft px-4 py-3 text-[13.5px] text-subtle", className)}>
      <Lock className="mt-0.5 size-4 shrink-0 text-ink/60" />
      <p>{children}</p>
    </div>
  );
}

/* ───────────── forms ───────────── */

export const inputCls = "h-11 rounded-[12px] px-3.5 text-[15px] md:text-[14.5px]";
export const selectTriggerCls = "w-full rounded-[12px] px-3.5 text-[14.5px] data-[size=default]:h-11";

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
}: {
  label: React.ReactNode;
  htmlFor?: string;
  hint?: React.ReactNode;
  error?: string | null;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 space-y-1.5", className)}>
      <Label htmlFor={htmlFor} className="text-[13px] font-semibold text-ink">
        {label}
      </Label>
      {children}
      {error ? (
        <motion.p initial={{ opacity: 0, y: -3 }} animate={{ opacity: 1, y: 0 }} className="text-[12.5px] font-medium text-red-fg" role="alert">
          {error}
        </motion.p>
      ) : hint ? (
        <p className="text-[12.5px] leading-snug text-subtle">{hint}</p>
      ) : null}
    </div>
  );
}

/** Small chip selector (segment, unit of measure…) with ≥40px tap targets. */
export function ChipSelect<T extends string>({
  options,
  value,
  onChange,
  className,
  ariaLabel,
}: {
  options: { value: T; label: React.ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cn("flex flex-wrap gap-2", className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex h-10 items-center gap-1.5 rounded-[12px] border px-3.5 text-[14px] transition",
              active ? "border-brand-deep bg-brand-deep font-semibold text-white shadow-[0_6px_14px_-8px_rgb(2_58_99/0.7)]" : "border-hairline bg-surface text-ink hover:border-line-strong",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Large Dialog form shell: serif title, scrollable body, sticky footer. */
export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  icon,
  iconTone = "sky",
  children,
  onSubmit,
  submitLabel = "Guardar",
  submitDisabled,
  footerNote,
  className,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  iconTone?: React.ComponentProps<typeof IconTile>["tone"];
  children: React.ReactNode;
  onSubmit: () => void;
  submitLabel?: string;
  submitDisabled?: boolean;
  footerNote?: React.ReactNode;
  className?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className={cn("max-h-[calc(100dvh-2rem)] gap-0 overflow-hidden rounded-[26px] p-0 sm:max-w-[560px]", className)}>
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
          className="flex max-h-[calc(100dvh-2rem)] min-h-0 flex-col"
        >
          <header className="flex items-start gap-4 border-b border-hairline px-5 pb-5 pt-6 sm:px-6">
            {icon && (
              <IconTile tone={iconTone} className="mt-1 size-10 rounded-[12px] [&_svg]:size-5">
                {icon}
              </IconTile>
            )}
            <div className="min-w-0 flex-1">
              <DialogTitle className="font-serif text-[25px] font-medium leading-tight text-ink">{title}</DialogTitle>
              {description && <DialogDescription className="mt-1.5 text-[14px] leading-relaxed text-subtle">{description}</DialogDescription>}
            </div>
            <DialogClose asChild>
              <button type="button" aria-label="Cerrar" className="-mr-1.5 -mt-1 inline-flex size-10 shrink-0 items-center justify-center rounded-[12px] text-subtle transition hover:bg-muted hover:text-ink">
                <X className="size-[18px]" />
              </button>
            </DialogClose>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
          <footer className="flex flex-col-reverse gap-2.5 border-t border-hairline bg-wash px-5 py-4 sm:flex-row sm:items-center sm:justify-end sm:px-6">
            {footerNote && <p className="text-[12.5px] leading-snug text-subtle sm:mr-auto">{footerNote}</p>}
            <DialogClose asChild>
              <Button type="button" variant="outline" className="h-11 rounded-[12px] px-5 text-[14px] font-semibold">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" disabled={submitDisabled} className="h-11 rounded-[12px] px-5 text-[14px] font-semibold">
              {submitLabel}
            </Button>
          </footer>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ───────────── confirmation dialog (key-value summary + explicit checkbox) ───────────── */

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  icon,
  iconTone = "amber",
  rows,
  checkboxLabel,
  confirmLabel,
  destructive,
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  iconTone?: React.ComponentProps<typeof IconTile>["tone"];
  rows: { k: React.ReactNode; v: React.ReactNode }[];
  checkboxLabel: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
  children?: React.ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="max-h-[calc(100dvh-2rem)] gap-0 overflow-y-auto rounded-[26px] p-0 sm:max-w-[480px]">
        <ConfirmBody
          title={title}
          description={description}
          icon={icon}
          iconTone={iconTone}
          rows={rows}
          checkboxLabel={checkboxLabel}
          confirmLabel={confirmLabel}
          destructive={destructive}
          onConfirm={() => {
            onConfirm();
            onOpenChange(false);
          }}
        >
          {children}
        </ConfirmBody>
      </DialogContent>
    </Dialog>
  );
}

/** Mounted only while the dialog is open, so the checkbox resets every time. */
function ConfirmBody({
  title,
  description,
  icon,
  iconTone,
  rows,
  checkboxLabel,
  confirmLabel,
  destructive,
  onConfirm,
  children,
}: Omit<React.ComponentProps<typeof ConfirmDialog>, "open" | "onOpenChange">) {
  const [checked, setChecked] = useState(false);
  return (
    <div>
      <div className="px-6 pb-2 pt-6">
        <div className="flex items-start justify-between gap-4">
          {icon && (
            <IconTile tone={iconTone} className="size-11 rounded-[14px] [&_svg]:size-5">
              {icon}
            </IconTile>
          )}
          <DialogClose asChild>
            <button type="button" aria-label="Cerrar" className="-mr-2 -mt-2 inline-flex size-10 items-center justify-center rounded-[12px] text-subtle transition hover:bg-muted hover:text-ink">
              <X className="size-[18px]" />
            </button>
          </DialogClose>
        </div>
        <DialogTitle className="mt-4 font-serif text-[26px] font-medium leading-tight text-ink">{title}</DialogTitle>
        {description && <DialogDescription className="mt-2 text-[14px] leading-relaxed text-subtle">{description}</DialogDescription>}
      </div>
      <dl className="mx-6 mt-4 divide-y divide-hairline rounded-[18px] border border-hairline">
        {rows.map((r, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: EASE, delay: 0.05 + i * 0.04 }}
            className="flex items-baseline justify-between gap-6 px-4 py-3 text-[14px]"
          >
            <dt className="shrink-0 text-subtle">{r.k}</dt>
            <dd className="min-w-0 text-right font-semibold text-ink tabular">{r.v}</dd>
          </motion.div>
        ))}
      </dl>
      {children && <div className="mx-6 mt-4">{children}</div>}
      <label className="mx-6 mt-5 flex min-h-11 cursor-pointer items-start gap-3 rounded-[14px] bg-soft px-4 py-3 text-[14px] text-ink">
        <Checkbox checked={checked} onCheckedChange={(v) => setChecked(v === true)} className="mt-0.5 size-[18px] rounded-[5px]" />
        <span className="leading-snug">{checkboxLabel}</span>
      </label>
      <div className="mt-6 flex flex-col-reverse gap-2.5 border-t border-hairline px-6 py-4 sm:flex-row sm:justify-end">
        <DialogClose asChild>
          <Button type="button" variant="outline" className="h-11 rounded-[12px] px-5 text-[14px] font-semibold">
            Cancelar
          </Button>
        </DialogClose>
        <Button
          type="button"
          disabled={!checked}
          onClick={onConfirm}
          className={cn("h-11 rounded-[12px] px-5 text-[14px] font-semibold", destructive && "bg-st-red text-white hover:bg-st-red/90")}
        >
          {confirmLabel}
        </Button>
      </div>
    </div>
  );
}

/* ───────────── dialog target (keeps content mounted while the close animation runs) ───────────── */

/**
 * Dialog state for "edit this record" flows. The target stays set after closing so the exit
 * animation shows real content; `key` changes on every open so each opening starts a fresh form.
 */
export function useDialogTarget<T>() {
  const [target, setTarget] = useState<T | null>(null);
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(0);
  return {
    target,
    open,
    key,
    show: (t: T) => {
      setTarget(t);
      setKey((k) => k + 1);
      setOpen(true);
    },
    onOpenChange: setOpen,
  };
}

/* ───────────── small utils ───────────── */

export function initialsOf(name: string) {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter((p) => p.length > 2);
  const letters = (parts.length ? parts : name.trim().split(/\s+/)).slice(0, 2).map((p) => p[0] ?? "");
  return letters.join("").toUpperCase() || "?";
}

/** Stable 0–359 hue from any string (avatar tints for new records). */
export function hueFrom(text: string) {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) % 360;
  return h;
}

export const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
export const phoneDigits = (v: string) => v.replace(/\D/g, "").length;

export function fmtBytes(n: number) {
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
}

/** Normalizes text for accent-insensitive search. */
export const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

/** Search input with icon, consistent across catalog lists. */
export function SearchField({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  className?: string;
}) {
  return (
    <label className={cn("relative flex h-11 min-w-0 items-center rounded-[14px] border border-hairline bg-surface pl-10 pr-3 transition focus-within:border-sky focus-within:ring-3 focus-within:ring-sky/30", className)}>
      <svg aria-hidden viewBox="0 0 24 24" className="absolute left-3.5 size-[17px] text-subtle" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <span className="sr-only">{placeholder}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-full w-full min-w-0 bg-transparent text-[14.5px] text-ink outline-none placeholder:text-faint"
      />
      {value && (
        <button type="button" onClick={() => onChange("")} aria-label="Limpiar búsqueda" className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-subtle hover:bg-muted hover:text-ink">
          <X className="size-4" />
        </button>
      )}
    </label>
  );
}

/** Table header row shared by the settings lists (hidden on phones, where rows become cards). */
export function ListHead({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("hidden gap-4 border-b border-hairline pb-3 text-[12px] font-semibold uppercase tracking-[0.1em] text-subtle lg:grid", className)}>{children}</div>;
}

/** Inline switch with a ≥40px hit area and an accessible label. */
export function InlineSwitch({
  checked,
  onChange,
  label,
  disabled,
  reason,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
  reason?: string;
}) {
  const sw = (
    <label className={cn("inline-flex min-h-11 min-w-11 items-center justify-center rounded-[12px] px-1.5 lg:min-h-10 lg:min-w-10", disabled ? "cursor-not-allowed" : "cursor-pointer hover:bg-muted")}>
      <SwitchLite checked={checked} onChange={onChange} disabled={disabled} label={label} />
    </label>
  );
  if (!disabled || !reason) return sw;
  return (
    <ReasonTip reason={reason} contentClassName="max-w-[240px] text-[12.5px] leading-snug">
      <span tabIndex={0} className="inline-flex outline-none">
        {sw}
      </span>
    </ReasonTip>
  );
}

/** Brand switch with a springy thumb (navy when on). */
export function SwitchLite({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-[24px] w-[42px] shrink-0 items-center rounded-full p-[3px] outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50",
        checked ? "bg-brand-deep" : "bg-line",
      )}
    >
      <motion.span
        layout
        transition={{ type: "spring", stiffness: 600, damping: 34 }}
        className={cn("block size-[18px] rounded-full bg-surface shadow-[0_1px_3px_rgb(16_24_40/0.25)]", checked ? "ml-auto" : "mr-auto")}
      />
    </button>
  );
}
